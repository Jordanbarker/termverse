/** A single commit object stored in .git/objects/<hash>.json */
export interface GitCommit {
  hash: string;
  parent: string | null;
  message: string;
  author: string;
  timestamp: number;
  /** Full tree snapshot: relative path → file content */
  tree: Record<string, string>;
}

/** Staging area stored in .git/index.json */
export interface GitIndex {
  staged: Record<string, string>;
  deleted: string[];
}

/** Stash entry stored in .git/stash.json */
export interface GitStashEntry {
  tree: Record<string, string>;
  message: string;
}

/** Parsed repo state (read from .git/ files) */
export interface GitRepo {
  root: string;
  head: string; // e.g. "ref: refs/heads/main" or a raw hash
  currentBranch: string | null; // null if detached HEAD
  index: GitIndex;
  stash: GitStashEntry[];
  remoteUrl: string | null; // from .git/config
  upstream: { remote: string; branch: string } | null;
}

/** Definition of a cloneable remote repository */
export interface RemoteRepoDef {
  /** Files to populate the working tree */
  files: Record<string, string>;
  /** Pre-built commit history (oldest first) */
  commits: GitCommit[];
  /** Default branch name */
  defaultBranch: string;
  /** Optional: returns new commits for git pull based on story state */
  getUpdates?: (storyFlags: Record<string, string | boolean>, localHead: string | null) => GitCommit[];
}
