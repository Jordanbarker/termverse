import { describe, it, expect } from "vitest";
import {
  makeWindow,
  makeLeaf,
  splitNode,
  resetPaneIdCounters,
  type WindowState,
} from "@tt/core/terminal/paneTypes";
import { findRepoRoot, gitAdd, gitCommit } from "@tt/core/git/repo";
import { buildPuzzleFs } from "../lib/seed";
import { structKey, paneTreeMatches } from "../lib/paneCompare";
import { PUZZLE_MACHINE, HOME_DIR, GIT_AUTHOR } from "../lib/machine";
import { panesSplit } from "../challenges/panes-split";
import { windowsCreate } from "../challenges/windows-create";
import { gitFirstCommit } from "../challenges/git-first-commit";
import { rmBomb } from "../challenges/rm-bomb";
import type { PuzzleSnapshot } from "../challenges/types";

function snap(activeWindow: WindowState, fs = buildPuzzleFs(), cwd = HOME_DIR): PuzzleSnapshot {
  return { activeWindow, windows: [activeWindow], fs, cwd };
}

describe("paneCompare", () => {
  it("ignores ids/ratios, keys by structure", () => {
    resetPaneIdCounters();
    const a = makeWindow(PUZZLE_MACHINE, HOME_DIR);
    resetPaneIdCounters(); // different id stream
    const b = makeWindow(PUZZLE_MACHINE, "/tmp");
    expect(paneTreeMatches(a.root, b.root)).toBe(true); // both single leaves
  });

  it("distinguishes split direction and nesting", () => {
    const w = makeWindow(PUZZLE_MACHINE, HOME_DIR);
    const h = splitNode(w.root, w.activePaneId, "h", () => makeLeaf(PUZZLE_MACHINE, HOME_DIR))!;
    const v = splitNode(w.root, w.activePaneId, "v", () => makeLeaf(PUZZLE_MACHINE, HOME_DIR))!;
    expect(paneTreeMatches(h.root, v.root)).toBe(false);
  });
});

describe("panes-split challenge", () => {
  it("matches the target only after split-h then split-v on the new pane", () => {
    const win = makeWindow(PUZZLE_MACHINE, HOME_DIR);

    // single pane: not yet matching
    expect(panesSplit.steps[0].isComplete(snap(win))).toBe(false);

    // split side-by-side
    const r1 = splitNode(win.root, win.activePaneId, "h", () => makeLeaf(PUZZLE_MACHINE, HOME_DIR))!;
    const win1: WindowState = { ...win, root: r1.root, activePaneId: r1.newPaneId };
    expect(panesSplit.steps[0].isComplete(snap(win1))).toBe(false);

    // stack the new right pane
    const r2 = splitNode(r1.root, r1.newPaneId, "v", () => makeLeaf(PUZZLE_MACHINE, HOME_DIR))!;
    const win2: WindowState = { ...win, root: r2.root, activePaneId: r2.newPaneId };
    expect(structKey(win2.root)).toBe("(h L (v L L))");
    expect(panesSplit.steps[0].isComplete(snap(win2))).toBe(true);
  });
});

describe("windows-create challenge", () => {
  function makeWindows(n: number): WindowState[] {
    const wins: WindowState[] = [];
    for (let i = 0; i < n; i++) {
      resetPaneIdCounters(); // keep ids unique across the constructed windows
      wins.push(makeWindow(PUZZLE_MACHINE, HOME_DIR));
    }
    return wins;
  }

  function winSnap(windows: WindowState[]): PuzzleSnapshot {
    return { activeWindow: windows[0], windows, fs: buildPuzzleFs(), cwd: HOME_DIR };
  }

  it("advances as windows are opened, then on rename", () => {
    const [open2nd, open3rd, rename] = windowsCreate.steps;

    // one window: nothing satisfied
    expect(open2nd.isComplete(winSnap(makeWindows(1)))).toBe(false);

    // two windows: step 0 only
    const two = makeWindows(2);
    expect(open2nd.isComplete(winSnap(two))).toBe(true);
    expect(open3rd.isComplete(winSnap(two))).toBe(false);

    // three windows: step 1 yes, rename still no
    const three = makeWindows(3);
    expect(open3rd.isComplete(winSnap(three))).toBe(true);
    expect(rename.isComplete(winSnap(three))).toBe(false);

    // name one of the three: rename step passes
    const named = three.map((w, i) => (i === 1 ? { ...w, name: "logs" } : w));
    expect(rename.isComplete(winSnap(named))).toBe(true);
  });

  it("exposes a 3-window target with one named window for the strip readout", () => {
    expect(windowsCreate.targetWindows).toHaveLength(3);
    expect(windowsCreate.targetWindows!.filter((w) => !!w.name)).toHaveLength(1);
  });
});

