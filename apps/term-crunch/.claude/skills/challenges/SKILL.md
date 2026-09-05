---
name: challenges
description: "How term-crunch's declarative challenge framework and state-based win-detection work (apps/term-crunch). Use this skill whenever adding or modifying a term-crunch challenge, changing win-detection, or touching files under apps/term-crunch/src/challenges/, the store's checkCompletion in apps/term-crunch/src/state/gameStore.ts, or the compare/seed helpers in apps/term-crunch/src/lib/."
---

# Challenge Framework

Term Crunch (`@tt/term-crunch`) is a sequence of self-contained challenges, each a pure declarative definition, grouped into selectable **categories** (tracks). Win-detection is **live and state-based**: after every command and pane mutation the store re-derives a read-only snapshot and asks the current step's predicate whether it's satisfied — no scripted commands, no event log. Built only on `@tt/core`; does **not** import termoil story code (see `apps/term-crunch/CLAUDE.md`).

## The shape (`src/challenges/types.ts`)

Read `types.ts` for `Challenge` / `Step` / `ChallengeSnapshot`. Conventions and traps:

- **`Challenge.failed?(snapshot)`** (optional) returns a message when the sandbox is unrecoverable (protected file deleted, secrets lost) or null. `checkCompletion` evaluates it before the cascade, stores it as `failure`, and blocks all steps while set; the panel shows it in red with Restart. It must be null on the freshly seeded board (test-enforced) and must not fire on the intended solution (playtest-enforced). Use it wherever a wrong move leaves a board that can never pass — the tree readout otherwise looks like a win.
- **`Step.isComplete(snapshot)` must be pure** over the `ChallengeSnapshot`, built fresh by `checkCompletion` — read its fields in `types.ts`.
- **Objective-first + progressive hints:** `instruction` states the sub-goal, never the command; `hint` (conceptual nudge) and `command` (literal answer) are the two reveal-on-request levels. Test-enforced over the whole registry in `challenges.test.ts`: every step has `hint` + `command`, no `instruction` contains its own command, and a `brief` exists unless `targetWindow`/`targetWindows` states the goal. Opting out means a `HINT_EXEMPT` entry there with a reason. Convention only (untested): omit `instruction` just on a single-step challenge whose `brief` states the whole objective.
- **No filler:** briefs are one clause of scenario plus the objective; instructions single imperatives; hints teach syntax/gotchas. Don't restate what the CURRENT/TARGET readout shows.
- `setup(base)` seeds on top of `buildBaseFs()` using the shared helpers in `src/lib/seedFs.ts` (`writeOrThrow`/`mkdirOrThrow` are mkdir-p and throw; `readTrimmed`/`readLines` are the trailing-newline-tolerant readers predicates should use unless byte-exact content matters). Don't re-roll per-challenge copies.
- Layout challenges set `targetWindow`/`targetWindows` (right-hand schematic). Challenges that start from a pre-built layout (`panes-cleanup`, the resize trio) also set `initialWindow`, a **builder**, not data: each call mints fresh pane ids so TabManager can tear down the previous challenge's terminals (`loadChallenge` must NOT reset the id counters).
- `gitRepoPath` is also the starting cwd; any challenge can set `startCwd` (ignored when `initialWindow` is set). `initialEnv` seeds env vars at load on top of the player's zshrc exports — needed when a predicate is "this var is gone" (e.g. `unset`), which would otherwise be vacuously true. Settings saves replace only the keys the outgoing zshrc owned, so seeded vars and mid-challenge shell state survive.
- Any challenge can set `fsWatchPath` (render an fs tree) + `fsDangerPath` (flag the deletion target). The panel gates every readout on the field, never on `type`.
- `commands?: string[]` is a per-challenge **allowlist** (primary names), enforced by `src/lib/availabilityPolicy.ts` — read that file for `ALWAYS_AVAILABLE` and the omitted-vs-empty-array rule before setting the field.

## Categories (`src/challenges/categories.ts`)

Categories are pure filters over the linear `CHALLENGES` registry, derived from each challenge's `type`: `all`, `tmux`, `git`, `fs`, `shell` (env/alias, anything about the shell itself rather than files), `vim`. **Registry order is test-enforced:** each type is one contiguous run (the "all" track never doubles back) and the three `panes-resize*` challenges are never all adjacent (two may be). `SELECTABLE_CATEGORIES` drops empty groups; `getCategory(id)` falls back to `all`. **Trap: the store's `challengeIndex` is relative to the active category's list, not the global registry.** Resolve the current challenge via `getCategory(activeCategory).challenges[challengeIndex]`, never `CHALLENGES[challengeIndex]`.

## Win-detection (`src/state/gameStore.ts`)

State: `activeCategory` + `challengeIndex` (category-relative) + `stepIndex` + `awaitingContinue`.

