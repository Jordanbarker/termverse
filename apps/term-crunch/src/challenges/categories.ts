import { CHALLENGES } from "./registry";
import type { Challenge } from "./types";

/**
 * A selectable challenge track. Categories are pure filters over the linear
 * `CHALLENGES` registry, derived from each challenge's `type`, plus an "all"
 * group that preserves the full registry order. No per-challenge data needed —
 * adding a challenge to a category is just giving it the matching `type`.
 */
export interface Category {
  id: string;
  label: string;
  challenges: Challenge[]; // registry order, filtered
}

const byType = (t: Challenge["type"]) => CHALLENGES.filter((c) => c.type === t);

export const CATEGORIES: Category[] = [
  { id: "all", label: "All", challenges: CHALLENGES },
  { id: "tmux", label: "Tmux", challenges: byType("tmux") },
  { id: "git", label: "Git", challenges: byType("git") },
  { id: "fs", label: "Filesystem", challenges: byType("fs") },
];

export const DEFAULT_CATEGORY = "all";

/** Categories that actually contain challenges (for the selector). */
export const SELECTABLE_CATEGORIES = CATEGORIES.filter((c) => c.challenges.length > 0);

/** Lookup with a safe fallback to the "all" group (handles stale persisted ids). */
export function getCategory(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}

/**
 * Challenge id -> index in the full registry (== the "all" category's index;
 * that's the only category where id-derived indices are safe). -1 if unknown.
 */
export function registryIndex(id: string): number {
  return CHALLENGES.findIndex((c) => c.id === id);
}
