import { SerializedFS } from "@tt/core/filesystem/serialization";
import { Mounts } from "@tt/core/filesystem/mounts";
import { GamePhase, ComputerId, StoryFlags } from "./types";
import { SavedWindowState } from "@tt/core/terminal/paneTypes";
import { SerializedSnowflake } from "@tt/core/snowflake/serialization";

export const SAVE_FORMAT_VERSION = 18;

export type SaveSlotId = "slot-1" | "slot-2" | "slot-3";

// The versioned snapshot shared by BOTH persistence paths: the Zustand
// auto-persist blob (partialize/merge) and manual save slots. Produced by
// serializeGameState() and consumed by restoreGameState() in saveManager.ts —
// add new persisted fields there, here, and nowhere else.
export interface SavePayload {
  version: number;
  username: string;
  gamePhase: GamePhase;
  currentChapter: string;
  completedObjectives: string[];
  deliveredEmailIds: string[];
  deliveredPiperIds: string[];
  storyFlags: StoryFlags;
  hasSeenIntro: boolean;
  computerStates: Record<string, { fs: SerializedFS; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }>;
  // Durable per-computer .zsh_history mirror (survives removeComputer).
  zshHistory: Partial<Record<ComputerId, string>>;
  // Each window is a tmux-style tab holding a binary pane tree.
  windows: SavedWindowState[];
  activeWindowIndex: number;
  notifiedChipTopicIds: string[];
  serializedSnowflake: SerializedSnowflake;
  // UI preference: hide the copy-mode key-hint overlay.
  copyModeHelpHidden: boolean;
}

// A manual save slot: the shared payload plus slot metadata.
export interface SaveData extends SavePayload {
  timestamp: number;
  label: string;
}

export interface SaveSlotMeta {
  slotId: SaveSlotId;
  label: string;
  timestamp: number;
  username: string;
  currentChapter: string;
  empty: boolean;
}
