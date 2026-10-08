import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import "@tt/core/commands/builtins"; // register builtins so the registry is populated
import {
  setAvailabilityPolicy,
  resetAvailabilityPolicy,
  isCommandAvailable,
  unavailableCommandMessage,
} from "@tt/core/commands/availability";
import { getAvailableCommands, execute } from "@tt/core/commands/registry";
import type { CommandContext } from "@tt/core/commands/types";
import type { Terminal } from "@xterm/xterm";
import { VimSession } from "@tt/core/vim/VimSession";
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
  findSplit,
  resetPaneIdCounters,
  MAX_NUDGE_RATIO,
  type PaneNode,
  type WindowState,
} from "@tt/core/terminal/paneTypes";
import { findRepoRoot, gitAdd, gitCommit, gitReset, gitRestore, gitRebase, gitRebaseContinue, gitCheckout, gitStashSave, gitStashPop, gitStashApply, readStash, gitPull, listBranches, deleteBranch, gitPushDelete } from "@tt/core/git/repo";
import { buildBaseFs } from "../lib/seed";
import { readGitState } from "../lib/gitState";
import { structKey, paneTreeMatches, paneTreeMatchesWithRatio } from "../lib/paneCompare";
import { CRUNCH_MACHINE, HOME_DIR, GIT_AUTHOR, MAX_WINDOWS, MAX_PANES_PER_WINDOW } from "../lib/machine";
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
import { gitBranchDelete } from "../challenges/git-branch-delete";
import { rmBomb } from "../challenges/rm-bomb";
import { chmodPerms } from "../challenges/chmod-perms";
import { mvOrganize } from "../challenges/mv-organize";
import { envExport } from "../challenges/env-export";
import { aliasShortcut } from "../challenges/alias-shortcut";
import { copyModeYank } from "../challenges/copy-mode-yank";
import { sessionsDetachAttach } from "../challenges/sessions-detach-attach";
import { sessionsJuggle } from "../challenges/sessions-juggle";
import { sessionsRename } from "../challenges/sessions-rename";
import { vimFirstEdit } from "../challenges/vim-first-edit";
import { vimDeleteLines } from "../challenges/vim-delete-lines";
import { vimFixWord } from "../challenges/vim-fix-word";
import { vimYankPaste } from "../challenges/vim-yank-paste";
import { vimSearchFix } from "../challenges/vim-search-fix";
import { vimReorder } from "../challenges/vim-reorder";
import type { ChallengeSnapshot } from "../challenges/types";

