---
name: challenges
description: "How term-crunch's declarative challenge framework and state-based win-detection work (apps/term-crunch). Use this skill whenever adding or modifying a term-crunch challenge, changing win-detection, or touching files under apps/term-crunch/src/challenges/, the store's checkCompletion in apps/term-crunch/src/state/gameStore.ts, or the compare/seed helpers in apps/term-crunch/src/lib/."
---

# Challenge Framework

Term Crunch (`@tt/term-crunch`) is a sequence of self-contained challenges, each a pure declarative definition, grouped into selectable **categories** (tracks). Win-detection is **live and state-based**: after every command and pane mutation the store re-derives a read-only snapshot and asks the current step's predicate whether it is satisfied. No scripted commands, no event log — just "does the current state match?".

This app is built only on `@tt/core` and does **not** import termoil story code. See `apps/term-crunch/CLAUDE.md` for the surrounding structure.

## The shape (`src/challenges/types.ts`)

- **`ChallengeSnapshot`** — the slice of state a validator may read, built fresh by `checkCompletion`:
  `{ activeWindow: WindowState; windows: WindowState[]; fs: VirtualFS; cwd: string }`.
- **`Step`** — `{ instruction: string; hint?: string; command?: string; isComplete: (s: ChallengeSnapshot) => boolean }`. The predicate must be **pure** (read-only over the snapshot). **Objective-first + progressive-hint convention:** `instruction` states the sub-goal, NOT the command — never bake the answer into it; `hint` (conceptual nudge) and `command` (the literal command) are the two hint levels the panel reveals only on request.
- **`Challenge`** — `{ id, title, type: "pane" | "git" | "fs", brief?, steps: Step[], setup(base) => VirtualFS, targetWindow?, targetWindows?, gitRepoPath?, fsWatchPath?, commands? }`.
  - `brief?: string` — the persistent scenario + overall objective, shown by `ChallengePanel` above the current step so the player always sees the whole task (command-free). Omitted = the panel shows only the current step's `instruction` (the pane/fs challenges do this). Rendered via `StepGoal` in `ChallengePanel.tsx`, which owns the hidden-by-default hint reveal (local `hintLevel` state, reset on every step/challenge change).
  - `setup` seeds the challenge FS on top of `buildBaseFs()` (`src/lib/seed.ts`).
  - Pane challenges set `targetWindow`/`targetWindows` (the RIGHT-hand schematic the player reproduces).
  - Git challenges set `gitRepoPath` (where the validators point — and the player's **starting cwd**: `loadChallenge` opens the window at `gitRepoPath ?? HOME_DIR`, so git challenges spawn *inside* the seeded repo, no `cd` needed).
  - FS challenges set `fsWatchPath` (the directory the panel renders as a tree via `FsTreeView`).
  - `commands?: string[]` — per-challenge **command allowlist** (primary names; aliases resolve via `getPrimaryName`). When set, only these commands appear in `help` + TAB/ghost-text suggestions and run; everything else prints a friendly hint (exit 127). Omit it for allow-all. `help` and `clear` are **always** available. Enforced by the `AvailabilityPolicy` in `src/lib/availabilityPolicy.ts` (registered as a side-effect import in `hooks/useTerminal.ts`), which resolves the current challenge from the store via `getCategory(activeCategory).challenges[challengeIndex]` (the index is **category-relative** — see Categories below).

## Categories (`src/challenges/categories.ts`)

The player picks a **track** from a panel dropdown. Categories are pure filters over the linear `CHALLENGES` registry, derived from each challenge's `type` — no per-challenge data: `all` (the full registry, in order), `panes` (type `pane`), `git` (type `git`), `fs` (type `fs`). `CATEGORIES` is the static list, `SELECTABLE_CATEGORIES` drops any empty group (for the dropdown), and `getCategory(id)` looks one up with a safe fallback to `all` (covers a stale persisted id).

The store's `challengeIndex` is **relative to the active category's `challenges` list**, not the global registry. Anything resolving the current challenge must go through `getCategory(activeCategory).challenges[challengeIndex]` (store `loadChallenge`/`checkCompletion`, `ChallengePanel`, `availabilityPolicy`) — never `CHALLENGES[challengeIndex]`. `selectCategory(id)` sets `activeCategory` then `loadChallenge(0)` to start that track fresh. Default track is `DEFAULT_CATEGORY` (`"all"`), which mirrors registry order — so a global index still resolves correctly under the default (e.g. tests that `loadChallenge(CHALLENGES.findIndex(...))`).

## Win-detection (`src/state/gameStore.ts`)

State: `activeCategory` + `challengeIndex` (category-relative) + `stepIndex` + `awaitingContinue` (completion-gate flag). `checkCompletion()` resolves `group = getCategory(activeCategory)`, builds a `ChallengeSnapshot`, runs `group.challenges[challengeIndex].steps[stepIndex].isComplete(snap)`, and:
- not satisfied → return;
- more steps remain → advance `stepIndex` (flash "✓ Step complete");
- last step, more challenges remain **in the group** → set `awaitingContinue` (panel shows "✓ {title} complete! Press Enter to continue", terminal input frozen); `continueToNext()` (Enter) then calls `loadChallenge(next)`, resetting FS + panes for its sandbox;
- last step of the last challenge **in the group** → set `completed` (flash "✓ All challenges complete"). The gate length is `group.challenges.length`, so a single-challenge track (e.g. `git`) completes immediately rather than showing a continue gate.

`checkCompletion()` early-returns while `completed || awaitingContinue` so the still-passing last step doesn't re-fire during the gate.

On the last-step branches it also captures timing: `elapsed = Date.now() - challengeStartTime` (stamped by `loadChallenge`), sets `lastElapsedMs`/`lastWasBest`, and updates `bestTimes[challenge.id]` when it beats the prior best. `bestTimes` (keyed by `challenge.id`, so it is category-independent and carries across tracks) and `activeCategory` are the persisted fields (zustand `persist`, `name: "term-crunch-progress"`); the panel shows the live/best time via `formatElapsed` (`@tt/core/lib/format`).

It's invoked after every command and after **structural** pane/window mutations (`splitPane`/`closePane`/`resizePane`/`newWindow`/`closeWindow`/`renameWindow`) — not after pure focus ops (`setActivePane`/`focusDirection`/`cyclePane`/`selectWindow`/`cycleWindow`), which can't change a layout/git predicate. (`renameWindow` re-checks because the `windows-create` challenge gates a step on a window having a `name`.) Keep validators cheap — they run on every keystroke-completed command.

## Existing challenges (`src/challenges/registry.ts`)

`CHALLENGES` is an ordered, linear array — the player advances one at a time. One file per challenge; each file's comments explain its own seed data and predicate gotchas. Read the file before changing a challenge.

- **`panes-split`** (pane) — reproduce a target pane layout; compared via `paneTreeMatches()` (`src/lib/paneCompare.ts`).
- **`windows-create`** (pane) — open/rename tmux windows; uses `targetWindows` + `WindowStripView` instead of the pane-tree schematic.
- **`git-first-commit`** (git) — stage + commit; validated via `src/lib/gitState.ts`.
- **`git-stash`** (git) — stash → branch-hop → pop; seed blocks the checkout until stashed.
- **`git-pull-ff`** (git) — `stash -u` → `pull --ff-only` → pop; seed mechanics (tracking refs, dirty tree) are documented in the file. Engine support: see the `git` skill.
- **`git-rebase`** (git) — rebase with a guaranteed conflict, resolved in `nano`. Engine support: see the `git` skill.
- **`rm-bomb`** (fs) — find + delete one file while survivors must remain; destructive, so the Restart button matters.
- **`chmod-perms`** (fs) — unlock an unreadable file; trap: the predicate checks `permissions[6]` (the "other" read bit) — see the file's setup docstring.

## Adding a challenge

1. Create `src/challenges/<id>.ts` exporting a `Challenge`. Write `setup` to seed only what the challenge needs on top of `buildBaseFs()`. For pane challenges build `targetWindow` with `paneTypes` helpers (don't hand-author ids — the compare ignores them). For git challenges set `gitRepoPath` and read state via `gitState.ts`.
2. Author each `Step` objective-first (see the shape above), set a challenge `brief` for the overall scenario, and add a pure `isComplete` predicate over `ChallengeSnapshot`.
3. Predicate conventions:
   - Use `>=`, not `===`, for count-style goals so overshoot doesn't strand the player.
   - A state predicate can't observe a read-only command (e.g. a `cat`) — gate on the state change that enables it, and let the read be the payoff.
   - Check what the engine actually enforces, not what looks right (e.g. `VirtualFS.readFile` gates on the "other" permission bit).
   - If a wrong move can soft-lock the sandbox (destructive challenges), make sure `restartChallenge()` recovers it — the panel's Restart button re-seeds via `loadChallenge(challengeIndex)`.
4. Put challenge-specific mechanics (seed quirks, predicate gotchas) in **comments in the challenge file**, not in this skill — docs point, code explains.
5. Set `commands` to the allowlist the player needs (primary names; `help`/`clear` are implicit). Keyboard-only challenges use `[]`; omit the field only if you genuinely want every builtin available.
6. Append it to `CHALLENGES` in `registry.ts` (order = play order). Its `type` decides which category it lands in automatically (`categories.ts` filters on it) — no edit there unless you're adding a brand-new category.
7. Cover it in `src/__tests__/challenges.test.ts`, then `npm run typecheck` + `npx vitest run`.
