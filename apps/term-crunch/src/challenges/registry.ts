import { panesSplit } from "./panes-split";
import { panesGrid } from "./panes-grid";
import { panesCleanup } from "./panes-cleanup";
import { panesResize } from "./panes-resize";
import { panesResizeRows } from "./panes-resize-rows";
import { panesResizeCorner } from "./panes-resize-corner";
import { windowsCreate } from "./windows-create";
import { gitFirstCommit } from "./git-first-commit";
import { gitUnstage } from "./git-unstage";
import { gitStashChallenge } from "./git-stash";
import { gitPullFf } from "./git-pull-ff";
import { gitRebaseChallenge } from "./git-rebase";
import { rmBomb } from "./rm-bomb";
import { chmodPerms } from "./chmod-perms";
import { copyModeYank } from "./copy-mode-yank";
import { sessionsDetachAttach } from "./sessions-detach-attach";
import { sessionsJuggle } from "./sessions-juggle";
import type { Challenge } from "./types";

/** Ordered, linear progression. The player advances one challenge at a time. */
export const CHALLENGES: Challenge[] = [panesSplit, panesGrid, panesCleanup, panesResize, panesResizeRows, panesResizeCorner, windowsCreate, gitFirstCommit, gitUnstage, gitStashChallenge, gitPullFf, gitRebaseChallenge, rmBomb, chmodPerms, copyModeYank, sessionsDetachAttach, sessionsJuggle];
