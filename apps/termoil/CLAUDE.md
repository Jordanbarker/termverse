# Termoil

A narrative-driven browser game that teaches Linux/terminal through a workplace mystery. Prioritize narrative realism in all game content — the game should reflect true-to-life zsh/git/data/characters.

**Chip is an in-game LLM chatbot** — same shape as ChatGPT Codex or Claude Code. It is **not autonomous and not sentient**. Users prompt it through the `chip` CLI; it responds. (See the `apps/termoil:narrative` skill for full detail.)

> This is the termoil app. Monorepo-wide context (`@tt/core`, tech stack, top-level commands, deploy) lives in the repo-root `.claude/CLAUDE.md`. The story-specific skills are directory-scoped: `apps/termoil:{narrative,dbt,piper,git,email,save,snowflake,play-testing}`. The shared engine skills `tmux` and `commands` stay at root.

## In-Game Commands

The full builtin roster + registration lives in `src/engine/commands/builtins/` and `story/commandGates.ts` — read there rather than a mirror. Highlights: standard coreutils (`ls`/`cd`/`cat`/`grep`/`find`/`sort`/etc.), editors/viewers (`nano`/`less`), narrative tools (`mail`/`piper`/`chip`), data tools (`snow`/`dbt`/`git`, dev-container only), computer nav (`ssh`/`coder`/`exit`/`shutdown`), and save control (`save`/`load`/`newgame`). Pipes (`|`), redirection (`>`/`>>`, zsh multios, prechecked), stdin passing, and chaining (`&&`/`||`/`;`) are all supported; shell-layer errors use zsh wording (only the `bash` script runner keeps `bash:` prefixes). See the **commands** skill.

## Project Structure

Rooted at `apps/termoil/`; `scripts/` (play-testing harness + `generate_data/`) is a sibling of `src/`. Under `src/`: `app/` (Next.js App Router, single page), `components/` (`Terminal/`, `Assistant/`, `HUD/`, `Game/`), `engine/` (game systems — most story-coupled; the generic engine now lives in `@tt/core`), `story/` (all content: emails, piper, filesystem builders, chapters, flags, chip menu, seed data), `state/` (Zustand store + save system), `hooks/`, `lib/`.

> **Path convention.** Skill docs may cite bare `src/...` paths. Resolve them as `apps/termoil/src/...` for app/story code, **except** the generic engine modules that moved to `@tt/core` — `commands`, `filesystem`, `git`, `dbt`, `snowflake`, `session`, `suggestions`, `terminal` (paneTypes/copyMode/tmuxConfig/ansiPalette/zshHistory), and `PaneDividers` — which live at `packages/core/src/...`. Story-coupled bits (`engine/mail`, `engine/piper`, `engine/prompt`, `engine/narrative`, `engine/chip`, story command builtins) stayed in the app. The per-directory detail is in the relevant skill; don't duplicate the tree here.

## Key Architectural Decisions

- **Immutable filesystem**: VirtualFS mutations return new instances (enables React re-renders, future undo/redo).
- **Minimal engine→state coupling**: engine files may import types from `state/types.ts` but never Zustand stores/actions; runtime deps flow via `CommandContext`.
- **Decomposed terminal hooks**: `useTerminal` (orchestrator; the chain/pipe execution loop itself is the shared `@tt/core/commands/runPipeline`, with context building and effects application injected) → `useSessionRouter` (session lifecycle) + `useCommandLine` (thin wrapper over the shared `@tt/core/terminal/lineEditor` `LineEditor`). Cursor-aware editing + zsh secondary-prompt continuation live in `@tt/core` and are shared with term-crunch; `useTerminal` only ever receives one complete submitted line.
- **Single-page app**: chapter transitions are state changes, not routes. **Dynamic xterm import** (`ssr:false`). **Static export** to GitHub Pages.
- **Five computers**: `home`, `nexacorp`, per-player `devcontainer` (`coder-ai`), shared `chipinfra` (`coder-chip`), and `erik-pc` (`nexacorp-lt05`, 10.20.5.84). Each has its own FS in `computerState`; `ComputerId` in `state/types.ts`, `PLAYER`/`COMPUTERS` (+ per-computer usernames via `getComputerUsername()`) in `story/player.ts`. Reached via `coder ssh ai|chip` and the chipinfra→erik-pc SSH-agent pivot. All transitions route through `dispatchTransition()` in `useComputerTransitions.ts`; `exit` is a soft disconnect everywhere except the end-of-day nexacorp exit. See the **narrative** skill for the transition/teardown contract.
- **Multi-terminal windows + panes**: a true tmux model (windows own a binary tree of panes). The pure model + status bar + rename prompt are shared `@tt/core`; the app store (`windows[]`/`activeWindowId` + actions) and renderer (`TabManager`/`TabBar`/`PaneDividers`) are app-side. `tabs_unlocked` from game start. **See the `tmux` skill** for the full model, bindings, `.tmux.conf` parsing, copy mode, and rendering.
- **Per-computer FS in store**: `computerState: Record<ComputerId, {fs, envVars, aliases, mounts}>`. No legacy `fs`/`cwd`/`activeComputer` fields — derived from `computerState` + the active pane (`getActiveLeaf`). Pipeline reads fresh FS from `getState()`, accumulates locally, writes once via `setComputerFs`/`setComputerMounts`; cwd per-pane; active computer derived from the active pane.
- **Shell history = the `.zsh_history` file (single source of truth)**: no separate `commandHistory[]` array. Up-arrow, the `history` command, and autosuggestions all parse the per-computer `~/.zsh_history` (`parseZshHistory`, HIST_IGNORE_DUPS). A durable `zshHistory` store mirror survives `removeComputer`/rebuilds (see the **save** skill).
- **Command availability**: home has `HOME_COMMANDS` from start, `HOME_GATED` unlocks via flags; nexacorp gates via `NEXACORP_GATED` (introduced through colleague messages); `git`/`snow`/`dbt` are `DEVCONTAINER_ONLY`; erik-pc gets the home set with no tutorial gates. Data in `story/commandGates.ts`; see the **narrative** skill.
- **Story/engine separation**: content lives in `src/story/`; engine modules re-export/import from it for runtime logic.

## Story Docs

- `docs/storyboard/chapter-{1,2,3}.md` — per-chapter narrative beats, dialogue, key player actions.
- `docs/characters.md` — read before writing character dialogue: personality, motivations, relationships, mystery angle.
- `docs/timeline.md` — master timeline of story events.
