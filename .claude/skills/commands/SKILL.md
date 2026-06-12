---
name: commands
description: "Command parser, registry, pipeline execution, and how to add new commands. Use this skill whenever adding a new terminal command, modifying the command parser or pipeline, working on applyResult.ts/computeEffects(), or touching files under src/engine/commands/ (except dbt.ts, mail.ts, snow.ts which have their own skills)."
---

# Command System

The command system handles parsing terminal input, dispatching to registered command handlers, chaining pipelines, and computing side effects — all as pure functions.

## Architecture

```
src/engine/commands/
├── types.ts               # ParsedCommand, CommandContext, CommandResult, CommandHandler, AsyncCommandHandler, ChainOperator, ChainSegment
├── registry.ts            # register(), registerAsync(), execute(), executeAsync()
├── parser.ts              # parseInput(), parsePipeline(), parseChainedPipeline(), splitOnPipe(), splitOnChainOperators()
├── applyResult.ts         # computeEffects(), AppliedEffects, ApplyContext
├── builtins/
│   ├── index.ts           # Side-effect imports that register all commands
│   ├── cat.ts, ls.ts, cd.ts, grep.ts, find.ts, diff.ts, ...  # Individual commands
│   ├── dbt.ts             # (see dbt skill)
│   ├── git.ts             # Git subcommand dispatch (init, add, commit, checkout, etc.)
│   ├── mail.ts            # (see email skill)
│   └── snow.ts            # (see snowflake skill)
└── helpTexts.ts           # HELP_TEXTS lookup for --help output

src/engine/session/
└── types.ts               # ISession, SessionResult — shared interface for interactive modes

src/engine/pager/          # less (pager) session — alt-screen scroll/search over file or piped stdin
├── LessSession.ts         # ISession impl; alt-screen lifecycle, topLine clamp, n/N search, Ctrl+L redraw
├── render.ts              # ANSI-aware truncation, search highlight, status line, help overlay
├── keymap.ts              # CSI parser → PagerAction union (mode-agnostic)
└── types.ts               # LessSessionInfo

src/hooks/
├── useTerminal.ts         # Pipeline orchestrator: chains commands, handles redirection, applies effects
├── useCommandLine.ts      # Input buffer, history navigation, autosuggestions
└── useComputerTransitions.ts  # SSH/Coder/exit transition flows extracted from useTerminal
```

## Core Types (`commands/types.ts`)

```ts
interface ParsedCommand {
  command: string;
  args: string[];
  flags: Record<string, boolean>;  // -x, --flag
  raw: string;
  rawArgs: string[];
  error?: string;                  // Set by parser when input is malformed (e.g. unterminated quote)
}

interface CommandContext {
  fs: VirtualFS;
  cwd: string;
  homeDir: string;
  username: string;             // Player's unix username (e.g. "ren")
  activeComputer: ComputerId;
  storyFlags?: StoryFlags;
  stdin?: string;               // Piped input from previous command
  rawArgs?: string[];
  isPiped?: boolean;
  commandHistory?: string[];    // For history command
  snowflakeState?: SnowflakeState;
  snowflakeContext?: SessionContext;
  setSnowflakeState?: (state: SnowflakeState) => void;
  elevated?: boolean;           // True when command is running under sudo
  envVars?: Record<string, string>;  // Per-computer environment variables
  setEnvVars?: (envVars: Record<string, string>) => void;  // Persist env changes
  aliases?: Record<string, string>;  // Per-computer shell aliases
  setAliases?: (aliases: Record<string, string>) => void;  // Persist alias changes
  deliveredPiperIds?: string[]; // Piper deliveries already received (for `after_piper_reply` checks)
  mounts?: Mounts;              // Per-computer { [mountpath]: { device, mountpath, fstype } } — read-only; commands return changes via result.newMounts
}

interface CommandResult {
  output: string;
  exitCode?: number;
  newCwd?: string;              // cd changes directory
  newFs?: VirtualFS;            // Filesystem mutations
  clearScreen?: boolean;        // clear command
  editorSession?: { ...; triggerEvents?: GameEvent[] };  // Enter nano editor; events fire when nano closes
  interactiveSession?: { ... }; // Enter Python REPL
  snowSqlSession?: { ... };     // Enter Snowflake CLI SQL session
  promptSession?: { ... };      // Enter inline prompt
  sshSession?: { ... };         // Enter SSH session
  chipSession?: { ... };        // Enter Chip assistant
  piperSession?: { ... };       // Enter Piper session
  lessSession?: { filename, content };  // Enter less pager (file or piped stdin)
  gameAction?: GameAction;      // save/load/newgame/shutdown/listCheckpoints/loadCheckpoint
  triggerEvents?: GameEvent[];  // Events for email/story processing
  transitionTo?: ComputerId;    // Transition to another computer (devcontainer, nexacorp)
  incrementalLines?: IncrementalLine[];  // Lines to print with per-line delays (e.g. boot sequences)
  closeTabsForComputer?: ComputerId;     // Close all tabs for a computer (e.g. coder stop)
  newMounts?: Mounts;                    // Per-computer mount registry update (mount/umount); accumulator-based, mirrors newFs
}

type CommandHandler = (args: string[], flags: Record<string, boolean>, ctx: CommandContext) => CommandResult;
type AsyncCommandHandler = (args: string[], flags: Record<string, boolean>, ctx: CommandContext) => Promise<CommandResult>;
```

