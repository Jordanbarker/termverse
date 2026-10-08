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
import { gitBranchDelete } from "./git-branch-delete";
import { rmBomb } from "./rm-bomb";
import { chmodPerms } from "./chmod-perms";
import { mvOrganize } from "./mv-organize";
import { envExport } from "./env-export";
import { aliasShortcut } from "./alias-shortcut";
import { copyModeYank } from "./copy-mode-yank";
import { sessionsDetachAttach } from "./sessions-detach-attach";
import { sessionsJuggle } from "./sessions-juggle";
import { sessionsRename } from "./sessions-rename";
import { vimFirstEdit } from "./vim-first-edit";
import { vimDeleteLines } from "./vim-delete-lines";
import { vimFixWord } from "./vim-fix-word";
import { vimYankPaste } from "./vim-yank-paste";
import { vimReorder } from "./vim-reorder";
import type { Challenge } from "./types";

/**
 * Ordered, linear progression. The player advances one challenge at a time.
 * Tracks are contiguous (tmux, git, fs, shell, vim) so the "all" track never
 * doubles back. `panes-resize` is separated from the other two resize
 * challenges by cleanup/windows; `panes-resize-rows` and `panes-resize-corner`
 * run back to back since the corner one builds directly on the row resize.
 */
export const CHALLENGES: Challenge[] = [
  // tmux
  panesSplit, panesGrid, panesResize, panesCleanup, windowsCreate, panesResizeRows, panesResizeCorner,
  copyModeYank, sessionsDetachAttach, sessionsJuggle, sessionsRename,
  // git
  gitFirstCommit, gitUnstage, gitStashChallenge, gitPullFf, gitBranchDelete, gitRebaseChallenge,
  // fs
  rmBomb, chmodPerms, mvOrganize,
  // shell
  envExport, aliasShortcut,
  // vim
  vimFirstEdit, vimDeleteLines, vimFixWord, vimYankPaste, vimReorder,
];
