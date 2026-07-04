import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "@tt/core/commands/builtins"; // register builtins so the registry is populated
import {
  setAvailabilityPolicy,
  resetAvailabilityPolicy,
  isCommandAvailable,
  unavailableCommandMessage,
} from "@tt/core/commands/availability";
import { getAvailableCommands, execute } from "@tt/core/commands/registry";
import type { CommandContext } from "@tt/core/commands/types";
import { CRUNCH_AVAILABILITY_POLICY } from "../lib/availabilityPolicy";
import { CHALLENGES } from "../challenges/registry";
import { getCategory } from "../challenges/categories";
import { useGameStore } from "../state/gameStore";
import {
  makeWindow,
  makeLeaf,
  splitNode,
  setSplitRatio,
  collapsePane,
  allLeaves,
  resetPaneIdCounters,
  type WindowState,
} from "@tt/core/terminal/paneTypes";
import { findRepoRoot, gitAdd, gitCommit, gitReset, gitRebase, gitRebaseContinue, gitCheckout, gitStashSave, gitStashPop, gitPull } from "@tt/core/git/repo";
import { buildBaseFs } from "../lib/seed";
import { readGitState } from "../lib/gitState";
import { structKey, paneTreeMatches, paneTreeMatchesWithRatio } from "../lib/paneCompare";
import { CRUNCH_MACHINE, HOME_DIR, GIT_AUTHOR } from "../lib/machine";
import { panesSplit } from "../challenges/panes-split";
import { panesGrid } from "../challenges/panes-grid";
import { panesCleanup } from "../challenges/panes-cleanup";
import { panesResize } from "../challenges/panes-resize";
import { panesResizeRows } from "../challenges/panes-resize-rows";
import { panesResizeCorner } from "../challenges/panes-resize-corner";
import { windowsCreate } from "../challenges/windows-create";
import { gitFirstCommit } from "../challenges/git-first-commit";
import { gitUnstage } from "../challenges/git-unstage";
import { gitStashChallenge } from "../challenges/git-stash";
import { gitPullFf } from "../challenges/git-pull-ff";
import { gitRebaseChallenge } from "../challenges/git-rebase";
import { rmBomb } from "../challenges/rm-bomb";
import { chmodPerms } from "../challenges/chmod-perms";
import { copyModeYank } from "../challenges/copy-mode-yank";
import { sessionsDetachAttach } from "../challenges/sessions-detach-attach";
import { sessionsJuggle } from "../challenges/sessions-juggle";
import type { ChallengeSnapshot } from "../challenges/types";

function snap(
  activeWindow: WindowState,
  fs = buildBaseFs(),
  cwd = HOME_DIR,
  tmux: ChallengeSnapshot["tmux"] = { attachedSession: "0", detachedSessions: [] },
): ChallengeSnapshot {
  return { activeWindow, windows: [activeWindow], fs, cwd, tmux };
}

describe("paneCompare", () => {
  it("ignores ids/ratios, keys by structure", () => {
    resetPaneIdCounters();
    const a = makeWindow(CRUNCH_MACHINE, HOME_DIR);
    resetPaneIdCounters(); // different id stream
    const b = makeWindow(CRUNCH_MACHINE, "/tmp");
    expect(paneTreeMatches(a.root, b.root)).toBe(true); // both single leaves
  });

  it("distinguishes split direction and nesting", () => {
    const w = makeWindow(CRUNCH_MACHINE, HOME_DIR);
    const h = splitNode(w.root, w.activePaneId, "h", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR))!;
    const v = splitNode(w.root, w.activePaneId, "v", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR))!;
    expect(paneTreeMatches(h.root, v.root)).toBe(false);
  });

  it("paneTreeMatchesWithRatio gates on structure AND per-split ratio", () => {
    const w = makeWindow(CRUNCH_MACHINE, HOME_DIR);
    const h = splitNode(w.root, w.activePaneId, "h", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR))!;
    if (h.root.kind !== "split") throw new Error("expected a split");
    const at = (r: number) => setSplitRatio(h.root, h.root.id, r);

    // structure mismatch: split vs single leaf
    expect(paneTreeMatchesWithRatio(w.root, at(0.7), 0.05)).toBe(false);
    // same structure, ratio outside the band
    expect(paneTreeMatchesWithRatio(at(0.6), at(0.7), 0.05)).toBe(false);
    // same structure, ratio within the band
    expect(paneTreeMatchesWithRatio(at(0.66), at(0.7), 0.05)).toBe(true);
    expect(paneTreeMatchesWithRatio(at(0.7), at(0.7), 0.05)).toBe(true);
  });
});

describe("panes-split challenge", () => {
  it("matches the target only after split-h then split-v on the new pane", () => {
    const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);

    // single pane: not yet matching
    expect(panesSplit.steps[0].isComplete(snap(win))).toBe(false);

    // split side-by-side
    const r1 = splitNode(win.root, win.activePaneId, "h", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR))!;
    const win1: WindowState = { ...win, root: r1.root, activePaneId: r1.newPaneId };
    expect(panesSplit.steps[0].isComplete(snap(win1))).toBe(false);

    // stack the new right pane
    const r2 = splitNode(r1.root, r1.newPaneId, "v", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR))!;
    const win2: WindowState = { ...win, root: r2.root, activePaneId: r2.newPaneId };
    expect(structKey(win2.root)).toBe("(h L (v L L))");
    expect(panesSplit.steps[0].isComplete(snap(win2))).toBe(true);
  });
});

