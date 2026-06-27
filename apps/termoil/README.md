# Termoil

A workplace mystery, played from a zsh-themed terminal.

Play it from your browser: https://jordanbarker.github.io/termverse/termoil/

Part of the [termverse](../../README.md) monorepo.

## What it looks like

Command history, suggestions, autocomplete, aliases

![Investigating the file system](../../.assets/file-demo.gif)

### Modern Data Stack

SSH into a coder dev container, git clone, run dbt commands, and query snowflake data.

![Git clone, dbt build](../../.assets/git-dbt.gif)

## Play Locally

From the repo root:

```bash
npm run dev
```

Saves live in `localStorage`. To start over from scratch, in your browser devtools:

```js
localStorage.removeItem('termoil-save'); location.reload();
```