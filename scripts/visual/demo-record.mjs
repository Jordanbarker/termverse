#!/usr/bin/env node
/**
 * Records the short demo clips shown in README.md and on the landing page.
 *
 * Drives each game in a real browser with Playwright's recordVideo, typing at a
 * human pace so a viewer can follow along, then encodes the .webm with ffmpeg.
 * Viewports are kept small so the fixed 14px terminal font reads large in the
 * frame: term-crunch at 960x540, termoil only as wide as dbt build's ~134-col
 * model lines need to not wrap. Recording is 1x (Playwright's screencast ignores
 * deviceScaleFactor). Both clips boot from a fresh context, so they are
 * reproducible: re-run after any visible UI change.
 *
 * termoil is the git clone + dbt build flow on the coder-ai dev container. An
 * off-camera context reaches it via `cheat 1` + a hand-set `coder_unlocked` flag
 * + `coder ssh ai` (so the repo is not cloned yet), and the recording context
 * boots from that save. Its README clip hides the HUD and is cropped to the
 * xterm screen, so it reads as a bare shell.
 *
 * Outputs:
 *   screenshots/demo/<game>.webm      raw recording (gitignored)
 *   .assets/termoil-demo.webp         README embed (bare terminal, animated webp)
 *   .assets/term-crunch-demo.gif      README embed (full UI)
 *   site/media/<game>.mp4             landing-page card video (full UI, 16:9)
 *
 * Usage:
 *   npm run record:demo                           # both games
 *   node scripts/visual/demo-record.mjs termoil   # or: crunch
 *   TERMOIL_URL=... CRUNCH_URL=... TT_OUT=... (overrides)
 *
 * Requires `npm run dev` already running, plus ffmpeg and img2webp on PATH
 * (ffmpeg builds often lack a webp encoder, so frames go through img2webp).
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(process.env.TT_OUT || join(ROOT, "screenshots/demo"));
const WHICH = process.argv[2] || "all";
// 16:9 with even dimensions (libx264), matching the landing-page card.
const TERMOIL_VIEWPORT = { width: 1168, height: 656 };
const CRUNCH_VIEWPORT = { width: 960, height: 540 };
const TERMOIL_URL = process.env.TERMOIL_URL || "http://localhost:3000/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hide the Next.js dev-tools badge (a <nextjs-portal> shadow host), plus any
// extra selectors a clip wants gone.
const hideCss = (selectors) => {
  const css = [...selectors, "nextjs-portal"].join(", ") + " { display: none !important; }";
  return `document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = ${JSON.stringify(css)};
    document.head.appendChild(style);
  });`;
};

/** Wait for xterm to paint, focus it, and return typing helpers for `page`. */
async function attach(page) {
  await page.waitForSelector(".xterm-rows", { timeout: 30000 });
  for (let i = 0; i < 60; i++) {
    if ((await screenText(page)).trim().length > 0) break;
    await sleep(250);
  }
  // Coordinate-click .xterm-screen: it intercepts pointer events, so a locator
  // click on .xterm-rows never lands.
  const box = await page.locator(".xterm-screen").first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  const type = async (line, readMs = 1200) => {
    await page.keyboard.type(line, { delay: 55 });
    await sleep(250);
    await page.keyboard.press("Enter");
    await sleep(readMs);
  };
  const ctrl = async (key) => {
    await page.keyboard.down("Control");
    await page.keyboard.press(key);
    await page.keyboard.up("Control");
  };
  // The in-game tmux prefix is Ctrl+Space.
  const chord = async (key) => {
    await ctrl("Space");
    await sleep(120);
    await page.keyboard.press(key);
  };
  return { type, ctrl, chord };
}

const screenText = (page) => page.evaluate(() => document.querySelector(".xterm-rows")?.innerText || "");

async function waitForText(page, needle, timeout = 30000) {
  for (const end = Date.now() + timeout; Date.now() < end; await sleep(200)) {
    if ((await screenText(page)).includes(needle)) return;
  }
  throw new Error(`timed out waiting for "${needle}"`);
}

/** Boot a recording context and return the page, typing helpers, and lead-in. */
async function open(browser, url, viewport, { init = [], hide = [], prep } = {}) {
  // Warm the dev server first: an on-demand compile would otherwise land in the
  // recording (and in term-crunch's challenge timer, which starts on load).
  const warm = await browser.newPage();
  await warm.goto(url, { waitUntil: "networkidle" });
  await warm.close();

  const ctx = await browser.newContext({ viewport, recordVideo: { dir: OUT, size: viewport } });
  for (const [fn, arg] of init) await ctx.addInitScript(fn, arg);
  await ctx.addInitScript(hideCss(hide));
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "networkidle" });
  const helpers = await attach(page);
  if (prep) await prep(page, helpers);
  // Seconds of loading (and prep) frames for ffmpeg to skip (-ss).
  const lead = (Date.now() - t0) / 1000;
  return { ctx, page, lead, ...helpers };
}

/** Close the context (finalizing the video) and move it to <OUT>/<name>.webm. */
async function finish({ ctx, page }, name) {
  const video = page.video();
  await ctx.close();
  const dest = join(OUT, `${name}.webm`);
  renameSync(await video.path(), dest);
  return dest;
}

