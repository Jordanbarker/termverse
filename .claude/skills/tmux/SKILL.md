---
name: tmux
description: "How the in-game tmux multiplexer works — the window/pane binary tree, session attach/detach, prefix bindings and chords, copy mode, the status line, and ~/.tmux.conf parsing (prefix/theme/keybindings). The pure model lives in the SHARED @tt/core engine and is reused by both apps/termoil and apps/term-crunch. Use this skill whenever modifying windows, panes, splits, resize or focus logic, copy mode, the tmux status bar or tab bar, the `tmux` builtin, or the player's ~/.tmux.conf."
---

# Tmux Multiplexer

A faithful tmux model: **windows** (tabs in the status line, capped at each app's `MAX_WINDOWS`) each own a **binary tree of panes** (capped at `MAX_PANES_PER_WINDOW`); each pane (`PaneLeaf`) is a full shell with its own xterm, cwd, computerId, and session. `tabs_unlocked` is `true` from game start.

## Session lifecycle (launch / detach / attach / kill)

The mux only exists while a client is attached to a named session. Both app stores hold `tmuxAttachedSession: {name, createdAt} | null` + `tmuxDetachedSessions: TmuxSessionSnapshot[]` (+ transient `pendingMuxNotice`); `windows[]` always renders the attached session's live windows, or one bare `makeWindow` shell when detached. "Server running" is **derived** (attached ≠ null or any detached snapshot) — never stored. Pieces:
- **Pure model** `@tt/core/terminal/tmuxSessions.ts` — snapshot/restore (detach = serialize, attach = rebuild with **fresh pane ids, fresh shells**; never reset id counters here), `nextSessionName`, `formatTmuxLs`.
- **`tmux` builtin** `@tt/core/commands/builtins/tmux.ts` — pure handler validating against the app-injected `CommandContext.tmux` snapshot and returning a fully resolved `CommandResult.tmuxAction`, with real-tmux errors. Each app's `applyTmuxAction(action): boolean` store action applies it (true = client view swapped → suppress the prompt; the fresh pane prints the one-shot `pendingMuxNotice` banner via `onPaneCreated`).
- **Window/pane verbs** (`new-window`/`kill-pane`/`split-window`/… + tmux aliases) go through the same builtin → `tmuxAction` → `applyTmuxAction` path, each delegating to the store action its prefix chord uses (so caps and the last-window kill rule come for free). **There is no pane addressing** — pane verbs carry no id, and `kill-pane`/`select-pane`/`resize-pane` reject any `-t` with `can't find pane` (`split-window` ignores it); window `-t` (name, else 1-based index) resolves in the builtin. CLI resize uses `cliResizeDelta` (paneTypes), capped at one chord press.
- **Router gate**: `tmuxInputRouter`'s `muxEnabled()` option is checked first in `route()` — when detached the prefix char passes through to the shell and chords/copy mode are unreachable. The app knob behind it is `TabManagerExtensions.muxActive` (both apps: "is a session attached").
- **`<prefix> d`** chord → `TabManagerAdapter.detachClient()` → same store path as `tmux detach`.
- **Kill rule** (real tmux): while attached, closing the last pane of the last window kills the session and drops to the bare shell; on the bare shell it's a no-op.
- Gating: status bar/dividers/shortcuts render only while attached (termoil additionally `tabs_unlocked && gamePhase==="playing"`). termoil attach **sanitizes** (prunes panes on machines with no `computerState`); termoil persists both session fields, crunch's are transient (reseeded attached-`"0"` by `loadChallenge`). `createdAt` feeds only `tmux ls` — termoil sources it from the game clock, crunch from `Date.now()`.

## Core-vs-app split (the trap)

The **pure** model + helpers live in `@tt/core` and are reused by both apps — keep them pure and store-agnostic:
- `@tt/core/terminal/paneTypes.ts` — tree types + pure query/edit helpers (edits return a new tree). **Read the types/signatures there.** Trap: pane IDs are deterministic per session, so reset the counters only before a TabManager mounts, never mid-session.
- `@tt/core/terminal/{tmuxConfig,copyMode,windowLabel,renameWindowPrompt,useRenameWindowPrompt,ansiPalette,xtermDefaults}.ts`; `@tt/core/components/{PaneDividers,TmuxStatusBar}.tsx`.
- **`@tt/core/terminal/useTabManager.ts`** — the shared, store-agnostic pane orchestration hook: per-pane xterm runtime map, wrapper `ResizeObserver`, copy mode, memoized `.tmux.conf` parsing, rename prompt, cell→ratio resize, the whole input pipeline. Apps inject store actions via `TabManagerAdapter` and behavior via `TabManagerExtensions` — read the interfaces there. Its key state machine (prefix arming, double-prefix literal, `-r` repeat window, conf-bind dispatch) is the pure, unit-tested `tmuxInputRouter.ts`.
- App side (thin adapters): termoil's `gameStore.ts` (`windows[]`/`activeWindowId` + actions; derive the focused leaf via `getActiveWindow`/`getActivePaneId`/`getActiveLeaf`), `components/Terminal/{TabManager,TabBar}.tsx`, `story/filesystem/home/dotfiles.ts` (the player's `~/.tmux.conf`). term-crunch feeds the same hook from its own lean store — see its CLAUDE.md. **The caps are per-app constants**, not core's: termoil `state/gameStore.ts`, term-crunch `lib/machine.ts`.

