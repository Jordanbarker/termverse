---
name: tmux
description: "How the in-game tmux multiplexer works — the window/pane binary tree, prefix bindings, copy mode, status line, and ~/.tmux.conf parsing (prefix/theme/keybindings). The pure pane model lives in the SHARED @tt/core engine (@tt/core/terminal/paneTypes + PaneDividers) and is reused by both apps/termoil and apps/term-crunch. Use this skill whenever modifying windows/panes, split/resize/focus logic, copy mode, the tmux status bar, or touching paneTypes.ts, the Terminal components (TabManager/TabBar/PaneDividers), the terminal engine (tmuxConfig/copyMode/ansiPalette), or the home ~/.tmux.conf in apps/termoil/src/story/filesystem/home/dotfiles.ts."
---

# Tmux Multiplexer

A faithful tmux model: **windows** (tabs in the status line, up to `MAX_WINDOWS=5`) each own a **binary tree of panes**; each pane (`PaneLeaf`) is a full shell with its own xterm, cwd, computerId, and session. `tabs_unlocked` is `true` from game start.

## Session lifecycle (launch / detach / attach / kill)

The mux only exists while a client is attached to a named session. Both app stores hold `tmuxAttachedSession: {name, createdAt} | null` + `tmuxDetachedSessions: TmuxSessionSnapshot[]` (+ transient `pendingMuxNotice`); `windows[]` always renders the attached session's live windows, or one bare `makeWindow` shell when detached. "Server running" is **derived** (attached ≠ null or any detached snapshot) — never stored. Pieces:
- **Pure model** `@tt/core/terminal/tmuxSessions.ts` — snapshot/restore (detach = serialize, attach = rebuild with **fresh pane ids, fresh shells**; never reset id counters here), `nextSessionName`, `formatTmuxLs`.
- **`tmux` builtin** `@tt/core/commands/builtins/tmux.ts` — pure handler validating against the app-injected `CommandContext.tmux` snapshot and returning a fully resolved `CommandResult.tmuxAction`, with real-tmux errors. Each app's `applyTmuxAction(action): boolean` store action applies it (true = client view swapped → suppress the prompt; the fresh pane prints the one-shot `pendingMuxNotice` banner via `onPaneCreated`).
- **Window/pane verbs** (`new-window`/`kill-pane`/`split-window`/… + tmux aliases) go through the same builtin → `tmuxAction` → `applyTmuxAction` path, each delegating to the store action its prefix chord uses (so caps and the last-window kill rule come for free). **There is no pane addressing** — pane verbs carry no id and any `-t` is a `can't find pane` error; window `-t` (name, else 1-based index) resolves in the builtin. CLI resize uses `cliResizeDelta` (paneTypes), capped at one chord press.
- **Router gate**: `tmuxInputRouter` option `muxEnabled()` is checked first in `route()` — when detached the prefix char passes through to the shell and chords/copy mode are unreachable.
- **`<prefix> d`** chord → `TabManagerAdapter.detachClient()` → same store path as `tmux detach`.
- **Kill rule** (real tmux): while attached, closing the last pane of the last window kills the session and drops to the bare shell; on the bare shell it's a no-op.
- Gating: status bar/dividers/shortcuts render only while attached (termoil additionally `tabs_unlocked && gamePhase==="playing"`). termoil attach **sanitizes** (prunes panes on machines with no `computerState`); termoil persists both session fields (save v19), crunch's are transient (reseeded attached-`"0"` by `loadChallenge`). `createdAt` feeds only `tmux ls` — termoil sources it from the game clock, crunch from `Date.now()`.

## Core-vs-app split (the trap)