/** Off camera: a save parked on coder-ai with nexacorp-analytics not yet cloned. */
async function termoilSave(browser) {
  const ctx = await browser.newContext({ viewport: TERMOIL_VIEWPORT });
  const page = await ctx.newPage();
  await page.goto(TERMOIL_URL, { waitUntil: "networkidle" });
  let { type, ctrl } = await attach(page);
  // A fresh save opens the nano tutorial (~/terminal_notes.txt).
  await sleep(2000);
  await ctrl("x");
  await sleep(800);
  await type("cheat 1", 3000);
  // cheat 1 (day 1 start) predates `coder_unlocked`; every later checkpoint has
  // the repo already cloned. Flip the flag in the saved blob and reload.
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem("termoil-save"));
    save.state.storyFlags.coder_unlocked = true;
    localStorage.setItem("termoil-save", JSON.stringify(save));
  });
  await page.reload({ waitUntil: "networkidle" });
  ({ type } = await attach(page));
  await sleep(1500);
  await type("coder ssh ai");
  await waitForText(page, "ren@coder-ai");
  // Let the first-visit toasts and deliveries settle, then flush the debounced save.
  await sleep(3000);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await sleep(1500);
  const save = await page.evaluate(() => localStorage.getItem("termoil-save"));
  await ctx.close();
  return save;
}

async function recordTermoil(browser) {
  const save = await termoilSave(browser);
  const s = await open(browser, TERMOIL_URL, TERMOIL_VIEWPORT, {
    init: [[(v) => localStorage.setItem("termoil-save", v), save]],
    hide: ['[data-hud="objective-tracker"]', '[data-hud="toast"]'],
    // The restored scrollback still shows the Coder banner; start from a clean screen.
    prep: async (page, { type }) => {
      await sleep(1500);
      await type("clear", 600);
    },
  });
  const { page, type } = s;
  await sleep(600);
  await type("git clone nexacorp/nexacorp-analytics", 1500);
  await type("cd nexacorp-analytics", 900);
  await type("git status", 1800);
  await type("dbt build", 0);
  await waitForText(page, "TOTAL=", 60000);
  await sleep(4000);
  // Crop the README clip to the xterm screen (drops the tmux bar + status line),
  // trimmed on the right to the scrollbar's left edge.
  const box = await page.locator(".xterm-screen").first().boundingBox();
  const right = await page.evaluate(() => {
    const vp = document.querySelector(".xterm-viewport");
    return vp ? vp.getBoundingClientRect().left + vp.clientWidth : Infinity;
  });
  const even = (n) => Math.floor(n / 2) * 2;
  const crop = { x: even(box.x), y: even(box.y), w: even(Math.min(box.width, right - box.x)), h: even(box.height) };
  return { name: "termoil", lead: s.lead, crop, webm: await finish(s, "termoil") };
}

async function recordCrunch(browser) {
  // Seeded 30 MP shy of a level, so the git clear fires the level-up callout.
  const s = await open(browser, process.env.CRUNCH_URL || "http://localhost:3001/", CRUNCH_VIEWPORT, {
    init: [
      [
        () =>
          localStorage.setItem("term-crunch-progress", JSON.stringify({ state: { mastery: { mp: 470 } }, version: 1 })),
      ],
    ],
  });
  const { page, type, chord } = s;
  await sleep(1500);
  // Challenge 0 (panes-split): prefix | then prefix -.
  await chord("|");
  await sleep(900);
  await chord("-");
  await sleep(2600);
  await page.keyboard.press("Enter");
  await sleep(1000);
  await type("track git", 1000);
  await type("git add README.md", 900);
  await type('git commit -m "init"', 3500);
  return { name: "term-crunch", lead: s.lead, webm: await finish(s, "term-crunch") };
}

const GIF_PALETTE = "split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4";

function encode({ name, lead, crop, webm }) {
  const ss = lead.toFixed(2);
  const mp4 = join(ROOT, "site", "media", `${name}.mp4`);
  mkdirSync(dirname(mp4), { recursive: true });
  const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", ss, "-i", webm, ...args]);
  let readme;
  if (crop) {
    // Animated webp of the cropped shell, built frame by frame with img2webp.
    readme = join(ROOT, ".assets", `${name}-demo.webp`);
    const frames = join(OUT, `${name}-frames`);
    rmSync(frames, { recursive: true, force: true });
    mkdirSync(frames);
    ff(["-vf", `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},fps=10`, join(frames, "%04d.png")]);
    const pngs = readdirSync(frames).sort().map((f) => join(frames, f));
    execFileSync("img2webp", ["-loop", "0", "-lossy", "-q", "50", "-d", "100", "-mixed", ...pngs, "-o", readme], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    rmSync(frames, { recursive: true });
  } else {
    readme = join(ROOT, ".assets", `${name}-demo.gif`);
    ff(["-vf", `fps=12,${GIF_PALETTE}`, readme]);
  }
  ff(["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-preset", "slow", "-movflags", "+faststart", "-an", mp4]);
  for (const f of [webm, readme, mp4]) console.log(`  ${(statSync(f).size / 1024).toFixed(0).padStart(6)} KB  ${f}`);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const runs = [];
if (WHICH === "all" || WHICH === "termoil") runs.push(await recordTermoil(browser));
if (WHICH === "all" || WHICH === "crunch") runs.push(await recordCrunch(browser));
await browser.close();
if (runs.length === 0) {
  console.error(`unknown target "${WHICH}" (expected termoil | crunch | all)`);
  process.exit(1);
}
if (process.env.TT_NO_ENCODE) process.exit(0);
for (const r of runs) {
  console.log(`\n${r.name} (trimmed ${r.lead.toFixed(1)}s lead-in)`);
  encode(r);
}
