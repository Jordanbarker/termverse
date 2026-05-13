---
name: play-testing
description: "Headless game runner for programmatic play-testing without a browser. Use this skill whenever modifying GameRunner, using the headless runner for testing, working on scripts/play.ts, or manually play-testing the game from the terminal."
---

# Headless Game Runner

`scripts/play.ts` replicates the browser game loop from `useTerminal.ts` without xterm.js or React. It exports a `GameRunner` class for programmatic game interaction and includes an interactive REPL for manual play-testing.

## Architecture

```
scripts/
└── play.ts              # GameRunner class + interactive REPL

Dependencies (engine layer only — no React/Zustand):
  src/engine/commands/    # parser, registry, builtins, applyResult
  src/engine/filesystem/  # VirtualFS, serialization
  src/engine/snowflake/   # SnowflakeState, seed, session context
  src/engine/mail/        # delivery, mailUtils
  src/engine/prompt/      # PromptSessionInfo, PromptOption
  src/lib/                # ansi, pathUtils
  src/state/types.ts      # ComputerId, StoryFlags
  src/story/player.ts     # PLAYER, COMPUTERS
  src/story/filesystem/   # home/ (homeFilesystem), nexacorp/ (createNexacorpFilesystem)
```

The script mocks `globalThis.localStorage` before any imports so Zustand's persist middleware doesn't crash in Node.

## GameRunner API

```ts
export class GameRunner {
  // Public state (readable/writable)
  fs: VirtualFS;
  cwd: string;
  username: string;
  activeComputer: ComputerId;
  storyFlags: StoryFlags;
  deliveredEmailIds: string[];
  deliveredPiperIds: string[];
  commandHistory: Record<ComputerId, string[]>;
  snowflakeState: SnowflakeState;
  completedObjectives: string[];
  pendingPrompt: PromptSessionInfo | null;
  envVars: Record<ComputerId, Record<string, string>>;
  aliases: Record<ComputerId, Record<string, string>>;
  mounts: Record<ComputerId, Mounts>;

  constructor(computer: ComputerId = "home")
  run(input: string): CommandOutput              // Synchronous command execution
  runAsync(input: string): Promise<CommandOutput> // Async-aware (for dbt, etc.)
  selectOption(choice: number): CommandOutput     // Resolve pending prompt (1-indexed)
  writeFile(path: string, content: string): void  // Direct file write (replaces nano)
  runPython(code: string): string                 // Execute Python via child_process
  switchComputer(to: ComputerId): void            // Instant computer transition (all 5 computers)
  status(): string                                // Game state summary
}
```

### `run(input)` / `runAsync(input)`

Parses the input as a pipeline, executes each command in sequence (passing stdout as stdin), handles `>` / `>>` redirection, then calls `computeEffects()` to process story flags, email delivery, and session starts. Returns a `CommandOutput`.

Use `runAsync()` for commands that may be async (e.g. `dbt run`). Use `run()` for everything else.

### `selectOption(choice)`

Resolves a pending inline prompt (from `mail` reply options). Fires `triggerEvents`, delivers follow-up emails, and saves reply to `sent/`. Returns error output if no prompt is pending or choice is out of range.

### `switchComputer(to)`

Rebuilds the filesystem for the target computer (`"home"`, `"nexacorp"`, `"devcontainer"`, `"chipinfra"`, or `"erik-pc"`), resets `cwd` to that computer's home directory (uses `getComputerUsername` so `erik-pc` lands in `/home/erik`), and reinitializes `envVars` and `aliases` for the computer via `initEnvForComputer`/`initAliasesForComputer`. Story flags carry over.

### Env / aliases / mounts persistence

The runner mirrors the Zustand store's per-computer state. `export FOO=bar` is preserved across subsequent `run()` calls on the same computer; switching computers loads that computer's separately tracked env. Same for `alias` and for the per-computer `mounts` map (USB on home, etc.).

## CommandOutput Type

