# Terminal Turmoil

A narrative-driven browser game that teaches Linux/terminal through a workplace mystery. Prioritize narrative realism in all game content.

## Tech Stack

- **Framework**: Next.js (App Router, static export)
- **Language**: TypeScript
- **Terminal**: xterm.js (`@xterm/xterm`, `@xterm/addon-fit`)
- **State**: Zustand with localStorage persist
- **Styling**: Tailwind CSS
- **Testing**: Vitest
- **Python**: Pyodide (WebAssembly)
- **Deployment**: GitHub Pages via GitHub Actions

## Commands

```bash
npm run dev       # Local development server
npm run build     # Production build (static export to out/)
npm run lint      # ESLint
npm run typecheck # TypeScript checking
npm run test      # Vitest (or: npx vitest run)
npm run check     # Combined typecheck + test + build
```

### In-Game Commands

`ls`, `cd`, `cat`, `less`, `pwd`, `clear`, `help`, `nano`, `mail`, `piper`, `python`, `snow`, `dbt`, `chip`, `ssh`, `ssh-add`, `coder`, `exit`, `shutdown`, `save`, `load`, `newgame`, `grep`, `find`, `head`, `tail`, `diff`, `wc`, `echo`, `chmod`, `mkdir`, `rm`, `mv`, `cp`, `touch`, `history`, `whoami`, `hostname`, `file`, `tree`, `sort`, `uniq`, `date`, `which`, `command`, `type`, `man`, `df`, `lsblk`, `mount`, `umount`, `pdftotext`, `sudo`, `apt`, `git`, `source`, `alias`, `unalias`, `export`, `printenv`, `env`, `true`, `false`

