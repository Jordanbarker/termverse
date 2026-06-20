---
name: tmux
description: "How the in-game tmux multiplexer works — the window/pane binary tree, prefix bindings, copy mode, status line, and ~/.tmux.conf parsing (prefix/theme/keybindings). The pure pane model lives in the SHARED @tt/core engine (@tt/core/terminal/paneTypes + PaneDividers) and is reused by both apps/terminal-turmoil and apps/puzzle-game. Use this skill whenever modifying windows/panes, split/resize/focus logic, copy mode, the tmux status bar, or touching paneTypes.ts, the Terminal components (TabManager/TabBar/PaneDividers), the terminal engine (tmuxConfig/copyMode/ansiPalette), or the home ~/.tmux.conf in apps/terminal-turmoil/src/story/filesystem/home/dotfiles.ts."
---

# Tmux Multiplexer

The terminal is a faithful tmux model: **windows** (the tabs in the status line, up to `MAX_WINDOWS=5`) each own a **binary tree of panes**, and each pane (`PaneLeaf`) is a full shell with its own xterm instance, cwd, computerId, and session. `tabs_unlocked` is set `true` in `createInitialState()`, so windows/panes/copy-mode are available from game start.

This skill covers the pane tree model, the Zustand window/pane state and actions, the hardcoded prefix chords, the live `~/.tmux.conf` parsing (prefix/theme/keybindings), repeat-mode resize, copy mode, and how the panes are rendered into xterm.

> **Shared engine:** the pure pane model + helpers live in `@tt/core/terminal/paneTypes` and `PaneDividers` in `@tt/core/components/PaneDividers` (see the Architecture map below for the full core-vs-app split). These are reused by the second app `apps/puzzle-game`, which ports the window/pane actions into its own lean store (`puzzleStore.ts`) and a trimmed renderer (`PuzzleTerminal.tsx`) + a thin status-line wrapper (`PuzzleTabBar.tsx`). Both games render the **same** status line and rename prompt from core: `@tt/core/components/TmuxStatusBar` (PREFIX indicator, `idx:label (paneCount)` tabs, modal takeover, app-injected `trailing` control), `@tt/core/terminal/windowLabel` (tab labels), and `@tt/core/terminal/useRenameWindowPrompt` (the `(rename-window)` keystroke handling). The puzzle mirrors the live game's multi-window UX: chords `<prefix> c/n/p/1-9/r` (new/cycle/jump/rename; `.`/`,` alias next/prev) alongside the pane chords `| - o x` + arrow focus. Its status line uses a **static theme** (no `~/.tmux.conf` parsing — there's no home PC), and prefix/keep-alive logic mirrors `TabManager.tsx` (cross-window `liveIds`, `display:none` for non-active windows so buffers persist). Keep `paneTypes` helpers pure and store-agnostic so both apps can share them.

## Architecture

```
# SHARED ENGINE — @tt/core (used by both apps)
packages/core/src/terminal/
├── paneTypes.ts                # PURE tree model + helpers (no React, no store) (__tests__/)
├── tmuxConfig.ts               # parseTmuxPrefix / parseTmuxTheme / parseTmuxBindings (__tests__/)
├── copyMode.ts                 # CopyModeController (per-pane vi-style scroller/yanker)
├── windowLabel.ts              # PURE status-line label derivation (host:dir, (n) count) (__tests__/)
├── renameWindowPrompt.ts       # PURE applyRenameKey reducer for the rename prompt (__tests__/)
├── useRenameWindowPrompt.ts    # React hook wrapping applyRenameKey (refs/state + onCommit)
└── ansiPalette.ts              # ANSI_COLORS — single source of truth for xterm + status-bar colors

packages/core/src/components/
├── PaneDividers.tsx            # Draggable seams overlaying split boundaries
└── TmuxStatusBar.tsx           # Shared tmux status line (PREFIX indicator, tabs, modal takeover, trailing slot)

# APP — apps/terminal-turmoil/src (the narrative game's store + renderer)
apps/terminal-turmoil/src/state/
└── gameStore.ts                # windows[] + activeWindowId state, all window/pane actions

apps/terminal-turmoil/src/components/Terminal/
├── TabManager.tsx              # Orchestrator: prefix handling, xterm pane lifecycle, layout, copy-mode UI
└── TabBar.tsx                  # thin wrapper over @tt/core TmuxStatusBar (injects the multi-computer "+" dropdown)

apps/terminal-turmoil/src/story/filesystem/home/
└── dotfiles.ts                 # The player's ~/.tmux.conf (prefix, pane binds, status colors)
```
(The second app, `apps/puzzle-game`, ports the same `@tt/core` model into its own `puzzleStore.ts` + `PuzzleTerminal.tsx`/`PuzzleTabBar.tsx`.)

