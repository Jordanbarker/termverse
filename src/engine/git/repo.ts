import { VirtualFS } from "../filesystem/VirtualFS";
import { isDirectory, isFile } from "../filesystem/types";
import { normalizePath } from "../../lib/pathUtils";
import { GitCommit, GitIndex, GitRepo, GitStashEntry } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────

/** Walk up from cwd to find a directory containing .git/ */
export function findRepoRoot(fs: VirtualFS, cwd: string): string | null {
  let dir = normalizePath(cwd);
  while (true) {
    const gitDir = dir === "/" ? "/.git" : `${dir}/.git`;
    const node = fs.getNode(gitDir);
    if (node && isDirectory(node)) return dir;
    if (dir === "/") return null;
    const lastSlash = dir.lastIndexOf("/");
    dir = lastSlash === 0 ? "/" : dir.slice(0, lastSlash);
  }
}

/** 7-char hex hash from content string */
export function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Second pass for more entropy
  let h2 = 0x6c62272e;
  for (let i = input.length - 1; i >= 0; i--) {
    h2 ^= input.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193);
  }
  return ((h >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0")).slice(0, 7);
}

/** Recursively collect all files under dirPath, skipping .git/, returning paths relative to relativeTo */
export function collectFiles(fs: VirtualFS, dirPath: string, relativeTo: string): Record<string, string> {
  const result: Record<string, string> = {};
  const { entries } = fs.listDirectory(dirPath);
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const childPath = dirPath === "/" ? `/${entry.name}` : `${dirPath}/${entry.name}`;
    if (isFile(entry)) {
      const rel = childPath.startsWith(relativeTo + "/")
        ? childPath.slice(relativeTo.length + 1)
        : childPath;
      result[rel] = entry.content;
    } else if (isDirectory(entry)) {
      Object.assign(result, collectFiles(fs, childPath, relativeTo));
    }
  }
  return result;
}

// ── Read/Write Repo State ────────────────────────────────────────────

export function readIndex(fs: VirtualFS, root: string): GitIndex {
  const indexPath = `${root}/.git/index.json`;
  const file = fs.readFile(indexPath);
  if (file.content) {
    try { return JSON.parse(file.content); } catch { /* fall through */ }
  }
  return { staged: {}, deleted: [] };
}

export function readStash(fs: VirtualFS, root: string): GitStashEntry[] {
  const stashPath = `${root}/.git/stash.json`;
  const file = fs.readFile(stashPath);
  if (file.content) {
    try { return JSON.parse(file.content); } catch { /* fall through */ }
  }
  return [];
}

export function readHead(fs: VirtualFS, root: string): string {
  const headFile = fs.readFile(`${root}/.git/HEAD`);
  return headFile.content?.trim() ?? "ref: refs/heads/main";
}

export function getCurrentBranch(head: string): string | null {
  if (head.startsWith("ref: refs/heads/")) return head.slice("ref: refs/heads/".length);
  return null;
}

export function resolveHead(fs: VirtualFS, root: string): string | null {
  const head = readHead(fs, root);
  const branch = getCurrentBranch(head);
  if (branch) {
    const refFile = fs.readFile(`${root}/.git/refs/heads/${branch}`);
    return refFile.content?.trim() ?? null;
  }
  return head; // detached HEAD is a raw hash
}

export function readCommit(fs: VirtualFS, root: string, hash: string): GitCommit | null {
  const file = fs.readFile(`${root}/.git/objects/${hash}.json`);
  if (!file.content) return null;
  try { return JSON.parse(file.content); } catch { return null; }
}

