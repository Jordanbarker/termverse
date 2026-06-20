import { ChapterDefinition, ObjectiveCompletionCheck } from "./types";
import { StoryFlags } from "../../state/types";

export interface ResolvedObjective {
  id: string;
  description: string;
  completed: boolean;
  failed: boolean;
  visible: boolean;
  optional: boolean;
  group?: string;
}

function isCheckSatisfied(
  check: ObjectiveCompletionCheck,
  storyFlags: StoryFlags,
  completedObjectives: string[],
  deliveredEmailIds: string[]
): boolean {
  switch (check.source) {
    case "storyFlag":
      return !!storyFlags[check.key];
    case "completedObjective":
      return completedObjectives.includes(check.key);
    case "deliveredEmail":
      return deliveredEmailIds.includes(check.key);
    case "allVisibleChildren":
      // Handled in pass 3 — should not reach here
      return false;
    case "all":
      return check.checks.every((c) =>
        isCheckSatisfied(c, storyFlags, completedObjectives, deliveredEmailIds)
      );
  }
}

export function resolveObjectives(
  chapter: ChapterDefinition,
  storyFlags: StoryFlags,
  completedObjectives: string[],
  deliveredEmailIds: string[]
): ResolvedObjective[] {
  // Pass 1: determine completion status for concrete checks
  const completionMap = new Map<string, boolean>();
  for (const obj of chapter.objectives) {
    if (obj.check.source === "allVisibleChildren") {
      // Deferred to pass 3
      completionMap.set(obj.id, false);
    } else {
      completionMap.set(
        obj.id,
        isCheckSatisfied(obj.check, storyFlags, completedObjectives, deliveredEmailIds)
      );
    }
  }

  // Pass 2: determine visibility
  const visibilityMap = new Map<string, boolean>();
  for (const obj of chapter.objectives) {
    let visible = !obj.hidden;
    if (obj.hidden && obj.prerequisite) {
      visible = !!completionMap.get(obj.prerequisite);
    }
    if (obj.hidden && obj.visibleWhen) {
      visible = isCheckSatisfied(
        obj.visibleWhen,
        storyFlags,
        completedObjectives,
        deliveredEmailIds
      );
    }
    visibilityMap.set(obj.id, visible);
  }

  // Pass 3: compute derived completion for allVisibleChildren parents
  for (const obj of chapter.objectives) {
    if (obj.check.source === "allVisibleChildren") {
      const visibleChildren = chapter.objectives.filter(
        (child) => child.group === obj.id && visibilityMap.get(child.id)
      );
      completionMap.set(
        obj.id,
        visibleChildren.length > 0 && visibleChildren.every((c) => !!completionMap.get(c.id))
      );
    }
  }

  return chapter.objectives.map((obj) => {
    const failed = obj.failCheck
      ? isCheckSatisfied(obj.failCheck, storyFlags, completedObjectives, deliveredEmailIds)
      : false;

    return {
      id: obj.id,
      description: obj.description,
      completed: !!completionMap.get(obj.id),
      failed,
      visible: !!visibilityMap.get(obj.id),
      optional: !!obj.optional,
      group: obj.group,
    };
  });
}
