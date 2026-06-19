#!/usr/bin/env node
/**
 * Visual harness for the @tt/core PaneDividers component.
 *
 * Drives the *rendered* terminal in a real browser (the headless scripts in
 * apps/terminal-turmoil/scripts/ exercise only the command engine, never the
 * DOM), splits panes via tmux key chords, screenshots each layout, and probes
 * the live divider geometry so a visual regression in the gold/grey active-pane
 * seam is caught with both an image and a hard assertion.
 *
 * PaneDividers lives in @tt/core and is consumed by BOTH apps, so re-run this
 * after any change to PaneDividers.tsx, paneTypes.ts, or the split/focus logic.
 *
 * Usage:
 *   npm run screenshot:panes                      # defaults: localhost:3001, ./screenshots
 *   TT_URL=http://localhost:3000/ npm run screenshot:panes
 *   node scripts/visual/pane-dividers.mjs <url> <outDir>
 *
 * Requires a dev server already running (npm run dev / npm run dev:puzzle).
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const URL = process.argv[2] || process.env.TT_URL || "http://localhost:3001/";
const OUT = resolve(process.argv[3] || process.env.TT_OUT || "screenshots");
// High DPI so the stacked 1px gold/grey seam lines stay crisp when zoomed.
const SCALE = Number(process.env.TT_SCALE || 3);

const GOLD = "rgb(230, 180, 80)"; // #e6b450 — active pane's side of a seam
const GREY = "rgb(61, 71, 81)"; //   #3d4751 — inactive neighbour's side

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: SCALE });
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector(".xterm-rows", { timeout: 30000 });

const termText = () => page.evaluate(() => document.querySelector(".xterm-rows")?.innerText || "");
for (let i = 0; i < 60; i++) {
  if ((await termText()).length > 20) break;
  await sleep(500);
}

async function focusTerm() {
  const b = await page.locator(".xterm-rows").first().boundingBox();
  if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
await focusTerm();
await sleep(400);

// Dismiss the nano tutorial if it's up (Ctrl+X); harmless otherwise.
await page.keyboard.down("Control");
await page.keyboard.press("x");
await page.keyboard.up("Control");
await sleep(1200);
await focusTerm();
await sleep(400);

// tmux prefix = Ctrl+Space, then a chord key.
async function prefix() {
  await page.keyboard.down("Control");
  await page.keyboard.press("Space");
  await page.keyboard.up("Control");
  await sleep(120);
}
async function chord(key) {
  await prefix();
  await page.keyboard.press(key);
  await sleep(450);
}
async function focus(arrow) {
  await prefix();
  await page.keyboard.press(arrow);
  await sleep(450);
}

// Every visible pane: rect + whether it carries the gold active outline.
const panes = () =>
  page.evaluate(() => {
    const wrap = document.querySelector(".isolate");
    if (!wrap) return [];
    return [...wrap.children]
      .filter((el) => getComputedStyle(el).display !== "none" && el.clientWidth > 0)
      .map((el, i) => {
        const r = el.getBoundingClientRect();
        return {
          i,
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          active: el.style.outline !== "" && el.style.outline !== "none",
        };
      });
  });

// Every divider seam: the colored sub-lines and their geometry.
const seams = () =>
  page.evaluate(() => {
    const out = [];
    document.querySelectorAll(".z-10 .group").forEach((g) => {
      const isH = getComputedStyle(g).cursor.includes("col");
      const lines = [...g.children].map((c) => {
        const s = getComputedStyle(c);
        const r = c.getBoundingClientRect();
        return { bg: s.backgroundColor, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      });
      out.push({ orientation: isH ? "vertical-line(h-split)" : "horizontal-line(v-split)", lines });
    });
    return out;
  });

const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

async function snap(name, note) {
  await sleep(300);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const p = await panes();
  console.log(`\n=== ${name} === ${note}`);
  console.log(JSON.stringify(p));
  return p;
}

// 1) Single pane: no divider, no outline.
let p = await snap("01-single", "one pane: expect NO outline");
check(p.length === 1 && !p[0].active, "01: single pane should have no active outline");

// 2) Horizontal split (side-by-side); new right pane B becomes active.
await chord("|");
await snap("02-hsplit", "A | B side-by-side, B active");

// 3) Focus left to A.
await focus("ArrowLeft");
await snap("03-hsplit-focus-left", "focus moved to LEFT pane");

// 4) Split the focused left pane vertically -> A(top) / C(bottom), C active.
await chord("-");
await snap("04-after-split-left", "left column split: top / bottom, bottom active");

// 5) Split again to reach a 2x2 grid, then verify the seam coloring.
await focus("ArrowRight");
await chord("-");
p = await snap("05-grid-2x2", "2x2 grid");
const exactlyOneActive = p.filter((x) => x.active).length === 1;
check(exactlyOneActive, "05: exactly one pane should be active in the grid");

const s = await seams();
console.log("\n--- seams ---");
console.log(JSON.stringify(s, null, 2));
const hasGold = s.some((d) => d.lines.some((l) => l.bg === GOLD));
const hasGrey = s.some((d) => d.lines.some((l) => l.bg === GREY));
check(hasGold, `05: expected a gold (${GOLD}) seam line bordering the active pane`);
check(hasGrey, `05: expected a grey (${GREY}) seam line on the inactive side`);

// Zoom the divider on the active pane's seam so the half/half split is legible.
const goldDivider = s.find((d) => d.lines.some((l) => l.bg === GOLD));
if (goldDivider) {
  const horiz = goldDivider.orientation.startsWith("horizontal");
  if (horiz) {
    const y = Math.min(...goldDivider.lines.map((l) => l.y));
    await page.screenshot({ path: `${OUT}/06-divider-zoom.png`, clip: { x: 150, y: y - 12, width: 360, height: 26 } });
  } else {
    const x = Math.min(...goldDivider.lines.map((l) => l.x));
    await page.screenshot({ path: `${OUT}/06-divider-zoom.png`, clip: { x: x - 12, y: 150, width: 26, height: 360 } });
  }
  console.log("\nwrote 06-divider-zoom.png");
}

// 6) Cycle focus; the gold seam should follow the active pane.
await focus("ArrowLeft");
await snap("07-grid-focus-left", "focus left; gold seam should move with it");

await browser.close();

console.log("\n" + "=".repeat(40));
if (failures.length) {
  console.log(`FAIL (${failures.length}):`);
  for (const f of failures) console.log("  - " + f);
  console.log(`Screenshots in ${OUT}`);
  process.exit(1);
}
console.log(`PASS — screenshots in ${OUT}`);
