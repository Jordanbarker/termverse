import { SerializedFS } from "../engine/filesystem/serialization";
import { Mounts } from "../engine/filesystem/mounts";
import { GamePhase, ComputerId, StoryFlags } from "./types";

export const SAVE_FORMAT_VERSION = 14;

export type SaveSlotId = "auto" | "slot-1" | "slot-2" | "slot-3";

export interface SavedTabState {
  computerId: ComputerId;
  cwd: string;
}

export interface SaveData {
  version: number;
  timestamp: number;
  label: string;
  username: string;
  gamePhase: GamePhase;
  currentChapter: string;
  completedObjectives: string[];
  deliveredEmailIds: string[];
  deliveredPiperIds: string[];
  storyFlags: StoryFlags;
  computerStates: Record<string, { fs: SerializedFS; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }>;
  // Durable per-computer .zsh_history mirror (survives removeComputer).
  zshHistory: Partial<Record<ComputerId, string>>;
  tabs: SavedTabState[];
  activeTabIndex: number;
  notifiedChipTopicIds: string[];
}

export interface SaveSlotMeta {
  slotId: SaveSlotId;
  label: string;
  timestamp: number;
  username: string;
  currentChapter: string;
  empty: boolean;
}
