import { GameEvent } from "../mail/delivery";
import { ComputerId, StoryFlags } from "../../state/types";

export interface PiperMessage {
  id: string;
  from: string;
  timestamp: string;
  body: string;
  isPlayer?: boolean;
}

export interface PiperReplyOption {
  label: string;
  messageBody: string;
  triggerEvents?: GameEvent[];
  visibleWhen?: { flag: string };
  hiddenWhen?: { flag: string };
}

export interface PiperDelivery {
  id: string;
  channelId: string;
  messages: PiperMessage[];
  trigger: PiperTrigger | PiperTrigger[];
  replyOptions?: PiperReplyOption[];
  computer?: ComputerId;
}

export type PiperTrigger =
  | { type: "immediate" }
  | { type: "after_file_read"; filePath: string; requireDelivered?: string; excludedFlags?: string[] }
  | { type: "after_email_read"; emailId: string }
  | { type: "after_piper_reply"; deliveryId: string }
  | { type: "after_command"; command: string }
  | { type: "after_objective"; objectiveId: string }
  | { type: "after_story_flag"; flag: string; requireDelivered?: string; excludedFlags?: string[] };

export interface PiperChannel {
  id: string;
  name: string;
  type: "channel" | "dm";
  description?: string;
  computer?: ComputerId;
}

export interface PiperSessionInfo {
  storyFlags: StoryFlags;
  deliveredPiperIds: string[];
  computerId?: ComputerId;
}