export function readRemoteUrl(fs: VirtualFS, root: string): string | null {
  const configFile = fs.readFile(`${root}/.git/config`);
  if (!configFile.content) return null;
  const match = configFile.content.match(/url\s*=\s*(.+)/);
  return match ? match[1].trim() : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Real git stores upstream per-branch as:
//   [branch "<name>"]
//     remote = origin
//     merge = refs/heads/<name>
// We match the section for `branch` and pull its remote/merge keys.
export function readUpstream(fs: VirtualFS, root: string, branch: string | null): { remote: string; branch: string } | null {
  if (!branch) return null;
  const configFile = fs.readFile(`${root}/.git/config`);
  if (!configFile.content) return null;
  const sectionRe = new RegExp(`\\[branch "${escapeRegex(branch)}"\\]([\\s\\S]*?)(?=\\n\\[|$)`);
  const match = configFile.content.match(sectionRe);
  if (!match) return null;
  const body = match[1];
  const remoteMatch = body.match(/^\s*remote\s*=\s*(.+)$/m);
  const mergeMatch = body.match(/^\s*merge\s*=\s*(.+)$/m);
  if (!remoteMatch || !mergeMatch) return null;
  const mergeRef = mergeMatch[1].trim().replace(/^refs\/heads\//, "");
  return { remote: remoteMatch[1].trim(), branch: mergeRef };
}

export function readRepo(fs: VirtualFS, root: string): GitRepo {
  const head = readHead(fs, root);
  return {
    root,
    head,
    currentBranch: getCurrentBranch(head),
    index: readIndex(fs, root),
    stash: readStash(fs, root),
    remoteUrl: readRemoteUrl(fs, root),
    upstream: readUpstream(fs, root, getCurrentBranch(head)),
  };
}

/** Write a file to the FS, chaining immutably. Returns updated fs or throws. */
function writeOrFail(fs: VirtualFS, path: string, content: string): VirtualFS {
  const result = fs.writeFile(path, content);
  if (result.error) throw new Error(result.error);
  return result.fs!;
}

function mkdirOrFail(fs: VirtualFS, path: string): VirtualFS {
  if (fs.getNode(path)) return fs; // already exists
  const result = fs.makeDirectory(path);
  if (result.error) throw new Error(result.error);
  return result.fs!;
}

function removeOrFail(fs: VirtualFS, path: string): VirtualFS {
  const result = fs.removeNode(path);
  if (result.error) throw new Error(result.error);
  return result.fs!;
}

// Write a ref file under .git/refs/, creating any missing parent directories
// (refs can be nested, e.g. refs/heads/feature/x).
function writeRefOrFail(fs: VirtualFS, path: string, content: string): VirtualFS {
  const parts = path.split("/");
  for (let i = 1; i < parts.length - 1; i++) {
    fs = mkdirOrFail(fs, parts.slice(0, i + 1).join("/"));
  }
  return writeOrFail(fs, path, content);
}

// FS-safety subset of git check-ref-format: reject names that would corrupt
// the on-disk layout. Real git's full ruleset is stricter; we only enforce
// what's needed to keep the virtual FS consistent.
export function isValidRefName(name: string): boolean {
  if (!name) return false;
  const segments = name.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") return false;
  }
  return true;
}

// ── git init ─────────────────────────────────────────────────────────

export function gitInit(fs: VirtualFS, cwd: string, _author: string): { fs: VirtualFS; output: string; alreadyExisted: boolean } {
  const gitDir = `${cwd}/.git`;
  const existed = !!fs.getNode(gitDir);

  fs = mkdirOrFail(fs, gitDir);
  fs = mkdirOrFail(fs, `${gitDir}/refs`);
  fs = mkdirOrFail(fs, `${gitDir}/refs/heads`);
  fs = mkdirOrFail(fs, `${gitDir}/refs/remotes`);
  fs = mkdirOrFail(fs, `${gitDir}/refs/remotes/origin`);
  fs = mkdirOrFail(fs, `${gitDir}/objects`);
  fs = writeOrFail(fs, `${gitDir}/HEAD`, "ref: refs/heads/main");
  fs = writeOrFail(fs, `${gitDir}/index.json`, JSON.stringify({ staged: {}, deleted: [] }));

  if (existed) {
    return { fs, output: `Reinitialized existing Git repository in ${cwd}/.git/`, alreadyExisted: true };
  }
  return { fs, output: `Initialized empty Git repository in ${cwd}/.git/`, alreadyExisted: false };
}

// ── git add ──────────────────────────────────────────────────────────

export function gitAdd(fs: VirtualFS, root: string, paths: string[], allFlag: boolean): { fs: VirtualFS; output: string; error?: string } {
  const index = readIndex(fs, root);
  const headHash = resolveHead(fs, root);
  const headTree: Record<string, string> = headHash ? (readCommit(fs, root, headHash)?.tree ?? {}) : {};

  let filesToStage: Record<string, string>;

  if (allFlag || (paths.length === 1 && paths[0] === ".")) {
    // Stage everything
    filesToStage = collectFiles(fs, root, root);
    // Detect deletions: files in HEAD tree no longer on disk
    for (const trackedPath of Object.keys(headTree)) {
      if (!(trackedPath in filesToStage) && !index.deleted.includes(trackedPath)) {
        index.deleted.push(trackedPath);
      }
    }
  } else {
    filesToStage = {};
    for (const p of paths) {
      const absPath = p.startsWith("/") ? p : normalizePath(`${root}/${p}`);
      const node = fs.getNode(absPath);
      if (!node) {
        // Check if it's a tracked file that was deleted
        const relPath = absPath.startsWith(root + "/") ? absPath.slice(root.length + 1) : p;
        if (relPath in headTree) {
          if (!index.deleted.includes(relPath)) {
            index.deleted.push(relPath);
          }
          continue;
        }
        return { fs, output: "", error: `fatal: pathspec '${p}' did not match any files` };
      }
      if (isDirectory(node)) {
        const dirFiles = collectFiles(fs, absPath, root);
        Object.assign(filesToStage, dirFiles);
      } else if (isFile(node)) {
        const relPath = absPath.startsWith(root + "/") ? absPath.slice(root.length + 1) : p;
        filesToStage[relPath] = node.content;
      }
    }
  }

  // Only stage files that differ from HEAD
  for (const [relPath, content] of Object.entries(filesToStage)) {
    if (headTree[relPath] !== content) {
      index.staged[relPath] = content;
    }
    // If it was in deleted, remove from deleted since it exists again
    const delIdx = index.deleted.indexOf(relPath);
    if (delIdx !== -1) index.deleted.splice(delIdx, 1);
  }

  fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify(index));
  return { fs, output: "" };
}

// ── git rm ───────────────────────────────────────────────────────────

