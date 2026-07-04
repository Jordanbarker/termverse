import { serializeFS, deserializeFS, SerializedFS } from "@tt/core/filesystem/serialization";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { Mounts } from "@tt/core/filesystem/mounts";
import {
  SaveData,
  SavePayload,
  SaveSlotId,
  SaveSlotMeta,
  SAVE_FORMAT_VERSION,
} from "./saveTypes";
import { GamePhase, ComputerId, StoryFlags } from "./types";
import {
  WindowState,
  serializeWindow,
  rebuildWindow,
  makeWindow,
  allLeaves,
} from "@tt/core/terminal/paneTypes";
import { TmuxSessionSnapshot } from "@tt/core/terminal/tmuxSessions";
import { SnowflakeState } from "@tt/core/snowflake/state";
import { serializeSnowflake, deserializeSnowflake } from "@tt/core/snowflake/serialization";
import { syncToVirtualFS } from "@tt/core/snowflake/bridge/fs_bridge";
import { createInitialSnowflakeState } from "@/story/data/snowflake/initial_data";
import { createNexacorpFilesystem } from "../story/filesystem/nexacorp";
import { createHomeFilesystem } from "../story/filesystem/home";
import { createDevcontainerFilesystem } from "../story/filesystem/devcontainer";
import { createChipinfraFilesystem } from "../story/filesystem/chipinfra";
import { createErikpcFilesystem } from "../story/filesystem/erikpc";
import { getComputerUsername } from "../story/player";
import { seedDeliveredEmails } from "../engine/mail/delivery";
import { initEnvForComputer, initAliasesForComputer } from "../story/env";

const SLOT_KEY_PREFIX = "termoil-slot-";

function slotKey(slotId: SaveSlotId): string {
  return `${SLOT_KEY_PREFIX}${slotId}`;
}

export const ALL_SLOTS: SaveSlotId[] = ["slot-1", "slot-2", "slot-3"];

type ComputerStateMap = Partial<Record<ComputerId, { fs: VirtualFS; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }>>;

export function buildFs(
  username: string,
  computer: ComputerId,
  storyFlags: StoryFlags = {},
  deliveredEmailIds: string[] = []
) {
  const root = computer === "home"
    ? createHomeFilesystem(username)
    : computer === "devcontainer"
      ? createDevcontainerFilesystem(username, storyFlags)
      : computer === "chipinfra"
        ? createChipinfraFilesystem(username, storyFlags)
        : computer === "erik-pc"
          ? createErikpcFilesystem(username)
          : createNexacorpFilesystem(username, storyFlags);
  const sessionUser = getComputerUsername(computer, username);
  const homeDir = `/home/${sessionUser}`;
  let fs = new VirtualFS(root, homeDir, homeDir);

  if (deliveredEmailIds.length > 0) {
    fs = seedDeliveredEmails(fs, deliveredEmailIds, computer, username, new Set(), storyFlags);
  }

  return fs;
}

export interface SaveableState {
  username: string;
  gamePhase: GamePhase;
  currentChapter: string;
  completedObjectives: string[];
  deliveredEmailIds: string[];
  deliveredPiperIds: string[];
  storyFlags: StoryFlags;
  hasSeenIntro: boolean;
  computerState: ComputerStateMap;
  zshHistory: Partial<Record<ComputerId, string>>;
  windows: WindowState[];
  activeWindowId: string;
  tmuxAttachedSession: { name: string; createdAt: number } | null;
  tmuxDetachedSessions: TmuxSessionSnapshot[];
  notifiedChipTopicIds: string[];
  snowflakeState: SnowflakeState;
  copyModeHelpHidden: boolean;
}

/** Single snapshot writer — used by both persist's partialize and manual save slots. */
export function serializeGameState(state: SaveableState): SavePayload {
  const computerStates: Record<string, { fs: SerializedFS; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }> = {};
  for (const [id, cs] of Object.entries(state.computerState)) {
    if (cs) computerStates[id] = { fs: serializeFS(cs.fs), envVars: cs.envVars, aliases: cs.aliases, mounts: cs.mounts ?? {} };
  }
  const activeWindowIndex = state.windows.findIndex((w) => w.id === state.activeWindowId);

  return {
    version: SAVE_FORMAT_VERSION,
    username: state.username,
    gamePhase: state.gamePhase,
    currentChapter: state.currentChapter,
    completedObjectives: [...state.completedObjectives],
    deliveredEmailIds: [...state.deliveredEmailIds],
    deliveredPiperIds: [...state.deliveredPiperIds],
    storyFlags: { ...state.storyFlags },
    hasSeenIntro: state.hasSeenIntro,
    computerStates,
    zshHistory: { ...state.zshHistory },
    windows: state.windows.map(serializeWindow),
    activeWindowIndex: activeWindowIndex >= 0 ? activeWindowIndex : 0,
    tmuxAttachedSession: state.tmuxAttachedSession ? { ...state.tmuxAttachedSession } : null,
    tmuxDetachedSessions: state.tmuxDetachedSessions.map((s) => ({ ...s })),
    notifiedChipTopicIds: [...state.notifiedChipTopicIds],
    serializedSnowflake: serializeSnowflake(state.snowflakeState),
    copyModeHelpHidden: state.copyModeHelpHidden,
  };
}