```ts
interface CommandOutput {
  output: string;           // ANSI-stripped text
  rawOutput: string;        // Original text with ANSI codes
  exitCode: number;
  events: GameEvent[];
  storyFlagUpdates: Array<{ flag: string; value: string | boolean }>;
  newEmails: string[];      // Newly delivered email IDs
  promptPending: boolean;   // True if an inline prompt awaits :select
  sshSessionStarted: boolean;  // True if an SSH session was started
}
```

## REPL Commands

Run the REPL: `npx tsx scripts/play.ts`

| Command | Action |
|---------|--------|
| `:status` | Game state summary (computer, cwd, flag count, etc.) |
| `:flags` | List all story flags and values |
| `:emails` | List delivered email IDs |
| `:objectives` | List completed objectives |
| `:switch home\|nexacorp\|devcontainer` | Switch computer (REPL exposes the 3 common ones; programmatic `switchComputer` supports all 5 including `chipinfra` and `erik-pc`) |
| `:select N` | Resolve pending prompt (choose option N) |
| `:write PATH TEXT` | Write file directly (replaces nano) |
| `:python CODE` | Run Python code via child_process |
| `:help` | Show REPL command list |
| `:quit` / `:q` | Exit |

All other input is executed as a game command (with pipe and redirection support).

## Usage Patterns

### Interactive play-testing

```bash
npx tsx scripts/play.ts
```

Walk through the game manually: run `mail`, `cat`, `ls`, read emails, reply via `:select`, trigger the NexaCorp transition, then `:switch nexacorp` to continue.

### Programmatic usage

```ts
import { GameRunner } from "../scripts/play";

const runner = new GameRunner("home");
const result = runner.run("ls");
console.log(result.output);

// Read email and reply
const mail = runner.run("mail 1");
if (mail.promptPending) {
  const reply = runner.selectOption(1);
  // reply.events, reply.newEmails, reply.storyFlagUpdates
}

// Write files (replaces nano)
runner.writeFile("notes.txt", "investigation notes");

// Async commands (dbt)
const dbt = await runner.runAsync("dbt run");

// Switch computers
runner.switchComputer("nexacorp");
```

### Common workflows

- **Test email delivery chain**: `mail` → read email → `:select N` → check `result.newEmails`
- **Test story flag triggers**: Run commands, inspect `runner.storyFlags`
- **Test full home→NexaCorp flow**: Read emails → accept offer → read followup → check `sshSessionStarted` → `:switch nexacorp`
- **Test dbt/SQL**: `:switch nexacorp` → `await runner.runAsync("dbt run")` → `runner.run("snow sql")`

### Multi-arc regression playtest

`scripts/playtest_arcs.ts` exercises each major story arc end-to-end with a fresh runner per scenario: home main path, Olive's challenges, backup quest, rejection branch (×3), Edward onboarding, Oscar logs, Auri dbt, Dana ops, end-of-day shutdown, USB tip, Day 2 pipeline fix, plugin build on chipinfra, Loose Thread pivot (chipinfra → erik-pc), Marcus endgame (all four accusations), and security tripwires. Run with `npx tsx scripts/playtest_arcs.ts`.

Two known limitations to plan around when extending the script:

- **Piper replies aren't interactively driven by the headless runner.** Where a piper-reply unlock flag would normally fire from `useSessionRouter.ts` (e.g., `search_tools_unlocked` from Oscar's DM accept), set the flag manually via a `simulatePiperUnlocks(runner, "search_tools_unlocked", ...)` helper and note the simulation. This is fine for arc coverage; for piper-reply correctness, lean on the per-message vitest suites instead.
- **`.git` doesn't live in FS builders.** It's created at runtime by `git clone` / `git init`. When testing Day 2 pipeline flows from a fresh runner, run `git clone` first; don't pre-set `dbt_project_cloned: true` (that bakes the dbt tree but no `.git`, leaving `git pull` / `checkout -b` failing). The real game persists `.git` via Zustand across days.
