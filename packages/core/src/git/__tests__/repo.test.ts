import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";
import {
  findRepoRoot, shortHash, collectFiles,
  gitInit, gitAdd, gitCommit, gitStatus, getCommitLog,
  listBranches, createBranch, deleteBranch, gitCheckout, gitDiffFiles,
  gitStashSave, gitStashPop, gitStashList,
  gitRm, gitClone, gitPush, gitPull,
  resolveHead, readIndex,
} from "../repo";
import { formatStatus, formatLog } from "../output";
import { buildSimpleRemote, REMOTE_REPOS } from "../remotes";

const AUTHOR = "player <player@test.local>";
const TEST_TS = new Date(2026, 1, 23, 8, 30, 0).getTime();

function emptyRoot(): DirectoryNode {
  return {
    type: "directory", name: "/", permissions: "rwxr-xr-x", hidden: false,
    children: {
      home: {
        type: "directory", name: "home", permissions: "rwxr-xr-x", hidden: false,
        children: {
          player: {
            type: "directory", name: "player", permissions: "rwxr-xr-x", hidden: false,
            children: {},
          },
        },
      },
    },
  };
}

function makeFs(): VirtualFS {
  return new VirtualFS(emptyRoot(), "/home/player", "/home/player");
}

function initRepo(fs: VirtualFS, cwd = "/home/player"): VirtualFS {
  return gitInit(fs, cwd, AUTHOR).fs;
}

function addAndCommit(fs: VirtualFS, root: string, message: string): VirtualFS {
  const addResult = gitAdd(fs, root, root, ["."], false);
  fs = addResult.fs;
  const commitResult = gitCommit(fs, root, message, AUTHOR, false, false, TEST_TS);
  return commitResult.fs;
}

// ── findRepoRoot ─────────────────────────────────────────────────────

describe("findRepoRoot", () => {
  it("finds repo in current directory", () => {
    const fs = initRepo(makeFs());
    expect(findRepoRoot(fs, "/home/player")).toBe("/home/player");
  });

  it("finds repo in parent directory", () => {
    let fs = initRepo(makeFs());
    fs = fs.makeDirectory("/home/player/subdir").fs!;
    expect(findRepoRoot(fs, "/home/player/subdir")).toBe("/home/player");
  });

  it("returns null when no repo exists", () => {
    expect(findRepoRoot(makeFs(), "/home/player")).toBeNull();
  });
});

// ── shortHash ────────────────────────────────────────────────────────

describe("shortHash", () => {
  it("returns 7-char hex string", () => {
    const h = shortHash("test input");
    expect(h).toMatch(/^[0-9a-f]{7}$/);
  });

  it("is deterministic", () => {
    expect(shortHash("hello")).toBe(shortHash("hello"));
  });

  it("differs for different inputs", () => {
    expect(shortHash("a")).not.toBe(shortHash("b"));
  });
});

// ── git init ─────────────────────────────────────────────────────────

describe("git init", () => {
  it("creates .git directory structure", () => {
    const fs = initRepo(makeFs());
    expect(fs.getNode("/home/player/.git")).toBeTruthy();
    expect(fs.getNode("/home/player/.git/HEAD")).toBeTruthy();
    expect(fs.getNode("/home/player/.git/refs/heads")).toBeTruthy();
    expect(fs.getNode("/home/player/.git/objects")).toBeTruthy();
  });

  it("sets HEAD to main", () => {
    const fs = initRepo(makeFs());
    expect(fs.readFile("/home/player/.git/HEAD").content).toBe("ref: refs/heads/main");
  });

  it("reports reinit for existing repo", () => {
    const fs = initRepo(makeFs());
    const result = gitInit(fs, "/home/player", AUTHOR);
    expect(result.alreadyExisted).toBe(true);
    expect(result.output).toContain("Reinitialized");
  });
});

// ── git add + commit ─────────────────────────────────────────────────

