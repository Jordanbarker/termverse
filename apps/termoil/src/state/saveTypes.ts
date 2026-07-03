import { SerializedFS } from "@tt/core/filesystem/serialization";
import { Mounts } from "@tt/core/filesystem/mounts";
import { GamePhase, ComputerId, StoryFlags } from "./types";
import { SavedWindowState } from "@tt/core/terminal/paneTypes";
import { SerializedSnowflake } from "@tt/core/snowflake/serialization";

export const SAVE_FORMAT_VERSION = 17;

export type SaveSlotId = "slot-1" | "slot-2" | "slot-3";

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
  // Each window is a tmux-style tab holding a binary pane tree.
  windows: SavedWindowState[];
  activeWindowIndex: number;
  notifiedChipTopicIds: string[];
  serializedSnowflake: SerializedSnowflake;
}

export interface SaveSlotMeta {
  slotId: SaveSlotId;
  label: string;
  timestamp: number;
  username: string;
  currentChapter: string;
  empty: boolean;
}
