import { panesSplit } from "./panes-split";
import { panesGrid } from "./panes-grid";
import { panesCleanup } from "./panes-cleanup";
import { panesResize } from "./panes-resize";
import { windowsCreate } from "./windows-create";
import { gitFirstCommit } from "./git-first-commit";
import { gitStashChallenge } from "./git-stash";
import { gitPullFf } from "./git-pull-ff";
import { gitRebaseChallenge } from "./git-rebase";
import { rmBomb } from "./rm-bomb";
import { chmodPerms } from "./chmod-perms";
import { copyModeYank } from "./copy-mode-yank";
import type { Challenge } from "./types";

/** Ordered, linear progression. The player advances one challenge at a time. */
export const CHALLENGES: Challenge[] = [panesSplit, panesGrid, panesCleanup, panesResize, windowsCreate, gitFirstCommit, gitStashChallenge, gitPullFf, gitRebaseChallenge, rmBomb, chmodPerms, copyModeYank];