describe("git add and commit", () => {
  it("stages and commits a file", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/hello.txt", "hello world").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["hello.txt"], false).fs;
    const result = gitCommit(fs, "/home/player", "first commit", AUTHOR, false, false, TEST_TS);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("first commit");
    expect(result.output).toContain("1 file changed");
  });

  it("reports nothing to commit when clean", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "content").fs!;
    fs = addAndCommit(fs, "/home/player", "initial");
    const result = gitCommit(fs, "/home/player", "empty", AUTHOR, false, false, TEST_TS);
    expect(result.output).toContain("nothing to commit");
  });

  it("stages all with git add .", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "aaa").fs!;
    fs = fs.writeFile("/home/player/b.txt", "bbb").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["."], false).fs;
    const result = gitCommit(fs, "/home/player", "two files", AUTHOR, false, false, TEST_TS);
    expect(result.output).toContain("2 files changed");
  });

  it("returns error for nonexistent file", () => {
    const fs = initRepo(makeFs());
    const result = gitAdd(fs, "/home/player", "/home/player", ["missing.txt"], false);
    expect(result.error).toContain("pathspec 'missing.txt' did not match any files");
  });

  it("git add . is scoped to the current directory, not the whole repo", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/root.txt", "at root").fs!;
    fs = fs.makeDirectory("/home/player/sub").fs!;
    fs = fs.writeFile("/home/player/sub/nested.txt", "in sub").fs!;
    // Run `git add .` from within sub/ — only sub/nested.txt should stage.
    fs = gitAdd(fs, "/home/player", "/home/player/sub", ["."], false).fs;
    const index = readIndex(fs, "/home/player");
    expect(index.staged["sub/nested.txt"]).toBe("in sub");
    expect(index.staged["root.txt"]).toBeUndefined();
  });

  it("-A stages the whole repo regardless of cwd", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/root.txt", "at root").fs!;
    fs = fs.makeDirectory("/home/player/sub").fs!;
    fs = fs.writeFile("/home/player/sub/nested.txt", "in sub").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player/sub", [], true).fs;
    const index = readIndex(fs, "/home/player");
    expect(index.staged["sub/nested.txt"]).toBe("in sub");
    expect(index.staged["root.txt"]).toBe("at root");
  });

  it("relative pathspecs resolve against cwd", () => {
    let fs = initRepo(makeFs());
    fs = fs.makeDirectory("/home/player/sub").fs!;
    fs = fs.writeFile("/home/player/sub/nested.txt", "in sub").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player/sub", ["nested.txt"], false).fs;
    const index = readIndex(fs, "/home/player");
    expect(index.staged["sub/nested.txt"]).toBe("in sub");
  });

  it("git add . detects deletions within the current directory only", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/root.txt", "at root").fs!;
    fs = fs.makeDirectory("/home/player/sub").fs!;
    fs = fs.writeFile("/home/player/sub/nested.txt", "in sub").fs!;
    fs = addAndCommit(fs, "/home/player", "initial");
    // Delete both files, then `git add .` from sub/.
    fs = fs.removeNode("/home/player/root.txt").fs!;
    fs = fs.removeNode("/home/player/sub/nested.txt").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player/sub", ["."], false).fs;
    const index = readIndex(fs, "/home/player");
    expect(index.deleted).toContain("sub/nested.txt");
    expect(index.deleted).not.toContain("root.txt");
  });

  it("only stages modified files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "original").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    // Add without modifying
    fs = gitAdd(fs, "/home/player", "/home/player", ["."], false).fs;
    const result = gitCommit(fs, "/home/player", "no changes", AUTHOR, false, false, TEST_TS);
    expect(result.output).toContain("nothing to commit");
  });

  it("commit -a auto-stages modified files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    const result = gitCommit(fs, "/home/player", "auto staged", AUTHOR, false, true, TEST_TS);
    expect(result.output).toContain("auto staged");
    expect(result.error).toBeUndefined();
  });

  it("commit --amend replaces HEAD commit", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "original message");
    // Amend
    const result = gitCommit(fs, "/home/player", "amended message", AUTHOR, true, false, TEST_TS);
    expect(result.output).toContain("amended message");
    fs = result.fs;
    const log = getCommitLog(fs, "/home/player");
    expect(log).toHaveLength(1);
    expect(log[0].message).toBe("amended message");
  });
});

// ── git status ───────────────────────────────────────────────────────

describe("git status", () => {
  it("shows untracked files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/new.txt", "content").fs!;
    const status = gitStatus(fs, "/home/player");
    expect(status.untracked).toContain("new.txt");
  });

  it("shows staged files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "content").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["a.txt"], false).fs;
    const status = gitStatus(fs, "/home/player");
    expect(status.staged).toHaveLength(1);
    expect(status.staged[0].status).toBe("new file");
  });

  it("shows modified unstaged files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    const status = gitStatus(fs, "/home/player");
    expect(status.unstaged).toHaveLength(1);
    expect(status.unstaged[0].status).toBe("modified");
  });

  it("shows clean repo", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const status = gitStatus(fs, "/home/player");
    expect(status.staged).toHaveLength(0);
    expect(status.unstaged).toHaveLength(0);
    expect(status.untracked).toHaveLength(0);
  });
});

// ── git log ──────────────────────────────────────────────────────────

describe("git log", () => {
  it("returns commits in reverse chronological order", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = addAndCommit(fs, "/home/player", "second");
    const log = getCommitLog(fs, "/home/player");
    expect(log).toHaveLength(2);
    expect(log[0].message).toBe("second");
    expect(log[1].message).toBe("first");
  });

  it("returns empty log for new repo", () => {
    const fs = initRepo(makeFs());
    expect(getCommitLog(fs, "/home/player")).toHaveLength(0);
  });
});

// ── git branch ───────────────────────────────────────────────────────

