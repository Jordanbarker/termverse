---
name: tmux
description: "How the in-game tmux multiplexer works — the window/pane binary tree, prefix bindings, copy mode, status line, and ~/.tmux.conf parsing (prefix/theme/keybindings). The pure pane model lives in the SHARED @tt/core engine (@tt/core/terminal/paneTypes + PaneDividers) and is reused by both apps/termoil and apps/term-crunch. Use this skill whenever modifying windows/panes, split/resize/focus logic, copy mode, the tmux status bar, or touching paneTypes.ts, the Terminal components (TabManager/TabBar/PaneDividers), the terminal engine (tmuxConfig/copyMode/ansiPalette), or the home ~/.tmux.conf in apps/termoil/src/story/filesystem/home/dotfiles.ts."
---

# Tmux Multiplexer

A faithful tmux model: **windows** (tabs in the status line, up to `MAX_WINDOWS=5`) each own a **binary tree of panes**; each pane (`PaneLeaf`) is a full shell with its own xterm, cwd, computerId, and session. `tabs_unlocked` is `true` from game start.

## Session lifecycle (launch / detach / attach / kill)

The mux only exists while a **client is attached** to a named session. Both app stores hold `tmuxAttachedSession: {name, createdAt} | null` + `tmuxDetachedSessions: TmuxSessionSnapshot[]` (+ transient `pendingMuxNotice`); `windows[]` always renders the attached session's live windows, or one bare `makeWindow` shell when detached. "Server running" is **derived** (attached ≠ null or any detached snapshot) — never stored. Pieces:
- **Pure model** `@tt/core/terminal/tmuxSessions.ts` — `TmuxSessionSnapshot` (serialized `SavedWindowState[]`), `nextSessionName` (lowest unused integer), `snapshotSession`/`restoreSession` (detach = serialize, attach = rebuild with **fresh pane ids, fresh shells**; never reset id counters here), `formatTmuxLs`.
- **`tmux` builtin** `@tt/core/commands/builtins/tmux.ts` — pure handler validating against `CommandContext.tmux` (app-injected snapshot; detached sessions **most-recent-last**) and returning a fully resolved `CommandResult.tmuxAction` (`new-session`/`attach`/`detach`/`kill-session`/`kill-server`). Real-tmux errors (nested guard, `no server running`, `can't find session`, `duplicate session`). `computeEffects` passes `tmuxAction` through; each app's `applyTmuxAction(action): boolean` store action applies it (true = client view swapped → suppress the prompt; the fresh pane prints the one-shot `pendingMuxNotice` banner — `[detached (from session X)]`/`[exited]`/`[server exited]` — via `onPaneCreated`).
- **Router gate**: `tmuxInputRouter` option `muxEnabled()` (wired from `TabManagerExtensions.muxActive`, both apps: `!!attachedSession`) is checked **first** in `route()` — when detached the prefix char passes through to the shell, chords and copy mode are unreachable, and armed/repeat state is dropped.
- **`<prefix> d`** chord → `TabManagerAdapter.detachClient()` → same store path as `tmux detach`.
- **Kill rule** (real tmux): while attached, closing the last pane of the last window (`closePane`/`removeWindow`|`closeWindow`) kills the session and drops to the bare shell; on the bare shell it stays a no-op. termoil's `<prefix> x` confirm now shows even for the final pane.
- Gating: status bar/`PaneDividers`/shortcuts tab-block render only while attached (termoil additionally `tabs_unlocked && gamePhase==="playing"`); the `tmux` command itself is `tabs_unlocked`-gated in termoil (`commandGates.ts`) and `ALWAYS_AVAILABLE` in term-crunch. termoil attach **sanitizes** (prunes panes on machines with no `computerState` entry, falls back to a home window); crunch is single-machine. termoil persists both fields in the save (v19); crunch's are transient (reseeded attached-`"0"` by `loadChallenge`, and `checkCompletion` is skipped while detached). `createdAt` feeds only `tmux ls` — termoil sources it from the game clock (`createGameClock`), crunch from `Date.now()`.

## Core-vs-app split (the trap)

