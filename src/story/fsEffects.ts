import { VirtualFS } from "../engine/filesystem/VirtualFS";

/**
 * Filesystem effects triggered by story flags.
 * Each entry maps a flag name to a function that mutates the FS when that flag is first set.
 * Used by processDeliveries (mid-game) and checkpoint loading (restore).
 */
export const STORY_FS_EFFECTS: Record<string, (fs: VirtualFS, username: string) => VirtualFS> = {
  // (currently empty — keep the registry for future use)
};