describe("git branch", () => {
  it("lists branches with current marked", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const { branches, current } = listBranches(fs, "/home/player");
    expect(branches).toContain("main");
    expect(current).toBe("main");
  });

  it("deletes a branch", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = gitCheckout(fs, "/home/player", "feature", true).fs;
    fs = gitCheckout(fs, "/home/player", "main", false).fs;
    const result = deleteBranch(fs, "/home/player", "feature", true);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("Deleted branch feature");
  });

  it("refuses to delete current branch", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = deleteBranch(fs, "/home/player", "main", false);
    expect(result.error).toContain("Cannot delete");
  });

  it("creates a branch silently at HEAD", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = createBranch(fs, "/home/player", "hi");
    expect(result.error).toBeUndefined();
    expect(result.output).toBe("");
    const { branches, current } = listBranches(result.fs, "/home/player");
    expect(branches).toContain("hi");
    expect(current).toBe("main"); // didn't switch
    // ref points to current HEAD hash
    const headHash = resolveHead(result.fs, "/home/player");
    const ref = result.fs.readFile("/home/player/.git/refs/heads/hi").content?.trim();
    expect(ref).toBe(headHash);
  });

  it("emits git_checkout_b trigger so `git branch <name>` counts as branching for story flags", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = createBranch(fs, "/home/player", "feature");
    expect(result.triggerEvents).toEqual([{ type: "command_executed", detail: "git_checkout_b" }]);
  });

  it("errors when creating a branch that already exists", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = createBranch(fs, "/home/player", "main");
    expect(result.error).toContain("already exists");
  });

  it("errors when creating a branch in an empty repo", () => {
    const fs = initRepo(makeFs());
    const result = createBranch(fs, "/home/player", "hi");
    expect(result.error).toContain("Not a valid object name");
  });

  it("returns empty remotes by default (mode='local')", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const { branches, remotes } = listBranches(fs, "/home/player");
    expect(branches).toContain("main");
    expect(remotes).toEqual([]);
  });
});

// ── git branch -a / -r (remote-tracking branches) ────────────────────

describe("git branch -a / -r", () => {
  const TEST_URL = "__test__/branch-a-remote";

  beforeEach(() => {
    REMOTE_REPOS[TEST_URL] = buildSimpleRemote(
      { "README.md": "# Test" },
      { author: AUTHOR, defaultBranch: "main", commitMessage: "init" },
    );
  });

  afterEach(() => {
    delete REMOTE_REPOS[TEST_URL];
  });

  it("mode='all' includes both local heads and remotes/origin/<branch>", () => {
    const fs = makeFs();
    const cloneResult = gitClone(fs, "/home/player", TEST_URL, AUTHOR);
    const root = "/home/player/branch-a-remote";
    const { branches, remotes, current } = listBranches(cloneResult.fs, root, "all");
    expect(branches).toContain("main");
    expect(remotes).toContain("remotes/origin/main");
    expect(current).toBe("main");
  });

  it("mode='remotes' returns only remote-tracking branches, no locals", () => {
    const fs = makeFs();
    const cloneResult = gitClone(fs, "/home/player", TEST_URL, AUTHOR);
    const root = "/home/player/branch-a-remote";
    const { branches, remotes } = listBranches(cloneResult.fs, root, "remotes");
    expect(branches).toEqual([]);
    expect(remotes).toContain("remotes/origin/main");
  });

  it("remotes are sorted", () => {
    const fs = makeFs();
    const cloneResult = gitClone(fs, "/home/player", TEST_URL, AUTHOR);
    const root = "/home/player/branch-a-remote";
    // Manually add a second remote ref to verify sort order
    const withExtra = cloneResult.fs.writeFile(
      `${root}/.git/refs/remotes/origin/develop`,
      resolveHead(cloneResult.fs, root) ?? "",
    ).fs!;
    const { remotes } = listBranches(withExtra, root, "all");
    expect(remotes).toEqual(["remotes/origin/develop", "remotes/origin/main"]);
  });
});

// ── nested branch names (refs/heads/feature/x) ───────────────────────

describe("nested branch names", () => {
  it("createBranch creates and lists a nested branch", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = createBranch(fs, "/home/player", "feature/x");
    expect(result.error).toBeUndefined();
    const { branches } = listBranches(result.fs, "/home/player");
    expect(branches).toContain("feature/x");
    expect(branches).toContain("main");
  });

  it("gitCheckout -b creates a nested branch and switches to it", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitCheckout(fs, "/home/player", "fix/bug-123", true);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("Switched to a new branch 'fix/bug-123'");
    const { current } = listBranches(result.fs, "/home/player");
    expect(current).toBe("fix/bug-123");
  });

  it("listBranches returns the full nested name, not just the leaf", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = createBranch(fs, "/home/player", "feature/a").fs;
    fs = createBranch(fs, "/home/player", "feature/b").fs;
    fs = createBranch(fs, "/home/player", "release/2026-q2").fs;
    const { branches } = listBranches(fs, "/home/player");
    expect(branches).toEqual(["feature/a", "feature/b", "main", "release/2026-q2"]);
  });

  it("deleteBranch removes a nested branch", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = createBranch(fs, "/home/player", "feature/x").fs;
    const result = deleteBranch(fs, "/home/player", "feature/x", true);
    expect(result.error).toBeUndefined();
    const { branches } = listBranches(result.fs, "/home/player");
    expect(branches).not.toContain("feature/x");
  });

  it("commit on nested branch updates the nested ref", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = gitCheckout(fs, "/home/player", "feature/x", true).fs;
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = addAndCommit(fs, "/home/player", "on feature");
    const ref = fs.readFile("/home/player/.git/refs/heads/feature/x").content?.trim();
    expect(ref).toBe(resolveHead(fs, "/home/player"));
  });

  it("rejects ref names with FS-unsafe segments", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    for (const bad of ["/leading", "trailing/", "a//b", "a/./b", "a/../b", ""]) {
      const result = createBranch(fs, "/home/player", bad);
      expect(result.error, `expected '${bad}' to be rejected`).toContain("not a valid branch name");
    }
  });

  it("checkout -b also rejects FS-unsafe names", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitCheckout(fs, "/home/player", "a/../b", true);
    expect(result.error).toContain("not a valid branch name");
  });
});