describe("panes-grid challenge", () => {
  const step = panesGrid.steps[0];

  it("matches only once both columns are split into two rows each", () => {
    const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);

    // single pane: not yet matching
    expect(step.isComplete(snap(win))).toBe(false);

    // two columns: (h L L) — not yet
    const cols = splitNode(win.root, win.activePaneId, "h", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR))!;
    const winCols: WindowState = { ...win, root: cols.root, activePaneId: cols.newPaneId };
    expect(structKey(winCols.root)).toBe("(h L L)");
    expect(step.isComplete(snap(winCols))).toBe(false);

    // only the left column split: (h (v L L) L) — still not a full grid
    const left = splitNode(cols.root, win.activePaneId, "v", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR))!;
    const winLeft: WindowState = { ...win, root: left.root, activePaneId: left.newPaneId };
    expect(structKey(winLeft.root)).toBe("(h (v L L) L)");
    expect(step.isComplete(snap(winLeft))).toBe(false);

    // split the right column too: (h (v L L) (v L L)) — complete
    const right = splitNode(left.root, cols.newPaneId, "v", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR))!;
    const winGrid: WindowState = { ...win, root: right.root, activePaneId: right.newPaneId };
    expect(structKey(winGrid.root)).toBe("(h (v L L) (v L L))");
    expect(step.isComplete(snap(winGrid))).toBe(true);
  });

  it("also matches a rows-first build — (v (h L L) (h L L)) renders the same grid", () => {
    const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);

    // two rows: (v L L)
    const rows = splitNode(win.root, win.activePaneId, "v", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR))!;
    // split the top row: (v (h L L) L) — not a full grid yet
    const top = splitNode(rows.root, win.activePaneId, "h", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR))!;
    expect(step.isComplete(snap({ ...win, root: top.root, activePaneId: top.newPaneId }))).toBe(false);

    // split the bottom row too: (v (h L L) (h L L)) — geometry-equal to the target
    const bottom = splitNode(top.root, rows.newPaneId, "h", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR))!;
    expect(structKey(bottom.root)).toBe("(v (h L L) (h L L))");
    expect(step.isComplete(snap({ ...win, root: bottom.root, activePaneId: bottom.newPaneId }))).toBe(true);
  });

  it("rejects a four-pane tree that is not a 2×2 grid", () => {
    const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
    // four columns: (h L (h L (h L L)))
    let root = win.root;
    let target = win.activePaneId;
    for (let i = 0; i < 3; i++) {
      const r = splitNode(root, target, "h", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR))!;
      root = r.root;
      target = r.newPaneId;
    }
    expect(step.isComplete(snap({ ...win, root, activePaneId: target }))).toBe(false);
  });
});

describe("panes-cleanup challenge", () => {
  const step = panesCleanup.steps[0];

  it("seeds a 2×2 grid that does not yet satisfy the two-column target", () => {
    const win = panesCleanup.initialWindow!();
    expect(structKey(win.root)).toBe("(h (v L L) (v L L))");
    expect(step.isComplete(snap(win))).toBe(false);
  });

  it("completes once each column is collapsed to a single pane: (h L L)", () => {
    const win = panesCleanup.initialWindow!();
    // in-order leaves: [left-top, left-bottom, right-top, right-bottom]
    const leaves = allLeaves(win.root);
    expect(leaves).toHaveLength(4);

    // kill left-bottom → left column collapses to a single leaf
    const afterLeft = collapsePane(win.root, leaves[1].id)!;
    expect(structKey(afterLeft)).toBe("(h L (v L L))");
    expect(step.isComplete(snap({ ...win, root: afterLeft, activePaneId: leaves[0].id }))).toBe(false);

    // kill right-bottom → right column collapses too → (h L L)
    const afterRight = collapsePane(afterLeft, leaves[3].id)!;
    expect(structKey(afterRight)).toBe("(h L L)");
    expect(step.isComplete(snap({ ...win, root: afterRight, activePaneId: leaves[0].id }))).toBe(true);
  });

  it("mints fresh, internally-unique ids on each build (as loadChallenge does)", () => {
    resetPaneIdCounters();
    const a = panesCleanup.initialWindow!();
    resetPaneIdCounters();
    const b = panesCleanup.initialWindow!();
    for (const w of [a, b]) {
      const ids = allLeaves(w.root).map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length); // no dup ids within a tree
    }
  });
});

describe("panes-resize challenge", () => {
  const step = panesResize.steps[0];
  const splitOf = (win: WindowState) => {
    if (win.root.kind !== "split") throw new Error("expected a side-by-side split");
    return win.root;
  };

  it("seeds a 50/50 side-by-side split that does not yet satisfy the ~70% target", () => {
    const win = panesResize.initialWindow!();
    expect(structKey(win.root)).toBe("(h L L)");
    expect(splitOf(win).ratio).toBe(0.5);
    // structurally identical to the target, so only the ratio keeps it incomplete
    expect(step.isComplete(snap(win))).toBe(false);
  });

  it("completes once the left pane is within ±0.05 of 70%, not before", () => {
    const win = panesResize.initialWindow!();
    const at = (r: number): WindowState => ({ ...win, root: setSplitRatio(win.root, splitOf(win).id, r) });

    expect(step.isComplete(snap(at(0.6)))).toBe(false); // outside the band
    expect(step.isComplete(snap(at(0.66)))).toBe(true); // within the band
    expect(step.isComplete(snap(at(0.7)))).toBe(true); // dead on
  });
});

describe("panes-resize-rows challenge", () => {
  const step = panesResizeRows.steps[0];
  const splitOf = (win: WindowState) => {
    if (win.root.kind !== "split") throw new Error("expected a stacked split");
    return win.root;
  };

  it("seeds a 50/50 stacked split that does not yet satisfy the ~70% target", () => {
    const win = panesResizeRows.initialWindow!();
    expect(structKey(win.root)).toBe("(v L L)");
    expect(splitOf(win).ratio).toBe(0.5);
    // structurally identical to the target, so only the ratio keeps it incomplete
    expect(step.isComplete(snap(win))).toBe(false);
  });

  it("completes once the top pane is within ±0.05 of 70%, not before", () => {
    const win = panesResizeRows.initialWindow!();
    const at = (r: number): WindowState => ({ ...win, root: setSplitRatio(win.root, splitOf(win).id, r) });

    expect(step.isComplete(snap(at(0.6)))).toBe(false); // outside the band
    expect(step.isComplete(snap(at(0.66)))).toBe(true); // within the band
    expect(step.isComplete(snap(at(0.7)))).toBe(true); // dead on
  });
});