export function gitRm(fs: VirtualFS, root: string, paths: string[], recursive: boolean): { fs: VirtualFS; output: string; error?: string } {
  const index = readIndex(fs, root);

  for (const p of paths) {
    const absPath = p.startsWith("/") ? p : normalizePath(`${root}/${p}`);
    const node = fs.getNode(absPath);
    if (!node) {
      return { fs, output: "", error: `fatal: pathspec '${p}' did not match any files` };
    }
    if (isDirectory(node) && !recursive) {
      return { fs, output: "", error: `fatal: not removing '${p}' recursively without -r` };
    }
    const relPath = absPath.startsWith(root + "/") ? absPath.slice(root.length + 1) : p;
    if (isDirectory(node)) {
      // Collect all files in directory and mark them deleted
      const dirFiles = collectFiles(fs, absPath, root);
      for (const filePath of Object.keys(dirFiles)) {
        if (!index.deleted.includes(filePath)) index.deleted.push(filePath);
        delete index.staged[filePath];
      }
    } else {
      if (!index.deleted.includes(relPath)) index.deleted.push(relPath);
      delete index.staged[relPath];
    }
    fs = removeOrFail(fs, absPath);
  }

  fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify(index));
  return { fs, output: "" };
}

// ── git commit ───────────────────────────────────────────────────────

export function gitCommit(
  fs: VirtualFS, root: string, message: string, author: string, amend: boolean, autoStage: boolean
): { fs: VirtualFS; output: string; error?: string } {
  let index = readIndex(fs, root);
  const headHash = resolveHead(fs, root);
  const headCommit = headHash ? readCommit(fs, root, headHash) : null;
  const headTree = headCommit?.tree ?? {};

  // Auto-stage modified tracked files if -a flag
  if (autoStage) {
    const workingTree = collectFiles(fs, root, root);
    for (const [path, content] of Object.entries(workingTree)) {
      if (path in headTree && headTree[path] !== content) {
        index.staged[path] = content;
      }
    }
    // Check for deleted tracked files
    for (const path of Object.keys(headTree)) {
      const absPath = `${root}/${path}`;
      if (!fs.getNode(absPath) && !index.deleted.includes(path)) {
        index.deleted.push(path);
      }
    }
  }

  const hasChanges = Object.keys(index.staged).length > 0 || index.deleted.length > 0;
  if (!hasChanges && !amend) {
    return { fs, output: "nothing to commit, working tree clean" };
  }

  if (amend && !headCommit) {
    return { fs, output: "", error: "fatal: You have nothing to amend." };
  }

  // Build new tree: start from head tree, apply staged, remove deleted
  const newTree: Record<string, string> = { ...headTree };
  for (const [path, content] of Object.entries(index.staged)) {
    newTree[path] = content;
  }
  for (const path of index.deleted) {
    delete newTree[path];
  }

  const parent = amend ? headCommit!.parent : (headHash ?? null);
  const timestamp = Date.now();
  const hash = shortHash(message + timestamp + (parent ?? "") + JSON.stringify(newTree));

  const commit: GitCommit = { hash, parent, message, author, timestamp, tree: newTree };
  fs = writeOrFail(fs, `${root}/.git/objects/${hash}.json`, JSON.stringify(commit));

  // Update branch ref
  const head = readHead(fs, root);
  const branch = getCurrentBranch(head);
  if (branch) {
    fs = writeRefOrFail(fs, `${root}/.git/refs/heads/${branch}`, hash);
  } else {
    fs = writeOrFail(fs, `${root}/.git/HEAD`, hash);
  }

  // Clear index
  fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify({ staged: {}, deleted: [] }));

  const fileCount = Object.keys(index.staged).length + index.deleted.length;
  const branchStr = branch ?? hash.slice(0, 7);
  const rootStr = parent ? "" : " (root-commit)";
  return {
    fs,
    output: `[${branchStr}${rootStr} ${hash}] ${message}\n ${fileCount} file${fileCount !== 1 ? "s" : ""} changed`,
  };
}

// ── git status ───────────────────────────────────────────────────────

export interface StatusResult {
  branch: string | null;
  staged: { path: string; status: "new file" | "modified" | "deleted" }[];
  unstaged: { path: string; status: "modified" | "deleted" }[];
  untracked: string[];
}

export function gitStatus(fs: VirtualFS, root: string): StatusResult {
  const repo = readRepo(fs, root);
  const headHash = resolveHead(fs, root);
  const headTree = headHash ? (readCommit(fs, root, headHash)?.tree ?? {}) : {};
  const workingTree = collectFiles(fs, root, root);

  const staged: StatusResult["staged"] = [];
  const unstaged: StatusResult["unstaged"] = [];
  const untracked: string[] = [];

  // Staged changes (index vs HEAD)
  for (const [path, content] of Object.entries(repo.index.staged)) {
    if (!(path in headTree)) {
      staged.push({ path, status: "new file" });
    } else if (headTree[path] !== content) {
      staged.push({ path, status: "modified" });
    }
  }
  for (const path of repo.index.deleted) {
    staged.push({ path, status: "deleted" });
  }

  // Determine effective tracked tree (HEAD + staged)
  const trackedTree: Record<string, string> = { ...headTree };
  for (const [path, content] of Object.entries(repo.index.staged)) {
    trackedTree[path] = content;
  }
  for (const path of repo.index.deleted) {
    delete trackedTree[path];
  }

  // Unstaged changes (working tree vs tracked tree)
  for (const [path, content] of Object.entries(trackedTree)) {
    if (!(path in workingTree)) {
      unstaged.push({ path, status: "deleted" });
    } else if (workingTree[path] !== content) {
      unstaged.push({ path, status: "modified" });
    }
  }

  // Untracked files
  for (const path of Object.keys(workingTree)) {
    if (!(path in trackedTree) && !(path in repo.index.staged)) {
      untracked.push(path);
    }
  }

  return { branch: repo.currentBranch, staged, unstaged, untracked };
}