function snap(
  activeWindow: WindowState,
  fs = buildBaseFs(),
  tmux: ChallengeSnapshot["tmux"] = { attachedSession: "0", detachedSessions: [] },
): ChallengeSnapshot {
  return { activeWindow, windows: [activeWindow], fs, tmux, envVars: {}, aliases: {} };
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

    // the TARGET strip says `logs`: any other name is not the target
    const misnamed = three.map((w, i) => (i === 2 ? { ...w, name: "x" } : w));
    expect(rename.isComplete(winSnap(misnamed))).toBe(false);

    // name one of the three logs (any position): rename step passes
    const named = three.map((w, i) => (i === 2 ? { ...w, name: "logs" } : w));
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

    const at = (f: typeof fs) => snap(win, f);

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
  const at = (f: ReturnType<typeof gitUnstage.setup>) => snap(win, f);

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

  it("also accepts the modern `git restore --staged .env` spelling", () => {
    let fs = gitUnstage.setup(buildBaseFs());
    fs = gitRestore(fs, repo, repo, [".env"], true).fs;
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

  it("completes via bare `git reset` then `git commit -am` — the change landed, .env stayed out", () => {
    let fs = gitUnstage.setup(buildBaseFs());
    fs = gitReset(fs, repo, repo, [], null).fs;
    // `commit -am` re-stages the tracked app.js edit and commits it atomically,
    // so "app.js staged" is never observable between commands.
    fs = gitCommit(fs, repo, "update", GIT_AUTHOR, false, true, 1_700_000_002_000).fs;
    const g = readGitState(fs, repo);
    expect(g.commitCount).toBe(2);
    expect(g.untracked).toContain(".env");
    expect(fs.readFile(ENV).content).toBe(ENV_CONTENT);
    // both steps true on the same snapshot: the store's forward-only cascade
    // consumes step 1 then step 2 and the challenge completes.
    expect(step1.isComplete(at(fs))).toBe(true);
    expect(step2.isComplete(at(fs))).toBe(true);
  });

  it("does NOT complete when `git commit -am` runs without unstaging .env first", () => {
    let fs = gitUnstage.setup(buildBaseFs());
    fs = gitCommit(fs, repo, "update", GIT_AUTHOR, false, true, 1_700_000_002_000).fs;
    expect(readGitState(fs, repo).untracked).not.toContain(".env"); // secrets committed
    expect(step1.isComplete(at(fs))).toBe(false);
    expect(step2.isComplete(at(fs))).toBe(false);
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
  const [step1, step2, step3, step4] = gitRebaseChallenge.steps;

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
    expect(step1.isComplete(snap(win, fs))).toBe(false);
    expect(step4.isComplete(snap(win, fs))).toBe(false);
  });

  it("walks the full rebase → resolve → continue flow", () => {
    let fs = gitRebaseChallenge.setup(buildBaseFs());
    const win = makeWindow(CRUNCH_MACHINE, repo);
    const at = (f: typeof fs) => snap(win, f);

    // git rebase main → conflict
    fs = gitRebase(fs, repo, "main").fs;
    expect(step1.isComplete(at(fs))).toBe(true);
    expect(step2.isComplete(at(fs))).toBe(false); // markers still present

    // player edits config.txt (removes markers), still unstaged
    fs = write(fs, "host = localhost\nport = 8080\ntimeout = 90\n");
    expect(step2.isComplete(at(fs))).toBe(true); // markers gone
    expect(step3.isComplete(at(fs))).toBe(false); // not yet staged

    // git add config.txt → staged, conflict marked resolved
    fs = gitAdd(fs, repo, repo, ["config.txt"], false).fs;
    expect(step3.isComplete(at(fs))).toBe(true);
    expect(step4.isComplete(at(fs))).toBe(false); // still mid-rebase

    // git rebase --continue → done
    fs = gitRebaseContinue(fs, repo).fs;
    expect(step4.isComplete(at(fs))).toBe(true);
  });

  it("accepts resolving in favor of one side (content equals a parent version)", () => {
    let fs = gitRebaseChallenge.setup(buildBaseFs());
    const win = makeWindow(CRUNCH_MACHINE, repo);
    const at = (f: typeof fs) => snap(win, f);

    fs = gitRebase(fs, repo, "main").fs;
    // resolve to exactly main's version — equal to HEAD-side content, no markers
    fs = write(fs, "host = localhost\nport = 8080\ntimeout = 45\n");
    fs = gitAdd(fs, repo, repo, ["config.txt"], false).fs;
    expect(step2.isComplete(at(fs))).toBe(true);
    expect(step3.isComplete(at(fs))).toBe(true);

    fs = gitRebaseContinue(fs, repo).fs;
    expect(step4.isComplete(at(fs))).toBe(true);
  });

  it("does NOT complete the staging step while conflict markers remain", () => {
    let fs = gitRebaseChallenge.setup(buildBaseFs());
    const win = makeWindow(CRUNCH_MACHINE, repo);
    fs = gitRebase(fs, repo, "main").fs;
    // stage the still-conflicted file (markers intact)
    fs = gitAdd(fs, repo, repo, ["config.txt"], false).fs;
    expect(step2.isComplete(snap(win, fs))).toBe(false); // markers not removed
    expect(step3.isComplete(snap(win, fs))).toBe(false); // so staging step stays blocked
  });
});

describe("git-stash challenge", () => {
  const repo = gitStashChallenge.gitRepoPath!;
  const APP = `${repo}/app.js`;
  const WIP_APP = "const VERSION = 1;\nstart(); // WIP: refactor in progress\n";
  const [step1, step2, step3, step4] = gitStashChallenge.steps;
  const win = makeWindow(CRUNCH_MACHINE, repo);
  const at = (f: ReturnType<typeof gitStashChallenge.setup>) => snap(win, f);

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

  it("completes the restore step via apply, which keeps the stash entry", () => {
    let fs = gitStashChallenge.setup(buildBaseFs());
    fs = gitStashSave(fs, repo).fs;
    fs = gitCheckout(fs, repo, "hotfix", false).fs;
    fs = gitCheckout(fs, repo, "main", false).fs;

    fs = gitStashApply(fs, repo).fs;
    expect(readStash(fs, repo)).toHaveLength(1);
    expect(step4.isComplete(at(fs))).toBe(true);
  });

  it("popping on the wrong branch refuses instead of dead-ending the challenge", () => {
    let fs = gitStashChallenge.setup(buildBaseFs());
    fs = gitStashSave(fs, repo).fs;
    fs = gitCheckout(fs, repo, "hotfix", false).fs;

    const popped = gitStashPop(fs, repo);
    expect(popped.error).toContain("would be overwritten");
    fs = popped.fs;
    expect(readStash(fs, repo)).toHaveLength(1); // stash survives, so step 3 is still reachable

    fs = gitCheckout(fs, repo, "main", false).fs;
    expect(step3.isComplete(at(fs))).toBe(true);
    fs = gitStashPop(fs, repo).fs;
    expect(step4.isComplete(at(fs))).toBe(true);
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
  const at = (f: ReturnType<typeof gitPullFf.setup>) => snap(win, f);

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

  // The step predicates are effect-based, so every no-merge-commit route the brief
  // invites has to reach the same end state, not just the canonical `git pull --ff-only`.
  describe("alternate no-merge-commit routes", () => {
    const step2 = gitPullFf.steps[1];
    const at = (f: ReturnType<typeof gitPullFf.setup>) => snap(makeWindow(CRUNCH_MACHINE, repo), f);

    function stashed() {
      resetAvailabilityPolicy();
      return gitStashSave(gitPullFf.setup(buildBaseFs()), repo, true).fs;
    }

    function run(fs: ReturnType<typeof gitPullFf.setup>, rawArgs: string[]) {
      const r = execute("git", [rawArgs[0]], {}, ctx(fs, rawArgs));
      expect(r.stderr ?? "").toBe("");
      expect(r.exitCode ?? 0).toBe(0);
      return r.newFs ?? fs;
    }

    it("git fetch + git merge --ff-only origin/feat/add-sql", () => {
      let fs = stashed();
      fs = run(fs, ["fetch"]);
      fs = run(fs, ["merge", "--ff-only", `origin/feat/add-sql`]);
      expect(readGitState(fs, repo).behind).toBe(0);
      expect(step2.isComplete(at(fs))).toBe(true);
    });

    it("git pull --rebase", () => {
      let fs = stashed();
      fs = run(fs, ["pull", "--rebase"]);
      expect(readGitState(fs, repo).behind).toBe(0);
      expect(step2.isComplete(at(fs))).toBe(true);
    });

    it("git fetch + git rebase origin/feat/add-sql", () => {
      let fs = stashed();
      fs = run(fs, ["fetch"]);
      fs = run(fs, ["rebase", `origin/feat/add-sql`]);
      expect(readGitState(fs, repo).behind).toBe(0);
      expect(step2.isComplete(at(fs))).toBe(true);
    });
  });
});

describe("git-branch-delete challenge", () => {
  const repo = gitBranchDelete.gitRepoPath!;
  const [step1, step2, step3] = gitBranchDelete.steps;
  const win = makeWindow(CRUNCH_MACHINE, repo);
  const at = (f: ReturnType<typeof gitBranchDelete.setup>) => snap(win, f);

  it("seeds main with a merged branch (local + remote ref) and an unmerged one", () => {
    const fs = gitBranchDelete.setup(buildBaseFs());
    expect(findRepoRoot(fs, repo)).toBe(repo);
    const g = readGitState(fs, repo);
    expect(g.branch).toBe("main");
    expect(g.clean).toBe(true);
    const { branches, remotes } = listBranches(fs, repo, "all");
    expect(branches).toEqual(["experiment", "feature/login", "main"]);
    expect(remotes).toEqual(["remotes/origin/feature/login"]);
    // No step is satisfied by the freshly-loaded board.
    expect(gitBranchDelete.steps.map((st) => st.isComplete(at(fs)))).toEqual([false, false, false]);
  });

  it("`-d` deletes the merged branch but refuses the unmerged one", () => {
    let fs = gitBranchDelete.setup(buildBaseFs());

    const merged = deleteBranch(fs, repo, "feature/login", false);
    expect(merged.error).toBeUndefined();
    fs = merged.fs;
    expect(step1.isComplete(at(fs))).toBe(true);
    expect(step2.isComplete(at(fs))).toBe(false);

    const refused = deleteBranch(fs, repo, "experiment", false);
    expect(refused.error).toContain("not fully merged");
    expect(step2.isComplete(at(refused.fs))).toBe(false);

    // -D forces it through.
    const forced = deleteBranch(refused.fs, repo, "experiment", true);
    expect(forced.error).toBeUndefined();
    expect(step2.isComplete(at(forced.fs))).toBe(true);
    // The remote ref survives the local deletions, so step 3 needs its own push.
    expect(step3.isComplete(at(forced.fs))).toBe(false);
  });

  it("`git push origin --delete` removes the remote-tracking ref", () => {
    let fs = gitBranchDelete.setup(buildBaseFs());
    const pushed = gitPushDelete(fs, repo, "origin", "feature/login");
    expect(pushed.error).toBeUndefined();
    fs = pushed.fs;
    expect(listBranches(fs, repo, "remotes").remotes).toEqual([]);
    expect(step3.isComplete(at(fs))).toBe(true);
    // Deleting on origin leaves the local branch alone.
    expect(step1.isComplete(at(fs))).toBe(false);
  });

  it("walks the full flow through the git command", () => {
    resetAvailabilityPolicy();
    let fs = gitBranchDelete.setup(buildBaseFs());
    const run = (rawArgs: string[]) => {
      const r = execute("git", [rawArgs[0]], {}, {
        fs, cwd: repo, homeDir: HOME_DIR, username: "player",
        activeComputer: CRUNCH_MACHINE, rawArgs,
      } as CommandContext);
      expect(r.stderr ?? "").toBe("");
      expect(r.exitCode ?? 0).toBe(0);
      fs = r.newFs ?? fs;
    };

    run(["branch", "-d", "feature/login"]);
    expect(step1.isComplete(at(fs))).toBe(true);
    run(["branch", "-D", "experiment"]);
    expect(step2.isComplete(at(fs))).toBe(true);
    run(["push", "origin", "--delete", "feature/login"]);
    expect(step3.isComplete(at(fs))).toBe(true);
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
  const PAGE = "/home/player/site/index.html";
  const [grant] = chmodPerms.steps;

  function fsSnap(fs: ReturnType<typeof buildBaseFs>): ChallengeSnapshot {
    return snap(makeWindow(CRUNCH_MACHINE, HOME_DIR), fs);
  }

  it("seeds index.html at 600 (others can't read) with the step unsatisfied", () => {
    const fs = chmodPerms.setup(buildBaseFs());
    const perms = fs.getNode(PAGE)?.permissions;
    expect(perms).toBe("rw-------");
    // The "other" read bit the engine's readFile() checks is off.
    expect(perms?.[6]).not.toBe("r");
    expect(grant.isComplete(fsSnap(fs))).toBe(false);
  });

  it("completes once others can read (chmod o+r / 644 → rw-r--r--)", () => {
    const fs = chmodPerms.setup(buildBaseFs()).setPermissions(PAGE, "rw-r--r--").fs!;
    expect(grant.isComplete(fsSnap(fs))).toBe(true);
  });

  it("does NOT complete on owner-only read (u+r) — the other bit is still off", () => {
    const fs = chmodPerms.setup(buildBaseFs()).setPermissions(PAGE, "rw-------").fs!;
    expect(grant.isComplete(fsSnap(fs))).toBe(false);
  });

  it("never claims the owner can't read: the brief is about other users, and cat isn't offered", () => {
    expect(chmodPerms.brief).toMatch(/other users/);
    expect(chmodPerms.brief).not.toMatch(/Permission denied/);
    expect(chmodPerms.commands).not.toContain("cat");
  });
});

describe("mv-organize challenge", () => {
  const DIR = "/home/player/downloads";
  const NAMES = ["notes.md", "todo.txt", "build.log"];
  const [mkLogs, moveLog] = mvOrganize.steps;

  function fsSnap(fs: ReturnType<typeof buildBaseFs>): ChallengeSnapshot {
    return snap(makeWindow(CRUNCH_MACHINE, HOME_DIR), fs);
  }

  function ctx(fs: ReturnType<typeof buildBaseFs>): CommandContext {
    return { fs, cwd: DIR, homeDir: HOME_DIR, username: "player", activeComputer: CRUNCH_MACHINE };
  }

  // Drives the real mkdir/mv builtins the player would use.
  function run(fs: ReturnType<typeof buildBaseFs>, cmd: string, args: string[]) {
    const r = execute(cmd, args, {}, ctx(fs));
    expect(r.exitCode ?? 0, `${cmd} ${args.join(" ")}: ${r.output}`).toBe(0);
    return r.newFs ?? fs;
  }

  it("seeds a flat mess with no logs subdir, both steps unsatisfied", () => {
    resetAvailabilityPolicy();
    const fs = mvOrganize.setup(buildBaseFs());
    for (const name of NAMES) expect(fs.getNode(`${DIR}/${name}`)).not.toBeNull();
    expect(fs.getNode(`${DIR}/logs`)).toBeNull();
    expect(mkLogs.isComplete(fsSnap(fs))).toBe(false);
    expect(moveLog.isComplete(fsSnap(fs))).toBe(false);
  });

  it("mkdir logs completes step 1 only", () => {
    resetAvailabilityPolicy();
    let fs = mvOrganize.setup(buildBaseFs());
    fs = run(fs, "mkdir", ["logs"]);
    expect(mkLogs.isComplete(fsSnap(fs))).toBe(true);
    expect(moveLog.isComplete(fsSnap(fs))).toBe(false);
  });

  it("a flat FILE named logs does not satisfy step 1", () => {
    const fs = mvOrganize.setup(buildBaseFs()).writeFile(`${DIR}/logs`, "").fs!;
    expect(mkLogs.isComplete(fsSnap(fs))).toBe(false);
  });

  it("mv-ing the log file into logs/ completes step 2", () => {
    resetAvailabilityPolicy();
    let fs = mvOrganize.setup(buildBaseFs());
    fs = run(fs, "mkdir", ["logs"]);
    expect(moveLog.isComplete(fsSnap(fs))).toBe(false);
    fs = run(fs, "mv", ["build.log", "logs/"]);
    expect(moveLog.isComplete(fsSnap(fs))).toBe(true);
  });

  it("a copy-like state (file in logs/ AND still flat) does not satisfy step 2", () => {
    let fs = mvOrganize.setup(buildBaseFs());
    fs = fs.makeDirectory(`${DIR}/logs`).fs!;
    // Write the log file at its sorted path but leave the flat original in place.
    fs = fs.writeFile(`${DIR}/logs/build.log`, "copy").fs!;
    expect(moveLog.isComplete(fsSnap(fs))).toBe(false);
  });
});

describe("env-export challenge", () => {
  const PROJECT = "/home/player/projects/world-domination";
  const [setEnv, dropSafeguards] = envExport.steps;
  const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
  const at = (envVars: Record<string, string>) =>
    ({ ...snap(win, envExport.setup(buildBaseFs())), envVars });
  // The seeded starting environment (loadChallenge merges initialEnv in).
  const seeded = () => ({ ...envExport.initialEnv });

  // Drives the real export/unset builtins (they commit through setEnvVars).
  function run(cmd: string, envVars: Record<string, string>, arg: string): Record<string, string> {
    resetAvailabilityPolicy();
    let committed = envVars;
    const ctx: CommandContext = {
      fs: buildBaseFs(), cwd: HOME_DIR, homeDir: HOME_DIR, username: "player",
      activeComputer: CRUNCH_MACHINE,
      envVars, setEnvVars: (next) => { committed = next; },
    };
    const r = execute(cmd, [arg], {}, ctx);
    expect(r.exitCode ?? 0).toBe(0);
    return committed;
  }

  it("starts in the project dir with SAFEGUARDS seeded, both steps unsatisfied", () => {
    expect(envExport.startCwd).toBe(PROJECT);
    expect(envExport.setup(buildBaseFs()).getNode(PROJECT)).not.toBeNull();
    expect(setEnv.isComplete(at(seeded()))).toBe(false);
    // SAFEGUARDS is present at load, so the unset step is NOT vacuously true.
    expect(dropSafeguards.isComplete(at(seeded()))).toBe(false);
  });

  it("real export/unset commands satisfy each step", () => {
    let env = run("export", seeded(), "ENV=prod");
    expect(setEnv.isComplete(at(env))).toBe(true);
    expect(dropSafeguards.isComplete(at(env))).toBe(false);
    env = run("unset", env, "SAFEGUARDS");
    expect(dropSafeguards.isComplete(at(env))).toBe(true);
  });

  it("wrong or empty values do not satisfy the steps", () => {
    expect(setEnv.isComplete(at({ ...seeded(), ENV: "dev" }))).toBe(false);
    // export SAFEGUARDS= leaves the key set — only removal counts.
    expect(dropSafeguards.isComplete(at({ SAFEGUARDS: "" }))).toBe(false);
  });
});

describe("alias-shortcut challenge", () => {
  const TARGET = "/home/player/releases/v2";
  const [define, run, cleanup] = aliasShortcut.steps;
  const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
  const at = (aliases: Record<string, string>, fs = aliasShortcut.setup(buildBaseFs())) =>
    ({ ...snap(win, fs), aliases });

  it("seeds an empty ~/releases with step 0 unsatisfied (step 2 vacuously true — cascade-safe)", () => {
    const fs = aliasShortcut.setup(buildBaseFs());
    expect(fs.getNode("/home/player/releases")).not.toBeNull();
    expect(define.isComplete(at({}, fs))).toBe(false);
    expect(run.isComplete(at({}, fs))).toBe(false);
    // trivially true at load; the cascade never reaches it before step 0 passes
    expect(cleanup.isComplete(at({}, fs))).toBe(true);
  });

  it("walks define → run → unalias against the real alias/unalias builtins", () => {
    resetAvailabilityPolicy();
    let aliases: Record<string, string> = {};
    const ctx = (rawArgs: string[]): CommandContext => ({
      fs: aliasShortcut.setup(buildBaseFs()), cwd: HOME_DIR, homeDir: HOME_DIR,
      username: "player", activeComputer: CRUNCH_MACHINE,
      rawArgs, aliases, setAliases: (next) => { aliases = next; },
    });

    // alias ship='mkdir -p ~/releases/v2' (quotes already consumed by the parser)
    execute("alias", ["ship=mkdir -p ~/releases/v2"], {}, ctx(["ship=mkdir -p ~/releases/v2"]));
    expect(aliases.ship).toBe("mkdir -p ~/releases/v2");
    expect(define.isComplete(at(aliases))).toBe(true);
    expect(run.isComplete(at(aliases))).toBe(false);

    // running the alias expands to mkdir -p → the target directory appears
    const fs = aliasShortcut.setup(buildBaseFs()).makeDirectory(TARGET).fs!;
    expect(run.isComplete(at(aliases, fs))).toBe(true);
    expect(cleanup.isComplete(at(aliases, fs))).toBe(false); // ship still defined

    execute("unalias", ["ship"], {}, ctx(["ship"]));
    expect(aliases.ship).toBeUndefined();
    expect(cleanup.isComplete(at(aliases, fs))).toBe(true);
  });

  it("a ship alias without mkdir does not satisfy step 0", () => {
    expect(define.isComplete(at({ ship: "echo shipped" }))).toBe(false);
  });
});

describe("shell env win-detection (store)", () => {
  // The snapshot must carry envVars/aliases, and the vacuously-true unalias
  // step must not advance before its predecessors.
  beforeAll(() => useGameStore.setState({ activeCategory: "all" }));
  afterAll(() => {
    useGameStore.setState({ activeCategory: "all" });
    useGameStore.getState().loadChallenge(0);
  });
  const select = (id: string) =>
    useGameStore.getState().loadChallenge(CHALLENGES.findIndex((c) => c.id === id));

  it("export/unset-driven envVars advance env-export step by step", () => {
    const state = useGameStore.getState;
    select("env-export");
    // loadChallenge merges initialEnv, so the unset step isn't pre-satisfied.
    expect(state().envVars.SAFEGUARDS).toBe("on");
    state().checkCompletion();
    expect(state().stepIndex).toBe(0);
    state().setEnvVars({ ...state().envVars, ENV: "prod" });
    state().checkCompletion();
    expect(state().stepIndex).toBe(1);
    const { SAFEGUARDS: _sg, ...rest } = state().envVars;
    state().setEnvVars(rest);
    state().checkCompletion();
    expect(state().awaitingContinue || state().completed).toBe(true);
  });

  it("alias-shortcut does not cascade past the vacuous unalias step at load", () => {
    const state = useGameStore.getState;
    select("alias-shortcut");
    state().checkCompletion(); // step 0 unsatisfied → no cascade into step 2
    expect(state().stepIndex).toBe(0);
    state().setAliases({ ...state().aliases, ship: "mkdir -p ~/releases/v2" });
    state().checkCompletion();
    expect(state().stepIndex).toBe(1);
    useGameStore.setState({ fs: state().fs.makeDirectory("/home/player/releases/v2").fs! });
    state().checkCompletion();
    expect(state().stepIndex).toBe(2); // ship still defined → step 2 waits
    const { ship: _ship, ...rest } = state().aliases;
    state().setAliases(rest);
    state().checkCompletion();
    expect(state().awaitingContinue || state().completed).toBe(true);
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

describe("vim challenges (validated on the SAVED buffer)", () => {
  // Vim predicates only see the file on disk after a :w, so these drive the
  // outcome directly by writing the saved content — VimSession's own keystroke
  // behavior is covered by packages/core/src/vim/__tests__. Every save target
  // lives under this scratch dir, which each challenge's setup creates.
  const WORK = "/home/player/work";
  const fsSnap = (fs: ReturnType<typeof buildBaseFs>): ChallengeSnapshot =>
    snap(makeWindow(CRUNCH_MACHINE, WORK), fs);
  // Simulate a vim :w of `content` into `path` on top of the seeded fs.
  const save = (c: typeof vimFirstEdit, path: string, content: string) =>
    c.setup(buildBaseFs()).writeFile(path, content).fs!;

  it("vim-first-edit: empty seed fails, the exact line passes (trailing newline ok)", () => {
    const [step] = vimFirstEdit.steps;
    expect(step.isComplete(fsSnap(vimFirstEdit.setup(buildBaseFs())))).toBe(false);
    expect(step.isComplete(fsSnap(save(vimFirstEdit, `${WORK}/notes.txt`, "Hello, Vim!")))).toBe(true);
    // vim appends a newline if you press Enter after the text — still a pass.
    expect(step.isComplete(fsSnap(save(vimFirstEdit, `${WORK}/notes.txt`, "Hello, Vim!\n")))).toBe(true);
    expect(step.isComplete(fsSnap(save(vimFirstEdit, `${WORK}/notes.txt`, "hello, vim!")))).toBe(false);
  });

  it("vim-delete-lines: seed with scratch lines fails, keepers-only passes", () => {
    const [step] = vimDeleteLines.steps;
    const keepers = "keep: alpha\nkeep: beta\nkeep: gamma\n";
    expect(step.isComplete(fsSnap(vimDeleteLines.setup(buildBaseFs())))).toBe(false);
    expect(step.isComplete(fsSnap(save(vimDeleteLines, `${WORK}/tasks.txt`, keepers)))).toBe(true);
    // A leftover scratch line, or a deleted keeper, both fail.
    expect(step.isComplete(fsSnap(save(vimDeleteLines, `${WORK}/tasks.txt`, "# scratch note, delete me\n" + keepers)))).toBe(false);
    expect(step.isComplete(fsSnap(save(vimDeleteLines, `${WORK}/tasks.txt`, "keep: alpha\nkeep: beta\n")))).toBe(false);
  });

  it("vim-fix-word: staging seed fails, production passes, debug line must survive", () => {
    const [step] = vimFixWord.steps;
    expect(step.isComplete(fsSnap(vimFixWord.setup(buildBaseFs())))).toBe(false);
    expect(step.isComplete(fsSnap(save(vimFixWord, `${WORK}/app.conf`, "environment = production\ndebug = true")))).toBe(true);
    // Fixing the value but clobbering the decoy line fails.
    expect(step.isComplete(fsSnap(save(vimFixWord, `${WORK}/app.conf`, "environment = production")))).toBe(false);
  });

  it("vim-yank-paste: single line fails, duplicated line passes, .1 rule must remain", () => {
    const [step] = vimYankPaste.steps;
    expect(step.isComplete(fsSnap(vimYankPaste.setup(buildBaseFs())))).toBe(false);
    expect(step.isComplete(fsSnap(save(vimYankPaste, `${WORK}/rules.conf`, "allow 10.0.0.1\nallow 10.0.0.2\nallow 10.0.0.2")))).toBe(true);
    // Duplicated but the other rule got lost → fail.
    expect(step.isComplete(fsSnap(save(vimYankPaste, `${WORK}/rules.conf`, "allow 10.0.0.2\nallow 10.0.0.2")))).toBe(false);
  });

  it("vim-search-fix: any oldhost left fails, all-newhost passes", () => {
    const [step] = vimSearchFix.steps;
    expect(step.isComplete(fsSnap(vimSearchFix.setup(buildBaseFs())))).toBe(false);
    expect(step.isComplete(fsSnap(save(vimSearchFix, `${WORK}/hosts.conf`, "backend = newhost\ncache = newhost\nworker = newhost")))).toBe(true);
    // Only two of three changed → one oldhost remains → fail.
    expect(step.isComplete(fsSnap(save(vimSearchFix, `${WORK}/hosts.conf`, "backend = newhost\ncache = newhost\nworker = oldhost")))).toBe(false);
  });

  it("vim-reorder: seed order fails, 1/2/3 order passes", () => {
    const [step] = vimReorder.steps;
    const ordered = "Step 1: chop the vegetables\nStep 2: simmer for 20 minutes\nStep 3: serve";
    expect(step.isComplete(fsSnap(vimReorder.setup(buildBaseFs())))).toBe(false);
    expect(step.isComplete(fsSnap(save(vimReorder, `${WORK}/recipe.txt`, ordered)))).toBe(true);
    expect(step.isComplete(fsSnap(save(vimReorder, `${WORK}/recipe.txt`, ordered + "\n")))).toBe(true);
  });

  it("vim-reorder: the hint's exact keystrokes complete it", () => {
    // The one vim challenge whose taught solution depends on end-of-file
    // behavior, so drive the real VimSession rather than a simulated save. A
    // phantom trailing-newline line would put G past the last real line and
    // make `V d G p` write a blank line into the middle of the file.
    const [step] = vimReorder.steps;
    const path = `${WORK}/recipe.txt`;
    const fs = vimReorder.setup(buildBaseFs());
    const term = { write: () => {}, rows: 24, cols: 80 } as unknown as Terminal;
    let saved = fs;
    const session = new VimSession(
      term, fs, path, fs.readFile(path).content ?? "", false, (newFs) => { saved = newFs; }
    );
    session.enter();
    for (const keys of ["Vd", "G", "p", ":wq\r"]) session.handleInput(keys);
    expect(step.isComplete(fsSnap(saved))).toBe(true);
  });

  it("start the player in the scratch dir so `vim <file>` needs no cd", () => {
    expect(vimFirstEdit.startCwd).toBe(WORK);
    useGameStore.setState({ activeCategory: "all" });
    useGameStore.getState().loadChallenge(CHALLENGES.findIndex((c) => c.id === "vim-first-edit"));
    const win = useGameStore.getState().windows[0];
    expect(win.root.kind === "leaf" && win.root.cwd).toBe(WORK);
    useGameStore.getState().loadChallenge(0); // restore default
  });
});

describe("challenges are objective-first with progressive hints", () => {
  // The command belongs in `command` (revealed on request), never in the
  // objective text. Derived from the REGISTRY, not a hand-kept list, so a new
  // challenge is covered the moment it's registered and can only escape by
  // being named here with a reason.
  const HINT_EXEMPT: Record<string, string> = {
    // Onboarding exemption: the very first challenge has no prior context to
    // hint from, so its instruction names the two chords outright.
    "panes-split": "first challenge; the instruction teaches the chords",
  };
  const objectiveFirst = CHALLENGES.filter((c) => !(c.id in HINT_EXEMPT));

  it("every step has a hint + command", () => {
    for (const c of objectiveFirst) {
      for (const step of c.steps) {
        expect(step.hint, `${c.id} step missing hint`).toBeTruthy();
        expect(step.command, `${c.id} step missing command`).toBeTruthy();
      }
    }
  });

  // A brief is required unless the panel's TARGET readout already states the
  // goal: pane/window challenges must not restate their own schematic.
  it("every challenge has a brief unless a TARGET schematic states the goal", () => {
    for (const c of CHALLENGES) {
      if (c.targetWindow || c.targetWindows) continue;
      expect(c.brief, `${c.id} missing brief`).toBeTruthy();
    }
  });

  it("no instruction spells out the step's own command", () => {
    // Normalize both sides so filler can't hide a leak: lowercase, strip
    // punctuation and connective words ("then", "and"), collapse whitespace.
    // The pre-fix windows-create text "Open a second window:  prefix then c"
    // contained its command "prefix c" only after this normalization, which is
    // why a raw substring check was vacuous.
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((w) => w && w !== "then" && w !== "and")
        .join(" ");
    for (const c of objectiveFirst) {
      for (const step of c.steps) {
        if (!step.instruction || !step.command) continue;
        expect(
          normalize(step.instruction).includes(normalize(step.command)),
          `${c.id} instruction leaks its command`
        ).toBe(false);
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
    const cases: Array<[string, "git" | "tmux" | "fs" | "shell" | "vim"]> = [
      ["git", "git"],
      ["tmux", "tmux"],
      ["fs", "fs"],
      ["shell", "shell"],
      ["vim", "vim"],
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

  it("the 'all' track plays each type as one contiguous run (never doubles back)", () => {
    const types = CHALLENGES.map((c) => c.type);
    const runs = types.filter((t, i) => i === 0 || t !== types[i - 1]);
    expect(new Set(runs).size).toBe(runs.length);
  });

  it("the three resize challenges are not consecutive", () => {
    const idx = CHALLENGES.map((c, i) => (c.id.startsWith("panes-resize") ? i : -1)).filter((i) => i >= 0);
    expect(idx).toHaveLength(3);
    expect(idx[1] === idx[0] + 1 && idx[2] === idx[1] + 1).toBe(false);
  });
});

describe("failed (unrecoverable sandbox) predicates", () => {
  const fsSnap = (fs: ReturnType<typeof buildBaseFs>) => snap(makeWindow(CRUNCH_MACHINE, HOME_DIR), fs);

  it("rm-bomb: null while survivors stand, names the lost file after rm -rf on a parent", () => {
    const fs = rmBomb.setup(buildBaseFs());
    expect(rmBomb.failed!(fsSnap(fs))).toBeNull();
    // Removing BOMB.md alone is the win, not a failure.
    expect(rmBomb.failed!(fsSnap(fs.removeNode("/home/player/work/reports/2024/BOMB.md").fs!))).toBeNull();
    const nuked = fs.removeNode("/home/player/work/reports/2024").fs!;
    expect(rmBomb.failed!(fsSnap(nuked))).toContain("q1.md");
    expect(rmBomb.failed!(fsSnap(nuked))).toContain("Run 'restart'");
  });

  it("git-unstage: null at load, a message once .env is deleted or altered", () => {
    const fs = gitUnstage.setup(buildBaseFs());
    const ENV = "/home/player/project/.env";
    expect(gitUnstage.failed!(fsSnap(fs))).toBeNull();
    expect(gitUnstage.failed!(fsSnap(fs.removeNode(ENV).fs!))).toContain(".env");
    expect(gitUnstage.failed!(fsSnap(fs.writeFile(ENV, "changed\n").fs!))).toContain(".env");
  });

  it("no challenge reports failure on its freshly seeded board", () => {
    for (const c of CHALLENGES) {
      if (!c.failed) continue;
      const win = c.initialWindow?.() ?? makeWindow(CRUNCH_MACHINE, c.startCwd ?? c.gitRepoPath ?? HOME_DIR);
      expect(c.failed(snap(win, c.setup(buildBaseFs()))), c.id).toBeNull();
    }
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

    // steps 2+3: remove markers, then stage → cascade advances to the final step
    useGameStore.setState({ fs: state().fs.writeFile(config, "host = localhost\nport = 8080\ntimeout = 90\n").fs! });
    useGameStore.setState({ fs: gitAdd(state().fs, repo, repo, ["config.txt"], false).fs });
    state().checkCompletion();
    expect(state().stepIndex).toBe(3);

    // step 4: git rebase --continue → last step of the final challenge → done, no gate
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

  // Five challenges have a last step that is already true on a freshly seeded
  // board (pop the stash, remove the alias, or a session-lifecycle predicate that
  // holds at load).
  // They are only safe because the cascade starts at the CURRENT stepIndex and an
  // earlier step is false at load, so it can never reach the last one for free.
  // Pin that here: if a future edit makes step 0 vacuously true too, these
  // challenges would self-complete on load.
  describe("challenges whose final step is vacuously true at load", () => {
    for (const challenge of [gitStashChallenge, gitPullFf, aliasShortcut, sessionsDetachAttach, sessionsJuggle]) {
      it(`${challenge.id}: last step true at load, first step gates it`, () => {
        const fs = challenge.setup(buildBaseFs());
        const cwd = challenge.startCwd ?? HOME_DIR;
        const s = snap(makeWindow(CRUNCH_MACHINE, cwd), fs);
        const steps = challenge.steps;
        expect(steps[steps.length - 1].isComplete(s)).toBe(true);
        expect(steps[0].isComplete(s)).toBe(false);
      });
    }
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

  it("drops the player at startCwd when the challenge sets one", () => {
    useGameStore.getState().loadChallenge(CHALLENGES.findIndex((c) => c.id === "env-export"));
    expect(leafCwd()).toBe(envExport.startCwd);
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

  it("always allows help, clear, man, shortcuts, and read-only orientation, regardless of the challenge list", () => {
    select("panes-split"); // commands: []
    expect(isCommandAvailable("help", CRUNCH_MACHINE)).toBe(true);
    expect(isCommandAvailable("clear", CRUNCH_MACHINE)).toBe(true);
    expect(isCommandAvailable("man", CRUNCH_MACHINE)).toBe(true);
    expect(isCommandAvailable("shortcuts", CRUNCH_MACHINE)).toBe(true);
    // ls/pwd/cd are always allowed as harmless orientation, even in a
    // keyboard-only tmux challenge that lists no shell commands.
    expect(isCommandAvailable("ls", CRUNCH_MACHINE)).toBe(true);
    expect(isCommandAvailable("pwd", CRUNCH_MACHINE)).toBe(true);
    expect(isCommandAvailable("cd", CRUNCH_MACHINE)).toBe(true);
  });

  it("allows exactly the listed commands (plus help/clear) and hides the rest", () => {
    select("chmod-perms"); // commands: ["chmod", "ls", "cd", "pwd"]
    for (const cmd of ["chmod", "ls", "cd", "pwd"]) {
      expect(isCommandAvailable(cmd, CRUNCH_MACHINE)).toBe(true);
    }
    expect(isCommandAvailable("git", CRUNCH_MACHINE)).toBe(false);
    expect(isCommandAvailable("rm", CRUNCH_MACHINE)).toBe(false);
    expect(isCommandAvailable("cat", CRUNCH_MACHINE)).toBe(false);

    const listed = getAvailableCommands(CRUNCH_MACHINE).map((c) => c.name).sort();
    expect(listed).toEqual(["cd", "chmod", "clear", "help", "ls", "man", "pwd", "shortcuts", "tmux"]);
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
  const at = (tmux: ChallengeSnapshot["tmux"]) => snap(win, buildBaseFs(), tmux);
  const [detach, reattach] = sessionsDetachAttach.steps;

  it("step 0: detached with session 0 on the server", () => {
    expect(detach.isComplete(at({ attachedSession: "0", detachedSessions: [] }))).toBe(false);
    expect(detach.isComplete(at({ attachedSession: null, detachedSessions: [{ name: "0", windowCount: 1 }] }))).toBe(true);
    // kill-server leaves no session to reattach to — must not count as a detach
    expect(detach.isComplete(at({ attachedSession: null, detachedSessions: [] }))).toBe(false);
  });

  it("step 1: reattached to 0, name-scoped so other sessions can't strand it", () => {
    expect(reattach.isComplete(at({ attachedSession: null, detachedSessions: [{ name: "0", windowCount: 1 }] }))).toBe(false);
    expect(reattach.isComplete(at({ attachedSession: "0", detachedSessions: [] }))).toBe(true);
    // An explorer who spun up and detached a second session before reattaching
    // still passes: the checkpoint is "back on 0", not "nothing else exists".
    expect(reattach.isComplete(at({ attachedSession: "0", detachedSessions: [{ name: "scratch", windowCount: 1 }] }))).toBe(true);
    // Attached to the WRONG session is still not the checkpoint.
    expect(reattach.isComplete(at({ attachedSession: "scratch", detachedSessions: [{ name: "0", windowCount: 1 }] }))).toBe(false);
  });
});

describe("sessions-rename predicates", () => {
  const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
  const at = (attachedSession: string | null, detachedNames: string[]) =>
    snap(win, buildBaseFs(), {
      attachedSession,
      detachedSessions: detachedNames.map((name) => ({ name, windowCount: 1 })),
    });
  const [detach, rename, fresh] = sessionsRename.steps;

  it("step 0: detached with session 0 still on the server", () => {
    expect(detach.isComplete(at("0", []))).toBe(false); // load state
    expect(detach.isComplete(at(null, ["0"]))).toBe(true);
    // kill-server leaves nothing to rename, so it is not a detach.
    expect(detach.isComplete(at(null, []))).toBe(false);
  });

  it("step 1: keys off the NAME, not the rename event", () => {
    expect(rename.isComplete(at(null, ["0"]))).toBe(false); // not renamed yet
    expect(rename.isComplete(at(null, ["old"]))).toBe(true);
    // Renaming the attached session instead leaves 0 gone but nothing parked.
    expect(rename.isComplete(at("old", []))).toBe(false);
    // A stray session named 0 (a re-created one) means the rename didn't stick.
    expect(rename.isComplete(at(null, ["old", "0"]))).toBe(false);
  });

  it("step 2: attached to new while old stays parked", () => {
    expect(fresh.isComplete(at(null, ["old"]))).toBe(false);
    expect(fresh.isComplete(at("new", ["old"]))).toBe(true);
    // Killing old instead of leaving it detached does not satisfy the step.
    expect(fresh.isComplete(at("new", []))).toBe(false);
  });

  it("the load state satisfies no step (nothing pre-fires on the cascade)", () => {
    const load = at("0", []);
    for (const [i, step] of sessionsRename.steps.entries()) {
      expect(step.isComplete(load), `step ${i} true at load`).toBe(false);
    }
  });
});

describe("sessions-juggle predicates", () => {
  const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
  const at = (attachedSession: string | null, detachedNames: string[]) =>
    snap(win, buildBaseFs(), {
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
      // also satisfies step 2, whose predicate no longer requires scratch to
      // exist — safe because the cascade can only reach 2 from step 1
      // (attached to scratch), which this state never satisfies.
      [at(null, ["0"]), [0, 2]],
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

  it("out-of-order: kill scratch from inside it, then attach, cascades to done", () => {
    const state = useGameStore.getState;
    select("sessions-juggle");
    state().applyTmuxAction({ type: "detach" });
    state().applyTmuxAction({ type: "new-session", name: "scratch" });
    expect(state().stepIndex).toBe(2);
    // Killing the attached session drops to a bare shell without snapshotting
    // scratch, so step 2 must not require it to exist.
    state().applyTmuxAction({ type: "kill-session", name: "scratch" });
    expect(state().tmuxAttachedSession).toBe(null);
    expect(state().stepIndex).toBe(3);
    state().applyTmuxAction({ type: "attach", name: "0" });
    expect(state().awaitingContinue || state().completed).toBe(true);
  });

  it("detach, rename, new completes sessions-rename", () => {
    const state = useGameStore.getState;
    select("sessions-rename");
    state().applyTmuxAction({ type: "detach" });
    expect(state().stepIndex).toBe(1);
    state().applyTmuxAction({ type: "rename-session", target: "0", name: "old" });
    expect(state().tmuxDetachedSessions.map((s) => s.name)).toEqual(["old"]);
    expect(state().stepIndex).toBe(2);
    state().applyTmuxAction({ type: "new-session", name: "new" });
    expect(state().awaitingContinue || state().completed).toBe(true);
  });

  it("renaming the attached session updates tmuxAttachedSession", () => {
    const state = useGameStore.getState;
    select("sessions-rename");
    state().applyTmuxAction({ type: "rename-session", target: "0", name: "old" });
    expect(state().tmuxAttachedSession?.name).toBe("old");
    expect(state().stepIndex).toBe(0); // step 0 still needs the detach
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

describe("tmux window/pane verbs (store)", () => {
  // A non-tmux challenge, so pane/window mutations can't satisfy a predicate
  // and freeze the store mid-test behind the completion gate.
  const state = useGameStore.getState;
  const win = () => state().windows.find((w) => w.id === state().activeWindowId)!;
  const activePane = () => win().activePaneId;
  const rootSplit = () => win().root as Extract<PaneNode, { kind: "split" }>;

  beforeAll(() => useGameStore.setState({ activeCategory: "all" }));
  afterAll(() => {
    useGameStore.setState({ activeCategory: "all" });
    useGameStore.getState().loadChallenge(0);
  });
  beforeEach(() => state().loadChallenge(CHALLENGES.findIndex((c) => c.id === "rm-bomb")));

  it("new-window appends a window, and is a silent no-op at MAX_WINDOWS", () => {
    expect(state().applyTmuxAction({ type: "new-window" })).toBe(false);
    expect(state().windows).toHaveLength(2);
    for (let i = state().windows.length; i < MAX_WINDOWS; i++) state().newWindow();
    expect(state().applyTmuxAction({ type: "new-window" })).toBe(false);
    expect(state().windows).toHaveLength(MAX_WINDOWS);
  });

  it("rename-window renames the targeted window", () => {
    const id = state().activeWindowId;
    expect(state().applyTmuxAction({ type: "rename-window", windowId: id, name: "logs" })).toBe(false);
    expect(state().windows.find((w) => w.id === id)!.name).toBe("logs");
  });

  it("kill-window returns true only for the window holding the active pane", () => {
    const first = state().activeWindowId;
    state().newWindow();
    const second = state().activeWindowId;
    expect(state().applyTmuxAction({ type: "kill-window", windowId: first })).toBe(false);
    expect(state().windows).toHaveLength(1);
    expect(state().applyTmuxAction({ type: "kill-window", windowId: second })).toBe(true);
    // Last window: tmux kills the session and drops to the bare shell.
    expect(state().tmuxAttachedSession).toBeNull();
    expect(state().pendingMuxNotice).toBe("[exited]");
  });

  it("select-window switches windows without swapping the client view", () => {
    const first = state().activeWindowId;
    state().newWindow();
    expect(state().applyTmuxAction({ type: "select-window", windowId: first })).toBe(false);
    expect(state().activeWindowId).toBe(first);
  });

  it("split-window splits the active pane, and is a no-op at the pane cap", () => {
    const original = activePane();
    expect(state().applyTmuxAction({ type: "split-window", direction: "h" })).toBe(false);
    expect(allLeaves(win().root)).toHaveLength(2);
    expect(rootSplit().direction).toBe("h");
    expect(activePane()).not.toBe(original);
    while (allLeaves(win().root).length < MAX_PANES_PER_WINDOW) state().splitPane(activePane(), "v");
    expect(state().applyTmuxAction({ type: "split-window", direction: "v" })).toBe(false);
    expect(allLeaves(win().root)).toHaveLength(MAX_PANES_PER_WINDOW);
  });

  it("kill-pane closes the active pane and suppresses the prompt", () => {
    const first = activePane();
    state().splitPane(first, "h");
    expect(state().applyTmuxAction({ type: "kill-pane" })).toBe(true);
    expect(allLeaves(win().root)).toHaveLength(1);
    expect(activePane()).toBe(first);
  });

  it("select-pane moves the focus in the given direction", () => {
    const left = activePane();
    const right = state().splitPane(left, "h")!;
    expect(state().applyTmuxAction({ type: "select-pane", dir: "L" })).toBe(false);
    expect(activePane()).toBe(left);
    state().applyTmuxAction({ type: "select-pane", dir: "R" });
    expect(activePane()).toBe(right);
  });

  it("resize-pane nudges the nearest split on the axis, capped at one chord press", () => {
    state().splitPane(activePane(), "h");
    const splitId = rootSplit().id;
    state().applyTmuxAction({ type: "resize-pane", dir: "R", cells: 2 });
    expect(findSplit(win().root, splitId)!.ratio).toBeCloseTo(0.52);
    state().applyTmuxAction({ type: "resize-pane", dir: "L", cells: 100 });
    expect(findSplit(win().root, splitId)!.ratio).toBeCloseTo(0.52 - MAX_NUDGE_RATIO);
  });

  it("resize-pane is a no-op when no split exists on that axis", () => {
    state().splitPane(activePane(), "h");
    const before = win().root;
    state().applyTmuxAction({ type: "resize-pane", dir: "U", cells: 5 });
    expect(win().root).toBe(before);
  });
});