describe("panes-resize-corner challenge", () => {
  const [stepK, stepH] = panesResizeCorner.steps;
  const rootOf = (win: WindowState) => {
    if (win.root.kind !== "split") throw new Error("expected an h-split root");
    return win.root;
  };
  const colOf = (win: WindowState) => {
    const col = rootOf(win).a;
    if (col.kind !== "split") throw new Error("expected a v-split left column");
    return col;
  };
  // Both dividers at the given ratios, everything else from the seeded window.
  const at = (win: WindowState, colRatio: number, rootRatio: number): WindowState => ({
    ...win,
    root: setSplitRatio(setSplitRatio(win.root, colOf(win).id, colRatio), rootOf(win).id, rootRatio),
  });

  it("seeds a 50/50 sidebar layout focused on the bottom-left pane", () => {
    const win = panesResizeCorner.initialWindow!();
    expect(structKey(win.root)).toBe("(h (v L L) L)");
    expect(rootOf(win).ratio).toBe(0.5);
    expect(colOf(win).ratio).toBe(0.5);
    expect(win.activePaneId).toBe(colOf(win).b.id);
    expect(stepK.isComplete(snap(win))).toBe(false);
  });

  it("step 1 checks only the column ratio (~0.3), regardless of the root ratio", () => {
    const win = panesResizeCorner.initialWindow!();
    expect(stepK.isComplete(snap(at(win, 0.4, 0.5)))).toBe(false); // outside the band
    expect(stepK.isComplete(snap(at(win, 0.34, 0.5)))).toBe(true); // within, root untouched
    expect(stepK.isComplete(snap(at(win, 0.3, 0.3)))).toBe(true); // overshoot on root is fine
  });

  it("step 2 requires BOTH ratios in band", () => {
    const win = panesResizeCorner.initialWindow!();
    expect(stepH.isComplete(snap(at(win, 0.3, 0.5)))).toBe(false); // column done, root not
    expect(stepH.isComplete(snap(at(win, 0.5, 0.3)))).toBe(false); // root done, column not
    expect(stepH.isComplete(snap(at(win, 0.34, 0.26)))).toBe(true); // both within ±0.05
  });
});

describe("windows-create challenge", () => {
  function makeWindows(n: number): WindowState[] {
    resetPaneIdCounters(); // once before the loop → sequential, non-colliding ids
    const wins: WindowState[] = [];
    for (let i = 0; i < n; i++) {
      wins.push(makeWindow(CRUNCH_MACHINE, HOME_DIR));
    }
    return wins;
  }

  function winSnap(windows: WindowState[]): ChallengeSnapshot {
    return { ...snap(windows[0]), windows };
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
    let fs = gitFirstCommit.setup(buildBaseFs());
    const win = makeWindow(CRUNCH_MACHINE, repo);

    expect(findRepoRoot(fs, repo)).toBe(repo);

    const at = (f: typeof fs) => snap(win, f, repo);

    // nothing staged, no commits
    expect(gitFirstCommit.steps[0].isComplete(at(fs))).toBe(false);
    expect(gitFirstCommit.steps[1].isComplete(at(fs))).toBe(false);

    // git add README.md
    fs = gitAdd(fs, repo, repo, ["README.md"], false).fs;
    expect(gitFirstCommit.steps[0].isComplete(at(fs))).toBe(true);
    expect(gitFirstCommit.steps[1].isComplete(at(fs))).toBe(false);

    // git commit -m "init"
    fs = gitCommit(fs, repo, "init", GIT_AUTHOR, false, false, 1_700_000_000_000).fs;
    expect(gitFirstCommit.steps[1].isComplete(at(fs))).toBe(true);
  });
});

describe("git-unstage challenge", () => {
  const repo = gitUnstage.gitRepoPath!;
  const ENV = `${repo}/.env`;
  const ENV_CONTENT = "API_KEY=sk-live-4f2a9c81d7e3\nDB_PASSWORD=hunter2\n";
  const [step1, step2] = gitUnstage.steps;
  const win = makeWindow(CRUNCH_MACHINE, repo);
  const at = (f: ReturnType<typeof gitUnstage.setup>) => snap(win, f, repo);

  it("seeds one commit with app.js AND the secret .env both staged", () => {
    const fs = gitUnstage.setup(buildBaseFs());
    expect(findRepoRoot(fs, repo)).toBe(repo);
    const g = readGitState(fs, repo);
    expect(g.commitCount).toBe(1);
    expect(g.staged.sort()).toEqual([".env", "app.js"]);
    expect(fs.readFile(ENV).content).toBe(ENV_CONTENT);
    expect(step1.isComplete(at(fs))).toBe(false);
    expect(step2.isComplete(at(fs))).toBe(false);
  });

  it("walks the targeted reset → commit flow (git reset .env)", () => {
    let fs = gitUnstage.setup(buildBaseFs());

    // git reset .env → out of the index, edits intact, app.js still staged
    fs = gitReset(fs, repo, repo, [".env"], null).fs;
    const g = readGitState(fs, repo);
    expect(g.staged).toEqual(["app.js"]);
    expect(g.untracked).toContain(".env");
    expect(step1.isComplete(at(fs))).toBe(true);
    expect(step2.isComplete(at(fs))).toBe(false);

    // git commit -m "Update app" → only app.js goes in, .env stays behind
    fs = gitCommit(fs, repo, "Update app", GIT_AUTHOR, false, false, 1_700_000_001_000).fs;
    expect(step2.isComplete(at(fs))).toBe(true);
    expect(fs.readFile(ENV).content).toBe(ENV_CONTENT);
  });

  it("also accepts the `git reset HEAD .env` spelling", () => {
    let fs = gitUnstage.setup(buildBaseFs());
    fs = gitReset(fs, repo, repo, ["HEAD", ".env"], null).fs;
    expect(step1.isComplete(at(fs))).toBe(true);
  });

  it("a bare `git reset` empties the whole index → step 1 stays incomplete until app.js is re-added", () => {
    let fs = gitUnstage.setup(buildBaseFs());
    fs = gitReset(fs, repo, repo, [], null).fs;
    expect(readGitState(fs, repo).staged).toEqual([]);
    expect(step1.isComplete(at(fs))).toBe(false); // app.js no longer staged

    // state checkpoint, not an event script: re-staging app.js reaches the target state
    fs = gitAdd(fs, repo, repo, ["app.js"], false).fs;
    expect(step1.isComplete(at(fs))).toBe(true);
  });

  it("does NOT complete via `git reset --hard` — it deletes the staged-new .env", () => {
    let fs = gitUnstage.setup(buildBaseFs());
    fs = gitReset(fs, repo, repo, [], "hard").fs;
    expect(fs.getNode(ENV)).toBeNull(); // secrets file lost
    expect(step1.isComplete(at(fs))).toBe(false);
  });

  it("does NOT complete when .env is deleted instead of unstaged", () => {
    let fs = gitUnstage.setup(buildBaseFs());
    fs = fs.removeNode(ENV).fs!;
    fs = gitReset(fs, repo, repo, [".env"], null).fs;
    expect(step1.isComplete(at(fs))).toBe(false);
  });
});

