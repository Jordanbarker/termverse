# Termverse

Terminal based browser games, built on one reusable terminal engine.

Play them: https://jordanbarker.github.io/termverse/

## Games

- **[termoil](apps/termoil/README.md)** — a workplace mystery
- **term-crunch** — bite-size terminal-skills challenges

## Local dev

```bash
npm install

npm run dev          # full termverse: both games + landing page
npm run dev:termoil  # termoil dev server only
npm run dev:crunch   # term-crunch dev server only

npm run build        # termoil static export
npm run build:crunch # term-crunch static export
```