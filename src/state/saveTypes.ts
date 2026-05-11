import { SerializedFS } from "../engine/filesystem/serialization";
import { Mounts } from "../engine/filesystem/mounts";
import { GamePhase, ComputerId, StoryFlags } from "./types";

export const SAVE_FORMAT_VERSION = 11;

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
  computerStates: Record<string, { fs: SerializedFS; commandHistory: string[]; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }>;
  tabs: SavedTabState[];
  activeTabIndex: number;
}

export interface SaveSlotMeta {
  slotId: SaveSlotId;
  label: string;
  timestamp: number;
  username: string;
  currentChapter: string;
  empty: boolean;
}