describe("git-rebase challenge", () => {
  const repo = gitRebaseChallenge.gitRepoPath!;
  const CONFIG = `${repo}/config.txt`;
  const [step1, step2, step3] = gitRebaseChallenge.steps;

  function write(fs: ReturnType<typeof gitRebaseChallenge.setup>, content: string) {
    const r = fs.writeFile(CONFIG, content);
    if (!r.fs) throw new Error(r.error);
    return r.fs;
  }

  it("seeds a feature branch that conflicts with main on rebase", () => {
    const fs = gitRebaseChallenge.setup(buildBaseFs());
    expect(findRepoRoot(fs, repo)).toBe(repo);
    const win = makeWindow(CRUNCH_MACHINE, repo);
    // freshly seeded: nothing done yet
    expect(step1.isComplete(snap(win, fs, repo))).toBe(false);
    expect(step3.isComplete(snap(win, fs, repo))).toBe(false);
  });

  it("walks the full rebase → resolve → continue flow", () => {
    let fs = gitRebaseChallenge.setup(buildBaseFs());
    const win = makeWindow(CRUNCH_MACHINE, repo);
    const at = (f: typeof fs) => snap(win, f, repo);

    // git rebase main → conflict
    fs = gitRebase(fs, repo, "main").fs;
    expect(step1.isComplete(at(fs))).toBe(true);
    expect(step2.isComplete(at(fs))).toBe(false); // markers present, not staged

    // player edits config.txt (removes markers), still unstaged
    fs = write(fs, "host = localhost\nport = 8080\ntimeout = 90\n");
    expect(step2.isComplete(at(fs))).toBe(false);

    // git add config.txt → resolved + staged
    fs = gitAdd(fs, repo, repo, ["config.txt"], false).fs;
    expect(step2.isComplete(at(fs))).toBe(true);
    expect(step3.isComplete(at(fs))).toBe(false); // still mid-rebase

    // git rebase --continue → done
    fs = gitRebaseContinue(fs, repo).fs;
    expect(step3.isComplete(at(fs))).toBe(true);
  });

  it("accepts resolving in favor of one side (content equals a parent version)", () => {
    let fs = gitRebaseChallenge.setup(buildBaseFs());
    const win = makeWindow(CRUNCH_MACHINE, repo);
    const at = (f: typeof fs) => snap(win, f, repo);

    fs = gitRebase(fs, repo, "main").fs;
    // resolve to exactly main's version — equal to HEAD-side content, no markers
    fs = write(fs, "host = localhost\nport = 8080\ntimeout = 45\n");
    fs = gitAdd(fs, repo, repo, ["config.txt"], false).fs;
    expect(step2.isComplete(at(fs))).toBe(true);

    fs = gitRebaseContinue(fs, repo).fs;
    expect(step3.isComplete(at(fs))).toBe(true);
  });

  it("does NOT complete step 2 while conflict markers remain", () => {
    let fs = gitRebaseChallenge.setup(buildBaseFs());
    const win = makeWindow(CRUNCH_MACHINE, repo);
    fs = gitRebase(fs, repo, "main").fs;
    // stage the still-conflicted file (markers intact)
    fs = gitAdd(fs, repo, repo, ["config.txt"], false).fs;
    expect(step2.isComplete(snap(win, fs, repo))).toBe(false);
  });
});

describe("git-stash challenge", () => {
  const repo = gitStashChallenge.gitRepoPath!;
  const APP = `${repo}/app.js`;
  const WIP_APP = "const VERSION = 1;\nstart(); // WIP: refactor in progress\n";
  const [step1, step2, step3, step4] = gitStashChallenge.steps;
  const win = makeWindow(CRUNCH_MACHINE, repo);
  const at = (f: ReturnType<typeof gitStashChallenge.setup>) => snap(win, f, repo);

  it("seeds a staged WIP on main with the hotfix branch present", () => {
    const fs = gitStashChallenge.setup(buildBaseFs());
    expect(findRepoRoot(fs, repo)).toBe(repo);
    // freshly seeded: WIP staged, nothing stashed yet
    expect(step1.isComplete(at(fs))).toBe(false);
    expect(fs.readFile(APP).content).toBe(WIP_APP);
  });

  it("refuses to switch branches while WIP is staged (the reason to stash)", () => {
    const fs = gitStashChallenge.setup(buildBaseFs());
    const r = gitCheckout(fs, repo, "hotfix", false);
    expect(r.error).toContain("stash");
  });

  it("walks the full stash → switch → switch back → pop flow", () => {
    let fs = gitStashChallenge.setup(buildBaseFs());

    // git stash → work shelved, tree clean
    fs = gitStashSave(fs, repo).fs;
    expect(step1.isComplete(at(fs))).toBe(true);
    expect(step2.isComplete(at(fs))).toBe(false); // still on main

    // git checkout hotfix → now allowed
    fs = gitCheckout(fs, repo, "hotfix", false).fs;
    expect(step2.isComplete(at(fs))).toBe(true);
    expect(step3.isComplete(at(fs))).toBe(false); // not back yet

    // git checkout main → back on your branch, still stashed
    fs = gitCheckout(fs, repo, "main", false).fs;
    expect(step3.isComplete(at(fs))).toBe(true);
    expect(step4.isComplete(at(fs))).toBe(false); // not popped yet

    // git stash pop → WIP restored, stash empty
    fs = gitStashPop(fs, repo).fs;
    expect(step4.isComplete(at(fs))).toBe(true);
    expect(fs.readFile(APP).content).toBe(WIP_APP);
  });
});

