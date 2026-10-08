import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { Mounts } from "@tt/core/filesystem/mounts";
import { LessSessionInfo } from "@tt/core/pager/types";
import type { EditorId } from "@tt/core/session/editorRegistry";
import type { MachineId, StoryFlags, GameEvent, PromptSessionInfo, ChipSessionInfo, PiperSessionInfo } from "@tt/core";
import { SecurityViolation, SecurityPolicy } from "./security";
import { DeviceProvider } from "./devices";
import { GameClock } from "./clock";
import { SnowflakeState } from "@tt/core/snowflake/state";
import { SessionContext } from "@tt/core/snowflake/session/context";

export interface ParsedCommand {
  command: string;
  args: string[];
  flags: Record<string, boolean>;
  raw: string;
  rawArgs: string[];
  error?: string;
}

export interface CommandContext {
  fs: VirtualFS;
  cwd: string;
  homeDir: string;
  username: string;
  activeComputer: MachineId;
  storyFlags?: StoryFlags;
  stdin?: string;
  rawArgs?: string[];
  isPiped?: boolean;
  commandHistory?: string[];
  snowflakeState?: SnowflakeState;
  snowflakeContext?: SessionContext;
  setSnowflakeState?: (state: SnowflakeState) => void;
  elevated?: boolean;
  envVars?: Record<string, string>;
  setEnvVars?: (envVars: Record<string, string>) => void;
  aliases?: Record<string, string>;
  setAliases?: (aliases: Record<string, string>) => void;
  deliveredPiperIds?: string[];
  mounts?: Mounts;
  /** Background commands currently scheduled on this machine (app-owned). */
  pendingCommands?: string[];
  /** Current terminal-tab prefix label (e.g. "Ctrl+Space"), from ~/.tmux.conf. */
  tabPrefixLabel?: string;
  /**
   * tmux server snapshot for the `tmux` builtin + `shortcuts` gating. Injected
   * by the app; absent => the mux is treated as permanently attached.
   */
  tmux?: TmuxContext;
  /**
   * Per-game security rules (protected paths / tripwires). Injected by the app;
   * absent => no operation is ever flagged as a violation.
   */
  security?: SecurityPolicy;
  /**
   * Machine-scoped block devices for df/lsblk/mount. Injected by the app;
   * absent => the machine exposes no enumerable devices.
   */
  devices?: DeviceProvider;
  /**
   * Author string for `git commit` (e.g. "Name <name@host>"). Injected by the
   * app; absent => git falls back to a generic `username <username@localhost>`.
   */
  gitAuthor?: string;
  /**
   * In-game clock for date/git/dbt/snow timestamps. Injected by the app;
   * absent => callers fall back to the real wall clock.
   */
  clock?: GameClock;
  /**
   * Canonical dbt model execution/display order. Injected by the app from story
   * data; absent => models keep their discovered order (no reordering).
   */
  dbtModelOrder?: string[];
}

export interface EditorSessionInfo {
  filePath: string;
  content: string;
  readOnly: boolean;
  isNewFile: boolean;
  /** Which editor session class the app router should start (see editorRegistry). Absent = nano. */
  editor?: EditorId;
  triggerRow?: number;
  triggerEvents?: GameEvent[];
  requireSave?: boolean;
  /**
   * Saved buffer must satisfy this before `triggerEvents` fire. Supplied by the
   * app's editor-trigger table (see commands/editorTriggers) so "the file is
   * actually fixed" can gate a story event without core knowing the file.
   */
  contentPredicate?: (content: string) => boolean;
}

/**
 * Fully resolved tmux lifecycle action. The `tmux` builtin validates against
 * `ctx.tmux` and pre-resolves names, so the store can apply these blindly.
 */
export type TmuxAction =
  | { type: "new-session"; name: string }
  | { type: "attach"; name: string }
  | { type: "detach" }
  | { type: "kill-session"; name: string }
  /** `target` is the session to rename (already known to exist), `name` the new one. */
  | { type: "rename-session"; target: string; name: string }
  | { type: "kill-server" }
  // Window/pane verbs. `windowId` is resolved against `TmuxContext.windows` by
  // the builtin; pane verbs carry no id because a command can only be submitted
  // from the active pane, which the store resolves when it applies the action.
  | { type: "new-window" }
  | { type: "rename-window"; windowId: string; name: string }
  | { type: "kill-window"; windowId: string }
  | { type: "select-window"; windowId: string }
  /** tmux: `-h` splits side-by-side, no flag (or `-v`) stacks. */
  | { type: "split-window"; direction: "h" | "v" }
  | { type: "kill-pane" }
  | { type: "select-pane"; dir: "L" | "R" | "U" | "D" }
  | { type: "resize-pane"; dir: "L" | "R" | "U" | "D"; cells: number };