The **pure** model + helpers live in `@tt/core` and are reused by both apps — keep them pure and store-agnostic:
- `@tt/core/terminal/paneTypes.ts` — tree types + pure query/edit helpers (edits return a new tree). **Read the types/signatures there.** `MIN_PANE_RATIO=0.1`; pane IDs are deterministic per session — counters reset only before a TabManager mounts, never mid-session, or new panes collide with `knownPaneIdsRef` ids, get misclassified "restored", and swallow the mux banner.
- `@tt/core/terminal/{tmuxConfig,copyMode,windowLabel,renameWindowPrompt,useRenameWindowPrompt,ansiPalette,xtermDefaults}.ts`; `@tt/core/components/{PaneDividers,TmuxStatusBar}.tsx`.
- **`@tt/core/terminal/useTabManager.ts`** — the shared, store-agnostic pane orchestration hook: per-pane xterm runtime map, wrapper `ResizeObserver`, copy mode, memoized `.tmux.conf` parsing, rename prompt, cell→ratio resize, the whole input pipeline. Apps inject store actions via `TabManagerAdapter` and behavior via `TabManagerExtensions` — read the interfaces there. Its key state machine (prefix arming, double-prefix literal, `-r` repeat window, conf-bind dispatch) is the pure, unit-tested `tmuxInputRouter.ts`.
- App side (thin adapters): termoil's `gameStore.ts` (`windows[]`/`activeWindowId` + actions; derive the focused leaf via `getActiveWindow`/`getActivePaneId`/`getActiveLeaf`), `components/Terminal/{TabManager,TabBar}.tsx`, `story/filesystem/home/dotfiles.ts` (the player's `~/.tmux.conf`). `MAX_PANES_PER_WINDOW=6`. term-crunch feeds the same hook from its own lean store — see its CLAUDE.md.

Persistence: `SavedWindowState` carries **no IDs** and stores focus as the DFS leaf index (survives ID regen); `serializeWindow`/`rebuildWindow` round-trip it. See the save skill.

## Prefix bindings (contract: hardcoded vs config-driven)

The prefix arms a one-shot mode (default Ctrl+Space). **Split/window chords are hardcoded** in `useTabManager.ts` `handleChord` (the router pre-normalizes control chars and gates on `ext.chordsEnabled`); apps reroute individual chords via `ext.interceptPrefixKey` (termoil sends `x` to its confirm modal):