describe("git-pull-ff challenge", () => {
  const repo = gitPullFf.gitRepoPath!;
  const LOAD = `${repo}/pipeline/load.py`;
  const SCRATCH = `${repo}/sql/existing_credit_card.sql`;
  const LOAD_WIP =
    "def load():\n    rows = read_source()\n    rows = dedupe(rows)  # WIP: drop duplicate cards\n    write_warehouse(rows)\n";
  const [step1, step2, step3] = gitPullFf.steps;
  const win = makeWindow(CRUNCH_MACHINE, repo);
  const at = (f: ReturnType<typeof gitPullFf.setup>) => snap(win, f, repo);

  it("seeds a branch 2 commits behind origin with a dirty tree", () => {
    const fs = gitPullFf.setup(buildBaseFs());
    expect(findRepoRoot(fs, repo)).toBe(repo);
    const g = readGitState(fs, repo);
    expect(g.branch).toBe("feat/add-sql");
    expect(g.behind).toBe(2);
    expect(g.commitCount).toBe(1);
    expect(g.unstaged.map((u) => u)).toContain("pipeline/load.py");
    expect(g.untracked).toContain("sql/existing_credit_card.sql");
    expect(step1.isComplete(at(fs))).toBe(false);
  });

  it("plain `git stash` (no -u) strands the untracked file → step 1 stays incomplete", () => {
    let fs = gitPullFf.setup(buildBaseFs());
    fs = gitStashSave(fs, repo, false).fs;
    expect(readGitState(fs, repo).untracked).toContain("sql/existing_credit_card.sql");
    expect(step1.isComplete(at(fs))).toBe(false);
  });

  it("an un-stashed `git pull` refuses to clobber local changes", () => {
    const fs = gitPullFf.setup(buildBaseFs());
    const r = gitPull(fs, repo, undefined, undefined, {});
    expect(r.error).toContain("would be overwritten");
    expect(step2.isComplete(at(fs))).toBe(false);
  });

  it("walks the full stash -u → pull --ff-only → pop flow", () => {
    let fs = gitPullFf.setup(buildBaseFs());

    // git stash --include-untracked → edits + new file shelved, tree clean
    fs = gitStashSave(fs, repo, true).fs;
    expect(step1.isComplete(at(fs))).toBe(true);
    expect(fs.getNode(SCRATCH)).toBeNull(); // untracked file tucked away
    expect(step2.isComplete(at(fs))).toBe(false); // not pulled yet

    // git pull --ff-only → fast-forward to the 2 upstream commits
    const pull = gitPull(fs, repo, undefined, undefined, {});
    expect(pull.error).toBeUndefined();
    expect(pull.output).toContain("Fast-forward");
    fs = pull.fs;
    const g = readGitState(fs, repo);
    expect(g.behind).toBe(0);
    expect(g.commitCount).toBe(3);
    expect(step2.isComplete(at(fs))).toBe(true);
    expect(step3.isComplete(at(fs))).toBe(false); // not popped yet

    // git stash pop → WIP edit + untracked file restored on top
    fs = gitStashPop(fs, repo).fs;
    expect(step3.isComplete(at(fs))).toBe(true);
    expect(fs.readFile(LOAD).content).toBe(LOAD_WIP);
    expect(fs.getNode(SCRATCH)).not.toBeNull();
  });
});

describe("git-pull-ff dispatch (flags accepted through the git command)", () => {
  const repo = gitPullFf.gitRepoPath!;
  // The git handler reads ctx.rawArgs; allow-all policy makes `git` runnable here.
  function ctx(fs: ReturnType<typeof gitPullFf.setup>, rawArgs: string[]): CommandContext {
    return {
      fs, cwd: repo, homeDir: HOME_DIR, username: "player",
      activeComputer: CRUNCH_MACHINE, rawArgs,
    };
  }

  it("accepts `git stash --include-untracked` (not a flag error) and shelves the untracked file", () => {
    resetAvailabilityPolicy();
    const fs = gitPullFf.setup(buildBaseFs());
    const r = execute("git", ["stash"], {}, ctx(fs, ["stash", "--include-untracked"]));
    expect(r.exitCode ?? 0).not.toBe(129); // 129 = git's "unknown switch"
    expect(readGitState(r.newFs ?? fs, repo).clean).toBe(true);
  });

  it("accepts `git pull --ff-only` (not a flag error) and fast-forwards", () => {
    resetAvailabilityPolicy();
    let fs = gitPullFf.setup(buildBaseFs());
    fs = gitStashSave(fs, repo, true).fs; // clean tree so the FF can proceed
    const r = execute("git", ["pull"], {}, ctx(fs, ["pull", "--ff-only"]));
    expect(r.exitCode ?? 0).not.toBe(129);
    expect(r.output).toContain("Fast-forward");
    expect(readGitState(r.newFs ?? fs, repo).behind).toBe(0);
  });
});

describe("rm-bomb challenge", () => {
  const BOMB = "/home/player/work/reports/2024/BOMB.md";
  const PARENT = "/home/player/work/reports/2024";
  const SIBLING = "/home/player/work/reports/2024/q1.md";
  const step = rmBomb.steps[0];

  function fsSnap(fs = rmBomb.setup(buildBaseFs())): ChallengeSnapshot {
    return snap(makeWindow(CRUNCH_MACHINE, HOME_DIR), fs);
  }

  it("seeds BOMB.md alongside survivors", () => {
    const fs = rmBomb.setup(buildBaseFs());
    expect(fs.getNode(BOMB)).not.toBeNull();
    for (const p of [SIBLING, "/home/player/work/notes.md", "/home/player/work/reports/summary.md"]) {
      expect(fs.getNode(p)).not.toBeNull();
    }
    expect(step.isComplete(fsSnap(fs))).toBe(false);
  });

  it("completes when only BOMB.md is removed", () => {
    const fs = rmBomb.setup(buildBaseFs()).removeNode(BOMB).fs!;
    expect(step.isComplete(fsSnap(fs))).toBe(true);
  });

  it("does NOT complete when rm -rf takes the whole parent dir (sibling lost)", () => {
    const fs = rmBomb.setup(buildBaseFs()).removeNode(PARENT).fs!;
    expect(fs.getNode(BOMB)).toBeNull(); // bomb gone...
    expect(fs.getNode(SIBLING)).toBeNull(); // ...but so is q1.md
    expect(step.isComplete(fsSnap(fs))).toBe(false);
  });

  it("does NOT complete when a survivor is also removed", () => {
    let fs = rmBomb.setup(buildBaseFs()).removeNode(BOMB).fs!;
    fs = fs.removeNode("/home/player/work/notes.md").fs!;
    expect(step.isComplete(fsSnap(fs))).toBe(false);
  });
});