## Registry (`registry.ts`)

```ts
register(name: string, handler: CommandHandler, description: string, helpText?: string): void
registerAsync(name: string, handler: AsyncCommandHandler, description: string, helpText?: string): void
execute(commandName: string, args: string[], flags: Record<string, boolean>, ctx: CommandContext): CommandResult
executeAsync(commandName: string, args: string[], flags: Record<string, boolean>, ctx: CommandContext): Promise<CommandResult>
isAsyncCommand(name: string): boolean
getCommandList(): { name: string; description: string }[]
```

Two internal `Map`s: `commands` (sync) and `asyncCommands` (async). Both auto-handle `--help` if helpText was provided.

## Parser (`parser.ts`)

| Function | Purpose |
|----------|---------|
| `parseInput(raw)` | Tokenize respecting quotes, split into command/args/flags |
| `parsePipeline(raw)` | Split on unquoted `\|`, parse each segment |
| `parseChainedPipeline(raw)` | Split on `&&`/`\|\|`/`;` first, then parse each segment's pipeline |
| `splitOnChainOperators(input)` | Split on unquoted `&&`, `\|\|`, `;` respecting quotes |
| `splitOnPipe(input)` | Split on `\|` outside single/double quotes |

Flag parsing: `-x` → `{ x: true }`, `-xyz` → `{ x: true, y: true, z: true }`, `--flag` → `{ flag: true }`.

## Flag validation (`flagValidation.ts`)

The dispatcher rejects unknown flags by default with a coreutils-style error (`<cmd>: invalid option -- 'z'`, exit 2). Each command must declare its known flags with `setKnownFlags(name, { short: [...], long: [...] })` after `register(...)`. Pass `{}` for commands that take no flags. `--help` is always allowed (the dispatcher short-circuits to `helpText` before validation).

Three opt-out cases (call `skipFlagValidation(name)` instead):

- **rawArgs-driven** (`find`, `head`, `tail`, `tree`): the parser splits `-name` into `{n,a,m,e}` and `-5` into `{5}`, so a generic whitelist would reject the canonical syntax. The handler re-parses `ctx.rawArgs` and accepts anything. `tree` uses this for `-L N` (depth limit) — value flags must come from rawArgs because the parser strips the `N` away from the `L` boolean.
- **Per-subcommand** (`git`): each subcommand has its own flag set; validation happens inside the handler with `rejectUnknownFlags(..., { style: "git" })` and a custom git-style error (`error: unknown switch \`z'`, exit 129).
- **Custom prefix** (`snow`): handler calls `rejectUnknownFlags("snow sql", flags, ...)` so the error reads `snow sql:` instead of `snow:`.

## Command Chaining

Supports `&&` (run if previous succeeded), `||` (run if previous failed), and `;` (always run). Pipes bind tighter than chain operators: `cmd1 && cmd2 | cmd3` means `[cmd1] && [cmd2 | cmd3]`.

**Types** (`types.ts`):
```ts
type ChainOperator = '&&' | '||' | ';';
interface ChainSegment {
  pipeline: ParsedCommand[];
  operator: ChainOperator | null;  // null for first segment
}
```

