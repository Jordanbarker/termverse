import { VirtualFS } from "../filesystem/VirtualFS";
import { Mounts } from "../filesystem/mounts";
import { PromptSessionInfo } from "../prompt/types";
import { ChipSessionInfo } from "../chip/types";
import { PiperSessionInfo } from "../piper/types";
import { LessSessionInfo } from "../pager/types";
import type { StoryFlags } from "../../state/types";
import type { MachineId } from "../machine";
import { GameEvent } from "../mail/delivery";
import { SecurityViolation, SecurityPolicy } from "./security";
import { DeviceProvider } from "./devices";
import { GameClock } from "./clock";
import { SnowflakeState } from "../snowflake/state";
import { SessionContext } from "../snowflake/session/context";

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
}

export interface IncrementalLine {
  text: string;
  delayMs: number;
}

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