describe("chmod-perms challenge", () => {
  const SECRETS = "/home/player/vault/secrets.env";
  const [unlock] = chmodPerms.steps;

  function fsSnap(fs: ReturnType<typeof buildBaseFs>): ChallengeSnapshot {
    return snap(makeWindow(CRUNCH_MACHINE, HOME_DIR), fs);
  }

  it("seeds secrets.env locked to 600 (unreadable) with the step unsatisfied", () => {
    const fs = chmodPerms.setup(buildBaseFs());
    const perms = fs.getNode(SECRETS)?.permissions;
    expect(perms).toBe("rw-------");
    // The "other" read bit the engine's readFile() checks is off, so `cat` would fail.
    expect(perms?.[6]).not.toBe("r");
    expect(unlock.isComplete(fsSnap(fs))).toBe(false);
  });

  it("completes once read is granted (chmod +r / 644 → rw-r--r--)", () => {
    const fs = chmodPerms.setup(buildBaseFs()).setPermissions(SECRETS, "rw-r--r--").fs!;
    expect(unlock.isComplete(fsSnap(fs))).toBe(true);
  });

  it("stays incomplete while still locked at 600", () => {
    const fs = chmodPerms.setup(buildBaseFs()).setPermissions(SECRETS, "rw-------").fs!;
    expect(unlock.isComplete(fsSnap(fs))).toBe(false);
  });

  it("does NOT complete on owner-only read (u+r) — the other bit is still off", () => {
    const fs = chmodPerms.setup(buildBaseFs()).setPermissions(SECRETS, "rw-------").fs!;
    // chmod u+r leaves index 6 unchanged, so the file still can't be cat'd.
    expect(unlock.isComplete(fsSnap(fs))).toBe(false);
  });
});

describe("copy-mode-yank challenge", () => {
  const TOKEN = "moonlit-cipher-7f3c91a0e5";
  const TARGET_DIR = `/home/player/${TOKEN}`;
  const LOG = "/home/player/passphrase.log";
  const [step] = copyModeYank.steps;

  function fsSnap(fs: ReturnType<typeof buildBaseFs>): ChallengeSnapshot {
    return snap(makeWindow(CRUNCH_MACHINE, HOME_DIR), fs);
  }

  it("seeds the log with the passphrase buried in it, step unsatisfied", () => {
    const fs = copyModeYank.setup(buildBaseFs());
    const body = fs.readFile(LOG).content ?? "";
    expect(body).toContain(TOKEN);
    // token sits alone on its own line so a copy-mode line-yank grabs just it
    expect(body).toContain(`\n${TOKEN}\n`);
    expect(step.isComplete(fsSnap(fs))).toBe(false);
  });

  it("completes once a directory named after the token exists", () => {
    const fs = copyModeYank.setup(buildBaseFs()).makeDirectory(TARGET_DIR).fs!;
    expect(step.isComplete(fsSnap(fs))).toBe(true);
  });

  it("does NOT complete for a wrong directory name", () => {
    const fs = copyModeYank.setup(buildBaseFs()).makeDirectory("/home/player/wrong").fs!;
    expect(step.isComplete(fsSnap(fs))).toBe(false);
  });
});

describe("challenges are objective-first with progressive hints", () => {
  // The command belongs in `command` (revealed on request), never in the objective
  // text — that's the whole point of the rework, so guard it. The pane challenges
  // (panes-split/windows-create) are keyboard-driven and intentionally excluded.
  const objectiveFirst = [gitFirstCommit, gitUnstage, gitStashChallenge, gitPullFf, gitRebaseChallenge, rmBomb, chmodPerms, copyModeYank, sessionsDetachAttach, sessionsJuggle];

  it("each has a brief and every step has a hint + command", () => {
    for (const c of objectiveFirst) {
      expect(c.brief, `${c.id} missing brief`).toBeTruthy();
      for (const step of c.steps) {
        expect(step.hint, `${c.id} step missing hint`).toBeTruthy();
        expect(step.command, `${c.id} step missing command`).toBeTruthy();
      }
    }
  });

  // An instruction may be omitted only when the brief alone carries the whole
  // objective — i.e. a single-step challenge with a brief. Everywhere else the
  // panel would render an empty goal.
  it("every step has an instruction unless a single-step brief covers it", () => {
    for (const c of CHALLENGES) {
      const briefCovers = Boolean(c.brief) && c.steps.length === 1;
      for (const step of c.steps) {
        if (!step.instruction) {
          expect(briefCovers, `${c.id} step missing instruction without a covering brief`).toBe(true);
        }
      }
    }
  });
});

describe("categories", () => {
  it("'all' contains every challenge in registry order", () => {
    expect(getCategory("all").challenges).toEqual(CHALLENGES);
  });

  it("type-derived groups contain only their type and are non-empty", () => {
    const cases: Array<[string, "git" | "tmux" | "fs"]> = [
      ["git", "git"],
      ["tmux", "tmux"],
      ["fs", "fs"],
    ];
    for (const [id, type] of cases) {
      const cs = getCategory(id).challenges;
      expect(cs.length).toBeGreaterThan(0);
      expect(cs.every((c) => c.type === type)).toBe(true);
    }
  });

  it("falls back to the 'all' group for an unknown id", () => {
    expect(getCategory("bogus")).toBe(getCategory("all"));
  });
});

describe("group-relative completion gate", () => {
  // The store's challengeIndex + completion gate are relative to the active
  // category. Restore the default "all" track afterward so the allowlist suite
  // (which loads challenges by global registry index) still lines up.
  afterAll(() => {
    useGameStore.setState({ activeCategory: "all" });
    useGameStore.getState().loadChallenge(0);
  });

  it("finishing the last challenge in a track completes the track (no continue gate)", () => {
    const state = useGameStore.getState;
    useGameStore.setState({ activeCategory: "git" });
    const gitChallenges = getCategory("git").challenges;
    const lastIndex = gitChallenges.length - 1;
    state().loadChallenge(lastIndex); // the final git challenge (git-rebase)
    expect(gitChallenges[lastIndex].id).toBe("git-rebase");

    const repo = gitRebaseChallenge.gitRepoPath!;
    const config = `${repo}/config.txt`;

    // step 1: git rebase main → conflict → advance within the challenge
    useGameStore.setState({ fs: gitRebase(state().fs, repo, "main").fs });
    state().checkCompletion();
    expect(state().stepIndex).toBe(1);

    // step 2: resolve markers + stage → advance to the final step
    useGameStore.setState({ fs: state().fs.writeFile(config, "host = localhost\nport = 8080\ntimeout = 90\n").fs! });
    useGameStore.setState({ fs: gitAdd(state().fs, repo, repo, ["config.txt"], false).fs });
    state().checkCompletion();
    expect(state().stepIndex).toBe(2);

    // step 3: git rebase --continue → last step of the final challenge → done, no gate
    useGameStore.setState({ fs: gitRebaseContinue(state().fs, repo).fs });
    state().checkCompletion();
    expect(state().completed).toBe(true);
    expect(state().awaitingContinue).toBe(false);
  });
});

