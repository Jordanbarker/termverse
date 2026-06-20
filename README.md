# Termoil

A workplace mystery, played from a zsh-themed terminal. 

Play it from your browser: https://jordanbarker.github.io/termverse/termoil/

## What it looks like

Command history, suggestions, autocomplete, aliases 

![Investigating the file system](.assets/file-demo.gif)

### Modern Data Stack

SSH into a coder dev container, git clone, run dbt commands, and query snowflake data.

![Git clone, dbt build](.assets/git-dbt.gif)

## Play Locally

```bash
npm run dev
```

Saves live in `localStorage`. To start over from scratch, in your browser devtools:

```js
localStorage.removeItem('termoil-save'); location.reload();
```

### Spoilers!

The `docs/` directory holds the story flows. 