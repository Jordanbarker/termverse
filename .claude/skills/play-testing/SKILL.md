---
name: play-testing
description: "Headless game runner for programmatic play-testing without a browser, plus a Playwright recipe for browser-driving the real game. Use this skill whenever modifying GameRunner, using the headless runner for testing, working on scripts/play.ts, manually play-testing the game from the terminal, or verifying tab/transition/xterm behavior in the browser."
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
  envVars: Partial<Record<ComputerId, Record<string, string>>>;   // lazily populated on first visit
  aliases: Partial<Record<ComputerId, Record<string, string>>>;   // lazily populated on first visit
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

Mirrors `useTerminal.ts` command submission: expands user aliases textually, parses the input with `parseChainedPipeline` (so `&&` / `||` / `;` chains work with bash short-circuit semantics), and executes each chain segment as a pipeline (passing stdout as stdin, `>` / `>>` redirection extracted per segment). `computeEffects()` runs per segment to process story flags, email delivery, and session starts; segment outputs are merged into one `CommandOutput` whose `exitCode` is the last executed segment's. A segment that starts a session, prompt, or computer transition stops the chain (same as the real game). Syntax errors (`echo one &&`) print the bash error, execute nothing, and return exit code 2.

Use `runAsync()` for inputs that may involve async commands (e.g. `dbt run` — also via alias or chain). Use `run()` for everything else; an async command hit by `run()` returns a "use runAsync()" error result with exit code 1.

### `selectOption(choice)`

Resolves a pending inline prompt (from `mail` reply options). Fires `triggerEvents`, delivers follow-up emails, and saves reply to `sent/`. Returns error output if no prompt is pending or choice is out of range.

### `switchComputer(to)`

Rebuilds the filesystem for the target computer (`"home"`, `"nexacorp"`, `"devcontainer"`, `"chipinfra"`, or `"erik-pc"`) and resets `cwd` to that computer's home directory (uses `getComputerUsername` so `erik-pc` lands in `/home/erik`). `envVars` and `aliases` are initialized via `initEnvForComputer`/`initAliasesForComputer` **on first visit only** (matching `gameStore.initComputer`); revisits keep anything set via `export`/`alias`. Note the FS itself is still rebuilt from seed on every switch — file changes do not survive a round-trip, only env/aliases/mounts and story flags do.

### Env / aliases / mounts persistence

The runner mirrors the Zustand store's per-computer state. `export FOO=bar` is preserved across subsequent `run()` calls on the same computer **and across `switchComputer` round-trips**; switching computers loads that computer's separately tracked env. Same for `alias` (aliases are expanded by `run()`/`runAsync()`, so aliased commands are fully testable headlessly) and for the per-computer `mounts` map (USB on home, etc.).

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

## Browser Play-Testing (Playwright)

The headless runner has **no tab model and no transition animations** — tab survival, the "+" dropdown, computer-transition behavior (`useComputerTransitions.ts`), and anything else React-side can only be verified in the real browser. This recipe was developed verifying the soft-disconnect/ssh-reattach change and is repeatable.

### Setup

- **Dev server**: a `next dev` instance is often already running on :3000 (a second `npm run dev` fails on `.next/dev/lock` and falls back to :3001). Check with `curl -s localhost:3000` before starting your own.
- **Playwright**: not a repo dependency — install in a scratch dir, never in the repo:
  ```bash
  cd $(mktemp -d) && npm init -y && npm i playwright@1.57   # pin to the build in ~/Library/Caches/ms-playwright
  ```
  Match the pinned version to the cached browser build (e.g. `chromium-1200` → playwright 1.57) or it will demand a fresh ~120MB download.

### Game-side facts the driver must know