// ── git checkout ─────────────────────────────────────────────────────

describe("git checkout", () => {
  it("creates a new branch with -b", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitCheckout(fs, "/home/player", "feature", true);
    expect(result.output).toContain("Switched to a new branch 'feature'");
    const { current } = listBranches(result.fs, "/home/player");
    expect(current).toBe("feature");
  });

  it("errors on duplicate branch name with -b", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitCheckout(fs, "/home/player", "main", true);
    expect(result.error).toContain("already exists");
  });

  it("switches branches and restores files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "main content").fs!;
    fs = addAndCommit(fs, "/home/player", "main commit");
    fs = gitCheckout(fs, "/home/player", "feature", true).fs;
    fs = fs.writeFile("/home/player/a.txt", "feature content").fs!;
    fs = addAndCommit(fs, "/home/player", "feature commit");
    // Switch back to main
    fs = gitCheckout(fs, "/home/player", "main", false).fs;
    expect(fs.readFile("/home/player/a.txt").content).toBe("main content");
  });

  it("errors on nonexistent branch", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitCheckout(fs, "/home/player", "nonexistent", false);
    expect(result.error).toContain("did not match");
  });
});

// ── git diff ─────────────────────────────────────────────────────────

describe("git diff", () => {
  it("shows working tree changes vs HEAD", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "line1\nline2\n").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "line1\nmodified\n").fs!;
    const diffs = gitDiffFiles(fs, "/home/player", false);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].path).toBe("a.txt");
  });

  it("shows staged changes with --staged", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["a.txt"], false).fs;
    const diffs = gitDiffFiles(fs, "/home/player", true);
    expect(diffs).toHaveLength(1);
  });

  it("returns empty for clean repo", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    expect(gitDiffFiles(fs, "/home/player", false)).toHaveLength(0);
  });

  it("hides a staged change from unstaged diff (working tree vs index, not HEAD)", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["a.txt"], false).fs;

    expect(gitDiffFiles(fs, "/home/player", false)).toHaveLength(0);
    expect(gitDiffFiles(fs, "/home/player", true)).toHaveLength(1);
  });

  it("shows index→working diff when a staged file is edited again", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["a.txt"], false).fs;
    fs = fs.writeFile("/home/player/a.txt", "v3").fs!;

    const diffs = gitDiffFiles(fs, "/home/player", false);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].path).toBe("a.txt");
    expect(diffs[0].oldContent).toBe("v2");
    expect(diffs[0].newContent).toBe("v3");
  });

  it("does not show a newly staged file (not in HEAD) in unstaged diff", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/new.txt", "hello").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["new.txt"], false).fs;

    expect(gitDiffFiles(fs, "/home/player", false)).toHaveLength(0);
  });

  it("shows only post-stage edits for a newly staged file", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/new.txt", "hello").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["new.txt"], false).fs;
    fs = fs.writeFile("/home/player/new.txt", "hello world").fs!;

    const diffs = gitDiffFiles(fs, "/home/player", false);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].path).toBe("new.txt");
    expect(diffs[0].oldContent).toBe("hello");
    expect(diffs[0].newContent).toBe("hello world");
  });

  it("treats a staged-deleted file still on disk as an unstaged addition", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    // Simulate `git rm --cached a.txt`: index marks it deleted, file stays on disk.
    fs = fs.writeFile(
      "/home/player/.git/index.json",
      JSON.stringify({ staged: {}, deleted: ["a.txt"] }),
    ).fs!;

    const diffs = gitDiffFiles(fs, "/home/player", false);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].path).toBe("a.txt");
    expect(diffs[0].oldContent).toBe("");
    expect(diffs[0].newContent).toBe("v1");
  });
});

// ── git rm ───────────────────────────────────────────────────────────

