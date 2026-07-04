import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { Mounts } from "@tt/core/filesystem/mounts";
import { LessSessionInfo } from "@tt/core/pager/types";
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
  triggerRow?: number;
  triggerEvents?: GameEvent[];
  requireSave?: boolean;
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
  | { type: "kill-server" };

/** Read-only tmux server snapshot injected by the app for the `tmux` builtin. */
export interface TmuxContext {
  /** Session this client is attached to, or null when on the bare shell. */
  attachedSession: string | null;
  /**
   * Every session on the server. Detached sessions must appear in detach order
   * (most recent last) — bare `attach`/`kill-session` target the last one.
   */
  sessions: Array<{ name: string; windowCount: number; createdAt: number; attached: boolean }>;
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
  output: string;
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
  /** Resolved tmux lifecycle action from the `tmux` builtin (applied by the app store). */
  tmuxAction?: TmuxAction;
}

// IncrementalLine now lives in @tt/core. Re-exported so existing call sites that
// import it from this module stay valid; rewire to @tt/core opportunistically.
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
