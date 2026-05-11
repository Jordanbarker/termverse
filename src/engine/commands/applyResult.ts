import { CommandResult, EditorSessionInfo, GameAction, IncrementalLine, SshSessionInfo } from "./types";
import { VirtualFS } from "../filesystem/VirtualFS";
import { Mounts } from "../filesystem/mounts";
import { GameEvent } from "../mail/delivery";
import { resolvePath } from "../../lib/pathUtils";
import { PromptSessionInfo } from "../prompt/types";
import { ChipSessionInfo } from "../chip/types";
import { PiperSessionInfo } from "../piper/types";
import { ComputerId, StoryFlags } from "../../state/types";
import { colorize, ansi } from "../../lib/ansi";
import { listSaveSlots, formatSlotName } from "../../state/saveManager";
import { commandReadsFiles } from "./registry";
import { processDeliveries } from "./processDeliveries";
import { CHECKPOINTS } from "../../story/checkpoints";

export type SessionToStart =
  | { type: "editor"; info: EditorSessionInfo }
  | { type: "snow-sql" }
  | { type: "pythonRepl" }
  | { type: "prompt"; info: PromptSessionInfo }
  | { type: "ssh"; info: SshSessionInfo }
  | { type: "chip"; info: ChipSessionInfo }
  | { type: "piper"; info: PiperSessionInfo };

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
  transitionTo?: ComputerId;
  incrementalLines?: IncrementalLine[];
  closeTabsForComputer?: ComputerId;
  newMounts?: Mounts;
}

export interface ApplyContext {
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
  /** Whether the target computer already exists in computerState (for subsequent transitions) */
  targetComputerExists?: boolean;
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

  // Computer transitions
  if (result.transitionTo) {
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
  }

  // Game actions
  if (result.gameAction) {
    effects.gameAction = result.gameAction;

    if (result.gameAction.type === "listSaves") {
      effects.output += computeListSavesOutput();
    } else if (result.gameAction.type === "listCheckpoints") {
      effects.output += computeListCheckpointsOutput();
    } else if (result.gameAction.type === "loadCheckpoint") {
      effects.suppressPrompt = true;
    } else if (result.gameAction.type === "newGame") {
      effects.suppressPrompt = true;
    } else if (result.gameAction.type === "shutdown") {
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

  // Process deliveries (story flags, emails, piper) via extracted pure function
  const deliveryResult = processDeliveries(
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

function computeListSavesOutput(): string {
  const slots = listSaveSlots();
  const lines = [
    colorize("Save Slots:", ansi.bold + ansi.cyan),
    "",
  ];
  for (const slot of slots) {
    const label = formatSlotName(slot.slotId);
    if (slot.empty) {
      const indicator = colorize("○", ansi.dim);
      lines.push(`  ${indicator} ${colorize(label.padEnd(10), ansi.bold)}  ${colorize("(empty)", ansi.dim)}`);
    } else {
      const indicator = colorize("●", ansi.cyan);
      const chapterNum = slot.currentChapter.replace("chapter-", "");
      const chapterLabel = colorize(`Ch. ${chapterNum}`, ansi.dim);
      const date = new Date(slot.timestamp).toLocaleString(undefined, {
        dateStyle: "short",
        timeStyle: "short",
      });
      lines.push(`  ${indicator} ${colorize(label.padEnd(10), ansi.bold)}  ${slot.label}  ${chapterLabel}  ${colorize(date, ansi.dim)}`);
    }
  }
  lines.push("");
  lines.push(`Use ${colorize("save 1|2|3", ansi.cyan)} or ${colorize("load 1|2|3|auto", ansi.cyan)}`);
  return lines.join("\n");
}

function computeListCheckpointsOutput(): string {
  const lines = [
    colorize("Checkpoints:", ansi.bold + ansi.cyan),
    "",
  ];
  for (let i = 0; i < CHECKPOINTS.length; i++) {
    const cp = CHECKPOINTS[i];
    const num = colorize(`${i + 1}.`, ansi.cyan);
    const name = colorize(cp.id.padEnd(12), ansi.bold);
    const desc = colorize(cp.description, ansi.dim);
    lines.push(`  ${num} ${name} ${desc}`);
  }
  lines.push("");
  lines.push(`Use ${colorize("cheat 1|2|3", ansi.cyan)} to load a checkpoint`);
  return lines.join("\n");
}