describe("git rm", () => {
  it("removes a file and marks deleted", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "content").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitRm(fs, "/home/player", ["a.txt"], false);
    expect(result.error).toBeUndefined();
    expect(result.fs.getNode("/home/player/a.txt")).toBeNull();
  });

  it("errors on nonexistent file", () => {
    const fs = initRepo(makeFs());
    const result = gitRm(fs, "/home/player", ["missing.txt"], false);
    expect(result.error).toContain("pathspec 'missing.txt' did not match");
  });

  it("errors on directory without -r", () => {
    let fs = initRepo(makeFs());
    fs = fs.makeDirectory("/home/player/dir").fs!;
    fs = fs.writeFile("/home/player/dir/file.txt", "content").fs!;
    const result = gitRm(fs, "/home/player", ["dir"], false);
    expect(result.error).toContain("without -r");
  });
});

// ── git stash ────────────────────────────────────────────────────────

describe("git stash", () => {
  it("saves and restores changes", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    // Stash
    const stashResult = gitStashSave(fs, "/home/player");
    expect(stashResult.output).toContain("Saved working directory");
    fs = stashResult.fs;
    expect(fs.readFile("/home/player/a.txt").content).toBe("v1");
    // Pop
    const popResult = gitStashPop(fs, "/home/player");
    fs = popResult.fs;
    expect(fs.readFile("/home/player/a.txt").content).toBe("v2");
  });

  it("errors on pop with empty stash", () => {
    const fs = initRepo(makeFs());
    const result = gitStashPop(fs, "/home/player");
    expect(result.error).toContain("No stash entries found");
  });

  it("errors on stash with no changes", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitStashSave(fs, "/home/player");
    expect(result.output).toContain("No local changes to save");
  });

  it("lists stash entries", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = gitStashSave(fs, "/home/player").fs;
    const list = gitStashList(fs, "/home/player");
    expect(list).toContain("stash@{0}");
    expect(list).toContain("WIP on main");
  });
});

// ── git push ─────────────────────────────────────────────────────────

describe("git push", () => {
  it("errors with no remote configured", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitPush(fs, "/home/player", undefined, undefined, false, false);
    expect(result.error).toContain("No configured push destination");
  });

  it("pushes with configured remote", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", '[remote "origin"]\n  url = test-remote\n[branch "main"]\n  remote = origin\n  merge = refs/heads/main\n').fs!;
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitPush(fs, "/home/player", "origin", "main", false, false);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("main -> main");
    expect(result.triggerEvents).toBeDefined();
  });

  it("sets upstream with -u flag", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", '[remote "origin"]\n  url = test-remote').fs!;
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitPush(fs, "/home/player", "origin", "main", true, false);
    expect(result.output).toContain("set up to track");
    fs = result.fs;
    const config = fs.readFile("/home/player/.git/config").content!;
    expect(config).toContain('[branch "main"]');
    expect(config).toContain("remote = origin");
    expect(config).toContain("merge = refs/heads/main");
  });
});

// ── collectFiles ─────────────────────────────────────────────────────

describe("collectFiles", () => {
  it("collects files skipping .git", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "aaa").fs!;
    fs = fs.writeFile("/home/player/b.txt", "bbb").fs!;
    const files = collectFiles(fs, "/home/player", "/home/player");
    expect(Object.keys(files)).toContain("a.txt");
    expect(Object.keys(files)).toContain("b.txt");
    // Should not include any .git files
    for (const key of Object.keys(files)) {
      expect(key).not.toContain(".git");
    }
  });

  it("handles nested directories", () => {
    let fs = initRepo(makeFs());
    fs = fs.makeDirectory("/home/player/src").fs!;
    fs = fs.writeFile("/home/player/src/main.ts", "code").fs!;
    const files = collectFiles(fs, "/home/player", "/home/player");
    expect(files["src/main.ts"]).toBe("code");
  });
});

// ── Integration: full workflow ───────────────────────────────────────

describe("git workflow integration", () => {
  it("init → add → commit → branch → checkout → modify → commit → switch back", () => {
    let fs = initRepo(makeFs());

    // Create and commit a file on main
    fs = fs.writeFile("/home/player/readme.md", "# Project").fs!;
    fs = addAndCommit(fs, "/home/player", "initial commit");

    // Create feature branch
    fs = gitCheckout(fs, "/home/player", "feature", true).fs;

    // Modify on feature branch
    fs = fs.writeFile("/home/player/readme.md", "# Project\n\nNew feature").fs!;
    fs = fs.writeFile("/home/player/feature.ts", "export const x = 1;").fs!;
    fs = addAndCommit(fs, "/home/player", "add feature");

    // Verify feature state
    expect(fs.readFile("/home/player/feature.ts").content).toBe("export const x = 1;");

    // Switch back to main
    fs = gitCheckout(fs, "/home/player", "main", false).fs;

    // Feature file should be gone, readme should be original
    expect(fs.getNode("/home/player/feature.ts")).toBeNull();
    expect(fs.readFile("/home/player/readme.md").content).toBe("# Project");

    // Verify log on main has only 1 commit
    const mainLog = getCommitLog(fs, "/home/player");
    expect(mainLog).toHaveLength(1);

    // Switch to feature, verify 2 commits
    fs = gitCheckout(fs, "/home/player", "feature", false).fs;
    const featureLog = getCommitLog(fs, "/home/player");
    expect(featureLog).toHaveLength(2);
  });

  it("handles deleted files across branches", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "aaa").fs!;
    fs = fs.writeFile("/home/player/b.txt", "bbb").fs!;
    fs = addAndCommit(fs, "/home/player", "initial");

    // Create branch, delete a file
    fs = gitCheckout(fs, "/home/player", "cleanup", true).fs;
    fs = gitRm(fs, "/home/player", ["b.txt"], false).fs;
    fs = gitCommit(fs, "/home/player", "remove b", AUTHOR, false, false, TEST_TS).fs;

    // Switch back to main — b.txt should be back
    fs = gitCheckout(fs, "/home/player", "main", false).fs;
    expect(fs.readFile("/home/player/b.txt").content).toBe("bbb");

    // Switch to cleanup — b.txt should be gone
    fs = gitCheckout(fs, "/home/player", "cleanup", false).fs;
    expect(fs.getNode("/home/player/b.txt")).toBeNull();
  });
});