// ── git log ──────────────────────────────────────────────────────────

export function getCommitLog(fs: VirtualFS, root: string): GitCommit[] {
  const headHash = resolveHead(fs, root);
  if (!headHash) return [];

  const commits: GitCommit[] = [];
  let current: string | null = headHash;
  while (current) {
    const commit = readCommit(fs, root, current);
    if (!commit) break;
    commits.push(commit);
    current = commit.parent;
  }
  return commits;
}

// ── git branch ───────────────────────────────────────────────────────

export type BranchListMode = "local" | "remotes" | "all";

export function listBranches(
  fs: VirtualFS,
  root: string,
  mode: BranchListMode = "local",
): { branches: string[]; remotes: string[]; current: string | null } {
  const current = getCurrentBranch(readHead(fs, root));

  const collect = (startPath: string, initialPrefix: string): string[] => {
    const out: string[] = [];
    const walk = (dirPath: string, prefix: string) => {
      const { entries } = fs.listDirectory(dirPath);
      for (const entry of entries) {
        if (isFile(entry)) {
          out.push(prefix + entry.name);
        } else if (isDirectory(entry)) {
          walk(`${dirPath}/${entry.name}`, `${prefix}${entry.name}/`);
        }
      }
    };
    walk(startPath, initialPrefix);
    out.sort();
    return out;
  };

  const branches = mode === "remotes" ? [] : collect(`${root}/.git/refs/heads`, "");
  const remotes = mode === "local" ? [] : collect(`${root}/.git/refs/remotes`, "remotes/");
  return { branches, remotes, current };
}

export function createBranch(
  fs: VirtualFS, root: string, name: string
): { fs: VirtualFS; output: string; error?: string; triggerEvents?: { type: "command_executed"; detail: string }[] } {
  if (!isValidRefName(name)) {
    return { fs, output: "", error: `fatal: '${name}' is not a valid branch name` };
  }
  const existing = fs.readFile(`${root}/.git/refs/heads/${name}`);
  if (existing.content) {
    return { fs, output: "", error: `fatal: a branch named '${name}' already exists` };
  }

  const headHash = resolveHead(fs, root);
  if (!headHash) {
    return { fs, output: "", error: `fatal: Not a valid object name: 'HEAD'.` };
  }

  fs = writeRefOrFail(fs, `${root}/.git/refs/heads/${name}`, headHash);
  return { fs, output: "", triggerEvents: [{ type: "command_executed", detail: "git_checkout_b" }] };
}

export function deleteBranch(fs: VirtualFS, root: string, name: string, force: boolean): { fs: VirtualFS; output: string; error?: string } {
  const current = getCurrentBranch(readHead(fs, root));
  if (name === current) {
    return { fs, output: "", error: `error: Cannot delete branch '${name}' checked out at '${root}'` };
  }

  const branchRef = fs.readFile(`${root}/.git/refs/heads/${name}`);
  if (!branchRef.content) {
    return { fs, output: "", error: `error: branch '${name}' not found.` };
  }

  if (!force) {
    const headHash = resolveHead(fs, root);
    if (branchRef.content.trim() !== headHash) {
      return { fs, output: "", error: `error: The branch '${name}' is not fully merged.\nIf you are sure you want to delete it, run 'git branch -D ${name}'.` };
    }
  }

  const hash = branchRef.content.trim();
  fs = removeOrFail(fs, `${root}/.git/refs/heads/${name}`);
  return { fs, output: `Deleted branch ${name} (was ${hash.slice(0, 7)}).` };
}

// ── git checkout ─────────────────────────────────────────────────────

