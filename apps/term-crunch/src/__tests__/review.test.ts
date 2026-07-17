import { describe, it, expect, beforeEach } from "vitest";
import { execute } from "@tt/core/commands/registry";
import type { CommandContext } from "@tt/core/commands/types";
import "../engine/commands/navigation"; // register challenges/review/goto/...
import { consumePendingNavigation } from "../engine/commands/navigation";
import { getCategory, registryIndex as idx } from "../challenges/categories";
import { CHALLENGES } from "../challenges/registry";
import { INITIAL_EASE, type ReviewStat } from "../challenges/scheduler";
import { useGameStore } from "../state/gameStore";
import { buildBaseFs } from "../lib/seed";
import { CRUNCH_MACHINE, HOME_DIR } from "../lib/machine";

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ctx(): CommandContext {
  return {
    fs: buildBaseFs(),
    cwd: HOME_DIR,
    homeDir: HOME_DIR,
    username: "player",
    activeComputer: CRUNCH_MACHINE,
    rawArgs: [],
  } as unknown as CommandContext;
}

function run(line: string) {
  const [cmd, ...args] = line.split(" ");
  return execute(cmd, args, {}, ctx());
}

// A stat whose dueAt is `overdueBy` ms in the past (negative = not yet due).
const overdue = (overdueBy: number): ReviewStat => ({
  lastReviewedAt: Date.now() - DAY - overdueBy,
  intervalMs: DAY,
  ease: INITIAL_EASE,
  reps: 1,
  lapses: 0,
});

