import { panesSplit } from "./panes-split";
import { windowsCreate } from "./windows-create";
import { gitFirstCommit } from "./git-first-commit";
import { gitStashChallenge } from "./git-stash";
import { gitRebaseChallenge } from "./git-rebase";
import { rmBomb } from "./rm-bomb";
import { chmodPerms } from "./chmod-perms";
import type { Challenge } from "./types";

/** Ordered, linear progression. The player advances one challenge at a time. */
export const CHALLENGES: Challenge[] = [panesSplit, windowsCreate, gitFirstCommit, gitStashChallenge, gitRebaseChallenge, rmBomb, chmodPerms];
