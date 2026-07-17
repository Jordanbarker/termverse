import { describe, it, expect } from "vitest";
import {
  applyGrade,
  buildReviewQueue,
  dueAt,
  formatInterval,
  gradeForKey,
  isDue,
  nextDueAt,
  nextIntervalMs,
  INITIAL_EASE,
  type ReviewStat,
} from "../challenges/scheduler";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const stat = (over: Partial<ReviewStat>): ReviewStat => ({
  lastReviewedAt: 0,
  intervalMs: DAY,
  ease: INITIAL_EASE,
  reps: 1,
  lapses: 0,
  ...over,
});

describe("applyGrade", () => {
  it("first completion uses the per-grade first interval and ease delta", () => {
    const again = applyGrade(undefined, "again", 100);
    expect(again).toEqual({ lastReviewedAt: 100, intervalMs: 10 * MINUTE, ease: 2.3, reps: 1, lapses: 1 });
    expect(applyGrade(undefined, "hard", 100).intervalMs).toBe(12 * HOUR);
    expect(applyGrade(undefined, "hard", 100).ease).toBe(2.35);
    expect(applyGrade(undefined, "good", 100).intervalMs).toBe(DAY);
    expect(applyGrade(undefined, "good", 100).ease).toBe(2.5);
    expect(applyGrade(undefined, "easy", 100).intervalMs).toBe(3 * DAY);
    expect(applyGrade(undefined, "easy", 100).ease).toBe(2.65);
    expect(applyGrade(undefined, "good", 100).lapses).toBe(0);
  });

  it("a good chain grows by the pre-update ease and caps at 60d", () => {
    let s: ReviewStat | undefined;
    const expected = [DAY, 2.5 * DAY, 6.25 * DAY, 15.625 * DAY, 39.0625 * DAY, 60 * DAY, 60 * DAY];
    for (const [i, want] of expected.entries()) {
      s = applyGrade(s, "good", i);
      expect(s.intervalMs).toBe(want);
      expect(s.ease).toBe(2.5); // good leaves ease unchanged
      expect(s.reps).toBe(i + 1);
    }
  });

  it("easy multiplies by ease and the easy bonus", () => {
    const next = applyGrade(stat({ intervalMs: DAY }), "easy", 0);
    expect(next.intervalMs).toBe(Math.round(DAY * 2.5 * 1.3));
    expect(next.ease).toBe(2.65);
  });

  it("hard halves the interval, floored at the 12h first-hard interval", () => {
    expect(applyGrade(stat({ intervalMs: 4 * DAY }), "hard", 0).intervalMs).toBe(2 * DAY);
    expect(applyGrade(stat({ intervalMs: DAY }), "hard", 0).intervalMs).toBe(12 * HOUR);
    expect(applyGrade(stat({ intervalMs: DAY }), "hard", 0).ease).toBe(2.35);
  });

  it("again resets to 10m and counts a lapse", () => {
    const next = applyGrade(stat({ intervalMs: 10 * DAY, ease: 2.0, reps: 3, lapses: 0 }), "again", 50);
    expect(next).toEqual({ lastReviewedAt: 50, intervalMs: 10 * MINUTE, ease: 1.8, reps: 4, lapses: 1 });
  });

  it("good after a lapse jumps back to the 1d floor (relearning)", () => {
    const lapsed = stat({ intervalMs: 10 * MINUTE, ease: 2.3 });
    expect(applyGrade(lapsed, "good", 0).intervalMs).toBe(DAY); // 23m raw, floored
  });

  it("ease never drops below 1.3", () => {
    expect(applyGrade(stat({ ease: 1.3 }), "again", 0).ease).toBe(1.3);
    expect(applyGrade(stat({ ease: 1.4 }), "again", 0).ease).toBeCloseTo(1.3);
  });
});

describe("isDue / dueAt", () => {
  it("is due exactly at lastReviewedAt + intervalMs, never for an ungraded stat", () => {
    const s = stat({ lastReviewedAt: 1000, intervalMs: 500 });
    expect(dueAt(s)).toBe(1500);
    expect(isDue(s, 1499)).toBe(false);
    expect(isDue(s, 1500)).toBe(true);
    expect(isDue(s, 2000)).toBe(true);
    expect(isDue(undefined, Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});

describe("buildReviewQueue / nextDueAt", () => {
  it("orders most-overdue first, drops not-due, appends new in given order", () => {
    const stats = {
      a: stat({ lastReviewedAt: 0, intervalMs: 100 }), // dueAt 100
      b: stat({ lastReviewedAt: 0, intervalMs: 50 }), // dueAt 50 (more overdue)
      c: stat({ lastReviewedAt: 0, intervalMs: 10_000 }), // not due
      z: stat({ lastReviewedAt: 0, intervalMs: 1 }), // stale: not in ids
    };
    expect(buildReviewQueue(stats, ["a", "b", "c", "d", "e"], 200)).toEqual(["b", "a", "d", "e"]);
  });

  it("keeps the given order on dueAt ties", () => {
    const stats = {
      a: stat({ lastReviewedAt: 0, intervalMs: 100 }),
      b: stat({ lastReviewedAt: 0, intervalMs: 100 }),
    };
    expect(buildReviewQueue(stats, ["a", "b"], 200)).toEqual(["a", "b"]);
  });

  it("is empty when every id has a future stat; nextDueAt reports the earliest", () => {
    const stats = {
      a: stat({ lastReviewedAt: 100, intervalMs: 1000 }), // dueAt 1100
      b: stat({ lastReviewedAt: 100, intervalMs: 500 }), // dueAt 600
    };
    expect(buildReviewQueue(stats, ["a", "b"], 200)).toEqual([]);
    expect(nextDueAt(stats, ["a", "b"])).toBe(600);
    expect(nextDueAt({}, ["a", "b"])).toBeNull();
  });
});

describe("gradeForKey", () => {
  it("maps 1-4 and rejects arbitrary input, including Object.prototype names", () => {
    expect(gradeForKey("1")).toBe("again");
    expect(gradeForKey("4")).toBe("easy");
    expect(gradeForKey("5")).toBeUndefined();
    expect(gradeForKey("x")).toBeUndefined();
    // A paste can deliver any string; prototype members must not leak through.
    expect(gradeForKey("constructor")).toBeUndefined();
    expect(gradeForKey("toString")).toBeUndefined();
    expect(gradeForKey("__proto__")).toBeUndefined();
  });
});

describe("nextIntervalMs / formatInterval", () => {
  it("nextIntervalMs matches what applyGrade would schedule", () => {
    expect(nextIntervalMs(undefined, "good")).toBe(DAY);
    expect(nextIntervalMs(stat({ intervalMs: 2 * DAY }), "good")).toBe(5 * DAY);
    expect(nextIntervalMs(stat({ intervalMs: 2 * DAY }), "again")).toBe(10 * MINUTE);
  });

  it("formats minutes/hours as integers and days with one decimal", () => {
    expect(formatInterval(30_000)).toBe("1m"); // sub-minute rounds up to the 1m floor
    expect(formatInterval(10 * MINUTE)).toBe("10m");
    expect(formatInterval(59 * MINUTE)).toBe("59m");
    expect(formatInterval(HOUR)).toBe("1h");
    expect(formatInterval(90 * MINUTE)).toBe("2h");
    expect(formatInterval(23 * HOUR)).toBe("23h");
    expect(formatInterval(DAY)).toBe("1d");
    expect(formatInterval(2.5 * DAY)).toBe("2.5d");
    expect(formatInterval(6.25 * DAY)).toBe("6.3d");
    expect(formatInterval(60 * DAY)).toBe("60d");
  });
});
