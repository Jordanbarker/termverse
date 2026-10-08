#!/usr/bin/env npx tsx
/**
 * End-to-end playtest of every challenge in the registry, via the headless
 * CrunchRunner: load the challenge, play its intended solution, and assert that
 * every step advanced, the completion gate rose, and the grade gate hands over to
 * the next challenge.
 *
 * This covers what `src/__tests__/challenges.test.ts` can't: the unit test pokes
 * predicates with hand-built snapshots, while this drives the real command
 * pipeline + store (`runLine` → `checkCompletion` → gate → `continueToNext`).
 *
 * Solutions live in SOLUTIONS below, keyed by challenge id: a list of steps that
 * are either a shell command string or a function driving the runner (for the
 * pane/window chords the harness maps to store actions). A challenge whose
 * solution can only be typed inside an editor session is declared SKIPPED with a
 * reason and reported as such — never silently dropped.
 *
 * Run: npm -w @tt/term-crunch run playtest
 */

import { CrunchRunner } from "./play";
import { CHALLENGES } from "../src/challenges/registry";
import { isGradeGateUp } from "../src/state/gameStore";

/** One solution move: a shell line, or a runner action (return value ignored). */
export type Move = string | ((r: CrunchRunner) => unknown);

/** Challenges whose solution is keystrokes inside an editor session. */
const SKIPPED: Record<string, string> = {
  "vim-first-edit": "solution is vim keystrokes (editor sessions aren't drivable headlessly)",
  "vim-delete-lines": "solution is vim keystrokes",
  "vim-fix-word": "solution is vim keystrokes",
  "vim-yank-paste": "solution is vim keystrokes",
  "vim-reorder": "solution is vim keystrokes",
};

export const SOLUTIONS: Record<string, Move[]> = {
  // (h L (v L L)) — split side-by-side, then stack the new right pane.
  "panes-split": [(r) => r.split("h"), (r) => r.split("v")],

  // 2×2 grid: columns, stack the right column, focus back left, stack it too.
  "panes-grid": [
    (r) => r.split("h"),
    (r) => r.split("v"),
    (r) => r.focus("L"),
    (r) => r.split("v"),
  ],

  // Prune the seeded 2×2 back to (h L L): kill one pane per column. Killing a
  // column's bottom pane collapses that column to a single leaf, so the second
  // kill targets the remaining grid pane by index (leaf order is left→right).
  "panes-cleanup": [
    (r) => r.killPane(),
    (r) => {
      r.focusPaneAt(1);
      r.killPane();
    },
  ],

  // 50/50 → left pane ~70%: four full-size nudges right (0.05 each) lands at 0.70.
  "panes-resize": [(r) => assertResize(r, "R", 4)],
  // 50/50 rows → top pane ~70%: D grows child `a` (the top pane).
  "panes-resize-rows": [(r) => assertResize(r, "D", 4)],
  // Bottom-left to ~70% of the column (U shrinks the top pane), then the left
  // column to ~30% of the width (L shrinks child `a`, the column).
  "panes-resize-corner": [(r) => assertResize(r, "U", 4), (r) => assertResize(r, "L", 4)],

  "windows-create": [(r) => r.newWindow(), (r) => r.newWindow(), (r) => r.renameWindow("logs")],

  // Copy mode itself is read-only (and keyboard-driven): the observable step is
  // spending the recovered token on a mkdir.
  "copy-mode-yank": ["cat passphrase.log", "mkdir moonlit-cipher-7f3c91a0e5"],

  "sessions-detach-attach": ["tmux detach", "tmux attach"],
  "sessions-juggle": [
    "tmux detach",
    "tmux new -s scratch",
    "tmux detach",
    "tmux attach -t 0",
    "tmux kill-session -t scratch",
  ],

  "sessions-rename": ["tmux detach", "tmux rename-session -t 0 old", "tmux new -s new"],

  "git-first-commit": ["git add README.md", 'git commit -m "init"'],
  "git-unstage": ["git reset .env", 'git commit -m "update"'],
  "git-stash": ["git stash", "git checkout hotfix", "git checkout main", "git stash pop"],
  "git-pull-ff": ["git stash --include-untracked", "git pull --ff-only", "git stash pop"],
  // Step 2 is a conflict resolution the player does in nano; writeFile stands in
  // (the predicate only reads the saved file).
  "git-rebase": [
    "git rebase main",
    (r) => r.writeFile("config.txt", "host = localhost\nport = 8080\ntimeout = 60\n"),
    "git add config.txt",
    "git rebase --continue",
  ],
  "git-branch-delete": [
    "git branch -d feature/login",
    "git branch -D experiment",
    "git push origin --delete feature/login",
  ],

  "rm-bomb": ["find ~/work -name BOMB.md", "rm ~/work/reports/2024/BOMB.md"],
  // Both set startCwd to their working dir, so no cd needed.
  "chmod-perms": ["chmod o+r index.html"],
  "mv-organize": ["mkdir logs", "mv build.log logs/"],
  "env-export": ["export ENV=prod", "unset SAFEGUARDS"],
  "alias-shortcut": ["alias ship='mkdir -p ~/releases/v2'", "ship", "unalias ship"],
};