describe("out-of-order step completion (cascade)", () => {
  // checkCompletion cascades through consecutive satisfied steps, so play
  // that reaches the target state in a different order still completes.
  const windowsCreateIndex = getCategory("all").challenges.findIndex((c) => c.id === "windows-create");
  beforeAll(() => useGameStore.setState({ activeCategory: "all" }));
  afterAll(() => {
    useGameStore.setState({ activeCategory: "all" });
    useGameStore.getState().loadChallenge(0);
  });

  it("create → rename → create completes windows-create", () => {
    const state = useGameStore.getState;
    state().loadChallenge(windowsCreateIndex);
    state().newWindow(); // step 0: 2 windows
    expect(state().stepIndex).toBe(1);
    state().renameWindow(state().windows[1].id, "logs"); // pre-satisfies step 2
    expect(state().stepIndex).toBe(1);
    state().newWindow(); // step 1 passes, cascade consumes step 2 → done
    expect(state().awaitingContinue).toBe(true);
  });

  it("rename first, then create twice, completes windows-create", () => {
    const state = useGameStore.getState;
    state().loadChallenge(windowsCreateIndex);
    state().renameWindow(state().windows[0].id, "logs");
    expect(state().stepIndex).toBe(0);
    state().newWindow();
    expect(state().stepIndex).toBe(1);
    state().newWindow();
    expect(state().awaitingContinue).toBe(true);
  });
});

describe("starting cwd", () => {
  // loadChallenge resolves the challenge from the active category; pin it to "all"
  // so the global registry indices below line up, and restore afterward.
  beforeAll(() => useGameStore.setState({ activeCategory: "all" }));
  afterAll(() => {
    useGameStore.setState({ activeCategory: "all" });
    useGameStore.getState().loadChallenge(0);
  });

  const leafCwd = (): string => {
    const win = useGameStore.getState().windows[0];
    expect(win.root.kind).toBe("leaf");
    if (win.root.kind !== "leaf") throw new Error("expected a single-leaf window");
    return win.root.cwd;
  };

  it("drops the player inside the repo for git challenges", () => {
    useGameStore.getState().loadChallenge(CHALLENGES.findIndex((c) => c.id === "git-first-commit"));
    expect(leafCwd()).toBe(gitFirstCommit.gitRepoPath);
  });

  it("starts non-git challenges at HOME_DIR", () => {
    useGameStore.getState().loadChallenge(CHALLENGES.findIndex((c) => c.id === "panes-split"));
    expect(leafCwd()).toBe(HOME_DIR);
  });

  it("seeds the multi-pane initialWindow for cleanup challenges", () => {
    useGameStore.getState().loadChallenge(CHALLENGES.findIndex((c) => c.id === "panes-cleanup"));
    const win = useGameStore.getState().windows[0];
    expect(structKey(win.root)).toBe("(h (v L L) (v L L))");
  });

  it("seeds a 50/50 side-by-side split for the resize challenge", () => {
    useGameStore.getState().loadChallenge(CHALLENGES.findIndex((c) => c.id === "panes-resize"));
    const win = useGameStore.getState().windows[0];
    expect(structKey(win.root)).toBe("(h L L)");
  });
});

describe("per-challenge command allowlist", () => {
  // The policy reads the current challenge from the store, so drive it via loadChallenge.
  const select = (id: string) =>
    useGameStore.getState().loadChallenge(CHALLENGES.findIndex((c) => c.id === id));

  beforeAll(() => setAvailabilityPolicy(CRUNCH_AVAILABILITY_POLICY));
  afterAll(() => resetAvailabilityPolicy());

  it("always allows help, clear, man, and shortcuts, regardless of the challenge list", () => {
    select("panes-split"); // commands: []
    expect(isCommandAvailable("help", CRUNCH_MACHINE)).toBe(true);
    expect(isCommandAvailable("clear", CRUNCH_MACHINE)).toBe(true);
    expect(isCommandAvailable("man", CRUNCH_MACHINE)).toBe(true);
    expect(isCommandAvailable("shortcuts", CRUNCH_MACHINE)).toBe(true);
  });

  it("allows exactly the listed commands (plus help/clear) and hides the rest", () => {
    select("chmod-perms"); // commands: ["chmod", "cat", "ls", "cd", "pwd"]
    for (const cmd of ["chmod", "cat", "ls", "cd", "pwd"]) {
      expect(isCommandAvailable(cmd, CRUNCH_MACHINE)).toBe(true);
    }
    expect(isCommandAvailable("git", CRUNCH_MACHINE)).toBe(false);
    expect(isCommandAvailable("rm", CRUNCH_MACHINE)).toBe(false);

    const listed = getAvailableCommands(CRUNCH_MACHINE).map((c) => c.name).sort();
    expect(listed).toEqual(["cat", "cd", "chmod", "clear", "help", "ls", "man", "pwd", "shortcuts", "tmux"]);
  });

  it("blocks off-list commands with a friendly hint message", () => {
    select("rm-bomb"); // commands: ["find", "rm", "ls", "cat", "cd", "pwd"]
    expect(isCommandAvailable("chmod", CRUNCH_MACHINE)).toBe(false);
    const msg = unavailableCommandMessage("chmod", CRUNCH_MACHINE);
    expect(msg).toContain("chmod");
    expect(msg).toContain("this challenge");
  });

  it("checks aliases by their primary name (python3 → python, not listed → blocked)", () => {
    select("git-first-commit"); // commands: ["git", "ls", "cat", "cd", "pwd"]
    // python3 resolves to primary `python`, which isn't listed → unavailable.
    expect(isCommandAvailable("python3", CRUNCH_MACHINE)).toBe(false);
    // getAvailableCommands lists primaries only (no aliases leak in).
    const listed = getAvailableCommands(CRUNCH_MACHINE).map((c) => c.name);
    expect(listed).not.toContain("python3");
    expect(listed.sort()).toEqual(["cat", "cd", "clear", "git", "help", "ls", "man", "pwd", "shortcuts", "tmux"]);
  });
});

