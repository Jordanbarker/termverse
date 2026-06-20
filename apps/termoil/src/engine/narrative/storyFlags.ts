import { GameEvent } from "../mail/delivery";
import { StoryFlags } from "../../state/types";
import type { StoryFlagTrigger } from "../../story/storyFlags";

// Re-export story data for convenience
export type { StoryFlagName, StoryFlagTrigger } from "../../story/storyFlags";
export { STORY_FLAG_NAMES, getStoryFlagTriggers, getNexacorpStoryFlagTriggers, getDevcontainerStoryFlagTriggers, getTriggersForComputer } from "../../story/storyFlags";

export function checkStoryFlagTriggers(
  event: GameEvent,
  triggers: StoryFlagTrigger[],
  currentFlags: StoryFlags
): { flag: string; value: string | boolean; toast?: string }[] {
  const results: { flag: string; value: string | boolean; toast?: string }[] = [];

  for (const trigger of triggers) {
    if (trigger.event === event.type) {
      if (trigger.requiredFlags?.some(f => !currentFlags[f])) continue;
      const matchExact = trigger.path ?? trigger.detail;
      const matchPrefix = trigger.pathPrefix;
      const matchSuffix = trigger.pathSuffix;
      const detail = event.detail;
      let fired = false;
      if ((matchPrefix || matchSuffix) && detail) {
        const prefixOk = !matchPrefix || detail.startsWith(matchPrefix);
        const suffixOk = !matchSuffix || detail.endsWith(matchSuffix);
        if (prefixOk && suffixOk) fired = true;
      } else if (matchExact && detail === matchExact) {
        fired = true;
      }
      if (fired && currentFlags[trigger.flag] === undefined) {
        results.push({ flag: trigger.flag, value: trigger.value, toast: trigger.toast });
      }
    }
  }

  return results;
}

