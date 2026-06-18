import { serializeFS, SerializedFS } from "@tt/core/filesystem/serialization";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { Mounts } from "@tt/core/filesystem/mounts";
import {
  SaveData,
  SaveSlotId,
  SaveSlotMeta,
  SAVE_FORMAT_VERSION,
} from "./saveTypes";
import { GamePhase, ComputerId, StoryFlags } from "./types";
import { WindowState, serializeWindow } from "./paneTypes";

const SLOT_KEY_PREFIX = "terminal-turmoil-slot-";

function slotKey(slotId: SaveSlotId): string {
  return `${SLOT_KEY_PREFIX}${slotId}`;
}

export const ALL_SLOTS: SaveSlotId[] = ["auto", "slot-1", "slot-2", "slot-3"];

export interface SaveableState {
  username: string;
  gamePhase: GamePhase;
  currentChapter: string;
  completedObjectives: string[];
  deliveredEmailIds: string[];
  deliveredPiperIds: string[];
  storyFlags: StoryFlags;
  computerState: Partial<Record<ComputerId, { fs: VirtualFS; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }>>;
  zshHistory: Partial<Record<ComputerId, string>>;
  windows: WindowState[];
  activeWindowIndex: number;
  notifiedChipTopicIds: string[];
}

export function createSaveData(state: SaveableState, label: string): SaveData {
  const computerStates: Record<string, { fs: SerializedFS; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }> = {};
  for (const [id, cs] of Object.entries(state.computerState)) {
    if (cs) computerStates[id] = { fs: serializeFS(cs.fs), envVars: cs.envVars, aliases: cs.aliases, mounts: cs.mounts ?? {} };
  }

  return {
    version: SAVE_FORMAT_VERSION,
    timestamp: Date.now(),
    label,
    username: state.username,
    gamePhase: state.gamePhase,
    currentChapter: state.currentChapter,
    completedObjectives: [...state.completedObjectives],
    deliveredEmailIds: [...state.deliveredEmailIds],
    deliveredPiperIds: [...state.deliveredPiperIds],
    storyFlags: { ...state.storyFlags },
    computerStates,
    zshHistory: { ...state.zshHistory },
    windows: state.windows.map(serializeWindow),
    activeWindowIndex: state.activeWindowIndex >= 0 ? state.activeWindowIndex : 0,
    notifiedChipTopicIds: [...state.notifiedChipTopicIds],
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
  if (slotId === "auto") return "Auto Save";
  return slotId.replace("slot-", "Slot ");
}

