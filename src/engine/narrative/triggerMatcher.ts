import { GameEvent } from "../mail/delivery";
import { StoryFlags } from "../../state/types";

export type CommonTrigger =
  | { type: "immediate" }
  | { type: "after_file_read"; filePath: string; requireDelivered?: string; excludedFlags?: string[] }
  | { type: "after_email_read"; emailId: string }
  | { type: "after_command"; command: string; requiredFlags?: string[] }
  | { type: "after_objective"; objectiveId: string }
  | { type: "after_story_flag"; flag: string; requireDelivered?: string; requiredFlags?: string[]; excludedFlags?: string[] }
  | { type: "after_event_detail"; eventType: GameEvent["type"]; detail: string };

export function matchesCommonTrigger(
  trigger: CommonTrigger,
  event: GameEvent,
  deliveredIds: string[],
  newDeliveries: string[],
  flags?: StoryFlags
): boolean {
  switch (trigger.type) {
    case "immediate":
      return false;
    case "after_file_read":
      if (event.type !== "file_read" || event.detail !== trigger.filePath) return false;
      if (trigger.excludedFlags && flags && trigger.excludedFlags.some((f) => flags[f])) return false;
      if (trigger.requireDelivered) {
        return deliveredIds.includes(trigger.requireDelivered) || newDeliveries.includes(trigger.requireDelivered);
      }
      return true;
    case "after_email_read":
      return event.type === "file_read" && event.detail === trigger.emailId;
    case "after_command":
      if (event.type !== "command_executed" || event.detail !== trigger.command) return false;
      if (trigger.requiredFlags && flags) {
        return trigger.requiredFlags.every((f) => flags[f]);
      }
      return true;
    case "after_objective":
      return event.type === "objective_completed" && event.detail === trigger.objectiveId;
    case "after_story_flag":
      if (!(flags && flags[trigger.flag])) return false;
      if (trigger.requiredFlags && !trigger.requiredFlags.every((f) => flags[f])) return false;
      if (trigger.excludedFlags && trigger.excludedFlags.some((f) => flags[f])) return false;
      if (trigger.requireDelivered) {
        return deliveredIds.includes(trigger.requireDelivered) || newDeliveries.includes(trigger.requireDelivered);
      }
      return true;
    case "after_event_detail":
      return event.type === trigger.eventType && event.detail === trigger.detail;
  }
}