Pipe support (`|`), output redirection (`>`, `>>`, zsh multios — multiple targets all receive the output; bad targets are prechecked zsh-style so the command never runs), stdin passing between piped commands, and command chaining (`&&`, `||`, `;`) are all supported. Shell-layer errors use zsh wording (`zsh: command not found:`, `` zsh: parse error near `&&' ``); only the `bash` script runner keeps `bash:` prefixes.

## Project Structure

```
src/
├── app/                    # Next.js App Router (single page game)
├── components/
│   ├── Terminal/           # TabManager (multi-tab), TabBar, xterm.js (dynamic import, ssr:false)
│   ├── Assistant/          # Chip's popup overlay
│   ├── HUD/               # ObjectiveTracker, StatusBar, Toast
│   └── Game/              # GameShell top-level layout
├── engine/
│   ├── filesystem/         # VirtualFS class, types, serialization, builders (__tests__/)
│   ├── commands/           # Parser, registry, builtin commands, applyResult, availability (__tests__/)
│   ├── chip/               # Chip interactive CLI (ChipSession, render, transcript, types) — writes plaintext transcripts to ~/.chip/sessions/ on exit (NexaCorp only) (__tests__/)
│   ├── editor/             # Nano text editor (EditorSession, keymap, render) (__tests__/)
│   ├── ssh/                # SSH client session (SshSession, sshConfig)
│   ├── python/             # Python REPL via Pyodide
│   ├── snowflake/          # In-browser Snowflake SQL engine (lexer, parser, planner, executor, functions, formatter, session, bridge, seed, state) (__tests__/)
│   ├── dbt/                # Virtual dbt CLI (project discovery, runner, output, data) (__tests__/)
│   ├── git/                # Virtual git CLI (repo, output, remotes, types) (__tests__/)
│   ├── mail/               # In-game email system (delivery, dispatcher, Maildir layout) (__tests__/)
│   ├── piper/              # Piper messaging system (PiperSession, delivery, render, types) (__tests__/)
│   ├── prompt/             # Inline prompt system (numbered choices for email replies, narrative)
│   ├── session/            # Shared ISession interface and SessionResult types
│   ├── terminal/           # Key code constants (keyCodes.ts)
│   ├── suggestions/        # Zsh-style autosuggestions (ghost text from history, commands, paths) (__tests__/)
│   ├── narrative/          # Chapter/objective/trigger types, storyFlags engine, triggerMatcher (re-exports from story/)
│   ├── result.ts           # Generic Result<T> type for error handling
│   └── assistant/          # Chip message types
├── story/                      # Story content separated from engine logic
│   ├── player.ts               # PLAYER and COMPUTERS config
│   ├── chapters.ts             # CHAPTERS array (chapter/objective definitions)
│   ├── storyFlags.ts           # Story flag names, triggers (home + NexaCorp)
│   ├── commandGates.ts         # HOME_COMMANDS, NEXACORP_GATED, HOME_GATED, DEVCONTAINER_COMMANDS
│   ├── emails/
│   │   ├── home.ts             # Home PC email definitions
│   │   └── nexacorp.ts         # NexaCorp email definitions
│   ├── filesystem/
│   │   ├── home.ts             # Home PC filesystem builder
│   │   ├── nexacorp/           # NexaCorp filesystem builder (split into modules)
│   │   │   ├── index.ts        # createNexacorpFilesystem() composer + re-exports
│   │   │   ├── dbt.ts          # buildDbtProject() — full dbt project tree
│   │   │   ├── chip.ts         # buildOptDirectory() — /opt/chip/ THIN CLIENT (bin/chip stub, config, VERSION, README, cache)
│   │   │   ├── srv.ts          # buildSrvDirectory() — /srv/ marketing, operations, engineering, leadership
│   │   │   └── home.ts         # buildHomeDirectory() — user home dir
│   │   ├── chipinfra/          # Shared Chip platform workspace (`coder ssh chip`) — plugin runtime + RAG + inference data
│   │   │   ├── index.ts        # createChipinfraFilesystem() composer
│   │   │   ├── home.ts         # /home/{player}, /home/erik, /home/oscar (multi-user shared box)
│   │   │   ├── opt.ts          # /opt/chip/ plugin runtime (10 plugins + registry.json + SDK)
│   │   │   ├── srv.ts          # /srv/ai/rag/ (RAG corpus) + /srv/chip/ (embeddings, prompts, cache, logs)
│   │   │   └── tmp.ts          # /tmp/ with Erik's live ssh agent socket — `.user-erik` marker drives the chipinfra→erik-pc pivot
│   │   ├── devcontainer.ts     # Coder dev container filesystem builder (`coder ssh ai`, per-player)
│   │   ├── erikpc.ts           # Erik's NexaCorp-issued Linux work laptop (reached via SSH-agent-forwarding pivot from chipinfra)
│   │   └── paths.ts            # HOME_PATHS, NEXACORP_PATHS, CHIPINFRA_PATHS constants for story flag triggers
│   ├── chip/
│   │   └── menuItems.ts        # Chip menu items and responses
│   ├── piper/
│   │   ├── channels.ts         # Piper channel definitions
│   │   ├── messages.ts         # Piper message/delivery definitions (re-exports from messages/)
│   │   └── messages/           # Per-character message files (home, onboarding, oscar, dana, auri, sarah, cassie, jordan, maya, soham, edward, ambient)
│   └── data/
│       ├── dbt/                # Pre-generated dbt data (model results, test results, etc.)
│       └── snowflake/          # Pre-generated Snowflake seed data
├── state/                  # Zustand store (gameStore.ts), save system (saveManager, saveTypes)
├── hooks/                  # useTerminal, useSessionRouter, useCommandLine, useLoginSequence, useComputerTransitions
└── lib/                    # ANSI helpers (ansi.ts), ASCII art/display text (ascii.ts), path utilities, timing constants (__tests__/)
```

## Key Architectural Decisions

- **Immutable filesystem**: VirtualFS mutations return new instances (enables React re-renders, future undo/redo)
- **Minimal engine→state coupling**: Engine files may import type definitions from `state/types.ts` (e.g. `ComputerId`, `StoryFlags`), but never import Zustand stores or actions. Runtime dependencies flow via `CommandContext`
- **Decomposed terminal hooks**: `useTerminal` (orchestrator) → `useSessionRouter` (session lifecycle) + `useCommandLine` (input/history/suggestions)
- **Single-page app**: Chapter transitions are state changes, not route changes
- **Dynamic xterm import**: `ssr: false` required because xterm.js needs `window`
- **Static export**: `output: 'export'` in next.config.ts, deployed to GitHub Pages
- **Five computers**: Home PC (`"home"`), NexaCorp workstation (`"nexacorp"`), per-player Coder dev container (`"devcontainer"`, hostname `coder-ai`), the shared Chip platform Coder workspace (`"chipinfra"`, hostname `coder-chip`), and Erik's NexaCorp-issued Linux work laptop (`"erik-pc"`, hostname `nexacorp-lt05`, on corp net at 10.20.5.84). Separate filesystems are stored in `computerState` (Zustand). `ComputerId` type in `state/types.ts`; `PLAYER` and `COMPUTERS` config in `story/player.ts`. Both Coder workspaces are reached from NexaCorp via `coder ssh <name>` (`ai` or `chip`) and exited with `exit`. The `chip` workspace is gated behind the `unlock_chip_plugin_development` story flag (set after Edward's Chapter 3 plugin DM). Erik's PC is reached from chipinfra via SSH-agent-forwarding abuse (read `/tmp/ssh-mZ4xPq/.user-erik` → `export SSH_AUTH_SOCK` → `ssh-add -l` → `ssh erik@nexacorp-lt05`); `exit` returns to chipinfra, not nexacorp. First-time transitions trigger fullscreen animations; subsequent transitions open new tabs instantly. Erik's PC has its own session username (`erik`) via `COMPUTERS["erik-pc"].username`; `getComputerUsername(computer, playerUsername)` is the helper consulted by prompt rendering, FS construction, and env defaults. Computer transitions route through a single source-aware `dispatchTransition(term, transitionTo, sourceComputer)` helper in `useComputerTransitions.ts`; both `useTerminal.ts` (for command results) and `useSessionRouter.ts` (for SSH session results) call it.
- **Multi-terminal tabs**: Players can open multiple terminal tabs (max 5) on different computers simultaneously. `TabManager.tsx` orchestrates tab lifecycle. Each tab has its own xterm instance, cwd, and session state. Tab state (`tabs[]`, `activeTabId`) lives in Zustand; persisted as `tabs[]` + `activeTabIndex` in save format v5. Tabs are keyed off the `tabs_unlocked` story flag, which is now set `true` in `createInitialState()` (`gameStore.ts`) so **tabs + copy mode are available from the start of a new game** (the Chapter 2 `search_tools_accepted` Piper reply and the cheat checkpoint still set it idempotently). Tmux-style shortcuts: `<prefix>, C/X/N/P/1-5`. **Copy mode** (`<prefix>, [`): tmux/vi-style keyboard copy — navigate the scrollback with `hjkl`/arrows (`0`/`$` line ends, `g`/`G` top/bottom, `Ctrl+U`/`Ctrl+D` half-page up/down — moves the cursor by `floor(rows/2)` and scrolls the viewport with it), `v` to begin a visual selection, `y` to yank to the system clipboard, `q`/`Esc` to exit. Cursor motion is **content-aware** (vi `curswant` model): vertical moves clamp the column to the target line's last content cell and remember a sticky **preferred column** (`desiredCol`) that is restored on longer lines. Horizontal motion **wraps across line boundaries** like real tmux (`window_copy_cursor_left`/`_right`): `h`/`←` at column 0 jumps to the **end of the previous line**, and `l`/`→` at end-of-line content jumps to the **start of the next line** (it stops at content, never the terminal width — and `(0,0)` left / last-row-end right are no-ops). Reaching end-of-line content via a single `l`/`→` press still parks `desiredCol` at the `EOL_COL` sentinel so an *immediate* vertical move then **follows each line's end** (as does `$`); a mid-line `l`/`→` stop keeps the literal column; a *further* `l`/`→` from end-of-line is what wraps down. The entry cursor is **not** clamped — it stays at the live shell-cursor position, and clamping begins on the first move. Implemented by `CopyModeController` in `src/engine/terminal/copyMode.ts` (drives xterm's native selection; clipboard via `src/lib/clipboard.ts`); `<prefix>, [` **always** enters copy mode (matching real tmux) — at the shell, over any **inline (normal-buffer) session** (the email reply prompt, `chip`, the `snow`/`python` REPLs, the `ssh` auth prompt) where it navigates the real scrollback, and over a full-screen **alternate-screen** session (`nano`/`less`/`piper`) where the alt buffer has no history so navigation is confined to the currently-visible screen (the `CopyModeController` is buffer-agnostic — it drives xterm's native selection over `term.buffer.active`, which is the alt buffer during those sessions). There is no entry gate (the old `copyModeAllowedForSession()` helper was removed). When copy mode **exits** over an alt-screen session, the `onChange` handler in `TabManager.tsx` calls `resizeActiveSessionRef.current()` (→ the session's `resize()`) so the session re-asserts its own screen and cursor visibility (nano shows its cursor; `less`/`piper` keep it hidden — `PiperSession.resize()` re-hides the cursor then redraws). Whether the active session uses the alt screen is the single source of truth `sessionUsesAltScreen()` / `ALT_SCREEN_SESSION_TYPES` in `src/engine/session/types.ts`, consulted both here (copy-mode-exit redraw) and by `useSessionRouter` when redrawing the prompt after a session exits. `getActiveSessionType()` (from `useSessionRouter`, threaded through `useTerminal`→`TabManager`) supplies the active session type. The onData prefix dispatch stays coherent for any flag value (if `tabs_unlocked` were ever false, only copy mode `[` would work and other post-prefix keys pass through to the shell rather than being swallowed); with the flag now true from game start, the tab actions work immediately. The tab bar (`TabBar.tsx`) is styled as a **tmux window-list/status line**: a bar with a left session block `[<username>]`, windows rendered `index:host:dir` with **1-based indices** (matching the `<prefix>, 1-5` jump keys), the current window drawn with a trailing `*` flag. Colors are **theme-driven inline styles** (not hardcoded Tailwind classes, so they can be set at runtime) sourced from a `TabBarTheme` prop, **including the bar's bottom divider** (`borderBottomColor` follows `statusBg`, so it blends instead of the old hardcoded olive `#6f8f4a` line); dim/hover states use Tailwind `opacity-*` utilities. The shipped `~/.tmux.conf` seeds a **seamless dark theme** (bar `bg=#0a0e14` matching the terminal background, dim `#686868` inactive tabs/`[session]` block, gold `#e6b450` active-tab text with no block) so a new game's bar blends into the terminal; the `DEFAULT_TAB_BAR_THEME` Ayu green/gold (`#91b362`/`#e6b450`) is now only the engine fallback when the conf is missing/deleted. The prefix indicator is folded into the bar: while the prefix is pending (`prefixActive`, passed from `TabManager` into `TabBar`), the session block inverts to gold and pulses. When the bar is hidden (pre-`playing` phases) the prefix indicator still renders as a floating chip in the terminal area. The prefix key is **user-configurable via `~/.tmux.conf` on the home PC** (single source of truth, since home is never removed from `computerState`): TabManager reads `computerState.home.fs` `~/.tmux.conf` and parses `set -g prefix <key>` via `parseTmuxPrefix()` in `src/engine/terminal/tmuxConfig.ts` (supports `C-Space` and `C-<a-z>`; default **Ctrl+Space**; falls back to Ctrl+Space if missing/unparseable). The **status-bar colors** are read from the same file via `parseTmuxTheme()` (same `tmuxConfig.ts`), which honors `status-style` (bar), `window-status-current-style` (active tab), `window-status-style` (inactive tabs), and `status-left-style` (the `[session]` block) — both the modern `"bg=..,fg=.."` form and the legacy split `*-bg`/`*-fg` options. Inline `# comments` after a directive are stripped (tmux-style, quote-aware so hex like `"bg=#0a0e14"` survives) by `stripInlineComment()`, shared by both `parseTmuxPrefix` and `parseTmuxTheme`. Color values are named (resolved against the shared 16-color ANSI palette in `src/engine/terminal/ansiPalette.ts`, also spread into `XTERM_THEME`) or raw hex; unresolvable values keep the per-field default in `DEFAULT_TAB_BAR_THEME`. The parsed `TabBarTheme` is memoized in TabManager off the live conf string and passed to `<TabBar theme={...}>`. Editing the file applies live (both prefix and colors). The label is surfaced to `help` via `CommandContext.tabPrefixLabel` (set in `useTerminal.ts` `buildCommandContext`). `<prefix>, X` shows a tmux `confirm-before` style `kill-pane <n>? (y/n)` prompt **in the status bar** (`TabBar`, via the `closeConfirm` prop, never written to the terminal buffer, so it doesn't clobber a half-typed shell line or corrupt an alt-screen session): `y` closes, any other key cancels, Enter is ignored. The answer keystroke is captured by a `closeConfirmRef` check at the top of TabManager's `onData`. When the active session has unsaved work (`canClose()` false) the prompt appends "Unsaved changes will be lost." and `y` force-closes. The old two-step 2s force-close warning was removed. The clickable per-tab "x" button still closes immediately (a GUI affordance, not a tmux keystroke). "+" button shows computer selection dropdown when multiple computers are available. Per-computer command queue serializes FS mutations to prevent TOCTOU races.
- **Per-computer FS in store**: `computerState: Record<ComputerId, { fs: VirtualFS; envVars; aliases; mounts }>` holds per-computer filesystem state. There are no legacy `fs`, `cwd`, or `activeComputer` fields — these are derived from `computerState` and `tabs`. Pipeline execution reads fresh FS from `getState().computerState[computerId]`, accumulates in local `runningFs` and `runningMounts`, writes once at end via `setComputerFs()` / `setComputerMounts()`. CWD is per-tab via `setTabCwd()`. Active computer is derived from the active tab's `computerId`. Hooks use `getState()` for global state (storyFlags, deliveredEmailIds, etc.) instead of synced refs. Computer transitions use `setTabComputer()` to repurpose the current tab instead of stash/swap.
- **Shell history = the `.zsh_history` file (single source of truth)**: There is **no** separate `commandHistory[]` array or `pushHistory` action. Up-arrow recall (`useCommandLine`), the `history` command (via `ctx.commandHistory`), and autosuggestions (`SuggestionContext.commandHistory`) all derive their list by parsing the per-computer `~/.zsh_history` VFS file with `parseZshHistory()` (`src/engine/terminal/zshHistory.ts`, plain one-command-per-line format). The runner appends each submitted line to the file at `useTerminal.ts` (HIST_IGNORE_DUPS) and writes it back via `setComputerFs()`. Because `removeComputer` deletes a computer's FS (work machines on exit-to-home) and home is rebuilt-from-seed on shutdown, a **durable `zshHistory: Partial<Record<ComputerId, string>>` mirror** in the store survives both: `setComputerFs` refreshes it from the written-back file, and `initComputer` (the single funnel for every FS rebuild) restores it into the freshly-built fs (the `merge` rebuild safety-valve does the same). Guards use `!= null` so a truncated/empty history is preserved faithfully. The mirror is persisted (partialize/merge + `SaveData.zshHistory`). So `cat .zsh_history`, `history`, and up-arrow always agree and continue across day/computer transitions.
- **Delivery extraction**: `processDeliveries()` in `engine/commands/processDeliveries.ts` is a pure function extracted from `computeEffects()`. Handles story flag triggers, email/piper deliveries, and piper_delivered flag cascades.
- **Command availability**: Home PC has `HOME_COMMANDS` available from the start; `HOME_GATED` commands (ssh, sudo, apt, pdftotext, tree) require story flags to unlock. NexaCorp has most commands available by default (including python); `git`, `snow`, and `dbt` are `DEVCONTAINER_ONLY` — never available on NexaCorp (they print the plain red "command not found" there, not the yellow unlock hint, since they never unlock on the workstation). `NEXACORP_GATED` commands are introduced gradually via colleague messages — search tools (grep/find/diff), inspection tools (head/tail/wc), processing tools (sort/uniq), coder, chip, and piper are each gated by story flags. Both Coder workspaces (`devcontainer` and `chipinfra`) share the `DEVCONTAINER_COMMANDS` whitelist (dbt/snow/python/chip always available). erik-pc gets the home command set with **no tutorial flag gates** (Erik's laptop is fully set up; only `DEVCONTAINER_ONLY` stays blocked). `availability.ts` gates command access by computer + flags; gate data lives in `story/commandGates.ts`. See the **narrative skill** for full gating details
- **Story/engine separation**: Story content (email definitions, Piper message definitions, filesystem builders, chapters, story flags, Chip menu items, seed data) lives in `src/story/`. Engine modules (`engine/narrative/`, `engine/mail/`, `engine/piper/`, `engine/commands/availability.ts`) re-export or import from `story/` for runtime logic

## Story Docs

`docs/storyboard/chapter-1.md`, `docs/storyboard/chapter-2.md`, `docs/storyboard/chapter-3.md` - detailed storyboards for each chapter, including narrative beats, character dialogue, and key player actions. Updated as story content is added or revised.
`docs/characters.md` - read before writing character dialogue or designing character-specific content. Defines each character's personality, motivations, and relationships to other characters.
`docs/timeline.md` - master timeline of all story events. Updated as new story beats are added.