export function gitCheckout(
  fs: VirtualFS, root: string, target: string, createBranch: boolean
): { fs: VirtualFS; output: string; error?: string; triggerEvents?: { type: "command_executed"; detail: string }[] } {
  const headHash = resolveHead(fs, root);
  const headTree = headHash ? (readCommit(fs, root, headHash)?.tree ?? {}) : {};
  const index = readIndex(fs, root);
  const hasUncommitted = Object.keys(index.staged).length > 0 || index.deleted.length > 0;

  if (createBranch) {
    if (!isValidRefName(target)) {
      return { fs, output: "", error: `fatal: '${target}' is not a valid branch name` };
    }
    // Check if branch already exists
    const existing = fs.readFile(`${root}/.git/refs/heads/${target}`);
    if (existing.content) {
      return { fs, output: "", error: `fatal: a branch named '${target}' already exists` };
    }
    // Create branch at current HEAD
    const hash = headHash ?? "";
    if (hash) {
      fs = writeRefOrFail(fs, `${root}/.git/refs/heads/${target}`, hash);
    }
    fs = writeOrFail(fs, `${root}/.git/HEAD`, `ref: refs/heads/${target}`);
    return { fs, output: `Switched to a new branch '${target}'`, triggerEvents: [{ type: "command_executed", detail: "git_checkout_b" }] };
  }

  // Switch to existing branch
  const targetRef = fs.readFile(`${root}/.git/refs/heads/${target}`);
  if (!targetRef.content) {
    return { fs, output: "", error: `error: pathspec '${target}' did not match any file(s) known to git` };
  }

  const targetHash = targetRef.content.trim();
  const targetCommit = readCommit(fs, root, targetHash);
  if (!targetCommit) {
    return { fs, output: "", error: `error: unable to read commit ${targetHash}` };
  }

  // Check for conflicting uncommitted changes
  if (hasUncommitted) {
    const workingTree = collectFiles(fs, root, root);
    const conflicts: string[] = [];
    for (const [path, content] of Object.entries(workingTree)) {
      if (headTree[path] !== content && targetCommit.tree[path] !== undefined && targetCommit.tree[path] !== content) {
        conflicts.push(path);
      }
    }
    if (conflicts.length > 0) {
      return {
        fs, output: "",
        error: `error: Your local changes to the following files would be overwritten by checkout:\n${conflicts.map((f) => `\t${f}`).join("\n")}\nPlease commit your changes or stash them before you switch branches.`,
      };
    }
  }

  // Restore working tree from target commit's snapshot
  const targetTree = targetCommit.tree;

  // Write all files from target tree
  for (const [relPath, content] of Object.entries(targetTree)) {
    const absPath = `${root}/${relPath}`;
    // Ensure parent directories exist
    const parts = relPath.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dirPath = `${root}/${parts.slice(0, i).join("/")}`;
      fs = mkdirOrFail(fs, dirPath);
    }
    fs = writeOrFail(fs, absPath, content);
  }

  // Delete files tracked by current branch but absent from target tree (leave untracked alone)
  for (const path of Object.keys(headTree)) {
    if (!(path in targetTree)) {
      const absPath = `${root}/${path}`;
      if (fs.getNode(absPath)) {
        fs = removeOrFail(fs, absPath);
      }
    }
  }

  // Update HEAD
  fs = writeOrFail(fs, `${root}/.git/HEAD`, `ref: refs/heads/${target}`);
  // Clear index
  fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify({ staged: {}, deleted: [] }));

  return { fs, output: `Switched to branch '${target}'` };
}

// ── git diff ─────────────────────────────────────────────────────────

export interface DiffFile {
  path: string;
  oldContent: string;
  newContent: string;
}

export function gitDiffFiles(fs: VirtualFS, root: string, staged: boolean): DiffFile[] {
  const headHash = resolveHead(fs, root);
  const headTree = headHash ? (readCommit(fs, root, headHash)?.tree ?? {}) : {};
  const diffs: DiffFile[] = [];

  if (staged) {
    const index = readIndex(fs, root);
    for (const [path, content] of Object.entries(index.staged)) {
      const oldContent = headTree[path] ?? "";
      if (oldContent !== content) {
        diffs.push({ path, oldContent, newContent: content });
      }
    }
    for (const path of index.deleted) {
      if (path in headTree) {
        diffs.push({ path, oldContent: headTree[path], newContent: "" });
      }
    }
  } else {
    const index = readIndex(fs, root);
    const trackedTree: Record<string, string> = { ...headTree };
    for (const [path, content] of Object.entries(index.staged)) {
      trackedTree[path] = content;
    }
    for (const path of index.deleted) {
      delete trackedTree[path];
    }

    const workingTree = collectFiles(fs, root, root);
    for (const [path, content] of Object.entries(trackedTree)) {
      if (path in workingTree) {
        if (workingTree[path] !== content) {
          diffs.push({ path, oldContent: content, newContent: workingTree[path] });
        }
      } else {
        diffs.push({ path, oldContent: content, newContent: "" });
      }
    }
    for (const [path, content] of Object.entries(workingTree)) {
      if (!(path in trackedTree)) {
        diffs.push({ path, oldContent: "", newContent: content });
      }
    }
  }

  return diffs;
}

// ── git stash ────────────────────────────────────────────────────────

