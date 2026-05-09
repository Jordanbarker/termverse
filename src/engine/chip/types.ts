import { GameEvent } from "../mail/delivery";
import { StoryFlags, ComputerId } from "../../state/types";

export interface ChipMenuItem {
  id: string;
  label: string;
  response: string;
  triggerEvents?: GameEvent[];
  condition?: (flags: StoryFlags, computer: ComputerId) => boolean;
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