function assertResize(r: CrunchRunner, dir: "L" | "R" | "U" | "D", steps: number): void {
  if (!r.resize(dir, steps)) throw new Error(`resize ${dir} found no divider on that axis`);
}

// ── harness ─────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;
let skipCount = 0;
const failures: string[] = [];

function pass(label: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  passCount++;
}

function fail(label: string, detail: string) {
  console.log(`  \x1b[31m✗\x1b[0m ${label}\n      ${detail.replace(/\n/g, "\n      ")}`);
  failures.push(label);
  failCount++;
}

function skip(label: string, reason: string) {
  console.log(`  \x1b[33m•\x1b[0m SKIP ${label} — ${reason}`);
  skipCount++;
}

/** Play one challenge on the "all" track and assert it completes step by step. */
async function playChallenge(index: number): Promise<void> {
  const challenge = CHALLENGES[index];
  const label = `${index + 1}. ${challenge.id}`;

  if (SKIPPED[challenge.id]) {
    skip(label, SKIPPED[challenge.id]);
    return;
  }
  const moves = SOLUTIONS[challenge.id];
  if (!moves) {
    fail(label, "no solution declared in SOLUTIONS (add one, or declare it SKIPPED with a reason)");
    return;
  }

  // Fresh runner per challenge: no state carried in from the previous one.
  const runner = new CrunchRunner(index);
  if (runner.challenge?.id !== challenge.id) {
    fail(label, `loaded ${runner.challenge?.id} instead (registry/track index mismatch)`);
    return;
  }
  if (runner.store.stepIndex !== 0) {
    fail(label, `starts on step ${runner.store.stepIndex + 1} — a predicate is satisfied at load`);
    return;
  }
  if (runner.store.failure !== null) {
    fail(label, `reports failure at load: ${runner.store.failure}`);
    return;
  }

  const log: string[] = [];
  for (const move of moves) {
    if (isGradeGateUp(runner.store)) break; // finished early; remaining moves are redundant
    try {
      if (typeof move === "string") {
        const res = await runner.run(move);
        log.push(`$ ${move}${res.output.trim() ? "\n" + res.output.trim() : ""}`);
        if (res.startSession) {
          fail(label, `\`${move}\` opened a ${res.startSession.type} session — not drivable headlessly`);
          return;
        }
      } else {
        await move(runner);
        log.push("(runner action)");
      }
    } catch (e) {
      fail(label, `move failed: ${e instanceof Error ? e.message : String(e)}\n${log.join("\n")}`);
      return;
    }
  }

  const s = runner.store;
  if (s.failure !== null) {
    fail(label, `the intended solution tripped the failure detector: ${s.failure}\n${log.join("\n")}`);
    return;
  }
  if (!isGradeGateUp(s)) {
    fail(
      label,
      `stalled on step ${s.stepIndex + 1}/${challenge.steps.length}: ` +
        `${challenge.steps[s.stepIndex]?.instruction ?? "(no instruction)"}\n${log.join("\n")}`
    );
    return;
  }
  if (s.bestTimes[challenge.id] === undefined) {
    fail(label, "completion recorded no best time");
    return;
  }

  // The gate is an Anki-style self-grade; grading must both feed the scheduler
  // and (mid-track) hand over to the next challenge.
  const wasLast = index === CHALLENGES.length - 1;
  if (!runner.grade(3)) {
    fail(label, "grade gate refused a grade");
    return;
  }
  const after = runner.store;
  if (after.reviewStats[challenge.id] === undefined) {
    fail(label, "grading recorded no review stat");
    return;
  }
  if (!wasLast && after.challengeIndex !== index + 1) {
    fail(label, `grading left the player on challenge ${after.challengeIndex + 1}, expected ${index + 2}`);
    return;
  }
  if (wasLast && !after.completed) {
    fail(label, "last challenge did not set the track-complete banner");
    return;
  }
  pass(`${label} — ${challenge.steps.length} step(s)`);
}

async function main() {
  console.log(`\x1b[1;34m━━━ term-crunch: ${CHALLENGES.length} challenges ━━━\x1b[0m`);
  for (let i = 0; i < CHALLENGES.length; i++) {
    await playChallenge(i);
  }

  console.log(
    `\n${failCount === 0 ? "\x1b[1;32mPASS" : "\x1b[1;31mFAIL"}\x1b[0m — ` +
      `${passCount} passed, ${failCount} failed, ${skipCount} skipped`
  );
  if (failures.length) console.log("Failed: " + failures.join(", "));
  process.exit(failCount === 0 ? 0 : 1);
}

// Run only when invoked as a script, so importing SOLUTIONS doesn't start a playtest.
if (process.argv[1]?.endsWith("playtest_tracks.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