- `checkCompletion()` builds a `ChallengeSnapshot` and **cascades**: it consumes every consecutive step the snapshot already satisfies in one pass (out-of-order play can pre-satisfy a later step).
- **The cascade makes step ordering load-bearing:** a later step may be vacuously true against the freshly-loaded snapshot and still be safe, because the cascade can't reach it until its predecessors pass (`git-stash`, `git-pull-ff`, `alias-shortcut`, `sessions-detach-attach`, `sessions-juggle` all rely on this; `challenges.test.ts` pins each). Reordering steps or loosening an early predicate can auto-complete a challenge at load.
- All steps consumed + more challenges in the group (or an active review session) → `awaitingContinue`; last challenge in the group → `completed`. Both stash `pendingGradeId`: the gate is an Anki-style self-grade (keys 1-4, Enter = Good → `continueToNext(grade)`) feeding the SM-2-lite scheduler in `src/challenges/scheduler.ts`; the `review` meta command queues due-then-new challenges on the "all" track and restores the pre-review spot. It early-returns while `completed || awaitingContinue`.
- The last-step branch captures timing (`lastElapsedMs`/`lastWasBest`, `bestTimes`) **and awards mastery points** (`src/challenges/mastery.ts`) in the same `set()` that raises the gate. Contract: MP rewards completion, never the grade; `lastMpAt` is stamped only when the completion paid, so early repeats can't push the retention clock; awards land in transient `lastAwards` alongside `mastery`, surfaced by the completion panel and `MasteryBlock`, **never** toasts. Pay-out rules are commented in `mastery.ts`. `MasteryBlock`'s two-beat reward animation is timing-sensitive and untested by unit tests: run `npm run screenshot:mp-reward` after touching it or the `mp-*` keyframes.
- `recordGrade` writes only `reviewStats` plus the deck-cleared MP bonus; abandoning a gate keeps the completion MP but never schedules.
- Persisted (zustand `persist`, `name: "term-crunch-progress"`): `bestTimes`, `reviewStats`, `lastMpAt` (all keyed by `challenge.id`), `mastery`, `activeCategory`, `zshrc`/`tmuxConf`.
- Invoked after every command, after **structural** pane/window mutations (not pure focus ops), after every `applyTmuxAction`, and after a Settings save (editing the zshrc genuinely mutates envVars/aliases). While detached it skips entirely so the bare shell can't satisfy a layout predicate — **unless** the challenge sets `checkWhileDetached` (session-lifecycle challenges whose predicates read `snapshot.tmux`; only safe with no target schematics, and step 0 must never be satisfied by the freshly-loaded attached state). Keep validators cheap.

## Existing challenges (`src/challenges/registry.ts`)

`CHALLENGES` is an ordered linear array (play order), one file per challenge; **each file's comments explain its own seed data and predicate gotchas — read the file before changing a challenge.** Cross-challenge patterns worth knowing: the resize trio (`panes-resize*`) needs `paneTreeMatchesWithRatio`, since `paneTreeMatches` ignores ratios; several challenges have a vacuously-true final step guarded only by the cascade (see win-detection above); the session-lifecycle trio (`sessions-detach-attach`, `sessions-rename`, `sessions-juggle`) sets `checkWhileDetached`.

## Adding a challenge

1. Create `src/challenges/<id>.ts` exporting a `Challenge`; `setup` seeds only what's needed. Pane challenges build `targetWindow` with `paneTypes` helpers — don't hand-author ids (`paneTreeMatches` compares normalized geometry: ids, ratios, and split order are ignored). Git challenges set `gitRepoPath` and read state via `gitState.ts` — except branch-set predicates, which call `listBranches` from `@tt/core/git/repo` directly (`GitReadout` carries only the current branch; remote-tracking refs come back `remotes/`-prefixed).
2. Author each `Step` objective-first, set a `brief`, add a pure `isComplete` predicate.
3. Predicate conventions: steps are **state checkpoints, not an event script** — out-of-order play reaching the same state must complete; use `>=` not `===` for counts; a predicate can't observe a read-only command (gate on the enabling state change); check what the engine actually enforces (e.g. `VirtualFS.readFile` gates on the "other" permission bit); if a wrong move can soft-lock a destructive sandbox, ensure `restartChallenge()` recovers it.
4. Put challenge-specific mechanics in **comments in the challenge file**, not this skill — docs point, code explains.
5. **Sweep every step's predicate against the freshly-loaded snapshot** — not just step 0 (which the playtest asserts). Any later step that comes back true is safe only via the cascade, so comment why the ordering protects it (`alias-shortcut.ts` is the model). No test enforces later steps, so the sweep is manual: a throwaway script mapping `steps.map(s => s.isComplete(snap))` finds them all.
6. Set `commands` to the allowlist (`[]` for keyboard-only; omit only for genuine allow-all).
7. Insert into `CHALLENGES` in `registry.ts` inside its type's run (order = play order); its `type` decides its category. Add `failed` if a plausible wrong move leaves the board unwinnable.
8. Cover it in `src/__tests__/challenges.test.ts` (predicate-level) **and** add a `SOLUTIONS` entry in `scripts/playtest_tracks.ts` (the `apps/term-crunch:play-testing` skill owns that gate). Then `npm run typecheck`, `npx vitest run`, `npm -w @tt/term-crunch run playtest`.
