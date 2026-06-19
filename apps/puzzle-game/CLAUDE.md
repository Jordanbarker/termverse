# Puzzle Game (`@tt/puzzle-game`)

A terminal-skills puzzle game built **entirely on `@tt/core`** to prove the engine-reuse pattern. basePath `/terminal-turmoil/puzzle-game`. Run via `npm run dev:puzzle` / `npm run build:puzzle`.

> Monorepo-wide context (`@tt/core`, tech stack, deploy) lives in the repo-root `.claude/CLAUDE.md`. The shared engine skills `tmux` and `commands` (both apply to `@tt/core`) are at root; this app's own skill is `apps/puzzle-game:challenges`.

**It does NOT import terminal-turmoil's story code** — no `useGameStore`, no `COMPUTERS`, no story flags, no `.tmux.conf` parsing, no emails/piper/chip. Keep it that way: anything shared must come through `@tt/core`, and `@tt/core/terminal/paneTypes` helpers must stay pure and store-agnostic so both apps share them.

## Structure (`apps/puzzle-game/src/`)

- **`challenges/`** — declarative challenge framework. `types.ts` (`Challenge`, `Step`, `PuzzleSnapshot`), `registry.ts` (ordered `CHALLENGES[]`), and one file per challenge (`panes-split.ts`, `windows-create.ts`, `git-first-commit.ts`, `rm-bomb.ts`). See the `apps/puzzle-game:challenges` skill.
- **`state/puzzleStore.ts`** — lean Zustand store. Ports `@tt/core` window/pane actions (`splitPane`/`focusDirection`/`cyclePane`/`newWindow`/`selectWindow`/`cycleWindow`/`closeWindow`/`renameWindow`) and drives win-detection via `checkCompletion()` (called after every command + pane mutation). `restartChallenge()` re-seeds the current challenge (recover from destructive dead-ends like `rm -rf`).
- **`components/`** — `PuzzleShell.tsx` (layout), `PuzzleTerminal.tsx` (trimmed xterm renderer; lifts window/prefix/rename state, keeps non-active windows alive via `display:none`), `PuzzleTabBar.tsx` (trimmed tmux status line with a pulsing `PREFIX` indicator, `idx:label (paneCount)` tabs, `x`/`+` controls), `ChallengePanel.tsx` (+ a Restart-challenge button) + `SchematicView.tsx` (pane-tree target readout) + `WindowStripView.tsx` (window-strip target readout for window-count challenges) + `FsTreeView.tsx` (filesystem-subtree readout for `fs` challenges).
- **`hooks/usePuzzleTerminal.ts`** — wires xterm to the store; `buildSuggestionContext()` feeds the shared `@tt/core/suggestions` engine (commands from `getCommandList()` since there's no flag gating).
- **`lib/`** — `lineSuggest.ts` (lean ANSI suggestion renderer: ghost text, accept-on-Right-arrow, columnar completion menu with cycling, tailored to the puzzle's end-of-line input model — distinct from the main game's mid-line `useCommandLine`), `machine.ts` (`PUZZLE_MACHINE`/`HOME_DIR`), `seed.ts` (`buildPuzzleFs()`), `gitState.ts` (git readout for the panel), `paneCompare.ts` (structural pane-tree compare, ignores ids), `windowLabel.ts` (status-line label derivation shared by `PuzzleTabBar` and `WindowStripView`).

## Window/pane UX

Mirrors the live game's multi-window model on a **static theme** (no `~/.tmux.conf`, no home PC): chords `<prefix> c/n/p/1-9/r` (new/cycle/jump/rename; `.`/`,` alias next/prev) alongside pane chords `| - o x` + arrow focus. Prefix = Ctrl+Space. Keep-alive logic mirrors `TabManager.tsx`.
