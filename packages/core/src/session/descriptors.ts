/**
 * Session-launch descriptors — the data contract between the command layer
 * (which produces them in a CommandResult) and the session runtimes + router
 * (which consume them to open an interactive session). Story-agnostic: computer
 * fields use the opaque MachineId, flags use the opaque StoryFlags bag.
 */
import type { GameEvent } from "../gameEvent";
import type { MachineId } from "../machine";
import type { StoryFlags } from "../storyFlags";
import type { Email } from "../email";

export interface PromptOption {
  label: string;
  replyEmail?: Email;
  /** Filename for the sent/ entry when this reply is selected. Game-time millis stamped at construction time. */
  replyFilename?: string;
  triggerEvents?: GameEvent[];
  output?: string;
}

export interface PromptSessionInfo {
  promptText: string;
  options: PromptOption[];
}

export interface ChipSessionInfo {
  storyFlags: StoryFlags;
  currentComputer: MachineId;
}

export interface PiperSessionInfo {
  storyFlags: StoryFlags;
  deliveredPiperIds: string[];
  computerId?: MachineId;
}
