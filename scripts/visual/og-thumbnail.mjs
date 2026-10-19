#!/usr/bin/env node
/**
 * Captures the termverse social-preview card (site/og.png, 1200x630).
 *
 * Drives both games in a real browser, screenshots each one mid-play, then
 * composes the two shots into a branded card styled like site/index.html and
 * screenshots that at exactly 1200x630. site/index.html points og:image at the
 * deployed copy, so re-run this whenever either game's look changes noticeably.
 *
 * Usage:
 *   npm run screenshot:og                         # defaults: localhost:3000, :3001, site/og.png
 *   node scripts/visual/og-thumbnail.mjs <termoilUrl> <crunchUrl> <outPng>
 *
 * Requires both dev servers already running (npm run dev).
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const TERMOIL = process.argv[2] || process.env.TT_TERMOIL_URL || "http://localhost:3000/";
const CRUNCH = process.argv[3] || process.env.TT_CRUNCH_URL || "http://localhost:3001/";
const OUT = resolve(process.argv[4] || process.env.TT_OUT || "site/og.png");
// Raw per-game shots land next to the card when set, for layout iteration.
const RAW_DIR = process.env.TT_RAW_DIR;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();

// Each game gets a fresh context so no localStorage save leaks into the shot.
async function openGame(url) {
  // A smallish viewport keeps terminal text legible once shrunk into the card.
  const ctx = await browser.newContext({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  // Hide the Next dev-tools badge.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForSelector(".xterm-rows", { timeout: 30000 });
  for (let i = 0; i < 60; i++) {
    const text = await page.evaluate(() => document.querySelector(".xterm-rows")?.innerText || "");
    if (text.length > 20) break;
    await sleep(500);
  }
  await sleep(800);
  return page;
}

async function focusTerm(page) {
  const b = await page.locator(".xterm-rows").first().boundingBox();
  if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(300);
}

async function ctrl(page, key) {
  await page.keyboard.down("Control");
  await page.keyboard.press(key);
  await page.keyboard.up("Control");
}

async function run(page, cmd, wait = 900) {
  await page.keyboard.type(cmd, { delay: 25 });
  await page.keyboard.press("Enter");
  await sleep(wait);
}

async function shot(page, name) {
  const buf = await page.screenshot();
  if (RAW_DIR) {
    await mkdir(RAW_DIR, { recursive: true });
    await page.screenshot({ path: `${RAW_DIR}/${name}.png` });
  }
  await page.context().close();
  return buf.toString("base64");
}

// termoil: close the nano tutorial, then make the terminal look lived-in.
const termoil = await openGame(TERMOIL);
await focusTerm(termoil);
await ctrl(termoil, "x");
await sleep(1200);
await focusTerm(termoil);
await run(termoil, "ls -la");
const termoilShot = await shot(termoil, "termoil");

// term-crunch: half-solve the first challenge (one of its two tmux splits) so
// the panes show off without auto-advancing to the next challenge.
const crunch = await openGame(CRUNCH);
await focusTerm(crunch);
await run(crunch, "ls");
await ctrl(crunch, "Space");
await crunch.keyboard.press("|");
await sleep(600);
await run(crunch, "pwd", 1200);
const crunchShot = await shot(crunch, "term-crunch");

const card = `<!doctype html><html><head><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    background: radial-gradient(ellipse at 50% 0%, #141b26 0%, #0a0e14 65%);
    color: #c9d4e3;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
    padding: 44px 48px 0;
  }
  h1 { font-size: 56px; margin: 0; letter-spacing: 0.03em; font-weight: 700; }
  .prompt { color: #5ec27a; }
  .tagline { color: #6b7889; font-size: 22px; margin: 6px 0 34px; }
  .row { display: flex; gap: 28px; }
  .win {
    flex: 1; border: 1px solid #1f2733; border-radius: 10px; overflow: hidden;
    background: #11161f; box-shadow: 0 18px 40px rgba(0,0,0,0.55);
  }
  .bar { display: flex; align-items: center; gap: 7px; padding: 9px 12px; border-bottom: 1px solid #1f2733; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #2a3442; }
  .bar .name { color: #f0b429; font-size: 17px; margin-left: 8px; }
  .win img { display: block; width: 100%; }
</style></head><body>
  <h1><span class="prompt">&gt;</span> termverse</h1>
  <p class="tagline">Terminal based browser games.</p>
  <div class="row">
    <div class="win"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="name">termoil</span></div>
      <img src="data:image/png;base64,${termoilShot}"></div>
    <div class="win"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="name">term-crunch</span></div>
      <img src="data:image/png;base64,${crunchShot}"></div>
  </div>
</body></html>`;

const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.setContent(card, { waitUntil: "load" });
await mkdir(dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT });
await browser.close();
console.log(`wrote ${OUT}`);
