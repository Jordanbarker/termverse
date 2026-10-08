---
name: play-testing
description: "Headless runner for programmatically play-testing term-crunch challenges without a browser, plus a Playwright recipe for browser-driving the real game. Use this skill whenever using or modifying apps/term-crunch/scripts/play.ts or playtest_tracks.ts, manually play-testing term-crunch from the terminal, or verifying challenge/gate/pane behavior in the browser."
---

# Headless Runner (term-crunch)

`apps/term-crunch/scripts/play.ts` exports **`CrunchRunner`** plus an interactive REPL (`npm -w @tt/term-crunch run play`, or the root `npm run play:crunch`). Unlike termoil's `GameRunner`, it is a **thin shim over the real code** rather than a reimplementation of the browser loop — the header comment at `scripts/play.ts:3-21` explains why and lists both structural limitations. Read the class for its API; conventions and traps:

- **No duplicated state** — read everything from `runner.store` (`useGameStore.getState()`). `runner.challenge` resolves the current challenge through the active **category** (never `CHALLENGES[challengeIndex]` — see the `challenges` skill's index trap).
- `run(line)` is async and returns `{ output, rawOutput, startSession }`. Navigation helpers (`goto`, `track`) go through `run`, so they exercise the real meta commands; `gotoId(id)` is the direct store jump for test setup.
- `grade(1-4 | Grade)` answers the completion gate (`continueToNext`), returning false when no gate is up. Grading is what advances to the next challenge. Mastery awards are echoed by a store subscription watching `lastAwards` (MP lands at completion time inside `checkCompletion`, not at the grade).
- Scripts import `./localStorageStub` **before** the store so persist neither warns nor writes a real file. Keep that import first in any new script.

**Two limitations to plan around** (rationale in the file header):
- **Keyboard chords are bypassed** — drive the store actions the chords call (`split`, `killPane`, `focus`/`cyclePane`/`focusPaneAt`, `resize`, `newWindow`, `cycleWindow`, `renameWindow`). `resize(dir, steps)` is a fixed `MAX_NUDGE_RATIO` nudge, not the real cell-geometry delta. Copy mode isn't reachable at all — drive the observable outcome (e.g. the `mkdir` that spends the yanked token) and verify the yank itself in the browser.
- **Editor/pager sessions can't be driven** — `writeFile(path, content)` is the editor stand-in when a predicate only reads the saved file.

## Track playtest

`scripts/playtest_tracks.ts` (`npm -w @tt/term-crunch run playtest`, part of the root `npm run playtest` / `npm run check` gate) plays **every** registry challenge end to end with a fresh runner each: asserts step 1 isn't satisfied at load and `failure` is null, plays the declared solution, then asserts no `failed` predicate tripped, the gate rose, a best time was recorded, grading fed `reviewStats`, and the grade handed over to the next challenge. Solutions live in `SOLUTIONS` keyed by challenge id — a command string or a function driving the runner. **Every new challenge needs an entry**, or a `SKIPPED` entry with a reason — a challenge with neither fails the playtest, so coverage can't silently lapse.

This complements `src/__tests__/challenges.test.ts`, which pokes predicates with hand-built snapshots; the playtest drives the real pipeline + store + gate.

## Browser play-testing (Playwright)

The headless runner has no chord layer, no copy mode, no editor sessions and no React, so keybindings, the `ChallengePanel` readouts, cheat sheets and the Settings modal are browser-only. Playwright is a **root devDependency** (version pinned in the root `package.json`), so drive it from the repo root.

**Two committed harnesses already drive the browser** — extend them instead of writing a throwaway: `npm run screenshot:panes` (`scripts/visual/pane-dividers.mjs`) and `npm run screenshot:mp-reward` (`scripts/visual/mp-reward.mjs`). The latter is the pattern to copy for anything *time-dependent*: it seeds a save via `addInitScript` + localStorage (`term-crunch-progress`; the store deep-merges `mastery`) to reach deep states, runs an in-page rAF recorder so single-frame glitches can't hide between screenshots, and re-runs under `reducedMotion: "reduce"`.

**When headless passes and the browser fails, suspect the driver before the game.** Replaying the challenge's declared `SOLUTIONS` moves is the fastest discriminator. `SOLUTIONS` (and its `Move` type) are exported from `playtest_tracks.ts` (importing them does not start the playtest) — but only the string moves are browser-typeable; function moves drive store actions and must be translated to chords. Most browser-only "bugs" are a chord sent to the wrong pane, a click that never landed, or `innerText` hiding whitespace.

### Setup

- **Dev server:** term-crunch is on **:3001** under the full `npm run dev`, or **:3000** via `npm run dev:crunch` alone. Check `curl -s localhost:3001` before starting another.
- Fresh context = empty localStorage (key `term-crunch-progress`) → boot lands directly in challenge 1. **No nano tutorial, no transitions, no `cheat`** (that's termoil). Navigate with `goto N` / `track <id>` / `next` / `prev` / `review` (`restart` re-seeds the current one), or the panel dropdowns.
- Player is `player@crunch`, home `/home/player`.
- **Driving from an ad-hoc script:** imports need absolute paths; `@tt/core` resolves only with `npx tsx --tsconfig apps/term-crunch/tsconfig.json`; `playwright` needs an absolute path into the repo's `node_modules`; top-level `await` fails under the cjs transform (wrap in `async main()`). Write such scripts to the session scratchpad, not the repo.

### Game-side facts the driver must know

- **The grade gate freezes terminal input.** On completion the pane stops accepting typed input until a grade key (`1`-`4`, Enter = Good) is pressed — a driver that keeps typing will hang. Watch for the gate, press a grade, then continue (detection strings below).
- Every challenge starts attached to tmux session `"0"`; while detached, chords and the status bar are gone and `checkCompletion` is skipped for most challenges (rules in the `challenges` skill's win-detection section).
- The per-challenge command allowlist is real: an out-of-allowlist command reports as unavailable, and `help` lists only the permitted set.

### Driving xterm.js

Identical to termoil — **the trap list and driver skeleton live in the `apps/termoil:play-testing` skill**; read them there. Prefix is Ctrl+Space by default: `keyboard.down('Control'); press('Space'); up('Control')`, then the chord key.

### DOM map

- Layout is **terminal on the left, `ChallengePanel` `<aside>` on the right** (`w-[420px]`). The panel has **no data attributes — select by text**: the challenge title, `CURRENT`/`TARGET` headings, the brief, the step instruction, hint controls, `Settings`, and `Restart` (only while a challenge's `failed` message shows; otherwise type `restart`).
- Window tab bar is the shared `TmuxStatusBar` (same labels as termoil: `1:crunch:~ *`, `(n)` pane count).
- **Gate detection: match on the full panel text, not its tail** — the end-of-track banner sits *above* the cheat sheet. Strings (from `ChallengePanel.tsx`): `✓ <title> complete!` (mid-track gate), `Enter = Good` (the `GradeBar`), `🎉 All … challenges complete. Nicely done.` (end of track).

Screenshot after each step: the schematic readouts are the reviewer's evidence that a layout matched for the right reason.
