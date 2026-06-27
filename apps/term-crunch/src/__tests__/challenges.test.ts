import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "@tt/core/commands/builtins"; // register builtins so the registry is populated
import {
  setAvailabilityPolicy,
  resetAvailabilityPolicy,
  isCommandAvailable,
  unavailableCommandMessage,
} from "@tt/core/commands/availability";
import { getAvailableCommands } from "@tt/core/commands/registry";
import { CRUNCH_AVAILABILITY_POLICY } from "../lib/availabilityPolicy";
import { CHALLENGES } from "../challenges/registry";
import { getCategory } from "../challenges/categories";
import { useGameStore } from "../state/gameStore";
import {
  makeWindow,
  makeLeaf,
  splitNode,
  resetPaneIdCounters,
  type WindowState,
} from "@tt/core/terminal/paneTypes";
import { findRepoRoot, gitAdd, gitCommit } from "@tt/core/git/repo";
import { buildBaseFs } from "../lib/seed";
import { structKey, paneTreeMatches } from "../lib/paneCompare";
import { CRUNCH_MACHINE, HOME_DIR, GIT_AUTHOR } from "../lib/machine";
import { panesSplit } from "../challenges/panes-split";
import { windowsCreate } from "../challenges/windows-create";
import { gitFirstCommit } from "../challenges/git-first-commit";
import { rmBomb } from "../challenges/rm-bomb";
import { chmodPerms } from "../challenges/chmod-perms";
import type { ChallengeSnapshot } from "../challenges/types";

function snap(activeWindow: WindowState, fs = buildBaseFs(), cwd = HOME_DIR): ChallengeSnapshot {
  return { activeWindow, windows: [activeWindow], fs, cwd };
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
    return { activeWindow: windows[0], windows, fs: buildBaseFs(), cwd: HOME_DIR };
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

  function fsSnap(fs = rmBomb.setup(buildBaseFs())): ChallengeSnapshot {
    const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
    return { activeWindow: win, windows: [win], fs, cwd: HOME_DIR };
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
    const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
    return { activeWindow: win, windows: [win], fs, cwd: HOME_DIR };
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

describe("categories", () => {
  it("'all' contains every challenge in registry order", () => {
    expect(getCategory("all").challenges).toEqual(CHALLENGES);
  });

  it("type-derived groups contain only their type and are non-empty", () => {
    const cases: Array<[string, "git" | "pane" | "fs"]> = [
      ["git", "git"],
      ["panes", "pane"],
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

  it("finishing the only challenge in a single-challenge track completes the track (no continue gate)", () => {
    const state = useGameStore.getState;
    useGameStore.setState({ activeCategory: "git" });
    state().loadChallenge(0); // git track has exactly one challenge (git-first-commit)
    expect(getCategory("git").challenges).toHaveLength(1);

    const repo = gitFirstCommit.gitRepoPath!;

    // step 1: stage README → advance within the challenge
    useGameStore.setState({ fs: gitAdd(state().fs, repo, ["README.md"], false).fs });
    state().checkCompletion();
    expect(state().stepIndex).toBe(1);

    // step 2: commit → last step of the only challenge in the track → done
    useGameStore.setState({
      fs: gitCommit(state().fs, repo, "init", GIT_AUTHOR, false, false, 1_700_000_000_000).fs,
    });
    state().checkCompletion();
    expect(state().completed).toBe(true);
    expect(state().awaitingContinue).toBe(false);
  });
});

describe("per-challenge command allowlist", () => {
  // The policy reads the current challenge from the store, so drive it via loadChallenge.
  const select = (id: string) =>
    useGameStore.getState().loadChallenge(CHALLENGES.findIndex((c) => c.id === id));

  beforeAll(() => setAvailabilityPolicy(CRUNCH_AVAILABILITY_POLICY));
  afterAll(() => resetAvailabilityPolicy());

  it("always allows help and clear, regardless of the challenge list", () => {
    select("panes-split"); // commands: []
    expect(isCommandAvailable("help", CRUNCH_MACHINE)).toBe(true);
    expect(isCommandAvailable("clear", CRUNCH_MACHINE)).toBe(true);
  });

  it("allows exactly the listed commands (plus help/clear) and hides the rest", () => {
    select("chmod-perms"); // commands: ["chmod", "cat", "ls", "cd", "pwd"]
    for (const cmd of ["chmod", "cat", "ls", "cd", "pwd"]) {
      expect(isCommandAvailable(cmd, CRUNCH_MACHINE)).toBe(true);
    }
    expect(isCommandAvailable("git", CRUNCH_MACHINE)).toBe(false);
    expect(isCommandAvailable("rm", CRUNCH_MACHINE)).toBe(false);

    const listed = getAvailableCommands(CRUNCH_MACHINE).map((c) => c.name).sort();
    expect(listed).toEqual(["cat", "cd", "chmod", "clear", "help", "ls", "pwd"]);
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
    expect(listed.sort()).toEqual(["cat", "cd", "clear", "git", "help", "ls", "pwd"]);
  });
});
