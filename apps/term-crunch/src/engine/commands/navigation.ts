import type { CommandHandler } from "@tt/core/commands/types";
import { register } from "@tt/core/commands/registry";
import { registerMetaCommands } from "@tt/core/commands/builtins/help";
import { formatElapsed } from "@tt/core/lib/format";
import { getCategory, SELECTABLE_CATEGORIES } from "../../challenges/categories";
import { CHALLENGES } from "../../challenges/registry";
import { buildReviewQueue, countDue, formatInterval, isDue, nextDueAt } from "../../challenges/scheduler";
import { useGameStore } from "../../state/gameStore";

/**
 * Keyboard-first challenge navigation: `challenges`, `goto`, `next`, `prev`,
 * `track`, `review`. App-local builtins (never in termoil's bundle), always
 * available regardless of the challenge allowlist (see lib/availabilityPolicy.ts).
 *
 * Handlers must not call loadChallenge/selectCategory directly: runLine commits
 * its accumulated fs/env to the store AFTER the pipeline finishes, which would
 * clobber the freshly seeded challenge. They validate, queue a pending
 * navigation here, and runLine applies it post-commit via
 * consumePendingNavigation().
 */
export type PendingNavigation =
  | { type: "load"; index: number }
  | { type: "category"; id: string }
  | { type: "review"; queue: string[] };

let pending: PendingNavigation | null = null;

export function consumePendingNavigation(): PendingNavigation | null {
  const p = pending;
  pending = null;
  return p;
}

const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

function current() {
  const { activeCategory, challengeIndex, bestTimes, reviewStats } = useGameStore.getState();
  return { category: getCategory(activeCategory), challengeIndex, bestTimes, reviewStats };
}

const challenges: CommandHandler = () => {
  const { category, challengeIndex, bestTimes, reviewStats } = current();
  const now = Date.now();
  const lines: string[] = [];
  lines.push(
    "Tracks: " +
      SELECTABLE_CATEGORIES.map((c) =>
        c.id === category.id ? `\x1b[33m[${c.id}]\x1b[0m` : c.id
      ).join(" ") +
      "  (switch with 'track <id>')"
  );
  lines.push("");
  category.challenges.forEach((c, i) => {
    const marker = i === challengeIndex ? "\x1b[33m→\x1b[0m" : " ";
    const best = bestTimes[c.id];
    const done = best != null ? ` \x1b[32m✓ ${formatElapsed(best)}\x1b[0m` : "";
    const due = isDue(reviewStats[c.id], now) ? " \x1b[33m● due\x1b[0m" : "";
    lines.push(` ${marker} ${String(i + 1).padStart(2)}. ${c.title}${done}${due}`);
  });
  lines.push("");
  lines.push("Jump with 'goto <n>', or step with 'next' / 'prev'.");
  // Registry-wide (not track-scoped), matching what `review` would queue.
  const dueCount = countDue(reviewStats, CHALLENGES.map((c) => c.id), now);
  if (dueCount > 0) lines.push(`${dueCount} due for review: run 'review'.`);
  return { output: lines.join("\n") + "\n" };
};

const goto_: CommandHandler = (args) => {
  const { category } = current();
  const n = Number(args[0]);
  if (!args[0] || !Number.isInteger(n) || n < 1 || n > category.challenges.length) {
    return {
      output: yellow(`usage: goto <1-${category.challenges.length}> (see 'challenges')`) + "\n",
      exitCode: 1,
    };
  }
  pending = { type: "load", index: n - 1 };
  return { output: `Loading ${n}. ${category.challenges[n - 1].title}…\n` };
};

function step(delta: 1 | -1): CommandHandler {
  return () => {
    const { category, challengeIndex } = current();
    const target = challengeIndex + delta;
    if (target < 0) return { output: yellow("Already at the first challenge.") + "\n", exitCode: 1 };
    if (target >= category.challenges.length)
      return { output: yellow("Already at the last challenge.") + "\n", exitCode: 1 };
    pending = { type: "load", index: target };
    return { output: `Loading ${target + 1}. ${category.challenges[target].title}…\n` };
  };
}

const track: CommandHandler = (args) => {
  const { category } = current();
  const ids = SELECTABLE_CATEGORIES.map((c) => c.id);
  if (!args[0]) {
    return {
      output:
        "Tracks: " +
        SELECTABLE_CATEGORIES.map((c) =>
          c.id === category.id ? `\x1b[33m[${c.id}]\x1b[0m` : c.id
        ).join(" ") +
        "\nusage: track <id>\n",
    };
  }
  if (!ids.includes(args[0])) {
    return { output: yellow(`track: no such track '${args[0]}' (${ids.join(", ")})`) + "\n", exitCode: 1 };
  }
  if (args[0] === category.id) return { output: `Already on the '${category.id}' track.\n` };
  pending = { type: "category", id: args[0] };
  return { output: `Switching to the '${args[0]}' track…\n` };
};

// Queue a spaced-repetition session over every overdue challenge, then every
// never-graded one (registry-wide, not track-scoped). Built here rather than
// in startReviewSession so the printed summary matches exactly what loads.
const review: CommandHandler = () => {
  const { reviewStats } = current();
  const now = Date.now();
  const ids = CHALLENGES.map((c) => c.id);
  const queue = buildReviewQueue(reviewStats, ids, now);
  if (queue.length === 0) {
    // Empty queue means every challenge has a stat and none are due, so
    // nextDueAt can't be null; guard anyway.
    const at = nextDueAt(reviewStats, ids);
    const when = at !== null ? ` Next review in ${formatInterval(at - now)}.` : "";
    return { output: `Nothing due for review.${when}\n` };
  }
  const dueCount = countDue(reviewStats, ids, now); // == the queue's due prefix
  pending = { type: "review", queue };
  return {
    output:
      `Reviewing ${queue.length} challenge${queue.length === 1 ? "" : "s"}: ` +
      `${dueCount} due, ${queue.length - dueCount} new.\n` +
      "Grade each completion: 1 Again, 2 Hard, 3/Enter Good, 4 Easy.\n",
  };
};

register("challenges", challenges, "List the current track's challenges and your progress");
register("goto", goto_, "Jump to challenge <n> in the current track");
register("next", step(1), "Skip to the next challenge");
register("prev", step(-1), "Go back to the previous challenge");
register("track", track, "List tracks or switch with 'track <id>'");
register("review", review, "Replay challenges that are due for spaced-repetition review");
// Game-control commands, not in-world shell tools: help lists them separately in cyan.
registerMetaCommands("challenges", "goto", "next", "prev", "track", "review");