export function gitStashSave(fs: VirtualFS, root: string): { fs: VirtualFS; output: string; error?: string } {
  const headHash = resolveHead(fs, root);
  const headTree = headHash ? (readCommit(fs, root, headHash)?.tree ?? {}) : {};
  const workingTree = collectFiles(fs, root, root);

  // Find modified tracked files
  const modified: Record<string, string> = {};
  for (const [path, content] of Object.entries(workingTree)) {
    if (path in headTree && headTree[path] !== content) {
      modified[path] = content;
    }
  }
  // Check for new tracked (staged) files
  const index = readIndex(fs, root);
  for (const [path, content] of Object.entries(index.staged)) {
    modified[path] = content;
  }

  if (Object.keys(modified).length === 0 && index.deleted.length === 0) {
    return { fs, output: "No local changes to save" };
  }

  const stash = readStash(fs, root);
  const repo = readRepo(fs, root);
  const branch = repo.currentBranch ?? "detached HEAD";
  const message = `WIP on ${branch}: ${headHash?.slice(0, 7) ?? "no commits"}`;
  stash.unshift({ tree: modified, message });

  fs = writeOrFail(fs, `${root}/.git/stash.json`, JSON.stringify(stash));

  // Revert working tree to HEAD state for modified files
  for (const path of Object.keys(modified)) {
    const absPath = `${root}/${path}`;
    if (path in headTree) {
      fs = writeOrFail(fs, absPath, headTree[path]);
    } else {
      // It was a new file — remove it
      if (fs.getNode(absPath)) fs = removeOrFail(fs, absPath);
    }
  }

  // Clear index
  fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify({ staged: {}, deleted: [] }));

  return { fs, output: `Saved working directory and index state ${message}` };
}

export function gitStashPop(fs: VirtualFS, root: string): { fs: VirtualFS; output: string; error?: string } {
  const stash = readStash(fs, root);
  if (stash.length === 0) {
    return { fs, output: "", error: "error: No stash entries found." };
  }

  const entry = stash.shift()!;
  fs = writeOrFail(fs, `${root}/.git/stash.json`, JSON.stringify(stash));

  // Restore stashed files
  for (const [relPath, content] of Object.entries(entry.tree)) {
    const absPath = `${root}/${relPath}`;
    const parts = relPath.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dirPath = `${root}/${parts.slice(0, i).join("/")}`;
      fs = mkdirOrFail(fs, dirPath);
    }
    fs = writeOrFail(fs, absPath, content);
  }

  return { fs, output: `On branch ${getCurrentBranch(readHead(fs, root)) ?? "HEAD"}, changes restored` };
}

export function gitStashList(fs: VirtualFS, root: string): string {
  const stash = readStash(fs, root);
  if (stash.length === 0) return "";
  return stash.map((entry, i) => `stash@{${i}}: ${entry.message}`).join("\n");
}

// ── git clone ────────────────────────────────────────────────────────

import { RemoteRepoDef } from "./types";
import { REMOTE_REPOS } from "./remotes";

function repoNameFromUrl(url: string): string {
  // Extract repo name from URL like github.com/nexacorp/analytics-pipeline
  const parts = url.replace(/\.git$/, "").split("/");
  return parts[parts.length - 1] || "repo";
}

export function gitClone(
  fs: VirtualFS, cwd: string, url: string, author: string, branchName?: string, _depth?: number
): { fs: VirtualFS; output: string; error?: string; repoName: string; triggerEvents?: { type: "command_executed"; detail: string }[] } {
  const remote = REMOTE_REPOS[url];
  const repoName = repoNameFromUrl(url);
  const repoPath = `${cwd}/${repoName}`;

  if (fs.getNode(repoPath)) {
    return { fs, output: "", error: `fatal: destination path '${repoName}' already exists and is not an empty directory.`, repoName };
  }

  if (!remote) {
    // Check if it looks like a plausible github URL
    if (url.includes("github.com") || url.includes("gitlab.com")) {
      return { fs, output: "", error: `Cloning into '${repoName}'...\nfatal: repository '${url}' not found`, repoName };
    }
    const host = url.split("/")[0] || url;
    return { fs, output: "", error: `Cloning into '${repoName}'...\nfatal: unable to access '${url}': Could not resolve host: ${host}`, repoName };
  }

  const branch = branchName ?? remote.defaultBranch;

  // Create repo directory
  fs = mkdirOrFail(fs, repoPath);

  // Init .git
  const initResult = gitInit(fs, repoPath, author);
  fs = initResult.fs;

  // Set HEAD to desired branch
  fs = writeOrFail(fs, `${repoPath}/.git/HEAD`, `ref: refs/heads/${branch}`);

  // Write remote config + per-branch upstream section (matches real git layout)
  fs = writeOrFail(
    fs,
    `${repoPath}/.git/config`,
    `[remote "origin"]\n  url = ${url}\n  fetch = +refs/heads/*:refs/remotes/origin/*\n[branch "${branch}"]\n  remote = origin\n  merge = refs/heads/${branch}\n`,
  );

  // Write commit objects and set up refs
  let lastHash: string | null = null;
  for (const commit of remote.commits) {
    fs = writeOrFail(fs, `${repoPath}/.git/objects/${commit.hash}.json`, JSON.stringify(commit));
    lastHash = commit.hash;
  }

  if (lastHash) {
    fs = writeRefOrFail(fs, `${repoPath}/.git/refs/heads/${branch}`, lastHash);
    fs = writeRefOrFail(fs, `${repoPath}/.git/refs/remotes/origin/${branch}`, lastHash);
  }

  // Populate working tree from latest commit
  const latestCommit = lastHash ? readCommit(fs, repoPath, lastHash) : null;
  if (latestCommit) {
    for (const [relPath, content] of Object.entries(latestCommit.tree)) {
      const absPath = `${repoPath}/${relPath}`;
      const parts = relPath.split("/");
      for (let i = 1; i < parts.length; i++) {
        const dirPath = `${repoPath}/${parts.slice(0, i).join("/")}`;
        fs = mkdirOrFail(fs, dirPath);
      }
      fs = writeOrFail(fs, absPath, content);
    }
  }

  const fileCount = latestCommit ? Object.keys(latestCommit.tree).length : 0;
  const output = [
    `Cloning into '${repoName}'...`,
    `remote: Enumerating objects: ${remote.commits.length * 3}, done.`,
    `remote: Counting objects: 100% (${remote.commits.length * 3}/${remote.commits.length * 3}), done.`,
    `remote: Compressing objects: 100%, done.`,
    `Receiving objects: 100%, done.`,
    `Resolving deltas: 100%, done.`,
    ...(fileCount > 0 ? [`Unpacking objects: 100% (${fileCount}/${fileCount}), done.`] : []),
  ].join("\n");

  return {
    fs, output, repoName,
    triggerEvents: [{ type: "command_executed", detail: `git_clone_${repoName}` }],
  };
}