/** Read-only tmux server snapshot injected by the app for the `tmux` builtin. */
export interface TmuxContext {
  /** Session this client is attached to, or null when on the bare shell. */
  attachedSession: string | null;
  /**
   * Every session on the server. Detached sessions must appear in detach order
   * (most recent last) — bare `attach`/`kill-session` target the last one.
   */
  sessions: Array<{ name: string; windowCount: number; createdAt: number; attached: boolean }>;
  /**
   * Windows of the attached session, in status-line order, for resolving the
   * window verbs' `-t` target. Absent => nothing resolves, including "current".
   */
  windows?: Array<{ id: string; index: number; name: string | null; active: boolean }>;
}

export type GameAction =
  | { type: "save"; slotId: string }
  | { type: "load"; slotId: string }
  | { type: "listSaves" }
  | { type: "listCheckpoints" }
  | { type: "loadCheckpoint"; checkpointId: string }
  | { type: "newGame" }
  | { type: "shutdown" }
  | { type: "reboot" };

export interface InteractiveSessionInfo {
  type: "pythonRepl";
}

export interface SnowSqlSessionInfo {
  startInteractive: boolean;
}

export interface SshSessionInfo {
  host: string;
  username: string;
  targetComputer: MachineId;
}

export interface CommandResult {
  /**
   * stdout. This is the ONLY channel a pipe hands to the next command and the
   * only one a `>`/`>>` redirect writes to a file. A diagnostic must never be
   * put here (see `stderr`), or `cmd nosuch > file` silently writes the error
   * message into the file and shows the player nothing.
   */
  output: string;
  /**
   * stderr: diagnostics (missing file, permission denied, bad flag, command
   * not found). Never piped downstream, never redirected into a file; the
   * pipeline runner surfaces it on the terminal instead (`runPipeline` folds
   * every stage's stderr into the segment result, `computeEffects` renders it
   * ahead of the segment's stdout). Exit codes are unaffected: a command that
   * writes stderr still reports its own exit code for `&&`/`||`.
   */
  stderr?: string;
  exitCode?: number;
  newCwd?: string;
  newFs?: VirtualFS;
  clearScreen?: boolean;
  editorSession?: EditorSessionInfo;
  gameAction?: GameAction;
  interactiveSession?: InteractiveSessionInfo;
  snowSqlSession?: SnowSqlSessionInfo;
  promptSession?: PromptSessionInfo;
  sshSession?: SshSessionInfo;
  chipSession?: ChipSessionInfo;
  piperSession?: PiperSessionInfo;
  lessSession?: LessSessionInfo;
  triggerEvents?: GameEvent[];
  transitionTo?: MachineId;
  incrementalLines?: IncrementalLine[];
  closeTabsForComputer?: MachineId;
  newMounts?: Mounts;
  securityViolation?: SecurityViolation;
  /**
   * Set by a builtin that logs out of the current session (termoil's `exit`).
   * A session exit still runs event processing on the way out, unlike a
   * first-time transition, which short-circuits — see computeEffects.
   */
  sessionExit?: boolean;
  /** Resolved tmux lifecycle action from the `tmux` builtin (applied by the app store). */
  tmuxAction?: TmuxAction;
  /** App-owned timers; scheduling/cancelling does not occupy the shell. */
  deferredCommands?: DeferredCommand[];
  /** The command's completion event will be emitted when its timer fires. */
  deferEvents?: boolean;
}

export type DeferredCommand =
  | { type: "schedule"; command: string; args: string[]; flags: Record<string, boolean>; delayMs: number }
  | { type: "cancel"; command: string };

// Canonical definition is ../incrementalLine (re-exported from the package
// index); re-exported here too for call sites that import it from this module.
export type { IncrementalLine } from "@tt/core";
import type { IncrementalLine } from "@tt/core";

export type ChainOperator = '&&' | '||' | ';';

export interface ChainSegment {
  pipeline: ParsedCommand[];
  operator: ChainOperator | null; // operator BEFORE this segment (null for first)
}

export type CommandHandler = (
  args: string[],
  flags: Record<string, boolean>,
  ctx: CommandContext
) => CommandResult;

export type AsyncCommandHandler = (
  args: string[],
  flags: Record<string, boolean>,
  ctx: CommandContext
) => Promise<CommandResult>;
