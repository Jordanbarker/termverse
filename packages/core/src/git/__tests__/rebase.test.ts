import { describe, it, expect } from "vitest";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";
import {
  gitInit, gitAdd, gitCommit, gitCheckout, createBranch,
  gitRebase, gitRebaseContinue, gitRebaseAbort,
  getCommitLog, gitStatus, resolveHead, readRebaseState, readIndex,
  hasConflictMarkers, commitsToReplay,
} from "../repo";
import { formatStatus } from "../output";

const AUTHOR = "player <player@test.local>";
const TS = new Date(2026, 1, 23, 8, 30, 0).getTime();
const ROOT = "/home/player";

function makeFs(): VirtualFS {
  const root: DirectoryNode = {
    type: "directory", name: "/", permissions: "rwxr-xr-x", hidden: false,
    children: {
      home: {
        type: "directory", name: "home", permissions: "rwxr-xr-x", hidden: false,
        children: {
          player: { type: "directory", name: "player", permissions: "rwxr-xr-x", hidden: false, children: {} },
        },
      },
    },
  };
  return new VirtualFS(root, ROOT, ROOT);
}

function write(fs: VirtualFS, relPath: string, content: string): VirtualFS {
  const r = fs.writeFile(`${ROOT}/${relPath}`, content);
  if (!r.fs) throw new Error(r.error);
  return r.fs;
}

function commitFile(fs: VirtualFS, relPath: string, content: string, message: string): VirtualFS {
  fs = write(fs, relPath, content);
  fs = gitAdd(fs, ROOT, ROOT, [relPath], false).fs;
  fs = gitCommit(fs, ROOT, message, AUTHOR, false, false, TS).fs;
  return fs;
}

function checkout(fs: VirtualFS, branch: string, create = false): VirtualFS {
  const r = gitCheckout(fs, ROOT, branch, create);
  if (r.error) throw new Error(r.error);
  return r.fs;
}

/** main: base → "main" edit; feature: base → "feature" edit. Same file => guaranteed conflict. */
function setupConflict(): VirtualFS {
  let fs = gitInit(makeFs(), ROOT, AUTHOR).fs;
  fs = commitFile(fs, "config.txt", "line one\nbase\nline three\n", "base");
  fs = createBranch(fs, ROOT, "feature").fs;
  fs = checkout(fs, "feature");
  fs = commitFile(fs, "config.txt", "line one\nfeature\nline three\n", "feature change");
  fs = checkout(fs, "main");
  fs = commitFile(fs, "config.txt", "line one\nmain\nline three\n", "main change");
  fs = checkout(fs, "feature");
  return fs;
}

const messages = (fs: VirtualFS) => getCommitLog(fs, ROOT).map((c) => c.message);

describe("git rebase — clean replay", () => {
  it("reapplies non-overlapping commits onto the upstream tip", () => {
    let fs = gitInit(makeFs(), ROOT, AUTHOR).fs;
    fs = commitFile(fs, "a.txt", "v1\n", "base");
    fs = createBranch(fs, ROOT, "feature").fs;
    fs = checkout(fs, "feature");
    fs = commitFile(fs, "b.txt", "feature file\n", "add b");
    fs = checkout(fs, "main");
    fs = commitFile(fs, "a.txt", "v2\n", "update a");
    fs = checkout(fs, "feature");

    const res = gitRebase(fs, ROOT, "main");
    fs = res.fs;
    expect(res.error).toBeUndefined();
    expect(res.output).toContain("Successfully rebased");
    expect(readRebaseState(fs, ROOT)).toBeNull();
    expect(messages(fs)).toEqual(["add b", "update a", "base"]);
    expect(fs.readFile(`${ROOT}/a.txt`).content).toBe("v2\n");
    expect(fs.readFile(`${ROOT}/b.txt`).content).toBe("feature file\n");
  });

  it("reports up to date when upstream is already an ancestor", () => {
    let fs = gitInit(makeFs(), ROOT, AUTHOR).fs;
    fs = commitFile(fs, "a.txt", "v1\n", "base");
    fs = createBranch(fs, ROOT, "feature").fs;
    fs = checkout(fs, "feature");
    fs = commitFile(fs, "b.txt", "x\n", "add b");
    const res = gitRebase(fs, ROOT, "main");
    expect(res.output).toBe("Current branch feature is up to date.");
    expect(readRebaseState(res.fs, ROOT)).toBeNull();
  });

  it("fast-forwards when the branch is strictly behind upstream", () => {
    let fs = gitInit(makeFs(), ROOT, AUTHOR).fs;
    fs = commitFile(fs, "a.txt", "v1\n", "base");
    fs = createBranch(fs, ROOT, "feature").fs; // feature stays at base
    fs = commitFile(fs, "a.txt", "v2\n", "update a"); // advances main
    fs = checkout(fs, "feature");
    const res = gitRebase(fs, ROOT, "main");
    fs = res.fs;
    expect(res.output).toContain("Successfully rebased");
    expect(messages(fs)).toEqual(["update a", "base"]);
    expect(fs.readFile(`${ROOT}/a.txt`).content).toBe("v2\n");
  });
});