Persistence: `SavedWindowState` carries **no IDs** and stores focus as the DFS leaf index (survives ID regen); `serializeWindow`/`rebuildWindow` round-trip it. See the save skill.

## Prefix bindings (contract: hardcoded vs config-driven)

The prefix arms a one-shot mode (default Ctrl+Space). **Split/window chords are hardcoded** in `useTabManager.ts` `handleChord` (the router pre-normalizes control chars and gates on `ext.chordsEnabled`); apps reroute individual chords via `ext.interceptPrefixKey` (termoil sends `x` to its confirm modal):

| `<prefix>` + | Action |
|---|---|
| `\|` / `-` | `splitPane(activePaneId, "h" \| "v")` — new pane inherits cwd+computer |
| `o` | `cyclePane()` |
| `c` | `newWindow()` (new window on active pane's computer) |
| `d` | `detachClient()` |
| `r` | rename active window via inline status-bar prompt (Enter applies, Esc cancels, empty reverts) |
| `x` | `closePane(paneId)` — plain kill in core; termoil's `interceptPrefixKey` swaps in its `confirm-before` `(y/n)` prompt |
| `n`/`.` , `p`/`,` | next / prev window |
| `1`–`9` | jump to window N (1-based; capped by `ext.digitWindowMax`) |
| arrow keys | directional pane focus — **hardcoded in the router** (`ARROW_DIRS`), not `handleChord` |

`<prefix> [` (copy mode) is also hardcoded, but is answered by `route()` *before* the `chordsEnabled` gate, so it stays reachable while chords are locked — it never reaches `handleChord`.

tmux defaults `%`/`"` are intentionally **not** bound. Vim-style **focus/resize** chords (`hjkl`/`HJKL`) are **not** hardcoded — they come from `~/.tmux.conf`, and a conf bind wins over the built-in table.

## `~/.tmux.conf` parsing (`tmuxConfig.ts`)

Parsed **live** from the home PC's `~/.tmux.conf` only (your local terminal config governs the mux regardless of which box a pane is on), memoized in `useTabManager`; later directives override earlier, malformed tokens keep the default. Three parsers — read their signatures in the file: `parseTmuxPrefix` (`C-Space`/`C-a..z`; the label reaches the `shortcuts` builtin via `CommandContext.tabPrefixLabel`), `parseTmuxTheme` (modern `bg=/fg=` + legacy `status-bg`/`-fg`; named ANSI resolved against `ansiPalette.ts`), `parseTmuxBindings` (focus/resize `PaneBinding`s from `bind [-r] <key> select-pane/resize-pane`; single-char keys; `-r` = repeatable; a resize bind with no amount gets `DEFAULT_RESIZE_CELLS = 5`).

## Behavior notes

- **Input pipeline order** (`useTabManager.handleData`) — `ext.isInputEnabled` → `ext.interceptEarly` → rename prompt → `ext.interceptAfterRename` → `tmuxInputRouter.route()` → chord table / `ext.onShellData`. Handlers bind once per pane, so everything is read through refs — never capture props in these closures.
- **Repeat-mode resize** — `-r` binds auto-fire after the last press. `applyResize` converts a cell step → ratio delta via `nearestResizableSplit` + `nodeBox`; `nudgeSplitRatio` caps a single nudge so short panes can't step over term-crunch's ratio targets. Repeat window is `DEFAULT_REPEAT_MS = 500` (`tmuxInputRouter.ts`); the nudge cap is `MAX_NUDGE_RATIO` (`paneTypes.ts`, rationale in its doc comment).
- **Copy mode** (`copyMode.ts`) — per-pane `CopyModeController`; sits **outside** the shell (swallows keys at the keydown layer, before the session). Inline sessions navigate real scrollback; alt-screen sessions (per `sessionUsesAltScreen()`) are confined to the visible screen + get a `resize()` redraw on exit. vi-style keys; callbacks `onChange`/`onYank` (caller owns clipboard)/`onToggleHelp`/`onPosition`. Like real tmux it is **per pane and persistent**: switching window/pane leaves it on (only its own keys or runtime disposal exit it), and the prefix + next key pass through to the router (`keyEventMatchesPrefix`) so chords work mid-copy; `handleData` drops `shell` results while active, and `r`/`x` exit first because their prompts read keys. The status bar is **never** taken over: each pane draws its own imperative chrome inside `containerEl` (`pointer-events:none`): a top-right `COPY offset/history` badge that overlays the pane, and a bottom hint strip that fills a row permanently reserved below the xterm host element (`termHostEl`), so copy mode never resizes the pane. Trap: FitAddon sizes rows from its parent's computed height and ignores the parent's padding (Tailwind's border-box), so pane insets are the host's absolute offsets; never pad the element xterm is opened into. `?` toggles the app-held help flag, fed back as `ext.copyModeHelpHidden`. termoil hides its ObjectiveTracker (which would cover the badge) while the active window has a copy-mode pane: store `copyModePaneIds`, fed by `onCopyModeChange` + `onPaneDisposed` (teardown skips the former). Trap: xterm drops scroll + selection while `display:none`, so a re-shown copy-mode pane gets `copyMode.refresh()` on the next frame (also after any re-fit).
- **Pane-runtime lifecycle** — two effects own it and must stay symmetric: the `[windows]` effect creates/disposes runtimes as panes enter/leave the tree; a `[]`-scoped effect disposes all on unmount. `disposeRuntime` must undo everything `createPaneRuntime` set up, and the unmount teardown must also reset the first-mount bookkeeping (see the comment at `useTabManager.ts` where it does) — **any new "have we booted yet" ref belongs in that reset**, or StrictMode's double-mount silently skips the splash/intro.
- **Rendering (hybrid)** — xterm pane containers are imperative, long-lived, keyed by pane id, positioned absolutely from `paneRects`; only the active window's panes are visible (others `display:none`). One wrapper `ResizeObserver` fits every visible pane and fires `ext.onPaneResized`. **Single-focused-xterm invariant: `sessionMapRef` + global cwd/computer refs key on `activePaneId`** — keep it when touching focus logic. `PaneDividers.tsx` overlays draggable seams (gold flush to the active pane's edge). Status line is the shared `TmuxStatusBar`; `TabBar.tsx` wraps it and injects termoil's multi-computer "+" dropdown as the `trailing` slot; the `x` confirm and `r` rename take over the bar via `modalText`.

## Adding / extending

- **New prefix chord:** add to `handleChord` in `useTabManager.ts` (+ a `TabManagerAdapter` action if it needs the store); app-specific behavior via `ext.interceptPrefixKey`.
- **New `.tmux.conf` bind:** extend `parseTmuxBindings` + `PaneBinding`, test in `packages/core/src/terminal/__tests__/tmuxConfig.test.ts`; key-pipeline behavior tests in `__tests__/tmuxInputRouter.test.ts`.
- **Theme colors:** add to `ANSI_COLORS` (keeps xterm + status bar in sync); extend `parseTmuxTheme`/`TabBarTheme`.
- **New status-bar element / modal:** edit the shared `TmuxStatusBar` so both apps inherit it.
- **New copy-mode key:** add to the `CopyModeController` keydown handler.
- **Tree changes:** keep `paneTypes` helpers pure, add cases to core's `paneTypes.test.ts`, wire edits through a store action (never mutate the tree in components).

Unit tests don't cover rendering — for visual changes to dividers/splits/focus also run `npm run screenshot:panes` (needs a dev server; asserts the gold/grey seam coloring; point elsewhere with `TT_URL`).
