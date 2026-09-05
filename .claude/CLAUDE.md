CRITICAL: keep `.claude/*` docs (this file, per-app `CLAUDE.md`s, and all `SKILL.md`s) up-to-date with important information. Docs point, code explains.
Run `npm run typecheck` and `npx vitest run` after making code changes.

# Termverse monorepo

An npm-workspace monorepo (`workspaces: ["packages/*", "apps/*"]`) holding a reusable terminal engine and games built on it. The repo (and its GitHub Pages basePath) is **termverse**.

## Workspaces

- **`packages/core` (`@tt/core`)** — the reusable terminal engine: VirtualFS, command engine + builtins, git/dbt/snowflake engines, the pane/window tree model (`@tt/core/terminal/paneTypes`), `PaneDividers`, sessions (nano/vim editors, pager), and the zsh-style autosuggestion + TAB-completion engine (`@tt/core/suggestions/{suggest,complete}`). It is a **raw-TS package (no build step)** — consumers resolve it via tsconfig `paths` (`@tt/core`, `@tt/core/*`) for typecheck and, for the Next apps, via a node_modules workspace symlink + `transpilePackages: ["@tt/core"]`. Each app's Tailwind v4 `@source` directive must point at `packages/core/src` so core component classes emit. **When you change `@tt/core`, both apps consume it — check both.** **Core registers only story-agnostic commands**: termoil's story builtins live in `apps/termoil/src/engine/commands/builtins/` (roster in the **commands** skill), as do its ASCII art and Chip/Piper pacing constants (`apps/termoil/src/lib/{ascii,timing}.ts`). Anything core needs to know about one game arrives through a seam it injects — never a literal machine id, flag name, or path in `packages/core`. `apps/term-crunch/src/__tests__/coreSurface.test.ts` guards the command half of that rule; the full seam list is in the **commands** skill.

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

The repo-root `package.json` is the workspace root only — its `build`/`start`/`analyze`/`generate-data` scripts delegate to `@tt/termoil`; `typecheck` runs `npm --workspaces --if-present run typecheck` (covers `@tt/core` + both apps). The root `dev` is the exception: it runs `scripts/dev-termverse.mjs`, a zero-dependency orchestrator that boots **both** game dev servers (termoil on 3000, term-crunch on 3001) plus the landing page (8080, serving `site/index.html` with its game links rewritten to the dev ports). It is a live-dev convenience, not the production-faithful nested `/termverse/` layout (basePath is `""` in dev). Use `dev:termoil` / `dev:crunch` for a single game.

```bash
npm run dev          # full termverse: both games (3000/3001) + landing page (8080)
npm run dev:termoil  # termoil dev server only
npm run dev:crunch   # term-crunch dev server only
npm run build        # termoil production build (static export to apps/termoil/out/)
npm run build:crunch # term-crunch production build
npm run build:all    # both production builds
npm run lint         # ESLint
npm run typecheck    # TypeScript checking across all workspaces
npm run test         # Vitest (or: npx vitest run)
npm run play         # termoil headless REPL (play:crunch for term-crunch)
npm run playtest     # asserting playtests: termoil playtest/:arcs/:git + term-crunch tracks
npm run check        # Combined lint + typecheck + test + playtest + build:all (also run in CI)
npm run screenshot:panes  # browser visual harnesses (scripts/visual/, needs a dev server); also screenshot:mp-reward
```

## Deploy

`.github/workflows/deploy.yml` builds **both** apps and assembles one GitHub Pages artifact (`_site/`): a static landing page (`site/index.html`) at `/termverse/`, termoil nested at `/termverse/termoil/`, and term-crunch nested at `/termverse/term-crunch/`. basePath is the repo-name (`termverse`) Pages path, so it is independent of the source directory.
