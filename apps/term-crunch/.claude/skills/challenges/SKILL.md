---
name: challenges
description: "How term-crunch's declarative challenge framework and state-based win-detection work (apps/term-crunch). Use this skill whenever adding or modifying a term-crunch challenge, changing win-detection, or touching files under apps/term-crunch/src/challenges/, the store's checkCompletion in apps/term-crunch/src/state/gameStore.ts, or the compare/seed helpers in apps/term-crunch/src/lib/."
---

# Challenge Framework

Term Crunch (`@tt/term-crunch`) is a sequence of self-contained challenges, each a pure declarative definition, grouped into selectable **categories** (tracks). Win-detection is **live and state-based**: after every command and pane mutation the store re-derives a read-only snapshot and asks the current step's predicate whether it's satisfied. No scripted commands, no event log — just "does the current state match?". Built only on `@tt/core`; does **not** import termoil story code (see `apps/term-crunch/CLAUDE.md`).

## The shape (`src/challenges/types.ts`)

Read `types.ts` for `Challenge` / `Step` / `ChallengeSnapshot`. Conventions and traps:
- **`Step.isComplete(snapshot)` must be pure** (read-only over the snapshot, which is `{ activeWindow, windows, fs, cwd }`, built fresh by `checkCompletion`).
- **Objective-first + progressive-hint convention:** `instruction` states the sub-goal, NOT the command — never bake the answer in; `hint` (conceptual nudge) and `command` (literal command) are the two reveal-on-request hint levels the panel owns. `instruction` may be omitted only on a single-step challenge whose `brief` already states the whole objective (test-enforced).
- `Challenge.brief?` is the persistent scenario shown above the current step (command-free); omitted = only the step's `instruction` shows. `setup(base)` seeds on top of `buildBaseFs()` (`src/lib/seed.ts`). Tmux layout challenges set `targetWindow`/`targetWindows` (the right-hand schematic). Git challenges set `gitRepoPath` — also the player's **starting cwd** (`loadChallenge` opens the window there, so no `cd` needed). Any challenge (any `type`) can set `fsWatchPath` to render an fs tree — the panel gates that readout on the field, not the type, so an fs-detected tmux challenge (e.g. `copy-mode-yank`) still shows it. `commands?: string[]` is a per-challenge **allowlist** (primary names; `help`/`clear` always available), enforced by the `AvailabilityPolicy` in `src/lib/availabilityPolicy.ts`; omit for allow-all.

## Categories (`src/challenges/categories.ts`)

Categories are pure filters over the linear `CHALLENGES` registry, derived from each challenge's `type`: `all`, `tmux`, `git`, `fs`. `SELECTABLE_CATEGORIES` drops empty groups; `getCategory(id)` falls back to `all` (covers a stale persisted id). **Trap: the store's `challengeIndex` is relative to the active category's list, not the global registry.** Anything resolving the current challenge must go through `getCategory(activeCategory).challenges[challengeIndex]` (store, `ChallengePanel`, `availabilityPolicy`) — never `CHALLENGES[challengeIndex]`. Default track `DEFAULT_CATEGORY="all"` mirrors registry order (so a global index still resolves under the default).

## Win-detection (`src/state/gameStore.ts`)

State: `activeCategory` + `challengeIndex` (category-relative) + `stepIndex` + `awaitingContinue`. `checkCompletion()` builds a `ChallengeSnapshot` and runs the current step's predicate: not satisfied → return; more steps → advance `stepIndex`; last step + more challenges **in the group** → `awaitingContinue` (Enter → `continueToNext()` → `loadChallenge(next)`); last step of the last challenge in the group → `completed`. The gate length is `group.challenges.length` (a single-challenge track completes immediately). It early-returns while `completed || awaitingContinue` so the still-passing last step doesn't re-fire. On last-step branches it captures timing (`lastElapsedMs`/`lastWasBest`, updates `bestTimes[challenge.id]`). Persisted fields (zustand `persist`, `name: "term-crunch-progress"`): `bestTimes` (keyed by `challenge.id`, category-independent) + `activeCategory`. Invoked after every command and after **structural** pane/window mutations (`splitPane`/`closePane`/`resizePane`/`newWindow`/`closeWindow`/`renameWindow`) — not pure focus ops. Keep validators cheap (they run on every completed command).

## Existing challenges (`src/challenges/registry.ts`)

`CHALLENGES` is an ordered linear array (play order), one file per challenge — each file's comments explain its own seed data and predicate gotchas; **read the file before changing a challenge.** Current set: `panes-split`, `panes-grid`, `windows-create`, `copy-mode-yank` (tmux; `copy-mode-yank` is fs-detected but tracks tmux copy mode); `git-first-commit`, `git-stash`, `git-pull-ff`, `git-rebase` (git; engine support in the `git` skill); `rm-bomb`, `chmod-perms` (fs, destructive — Restart matters).

## Adding a challenge

1. Create `src/challenges/<id>.ts` exporting a `Challenge`; `setup` seeds only what's needed on `buildBaseFs()`. Pane challenges build `targetWindow` with `paneTypes` helpers (don't hand-author ids — compare ignores them); git challenges set `gitRepoPath` and read state via `gitState.ts`.
2. Author each `Step` objective-first, set a `brief`, add a pure `isComplete` predicate.
3. Predicate conventions: use `>=` not `===` for counts (overshoot shouldn't strand); a predicate can't observe a read-only command (gate on the enabling state change, let the read be the payoff); check what the engine actually enforces (e.g. `VirtualFS.readFile` gates on the "other" permission bit); if a wrong move can soft-lock a destructive sandbox, ensure `restartChallenge()` recovers it.
4. Put challenge-specific mechanics (seed quirks, predicate gotchas) in **comments in the challenge file**, not this skill — docs point, code explains.
5. Set `commands` to the allowlist (primary names; `help`/`clear` implicit; `[]` for keyboard-only; omit only for genuine allow-all).
6. Append to `CHALLENGES` in `registry.ts` (order = play order); its `type` decides its category automatically.
7. Cover it in `src/__tests__/challenges.test.ts`, then `npm run typecheck` + `npx vitest run`.
