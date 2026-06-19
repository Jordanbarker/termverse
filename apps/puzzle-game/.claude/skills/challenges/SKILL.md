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
- **`Challenge`** — `{ id, title, type: "pane" | "git" | "fs", steps: Step[], setup(base) => VirtualFS, targetWindow?, targetWindows?, gitRepoPath?, fsWatchPath? }`.
  - `setup` seeds the challenge FS on top of `buildPuzzleFs()` (`src/lib/seed.ts`).
  - Pane challenges set `targetWindow`/`targetWindows` (the RIGHT-hand schematic the player reproduces).
  - Git challenges set `gitRepoPath` (where the validators + panel readout point).
  - FS challenges set `fsWatchPath` (the directory the panel renders as a tree via `FsTreeView`).

## Win-detection (`src/state/puzzleStore.ts`)

State: `challengeIndex` + `stepIndex` + `awaitingContinue` (completion-gate flag). `checkCompletion()` builds a `PuzzleSnapshot`, runs `challenge.steps[stepIndex].isComplete(snap)`, and:
- not satisfied → return;
- more steps remain → advance `stepIndex` (flash "✓ Step complete");
- last step, more challenges remain → set `awaitingContinue` (panel shows "✓ {title} complete! Press Enter to continue", terminal input frozen); `continueToNext()` (Enter) then calls `loadChallenge(next)`, resetting FS + panes for its sandbox;
- last step of the last challenge → set `completed` (flash "✓ All challenges complete").

`checkCompletion()` early-returns while `completed || awaitingContinue` so the still-passing last step doesn't re-fire during the gate.

It's invoked after every command and after **structural** pane/window mutations (`splitPane`/`closePane`/`resizePane`/`newWindow`/`closeWindow`/`renameWindow`) — not after pure focus ops (`setActivePane`/`focusDirection`/`cyclePane`/`selectWindow`/`cycleWindow`), which can't change a layout/git predicate. (`renameWindow` re-checks because the `windows-create` challenge gates a step on a window having a `name`.) Keep validators cheap — they run on every keystroke-completed command.

## Existing challenges (`src/challenges/registry.ts`)

`CHALLENGES` is an ordered, linear array — the player advances one at a time.
- **`panes-split`** (type `pane`) — reproduce a target layout (`(h L (v L L))`). `targetWindow` is built with the same pure `@tt/core/terminal/paneTypes` helpers (`makeWindow`/`makeLeaf`/`splitNode`) the player drives, so the `a`/`b` split ordering lines up; `isComplete` calls `paneTreeMatches()` (`src/lib/paneCompare.ts`, structural compare that ignores ids).
- **`windows-create`** (type `pane`, `targetWindows` → panel shows a Current/Target **window strip** via `WindowStripView`, not the pane-tree `SchematicView`) — open a 2nd then 3rd tmux window and rename one. Steps read `s.windows.length` for the count and `s.windows.some(w => !!w.name)` for the rename; no FS seed (`setup: (base) => base`). Uses `>=` so overshoot doesn't strand the player. `targetWindows` is three `makeWindow`s with one named `logs`; the strip diagram shows count + labels (ids don't matter).
- **`git-first-commit`** (type `git`) — stage + commit in `gitRepoPath`, validated against `@tt/core`'s git engine state via `src/lib/gitState.ts`.
- **`rm-bomb`** (type `fs`, `fsWatchPath` → panel shows the `~/work` subtree via `FsTreeView`) — `find` then `rm` a nested `BOMB.md` without deleting its neighbors. `setup` seeds `BOMB.md` beside a sibling inside a nested dir plus other survivors; the single step's predicate is `fs.getNode(BOMB_PATH) === null && SURVIVORS.every(p => fs.getNode(p) !== null)`, so any `rm -rf` of `~/work` (or of `BOMB.md`'s own dir, which also takes the sibling) deletes a survivor and never passes. Because that soft-locks the run, the panel exposes a **Restart challenge** button wired to the store's `restartChallenge()` (re-runs `loadChallenge(challengeIndex)` to re-seed the current sandbox).

## Adding a challenge

1. Create `src/challenges/<id>.ts` exporting a `Challenge`. Write `setup` to seed only what the challenge needs on top of `buildPuzzleFs()`. For pane challenges build `targetWindow` with `paneTypes` helpers (don't hand-author ids — the compare ignores them). For git challenges set `gitRepoPath` and read state via `gitState.ts`.
2. Author each `Step` with a clear `instruction` and a pure `isComplete` predicate over `PuzzleSnapshot`.
3. Append it to `CHALLENGES` in `registry.ts` (order = play order).
4. Cover it in `src/__tests__/challenges.test.ts`, then `npm run typecheck` + `npx vitest run`.
