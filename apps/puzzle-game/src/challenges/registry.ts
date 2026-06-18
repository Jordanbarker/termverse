import { panesSplit } from "./panes-split";
import { gitFirstCommit } from "./git-first-commit";
import type { Challenge } from "./types";

/** Ordered, linear progression. The player advances one challenge at a time. */
export const CHALLENGES: Challenge[] = [panesSplit, gitFirstCommit];
