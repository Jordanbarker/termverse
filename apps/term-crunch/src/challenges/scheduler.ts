/**
 * SM-2-lite spaced-repetition scheduler for challenge review (Anki-style
 * self-grading at the completion gate). Pure module: no store or registry
 * imports, `now` is always a parameter (never Date.now()), so every function
 * is trivially testable. Intervals are in ms, consistent with
 * challengeStartTime/bestTimes.
 */

export type Grade = "again" | "hard" | "good" | "easy";

export interface ReviewStat {
  lastReviewedAt: number; // Date.now() of last graded completion
  intervalMs: number; // due when now >= lastReviewedAt + intervalMs (dueAt derived, not stored)
  ease: number; // growth multiplier applied on good/easy
  reps: number; // total graded completions
  lapses: number; // count of "again" grades
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// First-completion interval per grade; also the per-grade FLOOR on every later
// grade, which gives Anki-like relearning: a lapsed card (interval reset to
// 10m by "again") graded Good next time jumps straight back to 1d instead of
// crawling up from 10m * ease.
const FIRST_INTERVAL: Record<Grade, number> = {
  again: 10 * MINUTE,
  hard: 12 * HOUR,
  good: DAY,
  easy: 3 * DAY,
};

export const INITIAL_EASE = 2.5;
const MIN_EASE = 1.3;
const EASY_BONUS = 1.3;
// Deliberate deviation from real Anki (where Hard still grows ~1.2x): halving
// resurfaces challenges the player finds hard sooner, which is the point of
// the game's review mode. The per-grade floors keep the resulting intervals
// monotonic: again < hard < good < easy.
const HARD_SHRINK = 0.5;
const MAX_INTERVAL_MS = 60 * DAY;
const EASE_DELTA: Record<Grade, number> = { again: -0.2, hard: -0.15, good: 0, easy: 0.15 };

const GRADE_KEYS: Record<string, Grade> = { "1": "again", "2": "hard", "3": "good", "4": "easy" };
export const GRADE_LABELS: Record<Grade, string> = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };
export const GRADES: Grade[] = ["again", "hard", "good", "easy"];

/**
 * Grade for a raw terminal keystroke, or undefined. `data` is arbitrary xterm
 * onData input (a paste can deliver any string), so the lookup must be
 * own-property-guarded: GRADE_KEYS["constructor"] would otherwise return a
 * truthy Object.prototype member.
 */
export function gradeForKey(data: string): Grade | undefined {
  return Object.hasOwn(GRADE_KEYS, data) ? GRADE_KEYS[data] : undefined;
}

/** Interval a grade schedules (also the gate's per-key previews). */
export function nextIntervalMs(prev: ReviewStat | undefined, grade: Grade): number {
  // Growth uses the PRE-update ease (Anki-style): this grade's ease delta only
  // affects the next review's growth.
  let raw: number;
  if (!prev) {
    raw = FIRST_INTERVAL[grade];
  } else if (grade === "again") {
    raw = FIRST_INTERVAL.again;
  } else if (grade === "hard") {
    raw = prev.intervalMs * HARD_SHRINK;
  } else if (grade === "good") {
    raw = prev.intervalMs * prev.ease;
  } else {
    raw = prev.intervalMs * prev.ease * EASY_BONUS;
  }
  return Math.min(MAX_INTERVAL_MS, Math.max(FIRST_INTERVAL[grade], Math.round(raw)));
}

export function applyGrade(prev: ReviewStat | undefined, grade: Grade, now: number): ReviewStat {
  return {
    lastReviewedAt: now,
    intervalMs: nextIntervalMs(prev, grade),
    ease: Math.max(MIN_EASE, (prev?.ease ?? INITIAL_EASE) + EASE_DELTA[grade]),
    reps: (prev?.reps ?? 0) + 1,
    lapses: (prev?.lapses ?? 0) + (grade === "again" ? 1 : 0),
  };
}

export function dueAt(stat: ReviewStat): number {
  return stat.lastReviewedAt + stat.intervalMs;
}

// undefined = never graded ("new"): new challenges aren't "due", they queue
// after all overdue ones instead. now === dueAt counts as due.
export function isDue(stat: ReviewStat | undefined, now: number): boolean {
  return stat != null && now >= dueAt(stat);
}

/** Overdue count across `ids` — the "N due for review" number everywhere. */
export function countDue(stats: Record<string, ReviewStat>, ids: string[], now: number): number {
  return ids.filter((id) => isDue(stats[id], now)).length;
}

/**
 * Review queue: overdue ids sorted by dueAt ascending (most overdue first;
 * stable sort keeps the given registry order on ties), then never-graded ids
 * in the given order. Ids with a stat but not yet due are excluded; stale stat
 * ids not in `ids` are ignored (we only iterate `ids`).
 */
export function buildReviewQueue(
  stats: Record<string, ReviewStat>,
  ids: string[],
  now: number
): string[] {
  const due = ids.filter((id) => isDue(stats[id], now)).sort((a, b) => dueAt(stats[a]) - dueAt(stats[b]));
  const fresh = ids.filter((id) => stats[id] == null);
  return [...due, ...fresh];
}

/** Earliest upcoming dueAt across the graded ids, or null if none are graded. */
export function nextDueAt(stats: Record<string, ReviewStat>, ids: string[]): number | null {
  let min: number | null = null;
  for (const id of ids) {
    const stat = stats[id];
    if (!stat) continue;
    const at = dueAt(stat);
    if (min === null || at < min) min = at;
  }
  return min;
}

/**
 * Compact interval display: "10m" / "12h" / "2.5d". Minutes and hours round to
 * integers; days keep one decimal (ease growth produces fractional days and
 * previews would otherwise misreport, e.g. 2.5d as 3d).
 */
export function formatInterval(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  if (ms < DAY) return `${Math.max(1, Math.round(ms / HOUR))}h`;
  const days = Math.round((ms / DAY) * 10) / 10;
  return `${days}d`;
}
