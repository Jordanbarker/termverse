---
name: play-testing
description: "Headless game runner for programmatic play-testing without a browser, plus a Playwright recipe for browser-driving the real game. Use this skill whenever modifying GameRunner, using the headless runner for testing, working on apps/termoil/scripts/play.ts, manually play-testing the game from the terminal, or verifying tab/transition/xterm behavior in the browser."
---

# Headless Game Runner

`apps/termoil/scripts/play.ts` replicates the browser game loop from `useTerminal.ts` without xterm.js or React. It exports a **`GameRunner`** class (read its API + the `CommandOutput` return type in `play.ts` — not mirrored here) and an interactive REPL. The play scripts are a sibling of `src/` (so `../src/*` imports resolve); engine primitives come from `@tt/core`, story+state from `apps/termoil/src/`. Run via the workspace scripts (`npm -w @tt/termoil run play|playtest|playtest:arcs|...`) so `tsx` picks up the path aliases. The script mocks `globalThis.localStorage` before imports so Zustand's persist doesn't crash in Node.

## GameRunner essentials

Construct with a computer (`new GameRunner("home")`); public state (`fs`, `cwd`, `storyFlags`, `deliveredEmailIds`, etc.) is readable/writable. Core methods: `run(input)` / `runAsync(input)` (mirror `useTerminal` submission — alias expansion, `parseChainedPipeline`, per-segment pipeline+redirection, `computeEffects()` per segment; a session/prompt/transition stops the chain; use `runAsync` for possibly-async commands like `dbt`, else `run` errors with "use runAsync()"), `selectOption(n)` (resolve a pending `mail` reply prompt), `writeFile` (replaces nano), `runPython` (via child_process), `switchComputer(to)` (rebuild target FS, reset cwd; env/aliases init on **first visit only**, matching `gameStore.initComputer` — but FS is rebuilt from seed every switch, so file changes don't survive a round-trip; env/aliases/mounts/flags do), `status()`.

## Multi-arc regression playtest

`scripts/playtest_arcs.ts` runs each major arc end-to-end with a fresh runner per scenario (home main path, Olive's challenges, backup quest, rejection ×3, Edward onboarding, Oscar logs, Auri dbt, Dana ops, end-of-day shutdown, USB tip, Day 2 pipeline fix, chipinfra plugin build, Loose Thread pivot, Marcus endgame ×4, security tripwires). Run `npm -w @tt/termoil run playtest:arcs`. **Two known limitations to plan around:**
- **Piper replies aren't interactively driven headlessly.** Where a piper-reply unlock flag would fire from `useSessionRouter.ts`, set it manually via `simulatePiperUnlocks(runner, ...)` and note the simulation. For piper-reply correctness, lean on the per-message vitest suites.
- **`.git` doesn't live in FS builders** — it's created at runtime by `git clone`/`init`. Testing Day 2 flows from a fresh runner: run `git clone` first; don't pre-set `dbt_project_cloned: true` (bakes the dbt tree but no `.git`, leaving `pull`/`checkout -b` failing). The real game persists `.git` via Zustand across days.

## Browser play-testing (Playwright)

The headless runner has **no tab model and no transition animations** — tab survival, the "+" dropdown, computer-transition behavior (`useComputerTransitions.ts`), and anything React-side can only be verified in the real browser. This recipe is repeatable.

### Setup

- **Dev server:** a `next dev` is often already on :3000 (a second `npm run dev` fails on `.next/dev/lock` → :3001). Check `curl -s localhost:3000` first.
- **Playwright:** not a repo dep — install in a scratch dir, never in the repo:
  ```bash
  cd $(mktemp -d) && npm init -y && npm i playwright@1.57   # match ~/Library/Caches/ms-playwright build
  ```
  Match the pinned version to the cached browser build (e.g. `chromium-1200` → playwright 1.57) or it demands a ~120MB download.

### Game-side facts the driver must know

- Fresh context = fresh localStorage = **new game** → boots into a nano tutorial. Send `Control+x` to exit nano before expecting a prompt.
- `cheat N` jumps checkpoints (1=day1-start … 5=day2-chapter3-marcus-dm; see `src/story/checkpoints.ts`). `cheat 3` (day2-start, nexacorp, mid-shift) is the best transition-testing fixture.
- After `cheat`, home FS is rebuilt **without** a nexacorp `known_hosts` entry, so the first `ssh nexacorp-ws01.nexacorp.internal` shows the fingerprint prompt — answer `yes` (persists after).
- Player is `ren`; ssh route `ssh nexacorp-ws01.nexacorp.internal` (see `SSH_ROUTES` in `builtins/ssh.ts`).
- Transitions print on `setInterval` at `BOOT_LINE_INTERVAL_MS` (300ms) — use polling waits with generous (15–25s) timeouts, never fixed sleeps.

### Driving xterm.js

- **Renderer is DOM** (no canvas/webgl), so text is readable from `.xterm-rows` innerText.
- **Windows hold panes (tmux model).** Each pane is an absolutely-positioned container in the `.isolate` wrapper; **only the active window's panes are shown, rest are `display:none`.** Enumerate visible panes: `[...document.querySelector('.isolate').children].filter(el => getComputedStyle(el).display !== 'none' && el.clientWidth > 0)`; the active pane has a non-`none` `style.outline`. Split `<prefix> |`/`-` (prefix default Ctrl+Space → `keyboard.down('Control'); press('Space'); up('Control')`), focus `<prefix>`+arrows/`o`, kill `<prefix> x` then `y`.
- **Typing:** real-mouse-click the visible `.xterm-rows` box first (focuses the hidden textarea), then `page.keyboard.type(...)` + `Enter`.
- **React needs real Playwright clicks** — `el.dispatchEvent(new MouseEvent('click'))` from `page.evaluate` does NOT trigger React handlers; use locator clicks.
- **Match output against the tail, not the whole buffer** (scrollback re-matches old prompts forever) — anchor to the last lines (`t.trim().split('\n').pop()` or `$`-anchored multiline regex).

### DOM map

- Tab bar `div.border-b.font-mono`; each button is a **window** labeled `1:nexacorp-ws01:/srv *` (`*`=active, `(n)`=pane count); new-window button is exact-text `+`.
- "+" dropdown items are buttons labeled with `promptHostname` (`maniac-iv`, `nexacorp-ws01`, `coder-ai`, …) — home plus only machines with ≥1 open pane; a single eligible machine opens a window directly (no dropdown).
- The objective tracker ("In Production") is also buttons — filter it out when enumerating.

### Driver skeleton

```js
const termText = () => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.xterm-rows')];
  const v = rows.find(r => getComputedStyle(r).visibility === 'visible') || rows[0];
  return v ? v.innerText : '';
});
const type = async (s) => {
  const box = await page.evaluate(() => {
    const v = [...document.querySelectorAll('.xterm-rows')]
      .find(r => getComputedStyle(r).visibility === 'visible');
    const r = v.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await page.keyboard.type(s, { delay: 15 });
  await page.keyboard.press('Enter');
};
const waitText = async (re, timeout = 20000) => {   // poll; throw with term tail on timeout
  for (const start = Date.now(); Date.now() - start < timeout; ) {
    const t = await termText();
    if (re.test(t)) return t;
    await page.waitForTimeout(300);
  }
  throw new Error(`timeout waiting for ${re}`);
};
```

Capture a screenshot + tab-bar text + terminal tail after every step — screenshots are the reviewer's evidence, and `bar.innerText` is the assertion surface for tab-survival claims.

### Example flow (soft-disconnect verification)

new game → exit nano → `cheat 3` → leave evidence (`echo x > ~/proof.txt`) → "+" second nexacorp window → `coder ssh ai` → switch to window 1 → `exit` (assert sibling survives) → "+" dropdown at home (assert only `maniac-iv` + machines with open panes) → `ssh` back (fingerprint `yes`; assert no boot logo = reattach) → `cat ~/proof.txt` (state survived). Remote-shutdown cascade: with sibling nexacorp + devcontainer panes open, `shutdown -h now` on nexacorp must close BOTH (connection-closure expansion in `useTerminal.ts`), active pane landing home.