describe("git-first-commit challenge", () => {
  it("detects stage then commit from real engine state", () => {
    const repo = gitFirstCommit.gitRepoPath!;
    let fs = gitFirstCommit.setup(buildPuzzleFs());
    const win = makeWindow(PUZZLE_MACHINE, repo);

    expect(findRepoRoot(fs, repo)).toBe(repo);

    const at = (f: typeof fs) => snap(win, f, repo);

    // nothing staged, no commits
    expect(gitFirstCommit.steps[0].isComplete(at(fs))).toBe(false);
    expect(gitFirstCommit.steps[1].isComplete(at(fs))).toBe(false);

    // git add README.md
    fs = gitAdd(fs, repo, ["README.md"], false).fs;
    expect(gitFirstCommit.steps[0].isComplete(at(fs))).toBe(true);
    expect(gitFirstCommit.steps[1].isComplete(at(fs))).toBe(false);

    // git commit -m "init"
    fs = gitCommit(fs, repo, "init", GIT_AUTHOR, false, false, 1_700_000_000_000).fs;
    expect(gitFirstCommit.steps[1].isComplete(at(fs))).toBe(true);
  });
});

describe("rm-bomb challenge", () => {
  const BOMB = "/home/player/work/reports/2024/BOMB.md";
  const PARENT = "/home/player/work/reports/2024";
  const SIBLING = "/home/player/work/reports/2024/q1.md";
  const step = rmBomb.steps[0];

  function fsSnap(fs = rmBomb.setup(buildPuzzleFs())): PuzzleSnapshot {
    const win = makeWindow(PUZZLE_MACHINE, HOME_DIR);
    return { activeWindow: win, windows: [win], fs, cwd: HOME_DIR };
  }

  it("seeds BOMB.md alongside survivors", () => {
    const fs = rmBomb.setup(buildPuzzleFs());
    expect(fs.getNode(BOMB)).not.toBeNull();
    for (const p of [SIBLING, "/home/player/work/notes.md", "/home/player/work/reports/summary.md"]) {
      expect(fs.getNode(p)).not.toBeNull();
    }
    expect(step.isComplete(fsSnap(fs))).toBe(false);
  });

  it("completes when only BOMB.md is removed", () => {
    const fs = rmBomb.setup(buildPuzzleFs()).removeNode(BOMB).fs!;
    expect(step.isComplete(fsSnap(fs))).toBe(true);
  });

  it("does NOT complete when rm -rf takes the whole parent dir (sibling lost)", () => {
    const fs = rmBomb.setup(buildPuzzleFs()).removeNode(PARENT).fs!;
    expect(fs.getNode(BOMB)).toBeNull(); // bomb gone...
    expect(fs.getNode(SIBLING)).toBeNull(); // ...but so is q1.md
    expect(step.isComplete(fsSnap(fs))).toBe(false);
  });

  it("does NOT complete when a survivor is also removed", () => {
    let fs = rmBomb.setup(buildPuzzleFs()).removeNode(BOMB).fs!;
    fs = fs.removeNode("/home/player/work/notes.md").fs!;
    expect(step.isComplete(fsSnap(fs))).toBe(false);
  });
});