describe("sessions-detach-attach predicates", () => {
  const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
  const at = (tmux: ChallengeSnapshot["tmux"]) => snap(win, buildBaseFs(), HOME_DIR, tmux);
  const [detach, reattach] = sessionsDetachAttach.steps;

  it("step 0: detached with session 0 on the server", () => {
    expect(detach.isComplete(at({ attachedSession: "0", detachedSessions: [] }))).toBe(false);
    expect(detach.isComplete(at({ attachedSession: null, detachedSessions: [{ name: "0", windowCount: 1 }] }))).toBe(true);
    // kill-server leaves no session to reattach to — must not count as a detach
    expect(detach.isComplete(at({ attachedSession: null, detachedSessions: [] }))).toBe(false);
  });

  it("step 1: reattached to 0 with nothing left detached", () => {
    expect(reattach.isComplete(at({ attachedSession: null, detachedSessions: [{ name: "0", windowCount: 1 }] }))).toBe(false);
    expect(reattach.isComplete(at({ attachedSession: "0", detachedSessions: [] }))).toBe(true);
  });
});

describe("sessions-juggle predicates", () => {
  const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
  const at = (attachedSession: string | null, detachedNames: string[]) =>
    snap(win, buildBaseFs(), HOME_DIR, {
      attachedSession,
      detachedSessions: detachedNames.map((name) => ({ name, windowCount: 1 })),
    });
  const steps = sessionsJuggle.steps;

  it("walks the intended sequence: each state satisfies its step (and only later-cascade-safe ones)", () => {
    // [state, indices of steps satisfied by that state]. The load and final
    // states also satisfy steps 3/4 — safe because the cascade starts at
    // step 0, which the load state never satisfies.
    const sequence: Array<[ReturnType<typeof at>, number[]]> = [
      [at("0", []), [3, 4]], // load state (and post-kill final state)
      [at(null, ["0"]), [0]],
      [at("scratch", ["0"]), [1]],
      // the second detach also re-satisfies step 0 (already consumed by then)
      [at(null, ["0", "scratch"]), [0, 2]],
      [at("0", ["scratch"]), [3]],
    ];
    for (const [idx, [s, satisfied]] of sequence.entries()) {
      steps.forEach((step, i) => {
        expect(step.isComplete(s), `state ${idx}, step ${i}`).toBe(satisfied.includes(i));
      });
    }
  });

  it("out-of-order: killing scratch while detached lets attach cascade steps 3+4", () => {
    // After kill-session -t scratch from the detached shell, then attach -t 0,
    // both remaining steps hold at once — no predicate strands the player.
    const s = at("0", []);
    expect(steps[3].isComplete(s)).toBe(true);
    expect(steps[4].isComplete(s)).toBe(true);
  });
});

describe("tmux lifecycle win-detection (store)", () => {
  // checkWhileDetached challenges must have predicates evaluated from the bare
  // shell, and applyTmuxAction must trigger checkCompletion on every action.
  beforeAll(() => useGameStore.setState({ activeCategory: "all" }));
  afterAll(() => {
    useGameStore.setState({ activeCategory: "all" });
    useGameStore.getState().loadChallenge(0);
  });
  const select = (id: string) =>
    useGameStore.getState().loadChallenge(CHALLENGES.findIndex((c) => c.id === id));

  it("detach then attach completes sessions-detach-attach", () => {
    const state = useGameStore.getState;
    select("sessions-detach-attach");
    state().applyTmuxAction({ type: "detach" });
    expect(state().stepIndex).toBe(1);
    state().applyTmuxAction({ type: "attach", name: "0" });
    expect(state().awaitingContinue || state().completed).toBe(true);
  });

  it("full juggle sequence completes sessions-juggle", () => {
    const state = useGameStore.getState;
    select("sessions-juggle");
    state().applyTmuxAction({ type: "detach" });
    expect(state().stepIndex).toBe(1);
    state().applyTmuxAction({ type: "new-session", name: "scratch" });
    expect(state().stepIndex).toBe(2);
    state().applyTmuxAction({ type: "detach" });
    expect(state().stepIndex).toBe(3);
    state().applyTmuxAction({ type: "attach", name: "0" });
    expect(state().stepIndex).toBe(4);
    state().applyTmuxAction({ type: "kill-session", name: "scratch" });
    expect(state().awaitingContinue || state().completed).toBe(true);
  });

  it("out-of-order: kill scratch while detached, then attach, cascades to done", () => {
    const state = useGameStore.getState;
    select("sessions-juggle");
    state().applyTmuxAction({ type: "detach" });
    state().applyTmuxAction({ type: "new-session", name: "scratch" });
    state().applyTmuxAction({ type: "detach" });
    expect(state().stepIndex).toBe(3);
    state().applyTmuxAction({ type: "kill-session", name: "scratch" });
    expect(state().stepIndex).toBe(3); // detached, step 3 not yet satisfied
    state().applyTmuxAction({ type: "attach", name: "0" });
    expect(state().awaitingContinue || state().completed).toBe(true);
  });

  it("kill-server soft-lock recovers via restartChallenge", () => {
    const state = useGameStore.getState;
    select("sessions-juggle");
    state().applyTmuxAction({ type: "detach" });
    state().applyTmuxAction({ type: "kill-server" });
    expect(state().tmuxAttachedSession).toBeNull();
    expect(state().tmuxDetachedSessions).toEqual([]);
    state().restartChallenge();
    expect(state().tmuxAttachedSession?.name).toBe("0");
    expect(state().stepIndex).toBe(0);
  });

  it("pane challenges (no checkWhileDetached) still skip checks while detached", () => {
    const state = useGameStore.getState;
    select("panes-split");
    state().applyTmuxAction({ type: "detach" });
    // The bare single shell must not advance panes-split (its target is a
    // multi-pane layout, but guard the mechanism, not the predicate).
    expect(state().stepIndex).toBe(0);
    state().applyTmuxAction({ type: "attach", name: "0" });
    expect(state().stepIndex).toBe(0);
  });
});
