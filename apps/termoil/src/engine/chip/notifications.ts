import { StoryFlags, ComputerId } from "../../state/types";
import { getMenuItems } from "../../story/chip/menuItems";

export function findNewlyAvailableChipTopics(
  flags: StoryFlags,
  computer: ComputerId,
  notified: readonly string[],
): string[] {
  const seen = new Set(notified);
  return getMenuItems(flags, computer)
    .filter((item) => item.notifyOnUnlock === true && !seen.has(item.id))
    .map((item) => item.id);
}
