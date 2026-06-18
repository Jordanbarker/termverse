---
name: challenges
description: "How the puzzle game's declarative challenge framework and state-based win-detection work (apps/puzzle-game). Use this skill whenever adding or modifying a puzzle-game challenge, changing win-detection, or touching files under apps/puzzle-game/src/challenges/, the store's checkCompletion in apps/puzzle-game/src/state/puzzleStore.ts, or the compare/seed helpers in apps/puzzle-game/src/lib/."
---

# Puzzle Challenge Framework

The puzzle game (`@tt/puzzle-game`) is a linear sequence of self-contained challenges, each a pure declarative definition. Win-detection is **live and state-based**: after every command and pane mutation the store re-derives a read-only snapshot and asks the current step's predicate whether it is satisfied. No scripted commands, no event log — just "does the current state match?".

This app is built only on `@tt/core` and does **not** import terminal-turmoil story code. See `apps/puzzle-game/CLAUDE.md` for the surrounding structure.

## The shape (`src/challenges/types.ts`)

- **`PuzzleSnapshot`** — the slice of state a validator may read, built fresh by `checkCompletion`:
  `{ activeWindow: WindowState; windows: WindowState[]; fs: VirtualFS; cwd: string }`.
- **`Step`** — `{ instruction: string; isComplete: (s: PuzzleSnapshot) => boolean }`. The predicate must be **pure** (read-only over the snapshot).
- **`Challenge`** — `{ id, title, type: "pane" | "git", steps: Step[], setup(base) => VirtualFS, targetWindow?, gitRepoPath? }`.
  - `setup` seeds the challenge FS on top of `buildPuzzleFs()` (`src/lib/seed.ts`).
  - Pane challenges set `targetWindow` (the RIGHT-hand schematic the player reproduces).
  - Git challenges set `gitRepoPath` (where the validators + panel readout point).

## Win-detection (`src/state/puzzleStore.ts`)

State: `challengeIndex` + `stepIndex`. `checkCompletion()` builds a `PuzzleSnapshot`, runs `challenge.steps[stepIndex].isComplete(snap)`, and:
- not satisfied → return;
- more steps remain → advance `stepIndex` (flash "✓ Step complete");
- last step → auto-advance to the next challenge in `CHALLENGES` (resets the FS + panes for its sandbox).

It's invoked after every command and every pane action (split/focus/cycle/window ops). Keep validators cheap — they run on every keystroke-completed command.

## Existing challenges (`src/challenges/registry.ts`)

`CHALLENGES` is an ordered, linear array — the player advances one at a time.
- **`panes-split`** (type `pane`) — reproduce a target layout (`(h L (v L L))`). `targetWindow` is built with the same pure `@tt/core/terminal/paneTypes` helpers (`makeWindow`/`makeLeaf`/`splitNode`) the player drives, so the `a`/`b` split ordering lines up; `isComplete` calls `paneTreeMatches()` (`src/lib/paneCompare.ts`, structural compare that ignores ids).
- **`git-first-commit`** (type `git`) — stage + commit in `gitRepoPath`, validated against `@tt/core`'s git engine state via `src/lib/gitState.ts`.

## Adding a challenge

1. Create `src/challenges/<id>.ts` exporting a `Challenge`. Write `setup` to seed only what the challenge needs on top of `buildPuzzleFs()`. For pane challenges build `targetWindow` with `paneTypes` helpers (don't hand-author ids — the compare ignores them). For git challenges set `gitRepoPath` and read state via `gitState.ts`.
2. Author each `Step` with a clear `instruction` and a pure `isComplete` predicate over `PuzzleSnapshot`.
3. Append it to `CHALLENGES` in `registry.ts` (order = play order).
4. Cover it in `src/__tests__/challenges.test.ts`, then `npm run typecheck` + `npx vitest run`.
