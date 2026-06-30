import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { findRepoRoot, getCommitLog, gitStatus, listBranches, readRebaseState } from "@tt/core/git/repo";

/**
 * Flattened, validator-friendly view of a git repo's state, read straight from
 * the `.git/` tree inside the VirtualFS. This is the correct detection strategy
 * because `git commit` emits no event in the engine: we compare repo *state*,
 * not a command/event log.
 */
export interface GitReadout {
  hasRepo: boolean;
  root: string | null;
  branch: string | null;
  commitCount: number;
  latestMessage: string | null;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  clean: boolean;
  /** True while a `git rebase` is in progress. */
  rebaseInProgress: boolean;
  /** Files still carrying unresolved conflict markers during a rebase. */
  conflictFiles: string[];
  /** Commits the local branch is ahead of `origin/<branch>` (0 when no upstream). */
  ahead: number;
  /** Commits the local branch is behind `origin/<branch>` (0 when no upstream). */
  behind: number;
}

const EMPTY: GitReadout = {
  hasRepo: false,
  root: null,
  branch: null,
  commitCount: 0,
  latestMessage: null,
  staged: [],
  unstaged: [],
  untracked: [],
  clean: true,
  rebaseInProgress: false,
  conflictFiles: [],
  ahead: 0,
  behind: 0,
};

/**
 * Read repo state by walking up from `atPath` to find the nearest `.git/`.
 * Pass the repo's directory directly (e.g. a challenge's fixed project path) to
 * make detection independent of where the player's cwd currently is.
 */
export function readGitState(fs: VirtualFS, atPath: string): GitReadout {
  const root = findRepoRoot(fs, atPath);
  if (!root) return EMPTY;

  const log = getCommitLog(fs, root);
  const status = gitStatus(fs, root);
  const { current } = listBranches(fs, root);
  const rebase = readRebaseState(fs, root);
  const staged = status.staged.map((s) => s.path);
  const unstaged = status.unstaged.map((s) => s.path);
  const untracked = status.untracked;
  const conflictFiles = status.rebase?.unmerged ?? [];

  return {
    hasRepo: true,
    root,
    branch: status.branch ?? current,
    commitCount: log.length,
    latestMessage: log[0]?.message ?? null,
    staged,
    unstaged,
    untracked,
    clean: !rebase && staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
    rebaseInProgress: !!rebase,
    conflictFiles,
    ahead: status.tracking?.ahead ?? 0,
    behind: status.tracking?.behind ?? 0,
  };
}
