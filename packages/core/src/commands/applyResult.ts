import { CommandResult, EditorSessionInfo, GameAction, IncrementalLine, SshSessionInfo } from "@tt/core/commands/types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { Mounts } from "@tt/core/filesystem/mounts";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { LessSessionInfo } from "@tt/core/pager/types";
import { MachineId, GameEvent, StoryFlags, PromptSessionInfo, ChipSessionInfo, PiperSessionInfo } from "@tt/core";
import { SecurityViolation } from "@tt/core/commands/security";
import { commandReadsFiles } from "./registry";

/**
 * Delivery-cascade processor, injected by the app. Given the events a command
 * produced, returns story-flag/email/piper deliveries. Absent => no deliveries
 * (a game with no narrative delivery system).
 */
export type ProcessDeliveriesFn = (
  events: GameEvent[],
  computerFs: VirtualFS,
  computerId: MachineId,
  deliveredEmailIds: string[],
  deliveredPiperIds: string[],
  username: string,
  storyFlags: StoryFlags,
) => DeliveryResult;

/**
 * Result of a delivery cascade: the mutated FS plus the new email/piper
 * deliveries, notification counts, and story-flag updates to apply.
 */
export interface DeliveryResult {
  fs: VirtualFS;
  newDeliveredEmailIds: string[];
  emailNotifications: number;
  newDeliveredPiperIds: string[];
  piperNotifications: number;
  storyFlagUpdates: StoryFlagUpdate[];
}

export type SessionToStart =
  | { type: "editor"; info: EditorSessionInfo }
  | { type: "snow-sql" }
  | { type: "pythonRepl" }
  | { type: "prompt"; info: PromptSessionInfo }
  | { type: "ssh"; info: SshSessionInfo }
  | { type: "chip"; info: ChipSessionInfo }
  | { type: "piper"; info: PiperSessionInfo }
  | { type: "less"; info: LessSessionInfo };

export interface StoryFlagUpdate {
  flag: string;
  value: string | boolean;
  toast?: string;
}

export interface AppliedEffects {
  clearScreen: boolean;
  output: string;
  newFs?: VirtualFS;
  newCwd?: string;
  startSession?: SessionToStart;
  gameAction?: GameAction;
  events: GameEvent[];
  storyFlagUpdates: StoryFlagUpdate[];
  newDeliveredEmailIds: string[];
  emailNotifications: number;
  newDeliveredPiperIds: string[];
  piperNotifications: number;
  suppressPrompt: boolean;
  transitionTo?: MachineId;
  incrementalLines?: IncrementalLine[];
  closeTabsForComputer?: MachineId;
  newMounts?: Mounts;
  terminationReason?: SecurityViolation;
}

export interface ApplyContext {
  parsedCommand: string;
  parsedArgs: string[];
  cwd: string;
  homeDir: string;
  activeComputer: MachineId;
  username: string;
  deliveredEmailIds: string[];
  deliveredPiperIds: string[];
  storyFlags: StoryFlags;
  fs: VirtualFS;
  /** Whether the target computer already exists in computerState (for subsequent transitions) */
  targetComputerExists?: boolean;
  /** App-injected delivery cascade. Absent => no deliveries are processed. */
  processDeliveries?: ProcessDeliveriesFn;
  /** App-injected renderer for the `listSaves` game action output. */
  renderSavesList?: () => string;
  /** App-injected renderer for the `listCheckpoints` game action output. */
  renderCheckpointsList?: () => string;
}

/**
 * Pure function that computes what effects a CommandResult should produce.
 * Does not touch the terminal or React state — the caller executes the effects.
 */