| `<prefix>` + | Action |
|---|---|
| `\|` / `-` | `splitPane(activePaneId, "h" \| "v")` — new pane inherits cwd+computer |
| `o` | `cyclePane()` |
| `c` | `addWindow(...)` (new window on active pane's computer) |
| `r` | rename active window via inline status-bar prompt (Enter applies, Esc cancels, empty reverts) |
| `x` | kill focused pane via `confirm-before` `(y/n)` prompt |
| `n`/`.` , `p`/`,` | next / prev window |
| `1`–`9` | jump to window N (1-based; capped by `ext.digitWindowMax`) |
| `[` | enter copy mode on the focused pane |

tmux defaults `%`/`"` are intentionally **not** bound. Pane **focus/resize** chords (`hjkl`/`HJKL`) are **not** hardcoded — they come from `~/.tmux.conf`.

## `~/.tmux.conf` parsing (`tmuxConfig.ts`)

Parsed **live** from the home PC's `~/.tmux.conf` only (your local terminal config governs the mux regardless of which box a pane is on), memoized in `useTabManager`; later directives override earlier, malformed tokens keep the default. Three parsers — read their signatures in the file: `parseTmuxPrefix` (`C-Space`/`C-a..z`; the label reaches the `shortcuts` builtin via `CommandContext.tabPrefixLabel`), `parseTmuxTheme` (modern `bg=/fg=` + legacy `status-bg`/`-fg`; named ANSI resolved against `ansiPalette.ts`), `parseTmuxBindings` (focus/resize `PaneBinding`s from `bind [-r] <key> select-pane/resize-pane`; single-char keys; `-r` = repeatable).

## Behavior notes

- **Input pipeline order** (`useTabManager.handleData`) — `ext.isInputEnabled` → `ext.interceptEarly` → rename prompt → `ext.interceptAfterRename` → `tmuxInputRouter.route()` → chord table / `ext.onShellData`. Handlers bind once per pane, so everything is read through refs — never capture props in these closures.
- **Repeat-mode resize** — `-r` binds auto-fire for `DEFAULT_REPEAT_MS=500` after the last press. `applyResize` converts a cell step → ratio delta via `nearestResizableSplit` + `nodeBox`; `nudgeSplitRatio` caps a single nudge at `MAX_NUDGE_RATIO=0.05` so short panes can't step over term-crunch's ratio targets.
- **Copy mode** (`copyMode.ts`) — per-pane `CopyModeController`; sits **outside** the shell (consumes keys before the session). Inline sessions navigate real scrollback; alt-screen sessions (per `sessionUsesAltScreen()`) are confined to the visible screen + get a `resize()` redraw on exit. vi-style keys; callbacks `onChange`/`onYank` (caller owns clipboard)/`onToggleHelp`. Both apps pass the hook's `copyModeActive` and their help preference through `TabBar` to the shared `TmuxStatusBar`: copy mode replaces the tabs with a single-line label + truncated hints (`?` toggles help), below explicit `modalText` prompts in priority. No floating copy-mode overlay; pane/window focus changes and runtime disposal exit copy mode.
- **Pane-runtime lifecycle** — two effects own it and must stay symmetric: the `[windows]` effect creates/disposes runtimes as panes enter/leave the tree; a `[]`-scoped effect disposes all on unmount. `disposeRuntime` must undo everything `createPaneRuntime` set up. The unmount teardown also **resets the first-mount bookkeeping** (`knownPaneIdsRef`, `firstPaneConsumedRef`): under Next dev StrictMode's double-mount, surviving state makes pass 2 recreate every pane as "restored" and silently skip the splash/intro. Any new "have we booted yet" ref belongs in that reset.
- **Rendering (hybrid)** — xterm pane containers are imperative, long-lived, keyed by pane id, positioned absolutely from `paneRects`; only the active window's panes are visible (others `display:none`). One wrapper `ResizeObserver` fits every visible pane and fires `ext.onPaneResized`. **Single-focused-xterm invariant: `sessionMapRef` + global cwd/computer refs key on `activePaneId`** — keep it when touching focus logic. `PaneDividers.tsx` overlays draggable seams (gold flush to the active pane's edge). Status line is the shared `TmuxStatusBar`; `TabBar.tsx` wraps it and injects termoil's multi-computer "+" dropdown as the `trailing` slot; the `x` confirm and `r` rename take over the bar via `modalText`.

## Adding / extending

- **New prefix chord:** add to `handleChord` in `useTabManager.ts` (+ a `TabManagerAdapter` action if it needs the store); app-specific behavior via `ext.interceptPrefixKey`.
- **New `.tmux.conf` bind:** extend `parseTmuxBindings` + `PaneBinding`, test in `packages/core/src/terminal/__tests__/tmuxConfig.test.ts`; key-pipeline behavior tests in `__tests__/tmuxInputRouter.test.ts`.
- **Theme colors:** add to `ANSI_COLORS` (keeps xterm + status bar in sync); extend `parseTmuxTheme`/`TabBarTheme`.
- **New status-bar element / modal:** edit the shared `TmuxStatusBar` so both apps inherit it.
- **New copy-mode key:** add to the `CopyModeController` keydown handler.
- **Tree changes:** keep `paneTypes` helpers pure, add cases to core's `paneTypes.test.ts`, wire edits through a store action (never mutate the tree in components).

Run `npm run typecheck` + `npx vitest run` after changes. Unit tests don't cover rendering — for visual changes to dividers/splits/focus also run `npm run screenshot:panes` (needs a dev server; asserts the gold/grey seam coloring; point elsewhere with `TT_URL`).
