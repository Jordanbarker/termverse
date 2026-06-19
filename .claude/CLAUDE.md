CRITICAL: keep `.claude/*` docs (this file, per-app `CLAUDE.md`s, and all `SKILL.md`s) up-to-date as the code changes.
Run `npm run typecheck` and `npx vitest run` after making code changes.

# Terminal Turmoil monorepo

An npm-workspace monorepo (`workspaces: ["packages/*", "apps/*"]`) holding a reusable terminal engine and two games built on it.

## Workspaces

- **`packages/core` (`@tt/core`)** — the reusable, **story-agnostic** terminal engine: VirtualFS, command engine + builtins, git/dbt/snowflake engines, the pane/window tree model (`@tt/core/terminal/paneTypes`), `PaneDividers`, sessions (editor/pager), and the zsh-style autosuggestion + TAB-completion engine (`@tt/core/suggestions/{suggest,complete}`). It is a **raw-TS package (no build step)** — consumers resolve it via tsconfig `paths` (`@tt/core`, `@tt/core/*`) for typecheck and, for the Next apps, via a node_modules workspace symlink + `transpilePackages: ["@tt/core"]`. Each app's Tailwind v4 `@source` directive must point at `packages/core/src` so core component classes emit. **When you change `@tt/core`, both apps consume it — check both.** Game-state-control commands (`save`/`load`/`newgame`) are **not** in core — they live in `apps/terminal-turmoil/src/engine/commands/builtins/` since they emit `gameAction`s only the narrative game's save system consumes; puzzle-game has no save system.
- **`apps/terminal-turmoil` (`@tt/terminal-turmoil`,** basePath `/terminal-turmoil`**)** — the narrative game (a workplace-mystery Linux/terminal teacher). App code in `apps/terminal-turmoil/src/`; play-testing harness in `apps/terminal-turmoil/scripts/`. **For its architecture, story/engine split, computers, panes, and command gating, see `apps/terminal-turmoil/CLAUDE.md`** (and the `apps/terminal-turmoil:*` directory-scoped skills).
- **`apps/puzzle-game` (`@tt/puzzle-game`,** basePath `/terminal-turmoil/puzzle-game`**)** — a second game built **entirely on `@tt/core`** to prove the engine-reuse pattern. It does **not** import terminal-turmoil's story code. **For its store/renderer/challenge framework, see `apps/puzzle-game/CLAUDE.md`** (and the `apps/puzzle-game:challenges` skill).

The two shared engine skills — **`tmux`** (window/pane tree, copy mode, status line, `.tmux.conf` parsing) and **`commands`** (parser, registry, pipeline, builtins) — stay at root `.claude/skills/` because they cover `@tt/core`, consumed by both apps.

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

The repo-root `package.json` is the workspace root only — its `dev`/`build`/`analyze`/`generate-data` scripts delegate to `@tt/terminal-turmoil`; `typecheck` runs `npm --workspaces --if-present run typecheck` (covers `@tt/core` + both apps).

```bash
npm run dev          # terminal-turmoil dev server
npm run build        # terminal-turmoil production build (static export to apps/terminal-turmoil/out/)
npm run dev:puzzle   # puzzle-game dev server
npm run build:puzzle # puzzle-game production build
npm run lint         # ESLint
npm run typecheck    # TypeScript checking across all workspaces
npm run test         # Vitest (or: npx vitest run)
npm run check        # Combined typecheck + test + build
```

## Deploy

`.github/workflows/deploy.yml` builds **both** apps and assembles one GitHub Pages artifact (`_site/`): terminal-turmoil at `/terminal-turmoil/`, puzzle-game nested at `/terminal-turmoil/puzzle-game/`. basePath is the repo-name Pages path, so it is independent of the source directory.