- A fresh browser context = fresh localStorage = **new game**, which boots into a nano tutorial file. Send `Control+x` to exit nano before expecting a shell prompt.
- Use `cheat N` to jump checkpoints (1=day1-start … 5=day2-chapter3-marcus-dm; see `src/story/checkpoints.ts`). `cheat 3` (day2-start, on nexacorp, mid-shift flags) is the best fixture for transition testing.
- After `cheat`, the home FS is rebuilt from seed **without** a nexacorp `known_hosts` entry, so the first `ssh nexacorp-ws01.nexacorp.internal` shows the host-key fingerprint prompt — answer `yes`. Subsequent sshes connect directly (the entry persists).
- The player is `ren`; ssh route is `ssh nexacorp-ws01.nexacorp.internal` (see `SSH_ROUTES` in `src/engine/commands/builtins/ssh.ts`).
- Transitions print on `setInterval` at `BOOT_LINE_INTERVAL_MS` (300ms) — use polling waits with generous (15–25s) timeouts, never fixed sleeps alone.

### Driving xterm.js

- **Renderer is DOM** (no canvas/webgl addons), so terminal text is readable from `.xterm-rows` innerText.
- **Inactive tabs hide via `visibility: hidden`** (TabManager.tsx), NOT `display: none` — `offsetParent` checks don't work. Pick the active terminal with `getComputedStyle(r).visibility === 'visible'`.
- **Typing**: real-mouse-click the visible `.xterm-rows` bounding box first (focuses xterm's hidden textarea), then `page.keyboard.type(...)` + `Enter`. After tab switches the app refocuses the active terminal itself, but the click is cheap insurance.
- **React needs real Playwright clicks.** `el.dispatchEvent(new MouseEvent('click', {bubbles:true}))` from `page.evaluate` does NOT trigger React handlers here — use locator clicks (`page.getByRole('button', {name: '+', exact: true}).click()`).
- **Match output against the tail, not the whole buffer.** The visible buffer includes scrollback; a regex like `/yes\/no/` will re-match an *old* fingerprint prompt forever. Anchor to the last lines (`t.trim().split('\n').pop()` or `$`-anchored multiline regex).

### DOM map

- Tab bar: `div.border-b.font-mono`. Tabs are buttons labeled `1:nexacorp-ws01:/srv *` (tmux style, `*` = active); the new-tab button is exact-text `+`.
- The "+" dropdown items are buttons labeled with `promptHostname` (`maniac-iv`, `nexacorp-ws01`, `coder-ai`, …) — it offers home plus only machines with at least one open tab (TabBar.tsx), so a soft-disconnected machine never appears until you `ssh`/`coder` back in. With a single eligible machine the "+" opens a tab directly with no dropdown.
- The objective tracker ("In Production") is also made of buttons — filter it out when enumerating.

### Driver skeleton

```js
const termText = () => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.xterm-rows')];
  const v = rows.find(r => getComputedStyle(r).visibility === 'visible') || rows[0];
  return v ? v.innerText : '';
});
const type = async (s) => {
  const box = await page.evaluate(() => {
    const v = [...document.querySelectorAll('.xterm-rows')]
      .find(r => getComputedStyle(r).visibility === 'visible');
    const r = v.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await page.keyboard.type(s, { delay: 15 });
  await page.keyboard.press('Enter');
};
const waitText = async (re, timeout = 20000) => {   // poll; throw with term tail on timeout
  for (const start = Date.now(); Date.now() - start < timeout; ) {
    const t = await termText();
    if (re.test(t)) return t;
    await page.waitForTimeout(300);
  }
  throw new Error(`timeout waiting for ${re}`);
};
```

Capture a screenshot + tab-bar text + terminal tail after every step — screenshots are the evidence a reviewer looks at, and the tab bar text (`bar.innerText`) is the assertion surface for tab-survival claims.

### Example flow (soft-disconnect verification)

new game → exit nano → `cheat 3` → leave evidence (`echo x > ~/proof.txt`) → "+" → second nexacorp tab → `coder ssh ai` (devcontainer tab) → switch to tab 1 → `exit` (assert sibling tab survives in tab bar) → "+" dropdown contents at home (assert it lists only `maniac-iv` plus machines with open tabs — no bare soft-disconnected entries) → `ssh` back (answer fingerprint `yes`; assert no `Internal Systems Portal` logo = no boot sequence) → `cat ~/proof.txt` (state survived). For remote-shutdown cascade: with sibling nexacorp + devcontainer tabs open, `shutdown -h now` on nexacorp must close BOTH (connection-closure expansion in useTerminal.ts), with the active tab landing home.
