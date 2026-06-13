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

`ls`, `cd`, `cat`, `less`, `pwd`, `clear`, `help`, `nano`, `mail`, `piper`, `python`, `snow`, `dbt`, `chip`, `ssh`, `ssh-add`, `coder`, `exit`, `shutdown`, `save`, `load`, `newgame`, `grep`, `find`, `head`, `tail`, `diff`, `wc`, `echo`, `chmod`, `mkdir`, `rm`, `mv`, `cp`, `touch`, `history`, `whoami`, `hostname`, `file`, `tree`, `sort`, `uniq`, `date`, `which`, `command`, `type`, `man`, `df`, `lsblk`, `mount`, `umount`, `pdftotext`, `sudo`, `apt`, `git`, `source`, `alias`, `unalias`, `export`, `printenv`, `env`, `true`, `false`, `bash` (aliases: `sh`, `zsh`), `cheat` (dev/play-testing checkpoint jump)

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
│   ├── chip/               # Chip interactive CLI (ChipSession, render, transcript, types) — writes plaintext transcripts to ~/.chip/sessions/ on exit (NexaCorp only); menu items can also apply FS mutations via ChipMenuItem.applyFs, threaded out via SessionResult.newFs on exit (__tests__/)
│   ├── editor/             # Nano text editor (EditorSession, keymap, render) (__tests__/)
│   ├── pager/              # less pager session (LessSession, keymap, render)
│   ├── ssh/                # SSH client session (SshSession, sshConfig)
│   ├── python/             # Python REPL via Pyodide
│   ├── snowflake/          # In-browser Snowflake SQL engine (lexer, parser, planner, executor, functions, formatter, session, bridge, seed, state) (__tests__/)
│   ├── dbt/                # Virtual dbt CLI (project discovery, runner, output, data) (__tests__/)
│   ├── git/                # Virtual git CLI (repo, output, remotes, types) (__tests__/)
│   ├── mail/               # In-game email system (delivery, dispatcher, Maildir layout) (__tests__/)
│   ├── piper/              # Piper messaging system (PiperSession, delivery, render, types) (__tests__/)
│   ├── prompt/             # Inline prompt system (numbered choices for email replies, narrative)
│   ├── session/            # Shared ISession interface and SessionResult types
│   ├── terminal/           # keyCodes, copyMode (CopyModeController), tmuxConfig parser, ansiPalette, zshHistory parser
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
- **Five computers**: Home PC (`"home"`), NexaCorp workstation (`"nexacorp"`), per-player Coder dev container (`"devcontainer"`, hostname `coder-ai`), shared Chip platform Coder workspace (`"chipinfra"`, hostname `coder-chip`), and Erik's work laptop (`"erik-pc"`, hostname `nexacorp-lt05`, 10.20.5.84). Each has its own filesystem in `computerState` (Zustand). `ComputerId` lives in `state/types.ts`; `PLAYER`/`COMPUTERS` config (including per-computer usernames via `getComputerUsername()`) in `story/player.ts`. Coder workspaces are reached from NexaCorp via `coder ssh ai|chip` (`chip` gated behind `unlock_chip_plugin_development`); erik-pc is reached from chipinfra via an SSH-agent-forwarding pivot (read `/tmp/ssh-mZ4xPq/.user-erik`, export `SSH_AUTH_SOCK`, `ssh erik@nexacorp-lt05`), and `exit` returns to chipinfra. All transitions route through the source-aware `dispatchTransition()` helper in `useComputerTransitions.ts` (called from both `useTerminal.ts` and `useSessionRouter.ts`); first-time transitions play fullscreen animations, later ones open tabs instantly. `exit` is a **soft disconnect** everywhere (true-to-life ssh: only the current session ends — other tabs and the source machine's `computerState` survive, and reconnecting reattaches to the state as left, including nexacorp→home mid-shift; `ssh` back skips the boot/logo, and `ssh` never closes home tabs). The **end-of-day** nexacorp exit is the exception (`isEndOfDayExit()`: Day 1 `read_end_of_day && !day1_shutdown`, Day 2 `accusation_made`): it tears the workday down — closes all work-machine tabs (nexacorp/devcontainer/chipinfra/erik-pc), `removeComputer()`s them, rebuilds home, runs evening deliveries. The Day 1→2 `shutdown` and the termination cinematic do the same teardown; a remote `shutdown` (and `coder stop`) also sets `closeTabsForComputer`, which `useTerminal.ts` expands via `getConnectionClosure()` (`story/player.ts`, topology in `CONNECTION_PARENT`): a rebooting box drops every SSH session to it AND every session chained through it (nexacorp down → devcontainer/chipinfra/erik-pc tabs close too), unlike `exit`.
- **Multi-terminal tabs**: Players can open up to 5 terminal tabs on different computers simultaneously; `TabManager.tsx` orchestrates tab lifecycle and each tab has its own xterm instance, cwd, and session state. Tab state (`tabs[]`, `activeTabId`) lives in Zustand and is persisted (`SaveData.tabs` + `activeTabIndex`). `tabs_unlocked` is set `true` in `createInitialState()`, so tabs and copy mode are available from game start. Tmux-style shortcuts (`<prefix>, C/X/N/P/1-5`); `<prefix>, X` shows a tmux `confirm-before` style kill-pane prompt rendered in the status bar (never the terminal buffer), with a force-close warning when the session has unsaved work. **Copy mode** (`<prefix>, [`) is tmux/vi-style keyboard copy with content-aware cursor motion and tmux-faithful line wrapping, implemented by `CopyModeController` in `src/engine/terminal/copyMode.ts` (see that file for exact key/cursor semantics; clipboard via `src/lib/clipboard.ts`, key-hint overlay toggled with `?` and persisted as `copyModeHelpHidden`). It works over any session: inline sessions navigate the real scrollback, alt-screen sessions (`nano`/`less`/`piper`, per `sessionUsesAltScreen()` in `src/engine/session/types.ts`) are confined to the visible screen and get a `resize()` redraw on exit. The tab bar (`TabBar.tsx`) is styled as a tmux status line (`[session]` block, `index:host:dir` windows, 1-based, `*` on current); its "+" dropdown offers home plus only machines with at least one open tab, so preserved-but-disconnected state (mid-shift soft disconnect) is reachable only via `ssh`/`coder`, never one click from "+". The prefix key and status-bar colors are user-configurable via `~/.tmux.conf` on the home PC, parsed live by `parseTmuxPrefix()`/`parseTmuxTheme()` in `src/engine/terminal/tmuxConfig.ts` (default Ctrl+Space; named colors resolve against `src/engine/terminal/ansiPalette.ts`; `DEFAULT_TAB_BAR_THEME` is the fallback). The prefix label reaches `help` via `CommandContext.tabPrefixLabel`. Per-computer command queue serializes FS mutations to prevent TOCTOU races.
- **Per-computer FS in store**: `computerState: Record<ComputerId, { fs: VirtualFS; envVars; aliases; mounts }>` holds per-computer filesystem state. There are no legacy `fs`, `cwd`, or `activeComputer` fields — these are derived from `computerState` and `tabs`. Pipeline execution reads fresh FS from `getState().computerState[computerId]`, accumulates in local `runningFs` and `runningMounts`, writes once at end via `setComputerFs()` / `setComputerMounts()`. CWD is per-tab via `setTabCwd()`. Active computer is derived from the active tab's `computerId`. Hooks use `getState()` for global state (storyFlags, deliveredEmailIds, etc.) instead of synced refs. Computer transitions use `setTabComputer()` to repurpose the current tab instead of stash/swap.
- **Shell history = the `.zsh_history` file (single source of truth)**: There is **no** separate `commandHistory[]` array or `pushHistory` action. Up-arrow recall (`useCommandLine`), the `history` command (via `ctx.commandHistory`), and autosuggestions (`SuggestionContext.commandHistory`) all derive their list by parsing the per-computer `~/.zsh_history` VFS file with `parseZshHistory()` (`src/engine/terminal/zshHistory.ts`, plain one-command-per-line format). The runner appends each submitted line to the file at `useTerminal.ts` (HIST_IGNORE_DUPS) and writes it back via `setComputerFs()`. Because `removeComputer` deletes a computer's FS (work machines on end-of-day exit / Day-1→2 shutdown / termination) and home is rebuilt-from-seed on shutdown, a **durable `zshHistory: Partial<Record<ComputerId, string>>` mirror** in the store survives both: `setComputerFs` refreshes it from the written-back file, and `initComputer` (the single funnel for every FS rebuild) restores it into the freshly-built fs (the `merge` rebuild safety-valve does the same). Guards use `!= null` so a truncated/empty history is preserved faithfully. The mirror is persisted (partialize/merge + `SaveData.zshHistory`). So `cat .zsh_history`, `history`, and up-arrow always agree and continue across day/computer transitions.
- **Delivery extraction**: `processDeliveries()` in `engine/commands/processDeliveries.ts` is a pure function extracted from `computeEffects()`. Handles story flag triggers, email/piper deliveries, and piper_delivered flag cascades.
- **Command availability**: Home PC has `HOME_COMMANDS` available from the start; `HOME_GATED` commands (ssh, sudo, apt, pdftotext, tree) require story flags to unlock. NexaCorp has most commands available by default (including python); `git`, `snow`, and `dbt` are `DEVCONTAINER_ONLY` — never available on NexaCorp (they print the plain red "command not found" there, not the yellow unlock hint, since they never unlock on the workstation). `NEXACORP_GATED` commands are introduced gradually via colleague messages — search tools (grep/find/diff), inspection tools (head/tail/wc), processing tools (sort/uniq), coder, chip, and piper are each gated by story flags. Both Coder workspaces (`devcontainer` and `chipinfra`) share the `DEVCONTAINER_COMMANDS` whitelist (dbt/snow/python/chip always available). erik-pc gets the home command set with **no tutorial flag gates** (Erik's laptop is fully set up; only `DEVCONTAINER_ONLY` stays blocked). `availability.ts` gates command access by computer + flags; gate data lives in `story/commandGates.ts`. See the **narrative skill** for full gating details
- **Story/engine separation**: Story content (email definitions, Piper message definitions, filesystem builders, chapters, story flags, Chip menu items, seed data) lives in `src/story/`. Engine modules (`engine/narrative/`, `engine/mail/`, `engine/piper/`, `engine/commands/availability.ts`) re-export or import from `story/` for runtime logic

## Story Docs

`docs/storyboard/chapter-1.md`, `docs/storyboard/chapter-2.md`, `docs/storyboard/chapter-3.md` - detailed storyboards for each chapter, including narrative beats, character dialogue, and key player actions. Updated as story content is added or revised.
`docs/characters.md` - read before writing character dialogue or designing character-specific content. Defines each character's personality, motivations, and relationships to other characters.
`docs/timeline.md` - master timeline of all story events. Updated as new story beats are added.
