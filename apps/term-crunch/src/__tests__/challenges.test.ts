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
  resetPaneIdCounters,
  type WindowState,
} from "@tt/core/terminal/paneTypes";
import { findRepoRoot, gitAdd, gitCommit, gitRebase, gitRebaseContinue, gitCheckout, gitStashSave, gitStashPop, gitPull } from "@tt/core/git/repo";
import { buildBaseFs } from "../lib/seed";
import { readGitState } from "../lib/gitState";
import { structKey, paneTreeMatches } from "../lib/paneCompare";
import { CRUNCH_MACHINE, HOME_DIR, GIT_AUTHOR } from "../lib/machine";
import { panesSplit } from "../challenges/panes-split";
import { windowsCreate } from "../challenges/windows-create";
import { gitFirstCommit } from "../challenges/git-first-commit";
import { gitStashChallenge } from "../challenges/git-stash";
import { gitPullFf } from "../challenges/git-pull-ff";
import { gitRebaseChallenge } from "../challenges/git-rebase";
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
    fs = gitAdd(fs, repo, repo, ["README.md"], false).fs;
    expect(gitFirstCommit.steps[0].isComplete(at(fs))).toBe(true);
    expect(gitFirstCommit.steps[1].isComplete(at(fs))).toBe(false);

    // git commit -m "init"
    fs = gitCommit(fs, repo, "init", GIT_AUTHOR, false, false, 1_700_000_000_000).fs;
    expect(gitFirstCommit.steps[1].isComplete(at(fs))).toBe(true);
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

describe("challenges are objective-first with progressive hints", () => {
  // The command belongs in `command` (revealed on request), never in the objective
  // text — that's the whole point of the rework, so guard it. The pane challenges
  // (panes-split/windows-create) are keyboard-driven and intentionally excluded.
  const objectiveFirst = [gitFirstCommit, gitStashChallenge, gitPullFf, gitRebaseChallenge, rmBomb, chmodPerms];

  it("each has a brief and every step has a hint + command", () => {
    for (const c of objectiveFirst) {
      expect(c.brief, `${c.id} missing brief`).toBeTruthy();
      for (const step of c.steps) {
        expect(step.hint, `${c.id} step missing hint`).toBeTruthy();
        expect(step.command, `${c.id} step missing command`).toBeTruthy();
        expect(step.instruction, `${c.id} step missing instruction`).toBeTruthy();
      }
    }
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
});

describe("per-challenge command allowlist", () => {
  // The policy reads the current challenge from the store, so drive it via loadChallenge.
  const select = (id: string) =>
    useGameStore.getState().loadChallenge(CHALLENGES.findIndex((c) => c.id === id));

  beforeAll(() => setAvailabilityPolicy(CRUNCH_AVAILABILITY_POLICY));
  afterAll(() => resetAvailabilityPolicy());

  it("always allows help, clear, and man, regardless of the challenge list", () => {
    select("panes-split"); // commands: []
    expect(isCommandAvailable("help", CRUNCH_MACHINE)).toBe(true);
    expect(isCommandAvailable("clear", CRUNCH_MACHINE)).toBe(true);
    expect(isCommandAvailable("man", CRUNCH_MACHINE)).toBe(true);
  });

  it("allows exactly the listed commands (plus help/clear) and hides the rest", () => {
    select("chmod-perms"); // commands: ["chmod", "cat", "ls", "cd", "pwd"]
    for (const cmd of ["chmod", "cat", "ls", "cd", "pwd"]) {
      expect(isCommandAvailable(cmd, CRUNCH_MACHINE)).toBe(true);
    }
    expect(isCommandAvailable("git", CRUNCH_MACHINE)).toBe(false);
    expect(isCommandAvailable("rm", CRUNCH_MACHINE)).toBe(false);

    const listed = getAvailableCommands(CRUNCH_MACHINE).map((c) => c.name).sort();
    expect(listed).toEqual(["cat", "cd", "chmod", "clear", "help", "ls", "man", "pwd"]);
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
    expect(listed.sort()).toEqual(["cat", "cd", "clear", "git", "help", "ls", "man", "pwd"]);
  });
});