// ── git clone --depth (accepted no-op) ──────────────────────────────

describe("git clone --depth", () => {
  const TEST_URL = "__test__/depth-remote";

  beforeEach(() => {
    REMOTE_REPOS[TEST_URL] = buildSimpleRemote(
      { "README.md": "# Depth Test", "src/index.ts": "export default 1;" },
      { author: AUTHOR, defaultBranch: "main", commitMessage: "init" },
    );
  });

  afterEach(() => {
    delete REMOTE_REPOS[TEST_URL];
  });

  it("clones with depth param, output shows Cloning, files populated", () => {
    const fs = makeFs();
    const result = gitClone(fs, "/home/player", TEST_URL, AUTHOR, undefined, 1);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("Cloning into 'depth-remote'...");
    expect(result.fs.readFile("/home/player/depth-remote/README.md").content).toBe("# Depth Test");
    expect(result.fs.readFile("/home/player/depth-remote/src/index.ts").content).toBe("export default 1;");
  });
});

// ── git clone -b <branch> ───────────────────────────────────────────

describe("git clone -b", () => {
  const TEST_URL = "__test__/branch-remote";

  beforeEach(() => {
    REMOTE_REPOS[TEST_URL] = buildSimpleRemote(
      { "app.ts": "hello" },
      { author: AUTHOR, defaultBranch: "main", commitMessage: "initial" },
    );
  });

  afterEach(() => {
    delete REMOTE_REPOS[TEST_URL];
  });

  it("clones into specified branch, HEAD points to that branch", () => {
    const fs = makeFs();
    const result = gitClone(fs, "/home/player", TEST_URL, AUTHOR, "develop");
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("Cloning into");
    const head = result.fs.readFile("/home/player/branch-remote/.git/HEAD").content;
    expect(head).toBe("ref: refs/heads/develop");
    // Working tree populated
    expect(result.fs.readFile("/home/player/branch-remote/app.ts").content).toBe("hello");
  });
});

// ── git status -s (short format) ────────────────────────────────────

describe("git status -s", () => {
  it("outputs short format: staged, unstaged, untracked", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/tracked.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    // Stage a new file
    fs = fs.writeFile("/home/player/new.txt", "new content").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["new.txt"], false).fs;
    // Modify tracked file (unstaged)
    fs = fs.writeFile("/home/player/tracked.txt", "v2").fs!;
    // Create untracked file
    fs = fs.writeFile("/home/player/untracked.txt", "stuff").fs!;

    const status = gitStatus(fs, "/home/player");
    const short = formatStatus(status, true, false);

    expect(short).toContain("A  new.txt");
    expect(short).toContain(" M tracked.txt");
    expect(short).toContain("?? untracked.txt");
    // No "On branch" header
    expect(short).not.toContain("On branch");
  });
});

// ── git add -A (stage all) ──────────────────────────────────────────

describe("git add -A", () => {
  it("stages new, modified, and deleted files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "original").fs!;
    fs = fs.writeFile("/home/player/b.txt", "to-delete").fs!;
    fs = addAndCommit(fs, "/home/player", "initial");

    // Modify a.txt
    fs = fs.writeFile("/home/player/a.txt", "modified").fs!;
    // Add new file
    fs = fs.writeFile("/home/player/c.txt", "brand new").fs!;
    // Delete b.txt from filesystem
    fs = fs.removeNode("/home/player/b.txt").fs!;

    // Stage all with allFlag=true
    const addResult = gitAdd(fs, "/home/player", "/home/player", [], true);
    fs = addResult.fs;

    const index = readIndex(fs, "/home/player");
    expect(index.staged["a.txt"]).toBe("modified");
    expect(index.staged["c.txt"]).toBe("brand new");
    expect(index.deleted).toContain("b.txt");
  });
});

// ── git commit --amend (focused tests) ──────────────────────────────