// ── git push ─────────────────────────────────────────────────────────

export function gitPush(
  fs: VirtualFS, root: string, remote: string | undefined, branch: string | undefined, setUpstream: boolean, force: boolean
): { fs: VirtualFS; output: string; error?: string; triggerEvents?: { type: "command_executed"; detail: string }[] } {
  const repo = readRepo(fs, root);

  // Resolve remote and branch
  let targetRemote = remote ?? repo.upstream?.remote ?? "origin";
  let targetBranch = branch ?? repo.upstream?.branch ?? repo.currentBranch;
  if (!targetBranch) {
    return { fs, output: "", error: "fatal: No configured push destination" };
  }

  const remoteUrl = readRemoteUrl(fs, root);
  if (!remoteUrl && targetRemote === "origin") {
    return { fs, output: "", error: "fatal: No configured push destination" };
  }

  const headHash = resolveHead(fs, root);
  if (!headHash) {
    return { fs, output: "", error: "error: src refspec does not match any" };
  }

  // Check if remote ref is ahead (non-force)
  const remoteRefFile = fs.readFile(`${root}/.git/refs/remotes/${targetRemote}/${targetBranch}`);
  const remoteHash = remoteRefFile.content?.trim();

  // Already up to date
  if (remoteHash === headHash) {
    return { fs, output: "Everything up-to-date" };
  }

  if (remoteHash && remoteHash !== headHash && !force) {
    // Simple check: if the remote hash isn't an ancestor of local, reject
    let isAncestor = false;
    let current: string | null = headHash;
    while (current) {
      if (current === remoteHash) { isAncestor = true; break; }
      const commit = readCommit(fs, root, current);
      current = commit?.parent ?? null;
    }
    if (!isAncestor) {
      return { fs, output: "", error: "error: failed to push some refs\nhint: Updates were rejected because the remote contains work that you do not\nhint: have locally." };
    }
  }

  // Update remote ref (writeRefOrFail mkdir-p's the parent chain, including
  // the remote dir itself and any nested branch path like feature/x).
  const oldHash = remoteHash ?? "0000000";
  fs = writeRefOrFail(fs, `${root}/.git/refs/remotes/${targetRemote}/${targetBranch}`, headHash);

  // Set upstream if requested — write a per-branch section so each branch
  // tracks its own upstream independently (real git layout).
  if (setUpstream) {
    const existingConfig = fs.readFile(`${root}/.git/config`);
    let configContent = existingConfig.content ?? "";
    // Drop legacy global keys from older saves so they can't shadow per-branch lookups
    configContent = configContent
      .replace(/^\s*merge-remote\s*=\s*.+$\n?/gm, "")
      .replace(/^\s*merge-branch\s*=\s*.+$\n?/gm, "");
    // Strip any existing section for this branch — terminate at the next [section] or EOF
    const sectionRe = new RegExp(
      `\\[branch "${escapeRegex(targetBranch)}"\\][\\s\\S]*?(?=\\n\\[|$)\\n?`,
      "g",
    );
    configContent = configContent.replace(sectionRe, "");
    configContent =
      configContent.trimEnd() +
      `\n[branch "${targetBranch}"]\n  remote = ${targetRemote}\n  merge = refs/heads/${targetBranch}\n`;
    fs = writeOrFail(fs, `${root}/.git/config`, configContent);
  }

  const forceStr = force ? "+ " : "";
  const output = [
    `To ${remoteUrl ?? targetRemote}`,
    `   ${forceStr}${oldHash.slice(0, 7)}..${headHash.slice(0, 7)}  ${targetBranch} -> ${targetBranch}${force ? " (forced update)" : ""}`,
    ...(setUpstream ? [`branch '${targetBranch}' set up to track '${targetRemote}/${targetBranch}'.`] : []),
  ].join("\n");

  return {
    fs, output,
    triggerEvents: [
      { type: "command_executed", detail: `git_push_origin_${targetBranch}` },
      { type: "command_executed", detail: "git_push" },
    ],
  };
}

// ── tree diff helper ────────────────────────────────────────────────