## Core Types (`paneTypes.ts`)

```ts
type SplitDirection = "h" | "v";          // "h" = side-by-side (vertical divider), "v" = stacked

interface PaneLeaf  { id: string; computerId: ComputerId; cwd: string; }
interface PaneSplit { id: string; direction: SplitDirection; ratio: number; a: PaneNode; b: PaneNode; }
type PaneNode = PaneLeaf | PaneSplit;      // the whole window tree
interface WindowState { id: string; root: PaneNode; activePaneId: string; name?: string; } // name = custom tmux rename-window label
```

- `ratio` is the fraction of the parent box allocated to child `a` (`b` gets `1 - ratio`).
- `MIN_PANE_RATIO = 0.1` clamps splits so no pane shrinks below 10% of its parent box.
- IDs are deterministic per session via `nextPaneId()` / `nextSplitId()` / `nextWindowId()` (`pane-N`, `split-N`, `win-N`). `resetPaneIdCounters()` runs on game reset/load so IDs match across save/restore.

### Persistence
`SavedWindowState = { root: SavedPaneNode; activePaneIndex: number; name?: string }` — the saved tree carries **no IDs**, and focus is stored as the **DFS leaf index** so it survives ID regeneration. `serializeWindow(w)` drops IDs + converts the active pane to its leaf index (and carries `name` when set); `rebuildWindow(s)` regenerates fresh IDs and restores focus + `name` from the saved shape. (See the **save** skill: `SaveData.windows` + `activeWindowIndex`.)

## Tree helpers (`paneTypes.ts`)

All helpers are **pure** — query functions read, edit functions return a new tree. Never mutate a `PaneNode` in place.