export function computeEffects(
  result: CommandResult,
  applyCtx: ApplyContext
): AppliedEffects {
  const effects: AppliedEffects = {
    clearScreen: !!result.clearScreen,
    output: result.output || "",
    events: [],
    storyFlagUpdates: [],
    newDeliveredEmailIds: [],
    emailNotifications: 0,
    newDeliveredPiperIds: [],
    piperNotifications: 0,
    suppressPrompt: false,
  };

  // FS and cwd updates
  let currentFs = applyCtx.fs;

  if (result.newFs) {
    currentFs = result.newFs;
    effects.newFs = result.newFs;
  }

  if (result.newMounts) {
    effects.newMounts = result.newMounts;
  }

  if (result.newCwd) {
    currentFs = new VirtualFS(currentFs.root, result.newCwd, currentFs.homeDir);
    effects.newFs = currentFs;
    effects.newCwd = result.newCwd;
  }

  // Security tripwire: override any other transition and force a termination route home.
  if (result.securityViolation) {
    effects.transitionTo = "home";
    effects.terminationReason = result.securityViolation;
    effects.suppressPrompt = true;
    // Continue with event processing — termination handler owns the email/flag side effects.
  } else if (result.transitionTo) {
    effects.transitionTo = result.transitionTo;
    effects.suppressPrompt = true;
    // Only early-return for first-time transitions (skip event processing)
    // exit and subsequent coder visits still need to run event processing below
    const isExit = applyCtx.parsedCommand === "exit";
    if (!isExit && !applyCtx.targetComputerExists) {
      return effects; // First-time transition — early return
    }
  }

  // Session starts (no early return — event processing must still run below)
  if (result.editorSession) {
    effects.startSession = { type: "editor", info: result.editorSession };
    effects.suppressPrompt = true;
  } else if (result.snowSqlSession?.startInteractive) {
    effects.startSession = { type: "snow-sql" };
    effects.suppressPrompt = true;
  } else if (result.promptSession) {
    effects.startSession = { type: "prompt", info: result.promptSession };
    effects.suppressPrompt = true;
  } else if (result.interactiveSession?.type === "pythonRepl") {
    effects.startSession = { type: "pythonRepl" };
    effects.suppressPrompt = true;
  } else if (result.sshSession) {
    effects.startSession = { type: "ssh", info: result.sshSession };
    effects.suppressPrompt = true;
  } else if (result.chipSession) {
    effects.startSession = { type: "chip", info: result.chipSession };
    effects.suppressPrompt = true;
  } else if (result.piperSession) {
    effects.startSession = { type: "piper", info: result.piperSession };
    effects.suppressPrompt = true;
  } else if (result.lessSession) {
    effects.startSession = { type: "less", info: result.lessSession };
    effects.suppressPrompt = true;
  }

  // Game actions
  if (result.gameAction) {
    effects.gameAction = result.gameAction;

    if (result.gameAction.type === "listSaves") {
      effects.output += applyCtx.renderSavesList?.() ?? "";
    } else if (result.gameAction.type === "listCheckpoints") {
      effects.output += applyCtx.renderCheckpointsList?.() ?? "";
    } else if (result.gameAction.type === "loadCheckpoint") {
      effects.suppressPrompt = true;
    } else if (result.gameAction.type === "newGame") {
      effects.suppressPrompt = true;
    } else if (result.gameAction.type === "shutdown" || result.gameAction.type === "reboot") {
      effects.suppressPrompt = true;
    } else if (result.gameAction.type === "save" || result.gameAction.type === "load") {
      effects.suppressPrompt = result.gameAction.type === "load";
    }
  }

  // Build event list — skip events for usage errors (exitCode >= 2) and unknown commands (127)
  const events: GameEvent[] = [];
  if (result.exitCode === undefined || result.exitCode <= 1) {
    events.push({ type: "command_executed", detail: applyCtx.parsedCommand });

    if (result.triggerEvents) {
      events.push(...result.triggerEvents);
    }

    // Commands that read files trigger file_read events — only when the read succeeds
    if (commandReadsFiles(applyCtx.parsedCommand)) {
      for (const arg of applyCtx.parsedArgs) {
        if (!arg.startsWith("-")) {
          const absPath = resolvePath(arg, applyCtx.cwd, applyCtx.homeDir);
          if (!applyCtx.fs.readFile(absPath).error) {
            events.push({ type: "file_read", detail: absPath });
          }
        }
      }
    }
  }

  effects.events = events;

  // Process deliveries (story flags, emails, piper) via the app-injected
  // cascade. Absent => no deliveries (a game with no narrative delivery system).
  if (applyCtx.processDeliveries) {
    const deliveryResult = applyCtx.processDeliveries(
      events,
      currentFs,
      applyCtx.activeComputer,
      applyCtx.deliveredEmailIds,
      applyCtx.deliveredPiperIds,
      applyCtx.username,
      applyCtx.storyFlags
    );

    if (deliveryResult.fs !== currentFs) {
      effects.newFs = deliveryResult.fs;
    }
    effects.storyFlagUpdates.push(...deliveryResult.storyFlagUpdates);
    effects.newDeliveredEmailIds.push(...deliveryResult.newDeliveredEmailIds);
    effects.emailNotifications += deliveryResult.emailNotifications;
    effects.newDeliveredPiperIds.push(...deliveryResult.newDeliveredPiperIds);
    effects.piperNotifications += deliveryResult.piperNotifications;
  }

  // Pass through incremental lines
  if (result.incrementalLines) {
    effects.incrementalLines = result.incrementalLines;
  }

  // Pass through closeTabsForComputer
  if (result.closeTabsForComputer) {
    effects.closeTabsForComputer = result.closeTabsForComputer;
  }

  return effects;
}
