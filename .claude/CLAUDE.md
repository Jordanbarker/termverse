CRITICAL: keep `.claude/*` docs (this file, per-app `CLAUDE.md`s, and all `SKILL.md`s) up-to-date as the code changes.
Run `npm run typecheck` and `npx vitest run` after making code changes.

# Termverse monorepo

An npm-workspace monorepo (`workspaces: ["packages/*", "apps/*"]`) holding a reusable terminal engine and games built on it. The repo (and its GitHub Pages basePath) is **termverse**.

## Workspaces

- **`packages/core` (`@tt/core`)** — the reusable terminal engine: VirtualFS, command engine + builtins, git/dbt/snowflake engines, the pane/window tree model (`@tt/core/terminal/paneTypes`), `PaneDividers`, sessions (editor/pager), and the zsh-style autosuggestion + TAB-completion engine (`@tt/core/suggestions/{suggest,complete}`). It is a **raw-TS package (no build step)** — consumers resolve it via tsconfig `paths` (`@tt/core`, `@tt/core/*`) for typecheck and, for the Next apps, via a node_modules workspace symlink + `transpilePackages: ["@tt/core"]`. Each app's Tailwind v4 `@source` directive must point at `packages/core/src` so core component classes emit. **When you change `@tt/core`, both apps consume it — check both.** Game-state-control commands (`save`/`load`/`newgame`) are **not** in core — they live in `apps/termoil/src/engine/commands/builtins/` since they emit `gameAction`s only the narrative game's save system consumes; term-crunch has no save system.

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

The repo-root `package.json` is the workspace root only — its `dev`/`build`/`analyze`/`generate-data` scripts delegate to `@tt/termoil`; `typecheck` runs `npm --workspaces --if-present run typecheck` (covers `@tt/core` + both apps).

```bash
npm run dev          # termoil dev server
npm run build        # termoil production build (static export to apps/termoil/out/)
npm run dev:crunch   # term-crunch dev server
npm run build:crunch # term-crunch production build
npm run lint         # ESLint
npm run typecheck    # TypeScript checking across all workspaces
npm run test         # Vitest (or: npx vitest run)
npm run check        # Combined typecheck + test + build
```

## Deploy

`.github/workflows/deploy.yml` builds **both** apps and assembles one GitHub Pages artifact (`_site/`): a static landing page (`site/index.html`) at `/termverse/`, termoil nested at `/termverse/termoil/`, and term-crunch nested at `/termverse/term-crunch/`. basePath is the repo-name (`termverse`) Pages path, so it is independent of the source directory.