**Query:** `allLeaves(node)` (DFS L→R), `firstLeaf(node)`, `findLeaf(node, id)`, `findSplit(node, id)`, `paneRects(node, x?, y?, w?, h?)` (each leaf's `{x,y,w,h}` rect in [0,1] space), `nodeBox(node, id, ...)` (bounding box of any node — used by resize + dividers), `focusDirectionTarget(root, fromId, dir)` (tmux `select-pane -L|R|U|D`: nearest pane in a direction whose perpendicular span overlaps), `nextLeafId(root, fromId)` (DFS cycle for `o`), `nearestResizableSplit(root, paneId, orientation)` (closest ancestor split resizable in `"h"`/`"v"`).

**Edit (return new tree):** `makeLeaf` / `makeWindow`, `mapLeaf(node, id, fn)` (replace one leaf — used by `setPaneCwd`/`setPaneComputer`), `splitNode(root, paneId, dir, newLeaf)` → `{root, newPaneId}` (original becomes child `a`, new leaf `b`, 50/50), `collapsePane(root, paneId)` (promote sibling; `null` if it was the only child), `prunePanesByComputer(root, downed, protectedId)` (drop panes on downed computers, collapse emptied splits), `setSplitRatio(root, splitId, ratio)` (clamped), `nudgeSplitRatio(root, splitId, delta)` (clamped delta — used by keyboard resize binds).

## Store state & actions (`gameStore.ts`)

State is `windows: WindowState[]` + `activeWindowId`. The focused leaf is each window's `activePaneId`.

**Derivations** (exported from `gameStore.ts`): `getActiveWindow(state)`, `getActivePaneId(state)`, `getActiveLeaf(state)`.

**Constants:** `MAX_WINDOWS = 5`, `MAX_PANES_PER_WINDOW = 6`.

| Action | Effect |
|---|---|
| `addWindow(computerId, cwd)` | New window; returns new id, or current id if at `MAX_WINDOWS` |
| `removeWindow(windowId)` | Close a window (always keeps ≥1) |
| `setActiveWindow(windowId)` | Switch focused window |
| `renameWindow(windowId, name)` | Set a custom window name (tmux rename-window); empty/whitespace clears it back to the derived label |
| `splitPane(paneId, dir)` | Split focused pane; returns new pane id, or `null` if at `MAX_PANES_PER_WINDOW` |
| `closePane(paneId)` | Kill pane; closes window if it's the last pane (unless only window) |
| `setActivePane(paneId)` | Focus a pane + activate its window |
| `focusDirection(dir)` | Geometric select-pane via `focusDirectionTarget` |
| `cyclePane()` | Focus next pane in DFS order (`o`) |
| `resizePane(splitId, ratio)` | Set a split ratio directly (divider drag) |
| `nudgeSplitRatio(splitId, delta)` | Adjust a ratio by a delta (keyboard resize binds) |
| `setPaneCwd` / `setPaneComputer` / `setActivePaneCwd` / `setActivePaneComputer` | Retarget a pane's cwd/computer |
| `closePanesForComputers(ids)` | Teardown: prune panes on downed boxes, active pane preserved |
| `closeOtherPanes()` | Collapse to a single pane (shutdown/reboot) |

CWD is per-pane; the active computer is derived from the active pane's `computerId`. See the rules doc for how `exit`/end-of-day/`shutdown` use the teardown actions.

## Prefix bindings

The prefix key arms "prefix mode" (default Ctrl+Space); the next key fires an action. **Split/window chords are hardcoded** in `TabManager.handleCtrlBAction(key)` (gated on `storyFlags.tabs_unlocked`; control chars are normalized — ASCII 1-26 → lowercase a-z):

| `<prefix>` + | Action |
|---|---|
| `\|` | `splitPane(activePaneId, "h")` — side-by-side |
| `-` | `splitPane(activePaneId, "v")` — stacked |
| `o` | `cyclePane()` |
| `c` | `addWindow(...)` (new window on active pane's computer) |
| `r` | Rename the active window via an inline `(rename-window) <text>` text prompt in the status bar (type, Backspace edits, Enter applies via `renameWindow`, Esc/Ctrl+C cancels; empty Enter reverts to the derived label). Keystrokes are handled by the shared `@tt/core/terminal/useRenameWindowPrompt` hook |
| `x` | Kill **focused pane** via a `confirm-before` `kill-pane? (y/n)` prompt in the status bar (blocked if it's the only pane of the only window) |
| `n` / `.` | Next window |
| `p` / `,` | Previous window |
| `1`–`5` | Jump to window N (**window**-indexed, 1-based) |
| `[` | Enter copy mode on the focused pane (handled in the pane's key path, not `handleCtrlBAction`) |

tmux defaults `%` / `"` are intentionally **not** bound. Pane **focus** and **resize** chords (e.g. `hjkl` / `HJKL`) are *not* hardcoded — they come from `~/.tmux.conf` via `parseTmuxBindings` (below).

## `~/.tmux.conf` parsing (`tmuxConfig.ts`)

Parsed **live** from the home PC's `~/.tmux.conf` only (your local terminal config governs the multiplexer regardless of which box a pane is on), memoized in `TabManager`. Later directives override earlier ones; malformed/unsupported tokens are ignored and the field keeps its default.

- **Prefix** — `parseTmuxPrefix(conf) → TabPrefix { char, label }`. `char` is the control char (`\x00` for Ctrl+Space, `\x02` for Ctrl+B); `label` is the display string. `keyTokenToControlChar("C-Space"|"C-a".."C-z")` maps tokens to ASCII control chars (rejects `M-`, `F1`, `C-1`, …). `DEFAULT_TAB_PREFIX = { char: "\x00", label: "Ctrl+Space" }`. The label reaches `help` via `CommandContext.tabPrefixLabel`.
- **Theme** — `parseTmuxTheme(conf) → TabBarTheme` with `statusBg/Fg`, `currentBg/Fg`, `windowBg/Fg`, `leftBg/Fg`. Reads `status-style` / `window-status-current-style` / `window-status-style` / `status-left-style` (modern `bg=X,fg=Y` and legacy `status-bg`/`status-fg`). `resolveTmuxColor(token)` resolves named ANSI colors (case-insensitive) against `ANSI_COLORS`, passes through hex, maps `default → transparent`, returns `null` if unresolvable. Fallback is `DEFAULT_TAB_BAR_THEME`.
- **Pane binds** — `parseTmuxBindings(conf) → TmuxBindings` (`Record<singleChar, PaneBinding>`). A `PaneBinding` is `{ kind: "focus", dir }` (from `bind [-r] <key> select-pane -L|-R|-U|-D`) or `{ kind: "resize", dir, cells, repeat }` (from `bind [-r] <key> resize-pane -L|-R|-U|-D [N]`). `PaneDir = "L"|"R"|"U"|"D"`; only single-char keys; `-r` marks the bind repeatable; `DEFAULT_RESIZE_CELLS = 5` when no amount given.

## Repeat-mode resize (`TabManager.tsx`)

`-r` binds auto-fire while held without re-pressing the prefix, for `REPEAT_MS = 500` after the last press. `armRepeat()`/`clearRepeat()` manage `repeatModeRef` + the timer (and keep the status bar "hot"). `applyResize(binding)` converts a cell-based step to a ratio delta: find `nearestResizableSplit` for the bind's orientation, compute the focused pane's cell px and the split box px (via `nodeBox` + the wrapper size), then call `nudgeSplitRatio` (R/D grow child `a`, L/U shrink it).

## Copy mode (`copyMode.ts`)

Each pane owns its own `CopyModeController`. `<prefix> [` enters it on the focused pane; it sits **outside** the shell (all keys are consumed before reaching the session) and works over any session — inline sessions navigate real scrollback, alt-screen sessions (`nano`/`less`/`piper`, per `sessionUsesAltScreen()`) are confined to the visible screen and get a `resize()` redraw on exit.

- **Keys** (vi-style): `h/j/k/l` + arrows (wraps at line ends), `0`/`Home` + `$`/`End` (sticks to EOL), `g`/`G` (top/bottom), `Ctrl+U`/`Ctrl+D` (half-page), `v` (toggle selection anchor), `y`/`Enter` (yank → clipboard), `q`/`Escape`/`Ctrl+C` (exit), `?` (toggle the key-hint overlay).
- **Callbacks:** `onChange(active)` (re-renders alt-screen sessions on enter/exit), `onYank(text)` (caller owns clipboard via `src/lib/clipboard.ts` + toast), `onToggleHelp()` (flips the store's `copyModeHelpHidden`, which is persisted).

## Rendering wiring (`TabManager.tsx` / `PaneDividers.tsx` / `TabBar.tsx`)

Rendering is **hybrid**: xterm pane containers are imperative, long-lived, keyed by pane id, and positioned **absolutely** from `paneRects(activeWindow.root)` (avoids the canvas re-parenting a nested-flex tree would cause). Only the active window's panes are visible (others `display:none`). A single wrapper `ResizeObserver` + a layout effect fits every visible pane and calls `resizePaneSession(paneId)` on size change. The active pane shows a 1px accent outline; clicking fires `setActivePane` + `term.focus()`.

**Single-focused-xterm invariant:** `sessionMapRef` and the global cwd/computer refs are keyed on `activePaneId`, so input routes to the right session — keep this invariant when touching focus logic.

`PaneDividers.tsx` overlays one draggable seam per split (computed from the tree, positioned via `nodeBox`); drag converts client coords → ratio and calls `resizePane(splitId, ratio)`. A seam bordering the active pane splits half/half — gold (`#e6b450`) flush to the active pane's edge, grey (`#3d4751`) on the inactive neighbour's — so each side shows which pane owns it; other seams are a single dim line that goes gold on hover/drag. The status line is the shared `@tt/core/components/TmuxStatusBar` (window labels via `@tt/core/terminal/windowLabel`: a custom `name` if set, else `index:host:dir` + `(n)` pane count, `*` on current); `TabBar.tsx` wraps it, passing its store-derived props and injecting the "+" dropdown (home plus only machines with an open pane) as the `trailing` slot. Two prompts take over the bar via the shared component's `modalText` prop: the `<prefix> x` `kill-pane? (y/n)` confirm (TT-only, gated in `onData` by `closeConfirmRef`) and the `<prefix> r` `(rename-window) <text>` input, whose keystrokes are owned by the shared `useRenameWindowPrompt` hook (`handleData` consumes keys in `onData`; `begin` opens it; `prompt` feeds `modalText`).

## Adding / Extending

- **New prefix chord:** add a branch in `TabManager.handleCtrlBAction` keyed on `key`/`normalized`; call the matching store action.
- **New `.tmux.conf`-driven bind:** the focus/resize parser already covers `select-pane`/`resize-pane`. For a brand-new directive, extend `parseTmuxBindings` (or a new parser) + its `PaneBinding` variant, and add tests in `packages/core/src/terminal/__tests__/tmuxConfig.test.ts`.
- **Theme colors:** add named colors to `ANSI_COLORS` (keeps xterm + status bar in sync); extend `parseTmuxTheme`/`TabBarTheme` for new style targets.
- **New status-bar element / modal:** edit the shared `@tt/core/components/TmuxStatusBar` so **both** apps inherit it; pass app-specific bits as props or via the `trailing` slot, and route a new takeover through the `modalText` prop. (TT's multi-computer "+" dropdown stays app-side as the `trailing` node.)
- **New copy-mode key:** add it to the `CopyModeController` keydown handler.
- **Tree changes:** keep `@tt/core/terminal/paneTypes` helpers pure and add cases to `apps/terminal-turmoil/src/state/__tests__/paneTypes.test.ts`. Wire new tree edits through a `gameStore.ts` action (never mutate the tree in components).

Run `npm run typecheck` and `npx vitest run` after changes (per CLAUDE.md). The unit tests cover the pure tree model but **not** rendering — for visual changes to `PaneDividers`/splits/focus, also run the browser harness `npm run screenshot:panes` (needs a dev server up; `scripts/visual/pane-dividers.mjs`). It drives the rendered terminal via tmux chords, screenshots single → h-split → 2×2 layouts into `screenshots/` (gitignored), and asserts the gold/grey active-pane seam coloring from the live DOM. Point it elsewhere with `TT_URL` (e.g. the puzzle-game dev server).

## Design Principles

- **Immutable, pure tree** — `paneTypes.ts` has no React/store deps; edits return new nodes (enables React re-renders + clean tests).
- **Windows vs panes** — windows are the tmux tabs; panes are the binary-tree subdivisions inside a window.
- **Prefix-driven UI** — the prefix arms a one-shot mode; split/window chords are hardcoded, focus/resize binds are config-driven.
- **`.tmux.conf` is live game state** — prefix, pane binds, and status colors come from the player's home dotfile, parsed at runtime (no restart).
- **Copy mode sits outside the shell** — a per-pane controller that consumes keys before the session.
- **Single-focused-xterm invariant** — session routing and global refs key on `activePaneId`.