function diffTrees(
  oldTree: Record<string, string>,
  newTree: Record<string, string>
): { path: string; insertions: number; deletions: number }[] {
  const allPaths = new Set([...Object.keys(oldTree), ...Object.keys(newTree)]);
  const changes: { path: string; insertions: number; deletions: number }[] = [];
  for (const path of allPaths) {
    const oldContent = oldTree[path];
    const newContent = newTree[path];
    if (oldContent === newContent) continue;
    const oldLines = oldContent ? oldContent.split("\n").length : 0;
    const newLines = newContent ? newContent.split("\n").length : 0;
    const ins = Math.max(0, newLines - oldLines);
    const del = Math.max(0, oldLines - newLines);
    // Ensure both show non-zero for modified files (content differs but same line count)
    if (oldContent && newContent && ins === 0 && del === 0) {
      changes.push({ path, insertions: 1, deletions: 1 });
    } else {
      changes.push({ path, insertions: ins, deletions: del });
    }
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

// ── git pull ─────────────────────────────────────────────────────────

export function gitPull(
  fs: VirtualFS, root: string, remote: string | undefined, branch: string | undefined, storyFlags: Record<string, string | boolean>
): { fs: VirtualFS; output: string; error?: string; triggerEvents?: { type: "command_executed"; detail: string }[] } {
  const repo = readRepo(fs, root);
  const targetBranch = branch ?? repo.upstream?.branch ?? repo.currentBranch;
  if (!targetBranch) {
    return { fs, output: "", error: "fatal: No configured pull destination" };
  }

  const remoteUrl = readRemoteUrl(fs, root);
  if (!remoteUrl) {
    const host = (remote ?? "origin").split("/")[0];
    return { fs, output: "", error: `fatal: unable to access '${remote ?? "origin"}': Could not resolve host: ${host}` };
  }

  const remoteDef = REMOTE_REPOS[remoteUrl];
  if (!remoteDef) {
    return { fs, output: "", error: `fatal: repository '${remoteUrl}' not found` };
  }

  const headHash = resolveHead(fs, root);

  // Check for updates from remote
  if (remoteDef.getUpdates) {
    const newCommits = remoteDef.getUpdates(storyFlags, headHash);
    if (newCommits.length === 0) {
      return { fs, output: "Already up to date." };
    }

    // Write new commit objects
    let lastHash = headHash;
    for (const commit of newCommits) {
      fs = writeOrFail(fs, `${root}/.git/objects/${commit.hash}.json`, JSON.stringify(commit));
      lastHash = commit.hash;
    }

    // Fast-forward local and remote refs
    if (lastHash) {
      fs = writeOrFail(fs, `${root}/.git/refs/heads/${targetBranch}`, lastHash);
      fs = writeOrFail(fs, `${root}/.git/refs/remotes/origin/${targetBranch}`, lastHash);

      // Update working tree from latest commit
      const latestCommit = readCommit(fs, root, lastHash);
      if (latestCommit) {
        for (const [relPath, content] of Object.entries(latestCommit.tree)) {
          const absPath = `${root}/${relPath}`;
          const parts = relPath.split("/");
          for (let i = 1; i < parts.length; i++) {
            const dirPath = `${root}/${parts.slice(0, i).join("/")}`;
            fs = mkdirOrFail(fs, dirPath);
          }
          fs = writeOrFail(fs, absPath, content);
        }
      }
    }

    const oldTree = headHash ? (readCommit(fs, root, headHash)?.tree ?? {}) : {};
    const newTree = newCommits[newCommits.length - 1].tree;
    const changes = diffTrees(oldTree, newTree);

    const maxPathLen = Math.max(...changes.map(c => c.path.length), 0);
    const maxTotal = Math.max(...changes.map(c => c.insertions + c.deletions), 0);
    const barWidth = Math.min(maxTotal, 40);

    const fileLines = changes.map(c => {
      const total = c.insertions + c.deletions;
      const scale = maxTotal > 0 ? barWidth / maxTotal : 0;
      const plusCount = Math.round(c.insertions * scale);
      const minusCount = Math.round(c.deletions * scale);
      const bar = "+".repeat(plusCount) + "-".repeat(minusCount);
      return ` ${c.path.padEnd(maxPathLen)} | ${String(total).padStart(3)} ${bar}`;
    });

    const totalIns = changes.reduce((s, c) => s + c.insertions, 0);
    const totalDel = changes.reduce((s, c) => s + c.deletions, 0);
    const summaryParts = [`${changes.length} file${changes.length !== 1 ? "s" : ""} changed`];
    if (totalIns > 0) summaryParts.push(`${totalIns} insertion${totalIns !== 1 ? "s" : ""}(+)`);
    if (totalDel > 0) summaryParts.push(`${totalDel} deletion${totalDel !== 1 ? "s" : ""}(-)`);

    const header = `From ${remoteUrl}\n   ${(headHash ?? "0000000").slice(0, 7)}..${(lastHash ?? "0000000").slice(0, 7)}  ${targetBranch} -> origin/${targetBranch}\nFast-forward`;
    const output = [header, ...fileLines, ` ${summaryParts.join(", ")}`].join("\n");

    return {
      fs,
      output,
      triggerEvents: [{ type: "command_executed", detail: `git_pull_origin_${targetBranch}` }],
    };
  }

  return { fs, output: "Already up to date." };
}
