---
name: play-testing
description: "Headless game runner for programmatic play-testing without a browser, plus a Playwright recipe for browser-driving the real game. Use this skill whenever modifying GameRunner, using the headless runner for testing, working on apps/termoil/scripts/play.ts, manually play-testing the game from the terminal, or verifying tab/transition/xterm behavior in the browser."
---

# Headless Game Runner

`apps/termoil/scripts/play.ts` replicates the browser game loop from `useTerminal.ts` without xterm.js or React. It exports a **`GameRunner`** class (read its API + `CommandOutput` in `play.ts`) and a REPL that also works on piped stdin — the fastest way to reproduce a bug by hand:

```
printf 'cheat 3\n:switch devcontainer\ncd nexacorp-analytics\ndbt run\n:quit\n' | npm -w @tt/termoil run play
```

Command gates apply to piped runs too, so route to the right machine first (`git`/`dbt`/`snow` are DEVCONTAINER_ONLY; `cheat 3` lands on nexacorp). Run via a workspace script (`npm -w @tt/termoil run play|playtest|playtest:arcs|...`, or the root `npm run play`; the root `play:crunch` is term-crunch's) so `tsx` picks up the path aliases. The script mocks `globalThis.localStorage` before imports (Zustand persist would crash in Node) and side-effect-imports `story/availabilityPolicy` so the real command gates apply — without it the allow-all default lets gated commands run unlocked.

`playtest`, `playtest:arcs` and `playtest:git` exit non-zero on failure and gate CI via the root `npm run playtest` (part of `npm run check`); `playtest:git` is scoped to the Day 2 git questline (clone → pull → branch → commit → push) and is the one to run after touching the git engine or its remotes. `playtest:nexacorp` and `playtest:reference` stay print-for-review. `playtest.ts` treats `warn()` as non-fatal; only `issue()` fails.

## GameRunner essentials

Construct with a computer (`new GameRunner("home")`); public state (`fs`, `cwd`, `storyFlags`, `deliveredEmailIds`, etc.) is readable/writable. Core methods: `run(input)` / `runAsync(input)` (mirror `useTerminal` submission; use `runAsync` for possibly-async commands like `dbt`), `selectOption(n)` (resolve a pending `mail` reply prompt), `writeFile` (replaces nano), `runPython`, `switchComputer(to)` (rebuilds the target FS from seed each switch, so file changes don't survive a round-trip; env/aliases/mounts/flags do; devcontainer routes through `buildFs` so a cloned dbt project keeps its `.git`), `status()`.

**`buildCtx` must stay in lockstep with `buildCommandContext` in `src/hooks/useTerminal.ts`.** The parity block is commented as such in `play.ts` — add any new seam there too, or a headless run silently stops being evidence about the real game. The pane-model fields (`tabPrefixLabel`, `tmux`) are the deliberate exception.

`save`/`load`/`cheat`/`newgame` work headlessly: `applyGameAction` mirrors the `effects.gameAction` branch of `executeEffects`. `cheat` is not a hand-written mirror — both it and `gameStore.loadCheckpointData` call `buildCheckpointState` (`src/state/checkpointLoad.ts`); add store-free checkpoint behavior there, not twice. Slots live in the mocked process-local `localStorage`, so save and load within one session. `shutdown`/`reboot` remain React-only cinematics. `CommandOutput` reports `transitionTo` + `terminationReason`, so security tripwires are assertable; the runner reports an ordinary route without walking it (follow with `:switch`), while a tripwire is enacted.

`selectOption(n)` reproduces `useSessionRouter.processTriggerEvents` but stops short of the piper cascade — the ordering and the reason are commented at `play.ts`'s `selectOption`; the workaround is the limitation below.

## Multi-arc regression playtest

`scripts/playtest_arcs.ts` runs each major arc end-to-end with a fresh runner per scenario. Run `npm -w @tt/termoil run playtest:arcs`. Prefer `fail()` over `warn()`: a warn is invisible to CI, so an arc that only warns is an untested arc. **Three limitations to plan around:**
- **Piper replies aren't interactively driven headlessly.** Set the unlock flag manually via `simulatePiperUnlocks(runner, ...)` and note the simulation; lean on the per-message vitest suites for piper-reply correctness.
- **`.git` doesn't live in FS builders** — it's created at runtime by `git clone`/`init`. Testing Day 2 from a fresh runner: run `git clone` first; don't pre-set `dbt_project_cloned: true` (bakes the dbt tree with no `.git`).
- **A tripwire arc must actually reach the protected path.** `/srv/leadership` is `drwx------`, so a single-file `cp` fails on stat before the policy sees it; recurse (`cp -r /srv/leadership ~/`) and assert `out.terminationReason.kind`.

## Browser play-testing (Playwright)

The headless runner has **no tab model and no transition animations** — tab survival, the "+" dropdown, computer-transition behavior (`useComputerTransitions.ts`), and anything React-side can only be verified in the real browser. This recipe is repeatable.

### Setup

- **Dev server:** use `npm run dev:termoil` and check `curl -s localhost:3000` first (a `next dev` is often already up; a second one fails on `.next/dev/lock`). The **root** `npm run dev` is the whole termverse orchestrator — termoil on 3000, term-crunch on 3001, landing page on 8080 — so it is not the single-app server this recipe assumes.
- **Playwright:** a repo-root devDependency (pinned `1.61.0`) — drive it from the repo root, no scratch install. If it demands a browser download: `npx playwright install chromium`.

### Game-side facts the driver must know

- Fresh context = fresh localStorage = **new game** → boots into a nano tutorial. Send `Control+x` to exit nano before expecting a prompt.
- `cheat N` jumps checkpoints (see `src/story/checkpoints.ts`); `cheat 3` (day2-start, nexacorp) is the best transition-testing fixture. **When editing a checkpoint, its `deliveredPiperIds` must carry a `reply:<deliveryId>:<index>` marker for every prompt the checkpoint's story position says was answered** — only the newest delivery in a channel may still be pending, or the player can re-decide a recorded branch. Guards live in `story/__tests__/checkpointPiper.test.ts` and `state/__tests__/checkpointLoad.test.ts`.
- After `cheat`, home FS is rebuilt without a nexacorp `known_hosts` entry, so the first `ssh nexacorp-ws01.nexacorp.internal` shows the fingerprint prompt — answer `yes`.
- Player is `ren`; ssh routes are `SSH_ROUTES` in `builtins/ssh.ts`.
- Transitions print on `setInterval` at `BOOT_LINE_INTERVAL_MS` (300ms) — use polling waits with generous (15–25s) timeouts, never fixed sleeps.

### Driving xterm.js

- **Renderer is DOM**, so text is readable off `.xterm-rows`. **Read per-row `textContent`, not `innerText`** — `innerText` collapses blank rows, so a 3-line file reads identically to a 4-line one. Any whitespace/line-count assertion must join the `.xterm-rows` children's `textContent`. Corollary: `ls -l` byte counts are a cheap invisible-whitespace probe, but counts alone never prove content.
- **Windows hold panes (tmux model).** Each pane is absolutely positioned in the `.isolate` wrapper; only the active window's panes are shown (rest `display:none`). Enumerate visible panes: `[...document.querySelector('.isolate').children].filter(el => getComputedStyle(el).display !== 'none' && el.clientWidth > 0)`. Prefix default Ctrl+Space → `keyboard.down('Control'); press('Space'); up('Control')`.
- **Active pane: the outline only exists with 2+ visible panes** (`el.style.outline = "1px solid #e6b450"` via `paneChrome.ts`) — with a single pane every outline is `"none"`, so an empty outline is not evidence your selector is wrong. The `PaneDividers` seams are an independent signal: gold (`bg-[#e6b450]`) borders the active pane vs `bg-[#3d4751]`.
- **Pane-relative chords no-op silently.** `nearestResizableSplit` resolves relative to the *focused* pane — indistinguishable from a broken predicate. Click (or `<prefix>`-focus) the target pane first and confirm focus moved.
- **Typing:** coordinate-click the centre of the visible **`.xterm-screen`** bounding box first (focuses the hidden textarea), then `page.keyboard.type(...)` + `Enter`. Not a locator click on `.xterm-rows` — `.xterm-screen` intercepts pointer events, so it hangs the full 30s timeout.
- **React needs real Playwright clicks** — `dispatchEvent(new MouseEvent('click'))` from `page.evaluate` does not trigger React handlers.
- **Match output against the tail, not the whole buffer** (scrollback re-matches old prompts forever).

### Clipboard and copy mode

- **Playwright's synthetic `Control+V` does not paste in Chromium.** Dispatch a real `ClipboardEvent` on `.xterm-helper-textarea`.
- Grant `clipboard-read`/`clipboard-write` on the context and **verify a yank by reading the clipboard back** — screen-based verification is ambiguous with duplicate scrollback lines.
- **Copy-mode state is per pane, not in the tab bar.** Each pane container holds a `z-index:5` badge (`COPY offset/history`) + hint strip; `display:block` on the badge means that pane is in copy mode (it persists across window switches).
- **Copy mode has two coordinate systems.** `g` jumps to the top of *scrollback*; once the viewport has scrolled, a rendered row index is not the cursor's line offset.

### DOM map

- Tab bar `div.border-b.font-mono`; each button is a **window** labeled `1:nexacorp-ws01:/srv *` (`*`=active, `(n)`=pane count); new-window button is exact-text `+`.
- "+" dropdown items are buttons labeled with `promptHostname` — home plus only machines with ≥1 open pane; a single eligible machine opens a window directly (no dropdown).
- The objective tracker ("In Production") is also buttons — filter it out when enumerating.

### Driver skeleton

```js
const termText = () => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.xterm-rows')];
  const v = rows.find(r => getComputedStyle(r).visibility === 'visible') || rows[0];
  // per-row textContent, NOT innerText — innerText collapses blank rows
  return v ? [...v.children].map(r => r.textContent).join('\n') : '';
});
const type = async (s) => {
  const box = await page.evaluate(() => {
    // .xterm-screen, not .xterm-rows — it intercepts pointer events
    const v = [...document.querySelectorAll('.xterm-screen')]
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

new game → exit nano → `cheat 3` → leave evidence (`echo x > ~/proof.txt`) → "+" second nexacorp window → `coder ssh ai` → switch to window 1 → `exit` (assert sibling survives) → "+" dropdown at home (assert only `maniac-iv` + machines with open panes) → `ssh` back (fingerprint `yes`; assert no boot logo = reattach) → `cat ~/proof.txt` (state survived). Remote-shutdown cascade: with sibling nexacorp + devcontainer panes open, `shutdown -h now` on nexacorp must close BOTH, active pane landing home.