describe("git rebase — conflict workflow", () => {
  it("stops on conflict with markers, rebase state, and unmerged status", () => {
    const res = gitRebase(setupConflict(), ROOT, "main");
    const fs = res.fs;
    expect(res.error).toBeUndefined();
    expect(res.output).toContain("CONFLICT (content): Merge conflict in config.txt");
    expect(res.output).toContain("could not apply");

    const state = readRebaseState(fs, ROOT);
    expect(state).not.toBeNull();
    expect(state!.conflictFiles).toEqual(["config.txt"]);
    expect(state!.originalBranch).toBe("feature");

    const content = fs.readFile(`${ROOT}/config.txt`).content!;
    expect(hasConflictMarkers(content)).toBe(true);
    expect(content).toContain("<<<<<<< HEAD");
    expect(content).toContain("main"); // ours
    expect(content).toContain("=======");
    expect(content).toContain("feature"); // theirs
    expect(content).toContain(">>>>>>>");

    const status = gitStatus(fs, ROOT);
    expect(status.rebase?.unmerged).toEqual(["config.txt"]);
    const rendered = formatStatus(status, false, true);
    expect(rendered).toContain("interactive rebase in progress");
    expect(rendered).toContain("both modified:   config.txt");
    expect(rendered).not.toContain("nothing to commit");
  });

  it("blocks --continue until conflicts are resolved AND staged", () => {
    let fs = gitRebase(setupConflict(), ROOT, "main").fs;

    // markers still present, not staged
    expect(gitRebaseContinue(fs, ROOT).error).toContain("you must edit all merge conflicts");

    // resolved in the working tree but not staged
    fs = write(fs, "config.txt", "line one\nresolved\nline three\n");
    expect(gitRebaseContinue(fs, ROOT).error).toContain("you must edit all merge conflicts");

    // staged with markers still in the staged content
    let fsMarkers = write(gitRebase(setupConflict(), ROOT, "main").fs, "config.txt", "<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> z\n");
    fsMarkers = gitAdd(fsMarkers, ROOT, ROOT, ["config.txt"], false).fs;
    expect(gitRebaseContinue(fsMarkers, ROOT).error).toContain("you must edit all merge conflicts");

    // staged + clean → succeeds
    fs = gitAdd(fs, ROOT, ROOT, ["config.txt"], false).fs;
    const cont = gitRebaseContinue(fs, ROOT);
    fs = cont.fs;
    expect(cont.error).toBeUndefined();
    expect(cont.output).toContain("Successfully rebased");
    expect(readRebaseState(fs, ROOT)).toBeNull();

    // feature commit replayed on top of main change, history truly rebased
    expect(messages(fs)).toEqual(["feature change", "main change", "base"]);
    expect(fs.readFile(`${ROOT}/config.txt`).content).toBe("line one\nresolved\nline three\n");
    const status = gitStatus(fs, ROOT);
    expect(status.staged).toHaveLength(0);
    expect(status.unstaged).toHaveLength(0);
  });

  it("re-stages an unmerged file even when the resolution equals HEAD's version", () => {
    // HEAD stays on feature during the rebase, so headTree['config.txt'] is the feature
    // version. Resolving to exactly that would be skipped by the normal gitAdd content
    // check — the rebase-aware path must still stage it, or --continue would dead-end.
    let fs = gitRebase(setupConflict(), ROOT, "main").fs;
    fs = write(fs, "config.txt", "line one\nfeature\nline three\n");
    fs = gitAdd(fs, ROOT, ROOT, ["config.txt"], false).fs;
    expect(readIndex(fs, ROOT).staged["config.txt"]).toBe("line one\nfeature\nline three\n");

    const cont = gitRebaseContinue(fs, ROOT);
    fs = cont.fs;
    expect(cont.error).toBeUndefined();
    expect(readRebaseState(fs, ROOT)).toBeNull();
    expect(messages(fs)).toEqual(["feature change", "main change", "base"]);
  });

  it("--abort restores the original branch tip and working tree", () => {
    let fs = setupConflict();
    const originalTip = resolveHead(fs, ROOT);
    const originalContent = fs.readFile(`${ROOT}/config.txt`).content;

    fs = gitRebase(fs, ROOT, "main").fs;
    expect(hasConflictMarkers(fs.readFile(`${ROOT}/config.txt`).content!)).toBe(true);

    const ab = gitRebaseAbort(fs, ROOT);
    fs = ab.fs;
    expect(ab.error).toBeUndefined();
    expect(readRebaseState(fs, ROOT)).toBeNull();
    expect(resolveHead(fs, ROOT)).toBe(originalTip);
    expect(fs.readFile(`${ROOT}/config.txt`).content).toBe(originalContent);
    expect(messages(fs)).toEqual(["feature change", "base"]);
  });
});

describe("git rebase — errors & helpers", () => {
  it("errors on an invalid upstream", () => {
    let fs = gitInit(makeFs(), ROOT, AUTHOR).fs;
    fs = commitFile(fs, "a.txt", "v1\n", "base");
    expect(gitRebase(fs, ROOT, "nope").error).toContain("invalid upstream 'nope'");
  });

  it("errors when --continue/--abort run with no rebase in progress", () => {
    let fs = gitInit(makeFs(), ROOT, AUTHOR).fs;
    fs = commitFile(fs, "a.txt", "v1\n", "base");
    expect(gitRebaseContinue(fs, ROOT).error).toContain("no rebase in progress");
    expect(gitRebaseAbort(fs, ROOT).error).toContain("no rebase in progress");
  });

  it("commitsToReplay returns the branch-only commits, oldest first", () => {
    let fs = gitInit(makeFs(), ROOT, AUTHOR).fs;
    fs = commitFile(fs, "a.txt", "v1\n", "base");
    fs = createBranch(fs, ROOT, "feature").fs;
    fs = checkout(fs, "feature");
    fs = commitFile(fs, "b.txt", "1\n", "f1");
    fs = commitFile(fs, "c.txt", "2\n", "f2");
    const branchTip = resolveHead(fs, ROOT)!;
    const upstreamTip = fs.readFile(`${ROOT}/.git/refs/heads/main`).content!.trim();
    expect(commitsToReplay(fs, ROOT, upstreamTip, branchTip).map((c) => c.message)).toEqual(["f1", "f2"]);
  });
});