describe("review sessions", () => {
  beforeEach(() => {
    useGameStore.setState({
      activeCategory: "all",
      challengeIndex: 0,
      completed: false,
      awaitingContinue: false,
      flash: null,
      bestTimes: {},
      reviewStats: {},
      pendingGradeId: null,
      reviewQueue: [],
      reviewTotal: 0,
      reviewReturn: null,
    });
    consumePendingNavigation(); // clear any leftover pending nav
  });

  it("review reports nothing due when every stat is future-dated", () => {
    const reviewStats = Object.fromEntries(CHALLENGES.map((c) => [c.id, overdue(-10 * DAY)]));
    useGameStore.setState({ reviewStats });
    const out = strip(run("review").output);
    expect(out).toContain("Nothing due for review.");
    expect(out).toContain("Next review in");
    expect(consumePendingNavigation()).toBeNull();
  });

  it("review queues most-overdue first, then new challenges in registry order", () => {
    const [a, b] = [CHALLENGES[3].id, CHALLENGES[7].id];
    useGameStore.setState({ reviewStats: { [a]: overdue(HOUR), [b]: overdue(5 * DAY) } });
    const out = strip(run("review").output);
    expect(out).toContain(`Reviewing ${CHALLENGES.length} challenges: 2 due, ${CHALLENGES.length - 2} new.`);
    expect(out).toContain("1 Again, 2 Hard, 3/Enter Good, 4 Easy");
    const nav = consumePendingNavigation();
    expect(nav?.type).toBe("review");
    if (nav?.type !== "review") throw new Error("expected a review nav");
    expect(nav.queue.slice(0, 2)).toEqual([b, a]); // b is more overdue
    expect(nav.queue.slice(2)).toEqual(CHALLENGES.filter((c) => c.id !== a && c.id !== b).map((c) => c.id));
  });

  it("startReviewSession flips to 'all', loads the first id, and stashes the return spot", () => {
    const state = useGameStore.getState;
    useGameStore.setState({ activeCategory: "git", challengeIndex: 2 });
    state().startReviewSession(["rm-bomb", "panes-split"]);
    expect(state().activeCategory).toBe("all");
    expect(state().challengeIndex).toBe(idx("rm-bomb"));
    expect(state().reviewReturn).toEqual({ category: "git", index: 2 });
    expect(state().reviewQueue).toEqual(["panes-split"]);
    expect(state().reviewTotal).toBe(2);

    // Re-running review mid-session keeps the ORIGINAL return point.
    state().startReviewSession(["env-export"]);
    expect(state().reviewReturn).toEqual({ category: "git", index: 2 });
    expect(state().challengeIndex).toBe(idx("env-export"));

    // An empty queue is a no-op.
    const before = state().challengeIndex;
    state().startReviewSession([]);
    expect(state().challengeIndex).toBe(before);
  });

  it("grading at a mid-review gate records the stat and chains to the next queued id", () => {
    const state = useGameStore.getState;
    useGameStore.setState({
      challengeIndex: idx("panes-grid"),
      awaitingContinue: true,
      pendingGradeId: "panes-grid",
      reviewReturn: { category: "git", index: 2 },
      reviewQueue: ["rm-bomb"],
      reviewTotal: 2,
    });
    state().continueToNext("hard");
    expect(state().reviewStats["panes-grid"]).toMatchObject({ intervalMs: 12 * HOUR, reps: 1 });
    expect(state().challengeIndex).toBe(idx("rm-bomb"));
    expect(state().reviewQueue).toEqual([]);
    expect(state().awaitingContinue).toBe(false);
    expect(state().pendingGradeId).toBeNull();
    expect(state().reviewReturn).toEqual({ category: "git", index: 2 }); // still reviewing
  });

  it("exhausting the queue restores the pre-review spot and flashes completion", () => {
    const state = useGameStore.getState;
    useGameStore.setState({
      challengeIndex: idx("rm-bomb"),
      awaitingContinue: true,
      pendingGradeId: "rm-bomb",
      reviewReturn: { category: "git", index: 1 },
      reviewQueue: [],
      reviewTotal: 2,
    });
    state().continueToNext("good");
    expect(state().reviewStats["rm-bomb"]).toMatchObject({ intervalMs: DAY, reps: 1 });
    expect(state().activeCategory).toBe("git");
    expect(state().challengeIndex).toBe(1);
    expect(state().reviewReturn).toBeNull();
    expect(state().reviewTotal).toBe(0);
    expect(state().flash).toBe("✓ Review session complete");
  });

  it("continueToNext defaults to a Good grade", () => {
    const state = useGameStore.getState;
    useGameStore.setState({ challengeIndex: 0, awaitingContinue: true, pendingGradeId: "panes-split" });
    state().continueToNext();
    expect(state().reviewStats["panes-split"]).toMatchObject({ intervalMs: DAY, ease: INITIAL_EASE });
    expect(state().challengeIndex).toBe(1); // sequential play advances as before
  });

  it("sequential play reaches the gate with a pending grade and records on continue", () => {
    const state = useGameStore.getState;
    state().loadChallenge(idx("panes-split"));
    const rootPaneId = state().windows[0].activePaneId;
    const rightPaneId = state().splitPane(rootPaneId, "h")!;
    state().splitPane(rightPaneId, "v"); // (h L (v L L)) = the target layout
    expect(state().awaitingContinue).toBe(true);
    expect(state().pendingGradeId).toBe("panes-split");
    state().continueToNext("easy");
    expect(state().reviewStats["panes-split"]).toMatchObject({ intervalMs: 3 * DAY, reps: 1 });
    expect(state().pendingGradeId).toBeNull();
    expect(state().challengeIndex).toBe(idx("panes-split") + 1);
  });

  it("the last registry challenge gates during review but completes outside it", () => {
    const state = useGameStore.getState;
    const all = getCategory("all").challenges;
    const last = all[all.length - 1];
    expect(last.id).toBe("sessions-juggle");
    // sessions-juggle's final step (attached to "0", no scratch session) is
    // exactly the freshly loaded state, so parking stepIndex on it lets
    // checkCompletion hit the terminal branch without tmux choreography.

    // Outside review: end-of-track banner with a pending grade.
    state().loadChallenge(all.length - 1);
    useGameStore.setState({ stepIndex: last.steps.length - 1 });
    state().checkCompletion();
    expect(state().completed).toBe(true);
    expect(state().awaitingContinue).toBe(false);
    expect(state().pendingGradeId).toBe(last.id);

    // Grading the banner records once, then further continues are no-ops.
    state().continueToNext("again");
    expect(state().reviewStats[last.id]).toMatchObject({ intervalMs: 10 * MINUTE, lapses: 1 });
    expect(state().completed).toBe(true);
    state().continueToNext("easy");
    expect(state().reviewStats[last.id].reps).toBe(1); // no double-grade

    // During review: the gate rises instead, so the queue can keep chaining.
    useGameStore.setState({ completed: false, reviewReturn: { category: "all", index: 0 }, reviewTotal: 1 });
    state().loadChallenge(all.length - 1);
    useGameStore.setState({ stepIndex: last.steps.length - 1 });
    state().checkCompletion();
    expect(state().awaitingContinue).toBe(true);
    expect(state().completed).toBe(false);
    expect(state().pendingGradeId).toBe(last.id);
  });

  it("challenges shows due badges and the review summary", () => {
    const first = CHALLENGES[0];
    useGameStore.setState({ reviewStats: { [first.id]: overdue(HOUR) } });
    const out = strip(run("challenges").output);
    expect(out).toContain(`1. ${first.title} ● due`);
    expect(out).toContain("1 due for review: run 'review'.");
  });

  it("switching tracks or jumping abandons the review session", () => {
    const state = useGameStore.getState;
    useGameStore.setState({ reviewReturn: { category: "git", index: 1 }, reviewQueue: ["rm-bomb"], reviewTotal: 3 });
    state().selectCategory("git");
    expect(state().reviewReturn).toBeNull();
    expect(state().reviewQueue).toEqual([]);
    expect(state().reviewTotal).toBe(0);

    // restartChallenge must NOT cancel (it re-seeds the current challenge only).
    useGameStore.setState({ activeCategory: "all", reviewReturn: { category: "git", index: 1 }, reviewTotal: 1 });
    state().restartChallenge();
    expect(state().reviewReturn).toEqual({ category: "git", index: 1 });
  });
});