/** The store slice restoreGameState produces (snapshot fields + derived resets). */
export interface RestoredGameState {
  username: string;
  gamePhase: GamePhase;
  currentChapter: string;
  completedObjectives: string[];
  deliveredEmailIds: string[];
  deliveredPiperIds: string[];
  storyFlags: StoryFlags;
  hasSeenIntro: boolean;
  snowflakeState: SnowflakeState;
  computerState: ComputerStateMap;
  zshHistory: Partial<Record<ComputerId, string>>;
  windows: WindowState[];
  activeWindowId: string;
  tmuxAttachedSession: { name: string; createdAt: number } | null;
  tmuxDetachedSessions: TmuxSessionSnapshot[];
  pendingMuxNotice: null;
  notifiedChipTopicIds: string[];
  copyModeHelpHidden: boolean;
  activeSnowSession: null;
}

/**
 * Single snapshot reader — used by both persist's merge and manual load.
 * Hardened: a corrupted snowflake/FS entry falls back or is skipped rather
 * than crashing the load, and any pane whose computer lost its FS gets a
 * rebuilt one (with the .zsh_history mirror restored, matching initComputer).
 */
export function restoreGameState(data: SavePayload): RestoredGameState {
  let sfState: SnowflakeState;
  try {
    sfState = data.serializedSnowflake?.databases
      ? deserializeSnowflake(data.serializedSnowflake)
      : createInitialSnowflakeState({ includeDay2: !!data.storyFlags.day1_shutdown });
  } catch {
    sfState = createInitialSnowflakeState({ includeDay2: !!data.storyFlags.day1_shutdown });
  }

  const computerState: ComputerStateMap = {};
  for (const [id, cs] of Object.entries(data.computerStates ?? {})) {
    try {
      computerState[id as ComputerId] = {
        fs: deserializeFS(cs.fs),
        envVars: cs.envVars,
        aliases: cs.aliases,
        mounts: cs.mounts ?? {},
      };
    } catch { /* skip corrupted entries */ }
  }
  if (computerState.nexacorp) {
    computerState.nexacorp = { ...computerState.nexacorp, fs: syncToVirtualFS(sfState, computerState.nexacorp.fs) };
  }

  const windows = data.windows && data.windows.length > 0
    ? data.windows.map(rebuildWindow)
    : [makeWindow("home", `/home/${data.username}`)];
  const activeIdx = Math.min(data.activeWindowIndex ?? 0, windows.length - 1);

  const zshHistory = data.zshHistory ?? {};

  // Ensure every pane's computer has a computerState entry — a pane can
  // outlive its FS if deserialization failed above. Without this rebuild,
  // useTerminal asserts on computerState[id]!.fs.
  const leafComputers = new Set<ComputerId>();
  for (const w of windows) for (const l of allLeaves(w.root)) leafComputers.add(l.computerId as ComputerId);
  for (const computerId of leafComputers) {
    if (!computerState[computerId]) {
      const fs = buildFs(data.username, computerId, data.storyFlags, data.deliveredEmailIds ?? []);
      let finalFs = computerId === "nexacorp" ? syncToVirtualFS(sfState, fs) : fs;
      const savedHistory = zshHistory[computerId];
      if (savedHistory != null) {
        const written = finalFs.writeFile(`${finalFs.homeDir}/.zsh_history`, savedHistory);
        if (written.fs) finalFs = written.fs;
      }
      computerState[computerId] = {
        fs: finalFs,
        envVars: initEnvForComputer(computerId, data.username, finalFs),
        aliases: initAliasesForComputer(computerId, data.username, finalFs),
        mounts: {},
      };
    }
  }

  return {
    username: data.username,
    gamePhase: data.gamePhase,
    currentChapter: data.currentChapter,
    completedObjectives: data.completedObjectives,
    deliveredEmailIds: data.deliveredEmailIds,
    deliveredPiperIds: data.deliveredPiperIds,
    storyFlags: data.storyFlags,
    hasSeenIntro: data.hasSeenIntro ?? false,
    snowflakeState: sfState,
    computerState,
    zshHistory,
    windows,
    activeWindowId: windows[activeIdx].id,
    tmuxAttachedSession: data.tmuxAttachedSession ?? null,
    tmuxDetachedSessions: data.tmuxDetachedSessions ?? [],
    pendingMuxNotice: null,
    notifiedChipTopicIds: data.notifiedChipTopicIds ?? [],
    copyModeHelpHidden: data.copyModeHelpHidden ?? false,
    activeSnowSession: null,
  };
}

export function createSaveData(state: SaveableState, label: string): SaveData {
  return {
    ...serializeGameState(state),
    timestamp: Date.now(),
    label,
  };
}

export function saveToSlot(slotId: SaveSlotId, data: SaveData): boolean {
  try {
    localStorage.setItem(slotKey(slotId), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadFromSlot(slotId: SaveSlotId): SaveData | null {
  try {
    const raw = localStorage.getItem(slotKey(slotId));
    if (!raw) return null;
    return JSON.parse(raw) as SaveData;
  } catch {
    return null;
  }
}

export function deleteSlot(slotId: SaveSlotId): void {
  localStorage.removeItem(slotKey(slotId));
}

export function listSaveSlots(): SaveSlotMeta[] {
  return ALL_SLOTS.map((slotId) => {
    try {
      const raw = localStorage.getItem(slotKey(slotId));
      if (!raw) {
        return {
          slotId,
          label: "",
          timestamp: 0,
          username: "",
          currentChapter: "",
          empty: true,
        };
      }
      const data = JSON.parse(raw) as SaveData;
      return {
        slotId,
        label: data.label,
        timestamp: data.timestamp,
        username: data.username,
        currentChapter: data.currentChapter,
        empty: false,
      };
    } catch {
      return {
        slotId,
        label: "",
        timestamp: 0,
        username: "",
        currentChapter: "",
        empty: true,
      };
    }
  });
}

export function formatSlotName(slotId: SaveSlotId): string {
  return slotId.replace("slot-", "Slot ");
}