**Parsing order**: `parseChainedPipeline(raw, shell?)` splits on chain operators first (consuming `||` before `splitOnPipe` can misinterpret it), then calls `parsePipeline` on each segment. Empty segments produce syntax errors whose wording follows the `shell` param: the interactive shell uses zsh wording (`` zsh: parse error near `&&' ``, the default); `bash.ts` passes `"bash"` so script lines keep `` bash: syntax error near unexpected token `&&' `` with exit 2. Unknown commands print `zsh: command not found: <name>` (exit 127) with a dimmed `Type 'help'` hint line; `./script` path execution errors are also zsh-worded (`zsh: no such file or directory:` exit 127, `zsh: permission denied:` exit 126 for directories and non-executable files alike).

**Execution** (`useTerminal.ts`): Outer loop over `ChainSegment[]`, inner loop runs each segment's pipeline. Per-segment: story flags/deliveries written to store (for gating), FS accumulated locally, output written to terminal. Sessions/incremental/transitions stop the chain. `stdin` resets between segments.

**Bash scripts** (`bash.ts`): `executeSingleLine` uses the same chaining via `parseChainedPipeline(text, "bash")`.

## Pipeline Execution (`useTerminal`)

1. `parseChainedPipeline(raw)` → array of `ChainSegment`
2. Outer loop: check `&&`/`||`/`;` logic against previous exit code
3. For each segment's pipeline:
   - Pass previous command's `output` as `stdin` in `CommandContext`
   - Execute via `execute()` or `executeAsync()`
   - Accumulate `newFs` and `newCwd` across pipeline
   - Reset `stdin` between chain segments
4. Per-segment redirection: `>` / `>>` extracted and applied per segment (see Redirection below)
5. Per-segment alias expansion
6. Final `CommandResult` from last segment passed to `computeEffects()`

## Redirection (`redirection.ts`)

zsh-realistic stdout redirection, shared by `useTerminal.ts`, `bash.ts`, and the headless runner (`scripts/play.ts`):

- **`extractStdoutRedirect(raw)`** returns `{ command, redirects, parseError? }`. It collects **every** unquoted `>`/`>>` into `redirects: { file, append }[]` (zsh has `multios` on by default, so output is written to all targets) and strips stderr redirects (`2>`, `2>>`, `2>&1`). A `>` with no target sets `` parseError: "zsh: parse error near `\n'" `` — callers print it (exit 1) and skip the segment.
- **`precheckRedirects(redirects, cwd, homeDir, fs)`** validates targets *before the pipeline runs* (zsh opens redirect files before exec). A directory target → `zsh: is a directory: <as-typed>`; a missing parent → `zsh: no such file or directory: <as-typed>`. On error the command never executes: no output, no trigger events, no FS change, exit 1.
- **`applyRedirection(redirects, ...)`** writes the output to every target against the accumulating FS. Per successful target it emits `file_created`/`file_modified` and runs the `isLogTamperPath` tripwire check; a failed write (defensive — precheck normally catches it) returns the zsh error with exit 1 and emits **no** event for that target. `>>` append is newline-aware: it only inserts a separator when the existing content doesn't already end with `\n`.
- **`VirtualFS.writeFile`** refuses to overwrite a directory (`Cannot write to '...': Is a directory`), so `echo x > some-dir` can never destroy a directory tree.

## Line splitting (`src/lib/textUtils.ts`)

`splitLines(content)` splits text into lines and drops the single trailing empty element a final `\n` produces (`"" → []`). Used by `sort` (which also concatenates multi-file input per-file instead of joining with `\n`), `uniq`, `grep`, `head`, and `tail` — use it in any new line-oriented command instead of bare `content.split("\n")`, which invents a phantom empty line for files with trailing newlines.

## Effect Computation (`applyResult.ts`)

`computeEffects(result: CommandResult, applyCtx: ApplyContext): AppliedEffects`

**Pure function** — computes all side effects without touching terminal or state.

### ApplyContext (input)

```ts
interface ApplyContext {
  parsedCommand: string;
  parsedArgs: string[];
  cwd: string;
  homeDir: string;
  activeComputer: ComputerId;
  username: string;
  deliveredEmailIds: string[];
  deliveredPiperIds: string[];
  storyFlags: StoryFlags;
  fs: VirtualFS;
  targetComputerExists?: boolean;  // True on a repeat transition (e.g. second `coder ssh ai`); skips the first-time animation
}
```

### AppliedEffects (output)

```ts
interface AppliedEffects {
  clearScreen: boolean;
  output: string;
  newFs?: VirtualFS;
  newCwd?: string;
  startSession?: SessionToStart;  // "editor" | "snow-sql" | "pythonRepl" | "prompt" | "ssh" | "chip" | "piper" | "less"
  gameAction?: GameAction;
  events: GameEvent[];
  storyFlagUpdates: StoryFlagUpdate[];
  newDeliveredEmailIds: string[];
  emailNotifications: number;
  newDeliveredPiperIds: string[];
  piperNotifications: number;
  suppressPrompt: boolean;
  transitionTo?: ComputerId;  // Computer transition (coder/exit commands)
  incrementalLines?: IncrementalLine[];  // For boot/login output animations
  closeTabsForComputer?: ComputerId;  // Close all other tabs for this computer (e.g. coder stop)
  newMounts?: Mounts;                 // Mount registry update copied through from CommandResult
}
```

### What `computeEffects` Does

1. **Builds event list** — always adds `command_executed`; file-read commands (`cat`, `head`, `tail`, `grep`, `diff`, `wc`, `sort`, `uniq`, `file`, `pdftotext`) auto-add `file_read` events per argument
2. **Processes story flag triggers** — delegates to `checkStoryFlagTriggers()` for the active computer's triggers
3. **Checks email delivery** — calls `checkEmailDeliveries()` for each event
4. **Detects transitions** — recognizes `nexacorp_followup` email read → `triggerTransition: true`
5. **Special NexaCorp logic** — `diff` on `.bak` files sets `discovered_log_tampering`

### `GameEvent` Vocabulary (`engine/mail/delivery.ts`)

The full event union accepted by the dispatcher and the StoryFlagTrigger matcher:

| Event              | Emitter(s) |
|--------------------|------------|
| `command_executed` | Always emitted by `computeEffects` |
| `file_read`        | Auto-emitted for read-shaped commands (cat/head/tail/etc.) |
| `directory_visit`  | `ls`, `cd` |
| `directory_created`| `mkdir`, `cp -r`, `mv` (for the destination dir and every nested sub-dir of a moved subtree) |
| `directory_removed`| `mv`, `rm -r` (for the directory and every nested sub-dir removed) |
| `file_created`     | `touch`, `cp`, `mv`, `nano` save, `>`/`>>` redirection — when the path **did not previously exist** |
| `file_modified`    | `nano` save, `cp`, `mv`, `>`/`>>` redirection — when **overwriting an existing file** |
| `file_removed`     | `rm`, `mv` (source-side; under `rm -r`, fires for every file inside the removed subtree) |
| `objective_completed` | Set by Piper reply triggerEvents and the engine when objectives close |
| `piper_delivered`  | Internal — fires on each Piper delivery |

`file_created` vs `file_modified` is decided by checking `fs.getNode(path)` *before* the write. The matcher supports `path` (exact) for all events; `file_read`, `file_created`, and `file_modified` additionally support `pathPrefix`.

## Session Interface (`session/types.ts`)

```ts
interface ISession {
  enter(): void | SessionResult | Promise<void>;       // Initialize (show UI, etc.). May exit immediately by returning a SessionResult
  handleInput(data: string): SessionResult | null;     // null = continue session
  canClose?(): boolean;                                 // Optional unsaved-state guard for tab close (default true)
  resize?(): void;                                      // Optional re-render after terminal resize / tab switch
}

interface SessionResult {
  type: "continue" | "exit";
  newFs?: VirtualFS;
  newState?: SnowflakeState;
  output?: string;
  triggerEvents?: GameEvent[];
}
```

Session types: editor (nano), snow-sql (Snowflake CLI REPL), pythonRepl (Pyodide), prompt (inline choices), ssh (SSH connection), chip (Chip assistant), piper (team chat), less (pager).

Alt-screen sessions: editor, piper, less — `useSessionRouter.routeInput` recognizes these in its `usedAltScreen` check so the post-session prompt is written cleanly without a leading `\r\n`. Add new alt-screen sessions to that list.

## Command Availability (`availability.ts`)

`isCommandAvailable(commandName, computer, storyFlags)` gates which commands are accessible. Gate data is defined in `story/commandGates.ts`. See the **narrative skill** for full gating details per computer.

## Adding a New Command

### Step 1: Create the command file

Create `src/engine/commands/builtins/{name}.ts`:

```ts
import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { HELP_TEXTS } from "../helpTexts";
import { resolvePath } from "../../lib/pathUtils";

const myCommand: CommandHandler = (args, flags, ctx) => {
  // Use ctx.fs, ctx.cwd, ctx.stdin, etc.
  // Return { output, newFs?, newCwd?, exitCode?, ... }
  return { output: "result" };
};

register("mycommand", myCommand, "Short description", HELP_TEXTS.mycommand);
setKnownFlags("mycommand", { short: ["x"], long: ["foo"] });
```

### Step 2: Add help text

Add entry to `HELP_TEXTS` in `helpTexts.ts`.

### Step 3: Register

Add `import "./mycommand";` to `builtins/index.ts`.

### Step 4: Add tests

Create `src/engine/commands/__tests__/mycommand.test.ts`.

## Command Patterns

### Simple (read-only)
```ts
const cmd: CommandHandler = (args, _flags, ctx) => {
  const path = resolvePath(args[0], ctx.cwd, ctx.homeDir);
  const result = ctx.fs.readFile(path);
  if (result.error) return { output: `error: ${result.error}` };
  return { output: result.value };
};
```

### Filesystem mutation
```ts
const cmd: CommandHandler = (args, _flags, ctx) => {
  const newFs = ctx.fs.writeFile(path, content);
  if (newFs.error) return { output: `error: ${newFs.error}` };
  return { output: "", newFs: newFs.value };
};
```

### Piped input
```ts
const cmd: CommandHandler = (args, flags, ctx) => {
  const input = ctx.stdin ?? ctx.fs.readFile(resolvePath(args[0], ctx.cwd, ctx.homeDir)).value;
  // Process input...
  return { output: processedResult };
};
```

### Interactive session
```ts
const cmd: CommandHandler = (args, _flags, ctx) => {
  return { output: "", snowSqlSession: { state, context } };
};
```

### Event-triggering
```ts
const cmd: CommandHandler = (args, _flags, ctx) => {
  return {
    output: "done",
    triggerEvents: [{ type: "command_executed", detail: "my_action" }],
  };
};
```

## Block devices and mounts (`lsblk`, `mount`, `umount`)

Block-device tooling lives in `src/engine/commands/builtins/{lsblk,mount,umount}.ts`. The story-side device registry is `src/story/blockDevices.ts` (`BLOCK_DEVICES: Partial<Record<ComputerId, BlockDevice[]>>`). Each entry can declare `visibleFlag` to hide the device until a story flag flips and `getContents(): Record<string, FSNode>` to populate the mountpoint on `mount`.

Every computer has a baseline **system disk** (a `disk` + root `part` mounted at `/`) built via the `systemDisk(disk, major, size)` helper — `nexacorp` `sda`/`sda1`, the Coder workspaces `vda`/`vda1`, the laptops `nvme0n1`/`nvme0n1p1` — so `lsblk` always reflects a real machine instead of an empty table. The `mountpoint?: string` field marks a static baseline mount: `lsblk` renders it in MOUNTPOINTS without any entry in `ctx.mounts`, and `mount` refuses to re-mount a device that has one (`mount: /dev/sda1 already mounted on /`). `getRootDevice(computer)` returns the partition with `mountpoint === "/"` and is the single source of truth for `df`'s Filesystem column (`df` runs only on `nexacorp`, but derives the name rather than hardcoding it).

`mount` builds the overlay node via `dir(basename(mountpath), device.getContents?.() ?? {})` — wrapping the children map ensures `node.name` matches the mountpath basename, since `VirtualFS.insertNode` writes the node verbatim. `mount` refuses non-empty target directories (stricter than real Linux but avoids silent destruction). `umount` replaces the mountpath with an empty directory of the same name.

The `Mounts` registry is per-computer state alongside `fs`/`commandHistory`/`envVars`/`aliases`. It rides on the same accumulator pattern as `fs`: pipeline reads from `getState().computerState[id].mounts`, threads it through `ctx.mounts`, and commands return `result.newMounts`. `useTerminal` commits via `setComputerMounts` once at the end. Path keying always goes through `normalizeMountKey(input, cwd, homeDir)` (resolves relative paths and trailing slashes via `resolvePath`).

## Design Principles

- **Pure functions**: `(args, flags, ctx) => CommandResult` — no side effects, no store access
- **Immutable FS**: Mutations return new `VirtualFS` instances via `newFs`
- **Minimal engine→state coupling**: Engine files import type definitions from `state/types.ts` but never Zustand stores. Runtime dependencies flow via `CommandContext`
- **stdin for pipes**: Commands check `ctx.stdin` for piped input, falling back to file args
- **Path resolution**: Always use `resolvePath(arg, ctx.cwd, ctx.homeDir)` for absolute paths
- **ANSI colors**: Use `colorize()` and `ansi` constants from `src/lib/ansi.ts`