describe("git commit --amend (focused)", () => {
  it("preserves parent of original commit", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/b.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "second");

    const beforeLog = getCommitLog(fs, "/home/player");
    const originalParent = beforeLog[0].parent;

    const result = gitCommit(fs, "/home/player", "amended second", AUTHOR, true, false, TEST_TS);
    fs = result.fs;

    const afterLog = getCommitLog(fs, "/home/player");
    expect(afterLog).toHaveLength(2);
    expect(afterLog[0].message).toBe("amended second");
    expect(afterLog[0].parent).toBe(originalParent);
  });

  it("errors when no commits exist", () => {
    const fs = initRepo(makeFs());
    const result = gitCommit(fs, "/home/player", "amend nothing", AUTHOR, true, false, TEST_TS);
    expect(result.error).toContain("nothing to amend");
  });
});

// ── git commit -a (auto-stage focused) ──────────────────────────────

describe("git commit -a (focused)", () => {
  it("does NOT stage new untracked files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/tracked.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    // Modify tracked file and add an untracked file
    fs = fs.writeFile("/home/player/tracked.txt", "v2").fs!;
    fs = fs.writeFile("/home/player/untracked.txt", "new file").fs!;

    const result = gitCommit(fs, "/home/player", "auto commit", AUTHOR, false, true, TEST_TS);
    fs = result.fs;
    expect(result.error).toBeUndefined();

    // The commit should include tracked.txt change
    const log = getCommitLog(fs, "/home/player");
    expect(log[0].tree["tracked.txt"]).toBe("v2");
    // But NOT the untracked file
    expect(log[0].tree["untracked.txt"]).toBeUndefined();
  });
});

// ── git branch -d (safe delete) ─────────────────────────────────────

describe("git branch -d (safe delete)", () => {
  it("errors on branch with divergent commit", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    // Create feature branch with a divergent commit
    fs = gitCheckout(fs, "/home/player", "feature", true).fs;
    fs = fs.writeFile("/home/player/b.txt", "feature work").fs!;
    fs = addAndCommit(fs, "/home/player", "feature commit");

    // Switch back to main
    fs = gitCheckout(fs, "/home/player", "main", false).fs;

    // Safe delete should fail — feature has unmerged commit
    const result = deleteBranch(fs, "/home/player", "feature", false);
    expect(result.error).toContain("not fully merged");
  });

  it("succeeds on branch at same HEAD", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    // Create branch at same point (no divergent commits)
    fs = gitCheckout(fs, "/home/player", "feature", true).fs;
    fs = gitCheckout(fs, "/home/player", "main", false).fs;

    const result = deleteBranch(fs, "/home/player", "feature", false);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("Deleted branch feature");
  });
});

// ── git branch -D (force delete) ────────────────────────────────────

describe("git branch -D (force delete)", () => {
  it("force deletes branch with divergent commit", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    fs = gitCheckout(fs, "/home/player", "feature", true).fs;
    fs = fs.writeFile("/home/player/b.txt", "divergent").fs!;
    fs = addAndCommit(fs, "/home/player", "divergent commit");

    fs = gitCheckout(fs, "/home/player", "main", false).fs;

    const result = deleteBranch(fs, "/home/player", "feature", true);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("Deleted branch feature");
  });

  it("still errors when deleting current branch", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    const result = deleteBranch(fs, "/home/player", "main", true);
    expect(result.error).toContain("Cannot delete");
  });
});

// ── git push -u (set upstream) ──────────────────────────────────────

describe("git push -u (set upstream)", () => {
  it("writes a per-branch upstream section to config", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", '[remote "origin"]\n  url = test-remote').fs!;
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    const result = gitPush(fs, "/home/player", "origin", "main", true, false);
    expect(result.error).toBeUndefined();
    fs = result.fs;

    const config = fs.readFile("/home/player/.git/config").content!;
    expect(config).toContain('[branch "main"]');
    expect(config).toContain("remote = origin");
    expect(config).toContain("merge = refs/heads/main");
  });

  it("scopes upstream per-branch — pushing -u on one branch doesn't steer another", () => {
    // Reproduces the bug where pull/push upstream was stored as global
    // merge-remote/merge-branch, so `git push -u origin feature` rewrote
    // main's upstream and a subsequent `git pull` on main wrote to
    // refs/heads/feature instead of refs/heads/main.
    const TEST_URL = "__test__/per-branch-upstream";
    REMOTE_REPOS[TEST_URL] = buildSimpleRemote(
      { "README.md": "v0" },
      { author: AUTHOR, defaultBranch: "main", commitMessage: "initial" },
    );
    // Add a getUpdates fn so the second pull on main has something to fast-forward to.
    REMOTE_REPOS[TEST_URL].getUpdates = (_flags, headHash) => {
      const tree = { "README.md": "v0", "new.txt": "from remote" };
      const hash = shortHash("remote-update" + (headHash ?? ""));
      return [{ hash, parent: headHash, message: "remote update", author: AUTHOR, timestamp: 1, tree }];
    };

    try {
      let fs = makeFs();
      fs = gitClone(fs, "/home/player", TEST_URL, AUTHOR).fs;
      const root = "/home/player/per-branch-upstream";

      // Branch off main, push -u on feature.
      fs = gitCheckout(fs, root, "feature", true).fs;
      fs = fs.writeFile(`${root}/feat.txt`, "feature work").fs!;
      fs = gitAdd(fs, root, root, ["feat.txt"], false).fs;
      fs = gitCommit(fs, root, "feat", AUTHOR, false, false, TEST_TS).fs;
      fs = gitPush(fs, root, "origin", "feature", true, false).fs;

      // Switch back to main and pull. Pull must advance refs/heads/main, not refs/heads/feature.
      fs = gitCheckout(fs, root, "main", false).fs;
      const featureRefBefore = fs.readFile(`${root}/.git/refs/heads/feature`).content!.trim();
      const mainRefBefore = fs.readFile(`${root}/.git/refs/heads/main`).content!.trim();

      const pullResult = gitPull(fs, root, undefined, undefined, {});
      expect(pullResult.error).toBeUndefined();
      fs = pullResult.fs;

      const featureRefAfter = fs.readFile(`${root}/.git/refs/heads/feature`).content!.trim();
      const mainRefAfter = fs.readFile(`${root}/.git/refs/heads/main`).content!.trim();

      expect(featureRefAfter).toBe(featureRefBefore); // feature untouched
      expect(mainRefAfter).not.toBe(mainRefBefore);   // main moved forward
      expect(pullResult.output).toContain("main -> origin/main");
    } finally {
      delete REMOTE_REPOS[TEST_URL];
    }
  });
});