The **pure** model + helpers live in `@tt/core` and are reused by **both** apps — keep them pure and store-agnostic:
- `@tt/core/terminal/paneTypes.ts` — tree types (`PaneLeaf`/`PaneSplit`/`PaneNode`/`WindowState`) + pure helpers (query: `allLeaves`/`findLeaf`/`paneRects`/`nodeBox`/`focusDirectionTarget`/`nextLeafId`/`nearestResizableSplit`; edit-returns-new-tree: `splitNode`/`collapsePane`/`prunePanesByComputer`/`setSplitRatio`/`nudgeSplitRatio`/`serializeWindow`/`rebuildWindow`). **Read the types/signatures there — not mirrored here.** `MIN_PANE_RATIO=0.1`; IDs deterministic per session (`nextPaneId`/etc.; counters reset only before a TabManager mounts — never mid-session, or new panes collide with `knownPaneIdsRef` ids, get misclassified "restored", and swallow the mux banner).
- `@tt/core/terminal/{tmuxConfig,copyMode,windowLabel,renameWindowPrompt,useRenameWindowPrompt,ansiPalette,xtermDefaults}.ts`; `@tt/core/components/{PaneDividers,TmuxStatusBar}.tsx`.
- **`@tt/core/terminal/useTabManager.ts`** — the shared, store-agnostic pane orchestration hook: owns the per-pane xterm runtime map (create/dispose/position/fit), wrapper `ResizeObserver`, per-pane copy mode, memoized `.tmux.conf` parsing, rename prompt, cell→ratio resize, and the whole input pipeline. Apps inject store actions via a `TabManagerAdapter` and behavior differences via `TabManagerExtensions` (gates, intercepts, `onPaneCreated`/`onPaneDisposed`, `onShellData`) — read the interfaces there. Its key state machine (prefix arming, double-prefix literal, `-r` repeat window, conf-bind dispatch) is the **pure** `tmuxInputRouter.ts` (unit-tested; same pure-core+hook split as `renameWindowPrompt`).
- App side (thin adapters over the hook): `apps/termoil/src/state/gameStore.ts` (`windows[]` + `activeWindowId` state, all window/pane actions; derive the focused leaf via `getActiveWindow`/`getActivePaneId`/`getActiveLeaf`), `components/Terminal/{TabManager,TabBar}.tsx`, `story/filesystem/home/dotfiles.ts` (the player's `~/.tmux.conf`). `MAX_PANES_PER_WINDOW=6`.
- `apps/term-crunch` feeds the same hook from its own lean store (Settings-editable `~/.tmux.conf`); its extensions carry the challenge gate, per-pane `LineEditor`s, and editor/pager sessions. See its CLAUDE.md.

Persistence: `SavedWindowState` carries **no IDs** and stores focus as the **DFS leaf index** (survives ID regen); `serializeWindow`/`rebuildWindow` round-trip it (+ custom `name`). See the save skill.

## Prefix bindings (contract: hardcoded vs config-driven)

The prefix arms a one-shot mode (default Ctrl+Space). **Split/window chords are hardcoded** in the shared hook's chord table (`useTabManager.ts` `handleChord`; the router pre-normalizes control chars ASCII 1-26 → a-z and gates on `ext.chordsEnabled` — termoil: `tabs_unlocked`). Apps reroute individual chords via `ext.interceptPrefixKey` (termoil sends `x` to its confirm modal):

| `<prefix>` + | Action |
|---|---|
| `\|` / `-` | `splitPane(activePaneId, "h" \| "v")` — side-by-side / stacked; new pane inherits cwd+computer |
| `o` | `cyclePane()` |
| `c` | `addWindow(...)` (new window on active pane's computer) |
| `r` | rename active window via inline `(rename-window)` status-bar prompt → `renameWindow` (Enter applies, Esc cancels, empty reverts); keystrokes via `useRenameWindowPrompt` |
| `x` | kill focused pane via `confirm-before` `(y/n)` prompt (blocked if only pane of only window) |
| `n`/`.` , `p`/`,` | next / prev window |
| `1`–`9` | jump to window N (**window**-indexed, 1-based; capped by `ext.digitWindowMax` — termoil `MAX_WINDOWS=5`) |
| `[` | enter copy mode on the focused pane (handled in the pane key path) |

tmux defaults `%`/`"` are intentionally **not** bound. Pane **focus/resize** chords (`hjkl`/`HJKL`) are **not** hardcoded — they come from `~/.tmux.conf`.

## `~/.tmux.conf` parsing (`tmuxConfig.ts`)

Parsed **live** from the home PC's `~/.tmux.conf` only (your local terminal config governs the mux regardless of which box a pane is on), memoized inside `useTabManager`; later directives override earlier, malformed tokens keep the default. Three parsers: `parseTmuxPrefix` (→ `{char, label}`; `keyTokenToControlChar` maps `C-Space`/`C-a..z`, rejects `M-`/`F1`/`C-1`; default Ctrl+Space; label reaches the `shortcuts` builtin via `CommandContext.tabPrefixLabel`), `parseTmuxTheme` (→ `TabBarTheme`; reads modern `bg=/fg=` + legacy `status-bg`/`-fg`; `resolveTmuxColor` resolves named ANSI against `ansiPalette.ts`, passes hex, `default→transparent`; fallback `DEFAULT_TAB_BAR_THEME`), `parseTmuxBindings` (→ `Record<char, PaneBinding>`; `{kind:"focus",dir}` from `bind [-r] <key> select-pane -L/R/U/D`, `{kind:"resize",dir,cells,repeat}` from `resize-pane`; single-char keys only; `-r` = repeatable; `DEFAULT_RESIZE_CELLS=5`).

## Behavior notes

- **Input pipeline order** (`useTabManager.handleData`) — `ext.isInputEnabled` → `ext.interceptEarly` (termoil close-confirm y/n; crunch challenge-continue gate) → rename prompt → `ext.interceptAfterRename` (crunch editor/pager session) → `tmuxInputRouter.route()` → chord table / `ext.onShellData`. Handlers bind once per pane, so everything is read through refs — never capture props in these closures.
- **Repeat-mode resize** (`tmuxInputRouter.ts`) — `-r` binds auto-fire while held for `DEFAULT_REPEAT_MS=500` after last press. The hook's `applyResize` converts a cell step → ratio delta: find `nearestResizableSplit`, compute pane cell px + split box px (`nodeBox` × wrapper), call `adapter.nudgeSplitRatio`. `nudgeSplitRatio` caps a single nudge at `MAX_NUDGE_RATIO=0.05` so short panes can't step over term-crunch's ±0.05 ratio targets.
- **Copy mode** (`copyMode.ts`) — per-pane `CopyModeController`, `<prefix> [` enters it; sits **outside** the shell (consumes keys before the session). Works over any session — inline navigates real scrollback, alt-screen (the `editor` type = `nano`/`vim`, plus `less`/`piper`, per `sessionUsesAltScreen()`) is confined to the visible screen + gets a `resize()` redraw on exit. vi-style keys; callbacks `onChange`/`onYank` (caller owns clipboard via `src/lib/clipboard.ts`)/`onToggleHelp` (flips persisted `copyModeHelpHidden`).
- **Rendering (hybrid)** — xterm pane containers are imperative, long-lived, keyed by pane id, positioned **absolutely** from `paneRects` (avoids the canvas re-parenting a nested-flex tree would cause); only the active window's panes are visible (others `display:none`). All of this lives in `useTabManager`'s mount + layout effects; one wrapper `ResizeObserver` fits every visible pane and fires `ext.onPaneResized` (termoil → `resizePaneSession(paneId)`). **Single-focused-xterm invariant: `sessionMapRef` + global cwd/computer refs key on `activePaneId`** — keep it when touching focus logic. `PaneDividers.tsx` overlays draggable seams (gold flush to the active pane's edge, grey on the neighbour). Status line is the shared `TmuxStatusBar`; `TabBar.tsx` wraps it and injects the multi-computer "+" dropdown (home + only machines with an open pane) as the `trailing` slot. The `x` confirm and `r` rename take over the bar via `modalText`.

## Adding / extending

- **New prefix chord:** add to `handleChord` in `useTabManager.ts` (+ a `TabManagerAdapter` action if it needs the store); app-specific behavior goes through `ext.interceptPrefixKey`.
- **New `.tmux.conf` bind:** extend `parseTmuxBindings` + its `PaneBinding` variant, add tests in `packages/core/src/terminal/__tests__/tmuxConfig.test.ts`; new key-pipeline behavior gets tests in `__tests__/tmuxInputRouter.test.ts`.
- **Theme colors:** add to `ANSI_COLORS` (keeps xterm + status bar in sync); extend `parseTmuxTheme`/`TabBarTheme`.
- **New status-bar element / modal:** edit the shared `TmuxStatusBar` so **both** apps inherit it (app-specific bits via props / the `trailing` slot / `modalText`).
- **New copy-mode key:** add to the `CopyModeController` keydown handler.
- **Tree changes:** keep `paneTypes` helpers pure, add cases to `paneTypes.test.ts`, wire edits through a `gameStore.ts` action (never mutate the tree in components).

Run `npm run typecheck` + `npx vitest run` after changes. Unit tests cover the pure tree but **not** rendering — for visual changes to dividers/splits/focus also run `npm run screenshot:panes` (needs a dev server; drives tmux chords, screenshots single→h-split→2×2, asserts the gold/grey seam coloring; point elsewhere with `TT_URL`).
