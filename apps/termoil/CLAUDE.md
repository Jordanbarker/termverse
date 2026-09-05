# Termoil

A narrative-driven browser game that teaches Linux/terminal through a workplace mystery. Prioritize narrative realism in all game content — the game should reflect true-to-life zsh/git/data/characters.

**Chip is an in-game LLM chatbot** — same shape as ChatGPT Codex or Claude Code. It is **not autonomous and not sentient**. Users prompt it through the `chip` CLI; it responds. (See the `apps/termoil:narrative` skill for full detail.)

> This is the termoil app. Monorepo-wide context (`@tt/core`, tech stack, top-level commands, deploy) lives in the repo-root `.claude/CLAUDE.md`. The story-specific skills are `narrative`, `dbt`, `piper`, `git`, `email`, `save`, `snowflake`, and `apps/termoil:play-testing` (that one needs the scope prefix — term-crunch has a skill of the same name). The root skills are `commands`, `tmux`, `termoil`, `term-crunch`.

## In-Game Commands

The full builtin roster + registration lives in `src/engine/commands/builtins/index.ts` and `story/commandGates.ts` — read there rather than a mirror. That index pulls in `@tt/core`'s story-agnostic builtins, then this app's story ones (same directory), then the seams core's builtins read — its import block is the authoritative list: `../scriptInterceptor` plus `story/{envTriggers,editorTriggers,diffTriggers,queryTriggers,warehouseIdentity}`, and `registerManSummaries(TERMOIL_MAN_SUMMARIES)` at the bottom. Shell-layer errors use zsh wording (only the `bash` script runner keeps `bash:` prefixes). See the **commands** skill.

## Project Structure

Rooted at `apps/termoil/`; `scripts/` (play-testing harness + `generate_data/`) is a sibling of `src/`. Under `src/`: `app/` (Next.js App Router, single page), `components/` (`Terminal/`, `HUD/`, `Game/`), `engine/` (game systems — most story-coupled; the generic engine now lives in `@tt/core`), `story/` (all content: emails, piper, filesystem builders, chapters, flags, chip menu, seed data), `state/` (Zustand store + save system), `hooks/`, `lib/`.

> **Path convention.** A bare `src/...` path means `apps/termoil/src/...`; the generic engine lives at `packages/core/src/` (`commands`, `filesystem`, `git`, `dbt`, `snowflake`, `session`, `editor`, `pager`, `vim`, `python`, `ssh`, `suggestions`, `terminal`, `lib`, `components`). Story-coupled engine dirs (`engine/{mail,piper,prompt,narrative,chip}` and the story builtins) stayed in the app.

> **`src/lib/`** holds what looks generic but is really story content: `ascii.ts` (NexaCorp logo, maniac-iv login/boot copy, Coder banners, credits) and `timing.ts` (Chip/Piper pacing). Engine-level pacing — boot, shutdown, dbt, the security-termination cinematic — stays in `@tt/core/lib/timing`.

## Key Architectural Decisions

- **Immutable filesystem**: VirtualFS mutations return new instances (enables React re-renders, future undo/redo).
- **Minimal engine→state coupling**: engine files may import types from `state/types.ts` but never Zustand stores/actions; runtime deps flow via `CommandContext`. Core never imports app code at all — it gets what it needs through injected seams (**commands** skill).
- **Decomposed terminal hooks**: `useTerminal` (orchestrator; the chain/pipe execution loop itself is the shared `@tt/core/commands/runPipeline`, with context building and effects application injected) → `useSessionRouter` (session lifecycle) + `useCommandLine` (thin wrapper over the shared `@tt/core/terminal/lineEditor` `LineEditor`). Cursor-aware editing + zsh secondary-prompt continuation live in `@tt/core` and are shared with term-crunch; `useTerminal` only ever receives one complete submitted line.
- **Single-page app**: chapter transitions are state changes, not routes. **Dynamic xterm import** (`ssr:false`). **Static export** to GitHub Pages.
- **Five computers**: `home`, `nexacorp`, per-player `devcontainer` (`coder-ai`), shared `chipinfra` (`coder-chip`), and `erik-pc` (`nexacorp-lt05`, 10.20.5.84). Each has its own FS in `computerState`; `ComputerId` in `state/types.ts`, `PLAYER`/`COMPUTERS` (+ per-computer usernames via `getComputerUsername()`) in `story/player.ts`. Reached via `coder ssh ai|chip` and the chipinfra→erik-pc SSH-agent pivot. All transitions route through `dispatchTransition()` in `useComputerTransitions.ts`; `exit` is a soft disconnect everywhere except the end-of-day nexacorp exit. See the **narrative** skill for the transition/teardown contract.
- **Multi-terminal windows + panes**: a true tmux model, mostly in `@tt/core`; app-side are the store (`windows[]`/`activeWindowId` + actions) and the thin `TabManager`/`TabBar` adapters (story gates, close-confirm, splash, session wiring). `tabs_unlocked` from game start. **See the `tmux` skill.**
- **Per-computer FS in store**: `computerState: Record<ComputerId, {fs, envVars, aliases, mounts}>`. No legacy `fs`/`cwd`/`activeComputer` fields — derived from `computerState` + the active pane (`getActiveLeaf`). Pipeline reads fresh FS from `getState()`, accumulates locally, writes once via `setComputerFs`/`setComputerMounts`; cwd per-pane; active computer derived from the active pane.
- **Shell history = the `.zsh_history` file (single source of truth)**: no separate `commandHistory[]` array. Up-arrow, the `history` command, and autosuggestions all parse the per-computer `~/.zsh_history`. The store's durable `zshHistory` mirror is the **save** skill's.
- **Command availability**: home has `HOME_COMMANDS` from start, `HOME_GATED` unlocks via flags; nexacorp gates via `NEXACORP_GATED` (introduced through colleague messages); `git`/`snow`/`dbt` are `DEVCONTAINER_ONLY`; erik-pc gets the home set with no tutorial gates. Data in `story/commandGates.ts`; see the **narrative** skill.
- **Story/engine separation**: content lives in `src/story/`; engine modules re-export/import from it for runtime logic.

## Story Docs

- `apps/termoil/docs/storyboard/chapter-{1,2,3}.md` — per-chapter narrative beats, dialogue, key player actions.
- `apps/termoil/docs/characters.md` — read before writing character dialogue: personality, motivations, relationships, mystery angle.
- `apps/termoil/docs/timeline.md` — master timeline of story events.
- `apps/termoil/docs/mystery.md` — the clue chain, act by act.
- `apps/termoil/docs/notes.md` — unstructured scratch (quest ideas, log inventory, cheatsheets); not authoritative.