// ── git push -f (force push) ────────────────────────────────────────

describe("git push -f (force push)", () => {
  it("rejects non-force push when remote is ahead", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", '[remote "origin"]\n  url = test-remote').fs!;
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    // Push to establish remote ref
    const pushResult = gitPush(fs, "/home/player", "origin", "main", false, false);
    fs = pushResult.fs;

    // Simulate remote being ahead: write a different hash to remote ref
    fs = fs.writeFile("/home/player/.git/refs/remotes/origin/main", "aaaaaaa").fs!;

    // Non-force push should fail
    const reject = gitPush(fs, "/home/player", "origin", "main", false, false);
    expect(reject.error).toContain("rejected");
  });

  it("succeeds with force flag when remote is ahead", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", '[remote "origin"]\n  url = test-remote').fs!;
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    const pushResult = gitPush(fs, "/home/player", "origin", "main", false, false);
    fs = pushResult.fs;

    // Simulate remote ahead
    fs = fs.writeFile("/home/player/.git/refs/remotes/origin/main", "aaaaaaa").fs!;

    // Force push should succeed
    const force = gitPush(fs, "/home/player", "origin", "main", false, true);
    expect(force.error).toBeUndefined();
    expect(force.output).toContain("(forced update)");
  });
});

// ── git log --oneline ───────────────────────────────────────────────

describe("git log --oneline", () => {
  it("outputs compact format: hash + message per line, no author/date", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first commit");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = addAndCommit(fs, "/home/player", "second commit");

    const commits = getCommitLog(fs, "/home/player");
    const output = formatLog(commits, true, false, true);
    const lines = output.split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^[0-9a-f]{7} second commit$/);
    expect(lines[1]).toMatch(/^[0-9a-f]{7} first commit$/);
    // No author or date
    expect(output).not.toContain("Author:");
    expect(output).not.toContain("Date:");
  });
});

// ── git log --graph ─────────────────────────────────────────────────

describe("git log --graph", () => {
  it("prefixes commit lines with *", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "initial");

    const commits = getCommitLog(fs, "/home/player");
    const output = formatLog(commits, false, true, true);

    expect(output).toContain("* commit ");
  });

  it("graph + oneline shows * prefix on each line", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = addAndCommit(fs, "/home/player", "second");

    const commits = getCommitLog(fs, "/home/player");
    const output = formatLog(commits, true, true, true);
    const lines = output.split("\n");

    for (const line of lines) {
      expect(line).toMatch(/^\* /);
    }
  });
});

// ── git diff --staged (focused) ─────────────────────────────────────

describe("git diff --staged (focused)", () => {
  it("shows full content as additions for new staged file", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "existing").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    // Stage a brand new file
    fs = fs.writeFile("/home/player/new.txt", "line1\nline2\n").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["new.txt"], false).fs;

    const diffs = gitDiffFiles(fs, "/home/player", true);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].path).toBe("new.txt");
    expect(diffs[0].oldContent).toBe("");
    expect(diffs[0].newContent).toBe("line1\nline2\n");
  });

  it("does NOT show unstaged changes", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    // Stage a change to a.txt
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["a.txt"], false).fs;

    // Make an additional unstaged change to a.txt
    fs = fs.writeFile("/home/player/a.txt", "v3").fs!;

    const diffs = gitDiffFiles(fs, "/home/player", true);
    expect(diffs).toHaveLength(1);
    // Should show v1→v2 (staged), NOT v1→v3 (working tree)
    expect(diffs[0].oldContent).toBe("v1");
    expect(diffs[0].newContent).toBe("v2");
  });
});
