import { GameEvent } from "../mail/delivery";
import { StoryFlags, ComputerId } from "../../state/types";
import { VirtualFS } from "../filesystem/VirtualFS";

export interface ChipMenuItem {
  id: string;
  label: string;
  /**
   * Chip's reply. Either a static string, or a function computed at render
   * time from the live filesystem so output matches what the player would get
   * running the same command (e.g. the access.log review).
   */
  response: string | ((fs: VirtualFS) => string);
  /**
   * Optional filesystem mutation applied when the item is selected. Lets Chip
   * act like a coding assistant (edit a file when asked). The mutated FS is
   * threaded out via SessionResult.newFs on exit, same mechanism as the
   * transcript flush.
   */
  applyFs?: (fs: VirtualFS) => VirtualFS;
  triggerEvents?: GameEvent[];
  condition?: (flags: StoryFlags, computer: ComputerId) => boolean;
  notifyOnUnlock?: boolean;
}

export interface ChipSessionInfo {
  storyFlags: StoryFlags;
  currentComputer: ComputerId;
}

export interface ChipExchange {
  timestamp: Date;
  role: "user" | "chip";
  text: string;
}
