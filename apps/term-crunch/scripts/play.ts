#!/usr/bin/env npx tsx
/**
 * Headless play-testing harness for Term Crunch.
 *
 * Unlike termoil's `GameRunner` (which reimplements the browser game loop), this
 * runner is a THIN shim over the real code: `runLine` from `src/hooks/useTerminal.ts`
 * only ever calls `write`/`clear` on its terminal, so a fake terminal plus the real
 * `useGameStore` exercises the genuine path — aliases, chained pipelines,
 * `checkCompletion()`, post-commit challenge navigation and `applyTmuxAction`
 * ordering. No game state is duplicated here; read it from the store.
 *
 * Limitations (both structural, not fixable here):
 * - **Keyboard chords are bypassed.** Prefix chords and `~/.tmux.conf` bindings live
 *   in the React `useTabManager` hook, so pane/window/copy-mode play is driven through
 *   the store actions the chords would call (`split`, `killPane`, `resize`, ...).
 *   The resize step is a fixed ratio nudge; the real chord derives its delta from live
 *   xterm cell geometry.
 * - **Editor/pager sessions can't be driven.** vim/nano/less return a `SessionToStart`
 *   the React layer instantiates; `run()` surfaces it and stops. Use `writeFile()` as
 *   the editor stand-in when a challenge only checks the saved file.
 *
 * Run: npm -w @tt/term-crunch run play
 */

// Side-effect import: must precede the store import (installs an in-memory
// localStorage so persist neither warns nor writes a real file).
import "./localStorageStub";

import type { Terminal } from "@xterm/xterm";
import type { SessionToStart } from "@tt/core/commands/applyResult";
import { stripAnsi } from "@tt/core/lib/ansi";
import {
  allLeaves,
  findLeaf,
  nearestResizableSplit,
  MAX_NUDGE_RATIO,
  type SplitDirection,
  type WindowState,
} from "@tt/core/terminal/paneTypes";
import { windowLabel } from "../src/lib/windowLabel";
import { formatElapsedPrecise } from "../src/lib/format";
import { runLine } from "../src/hooks/useTerminal";
import { useGameStore, isGradeGateUp, type GameState } from "../src/state/gameStore";
import { getCategory, SELECTABLE_CATEGORIES, registryIndex } from "../src/challenges/categories";
import { gradeForKey, type Grade } from "../src/challenges/scheduler";
import { levelFor, progressInLevel } from "../src/challenges/mastery";
import { HOME_DIR } from "../src/lib/machine";

// ── Fake terminal ───────────────────────────────────────────────────

/**
 * Captures everything `runLine` writes. Only `write`/`clear` are ever called, so
 * the rest of the xterm surface is deliberately absent (cast at the call site).
 */
class FakeTerminal {
  buffer = "";
  write(data: string): void {
    this.buffer += data;
  }
  clear(): void {
    this.buffer = "";
  }
  asTerminal(): Terminal {
    return this as unknown as Terminal;
  }
}

export interface CommandOutput {
  /** ANSI-stripped, `\n`-normalized output. */
  output: string;
  /** Exactly what the engine wrote (ANSI + `\r\n`). */
  rawOutput: string;
  /** Set when the command opened an editor/pager — the harness can't drive it. */
  startSession?: SessionToStart;
}

// ── Runner ──────────────────────────────────────────────────────────

// Mastery awards surface in the browser as the completion panel's gold line plus
// the animated header block, neither of which exists here, so echo them —
// headless playtesting is the only way to watch the MP economy. A store
// subscription catches every writer (completion MP lands inside
// checkCompletion, i.e. any command or pane action; deck-cleared lands in
// recordGrade), so no per-call-site hooks are needed. Module-level guard:
// the store is a singleton, so multiple runners must not double-echo.
let awardEchoInstalled = false;
function installAwardEcho(masteryLine: () => string): void {
  if (awardEchoInstalled) return;
  awardEchoInstalled = true;
  // lastAwards is written in the SAME set() as mastery, so one transition
  // carries both the labels and the post-award total. Identity comparison:
  // every write is a fresh array (loadChallenge resets it to []).
  useGameStore.subscribe((s, prev) => {
    if (s.lastAwards !== prev.lastAwards && s.lastAwards.length > 0) {
      const awarded = s.lastAwards.map((a) => `+${a.mp} MP · ${a.label}`);
      console.log(`\x1b[35m${awarded.join("  ")}  →  ${masteryLine()}\x1b[0m`);
    }
  });
}

export class CrunchRunner {
  constructor(challengeIndex = 0) {
    installAwardEcho(() => this.masteryLine());
    this.store.loadChallenge(challengeIndex);
  }

  /** Live store state — every read goes through here; nothing is cached. */
  get store(): GameState {
    return useGameStore.getState();
  }

  get activeWindow(): WindowState {
    const s = this.store;
    return s.windows.find((w) => w.id === s.activeWindowId) ?? s.windows[0];
  }

  get paneId(): string {
    return this.activeWindow.activePaneId;
  }

  get cwd(): string {
    return findLeaf(this.activeWindow.root, this.paneId)?.cwd ?? HOME_DIR;
  }

  get challenge() {
    const s = this.store;
    return getCategory(s.activeCategory).challenges[s.challengeIndex];
  }

  /** Submit a command line to the focused pane, exactly as the browser does. */
  async run(input: string): Promise<CommandOutput> {
    const term = new FakeTerminal();
    const { startSession } = await runLine(term.asTerminal(), this.paneId, input);
    return {
      output: stripAnsi(term.buffer).replace(/\r\n/g, "\n"),
      rawOutput: term.buffer,
      startSession,
    };
  }

  // ── navigation / gate ─────────────────────────────────────────────

  /** Jump to a 1-based challenge number in the active track (the `goto` command). */
  goto(n: number): Promise<CommandOutput> {
    return this.run(`goto ${n}`);
  }

  /** Switch track (the `track` command): all/tmux/git/fs/shell/vim. */
  track(id: string): Promise<CommandOutput> {
    return this.run(`track ${id}`);
  }

  /** Load a challenge by registry id, regardless of the active track. */
  gotoId(id: string): void {
    this.store.selectCategory("all");
    this.store.jumpToChallenge(registryIndex(id));
  }

  /**
   * Answer the completion gate with a self-grade (1-4 / a `Grade`), advancing to
   * the next challenge. Returns false when no gate is up.
   */
  grade(grade: Grade | 1 | 2 | 3 | 4 = "good"): boolean {
    if (!isGradeGateUp(this.store)) return false;
    // Same 1-4 → Grade map TabManager's gate keys use, so the harness can't
    // drift from what the browser actually schedules.
    const g = typeof grade === "number" ? gradeForKey(String(grade))! : grade;
    // MP echoes come from the award-echo store subscription (completion MP
    // lands before this in checkCompletion; grading only adds deck-cleared).
    this.store.continueToNext(g);
    return true;
  }

  /** `1,234 MP · Learner (34% to Scholar)` — the sidebar's MasteryBlock in one line. */
  masteryLine(): string {
    const { mp } = this.store.mastery;
    const { title, next } = levelFor(mp);
    const tail = next === null ? "" : ` (${Math.round(progressInLevel(mp) * 100)}% to ${levelFor(next).title})`;
    return `${mp.toLocaleString("en-US")} MP · ${title}${tail}`;
  }

  // ── editor stand-in ───────────────────────────────────────────────

  /** Write a file directly — replaces a vim/nano session for fs-only predicates. */
  writeFile(path: string, content: string): void {
    const abs = path.startsWith("/") ? path : path.startsWith("~") ? HOME_DIR + path.slice(1) : `${this.cwd}/${path}`;
    const res = this.store.fs.writeFile(abs, content);
    if (!res.fs) throw new Error(res.error ?? `writeFile ${abs} failed`);
    this.store.setFs(res.fs);
    this.store.checkCompletion();
  }

  // ── pane / window actions (what the prefix chords call) ────────────

  /** `<prefix> |` (h) / `<prefix> -` (v) on the focused pane; focus follows the new pane. */
  split(dir: SplitDirection): string | null {
    return this.store.splitPane(this.paneId, dir);
  }

  /** `<prefix> x` on the focused pane (or an explicit one). */
  killPane(paneId = this.paneId): void {
    this.store.closePane(paneId);
  }

  /** `<prefix> o` — cycle focus within the window. */
  cyclePane(): void {
    this.store.cyclePane();
  }

  /** `<prefix>` + arrow / hjkl focus move. */
  focus(dir: "L" | "R" | "U" | "D"): void {
    this.store.focusDirection(dir);
  }

  /** Focus a pane by index in `allLeaves` order (headless stand-in for clicking it). */
  focusPaneAt(index: number): void {
    const leaf = allLeaves(this.activeWindow.root)[index];
    if (!leaf) throw new Error(`focusPaneAt: no pane at index ${index}`);
    this.store.setActivePane(leaf.id);
  }

  /**
   * One `<prefix> H/J/K/L` nudge of the divider nearest the focused pane. The real
   * chord sizes its delta from xterm cell geometry; headless uses the maximum
   * per-nudge step (`MAX_NUDGE_RATIO`), so `steps` counts full-size nudges.
   * Returns false when the focused pane has no divider on that axis.
   */
  resize(dir: "L" | "R" | "U" | "D", steps = 1): boolean {
    const orientation: SplitDirection = dir === "L" || dir === "R" ? "h" : "v";
    const splitId = nearestResizableSplit(this.activeWindow.root, this.paneId, orientation);
    if (!splitId) return false;
    // R/D grow child `a`, L/U shrink it — same sign convention as useTabManager.
    const delta = (dir === "R" || dir === "D" ? 1 : -1) * MAX_NUDGE_RATIO;
    for (let i = 0; i < steps; i++) this.store.nudgePaneRatio(splitId, delta);
    return true;
  }

  /** `<prefix> c`. */
  newWindow(): void {
    this.store.newWindow();
  }

  /** `<prefix> n` / `<prefix> p`. */
  cycleWindow(dir: "next" | "prev"): void {
    this.store.cycleWindow(dir);
  }

  /** `<prefix> r` + a name + Enter. */
  renameWindow(name: string, windowId = this.store.activeWindowId): void {
    this.store.renameWindow(windowId, name);
  }

  /** Re-seed the current challenge (the `restart` command / failure-box button). */
  restart(): void {
    this.store.restartChallenge();
  }

  // ── reporting ─────────────────────────────────────────────────────

  status(): string {
    const s = this.store;
    const group = getCategory(s.activeCategory);
    const ch = this.challenge;
    const lines = [
      `track:      ${group.id} (${group.challenges.length} challenges)`,
      `challenge:  ${s.challengeIndex + 1}. ${ch?.title ?? "(none)"} [${ch?.id ?? "-"}]`,
      `step:       ${s.stepIndex + 1}/${ch?.steps.length ?? 0}${
        ch?.steps[s.stepIndex]?.instruction ? ` — ${ch.steps[s.stepIndex].instruction}` : ""
      }`,
      `gate:       ${isGradeGateUp(s) ? "UP (grade 1-4 to continue)" : "down"}${s.completed ? " [track complete]" : ""}`,
      ...(s.failure ? [`FAILED:     ${s.failure}`] : []),
      `tmux:       ${s.tmuxAttachedSession ? `attached to ${s.tmuxAttachedSession.name}` : "DETACHED (bare shell)"}` +
        (s.tmuxDetachedSessions.length
          ? ` | detached: ${s.tmuxDetachedSessions.map((d) => d.name).join(", ")}`
          : ""),
      `windows:    ${s.windows
        .map((w) => `${windowLabel(w)}${w.id === s.activeWindowId ? "*" : ""}`)
        .join("  ")}`,
      `mastery:    ${this.masteryLine()}`,
      `cwd:        ${this.cwd}`,
      `env:        ${JSON.stringify(s.envVars)}`,
      `aliases:    ${JSON.stringify(s.aliases)}`,
    ];
    if (s.lastElapsedMs !== null) {
      lines.push(`last run:   ${formatElapsedPrecise(s.lastElapsedMs)}${s.lastWasBest ? " (best)" : ""}`);
    }
    if (s.reviewReturn) lines.push(`review:     ${s.reviewQueue.length} left of ${s.reviewTotal}`);
    return lines.join("\n");
  }
}

// ── REPL ────────────────────────────────────────────────────────────

const HELP = [
  "REPL commands (anything else is sent to the shell):",
  "  :status         — challenge/step/pane state summary",
  "  :goto N         — jump to challenge N in the active track",
  "  :track ID       — switch track (" + SELECTABLE_CATEGORIES.map((c) => c.id).join("/") + ")",
  "  :grade N        — answer the completion gate (1=again 2=hard 3=good 4=easy)",
  "  :write PATH TEXT— write a file directly (stands in for vim/nano)",
  "  :split h|v      — <prefix> | / <prefix> -",
  "  :kill           — <prefix> x on the focused pane",
  "  :pane N         — focus the Nth pane (0-based)",
  "  :resize DIR [N] — <prefix> H/J/K/L nudges (DIR = L|R|U|D)",
  "  :window         — <prefix> c (new window)",
  "  :rename NAME    — <prefix> r (rename the active window)",
  "  :restart        — re-seed the current challenge",
  "  :hint           — show the current step's hint + answer",
  "  :help / :quit",
].join("\n");

async function main() {
  const readline = await import("readline");
  const runner = new CrunchRunner();

  console.log("Term Crunch — headless runner");
  console.log(runner.status());
  console.log("\nType :help for REPL commands, :quit to exit\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const prompt = () => {
    const cwd = runner.cwd.startsWith(HOME_DIR) ? "~" + runner.cwd.slice(HOME_DIR.length) : runner.cwd;
    return `player@crunch:${cwd}$ `;
  };

  /** Report the step/gate movement a command caused (the panel's job in the browser). */
  const reportProgress = (before: { step: number; index: number; gate: boolean; failure: string | null }) => {
    const s = runner.store;
    if (s.failure && s.failure !== before.failure) {
      console.log(`\x1b[31m✗ ${s.failure}\x1b[0m`);
    }
    if (s.flash) {
      console.log(`\x1b[32m${s.flash}\x1b[0m`);
      s.clearFlash();
    }
    if (isGradeGateUp(s) && !before.gate) {
      console.log(`\x1b[33mChallenge complete — :grade 1-4 to continue\x1b[0m`);
    } else if (s.stepIndex !== before.step || s.challengeIndex !== before.index) {
      console.log(`\x1b[36m→ ${runner.status().split("\n")[2]}\x1b[0m`);
    }
  };

  const snapshot = () => ({
    step: runner.store.stepIndex,
    index: runner.store.challengeIndex,
    gate: isGradeGateUp(runner.store),
    failure: runner.store.failure,
  });

  // An async line loop (not rl.question callbacks): each line is fully handled
  // before the next is read, so a piped script runs to completion too.
  process.stdout.write(prompt());
  for await (const line of rl) {
    {
      const trimmed = line.trim();
      const before = snapshot();
      try {
        if (!trimmed) {
          process.stdout.write(prompt());
          continue;
        }

        if (trimmed === ":quit" || trimmed === ":q") {
          rl.close();
          process.exit(0);
        } else if (trimmed === ":help") {
          console.log(HELP);
        } else if (trimmed === ":status") {
          console.log(runner.status());
        } else if (trimmed.startsWith(":goto ")) {
          console.log((await runner.goto(Number(trimmed.slice(6)))).output.trimEnd());
        } else if (trimmed.startsWith(":track ")) {
          console.log((await runner.track(trimmed.slice(7).trim())).output.trimEnd());
        } else if (trimmed.startsWith(":grade")) {
          const key = trimmed.slice(6).trim() || "3";
          const grade = gradeForKey(key);
          if (!grade) console.log("Usage: :grade 1|2|3|4");
          else if (!runner.grade(grade)) console.log("No completion gate is up.");
          else console.log(runner.status());
        } else if (trimmed.startsWith(":write ")) {
          const rest = trimmed.slice(7).trim();
          const sp = rest.indexOf(" ");
          if (sp === -1) console.log("Usage: :write PATH CONTENT (use \\n for newlines)");
          else {
            runner.writeFile(rest.slice(0, sp), rest.slice(sp + 1).replace(/\\n/g, "\n") + "\n");
            console.log(`Written to ${rest.slice(0, sp)}`);
          }
        } else if (trimmed.startsWith(":split")) {
          const dir = trimmed.slice(6).trim() || "h";
          if (dir !== "h" && dir !== "v") console.log("Usage: :split h|v");
          else runner.split(dir);
        } else if (trimmed === ":kill") {
          runner.killPane();
        } else if (trimmed.startsWith(":pane ")) {
          runner.focusPaneAt(Number(trimmed.slice(6)));
        } else if (trimmed.startsWith(":resize ")) {
          const [dir, n] = trimmed.slice(8).trim().split(/\s+/);
          if (!["L", "R", "U", "D"].includes(dir)) console.log("Usage: :resize L|R|U|D [steps]");
          else if (!runner.resize(dir as "L" | "R" | "U" | "D", n ? Number(n) : 1)) {
            console.log("No divider on that axis from the focused pane.");
          }
        } else if (trimmed === ":window") {
          runner.newWindow();
        } else if (trimmed.startsWith(":rename ")) {
          runner.renameWindow(trimmed.slice(8).trim());
        } else if (trimmed === ":restart") {
          runner.restart();
        } else if (trimmed === ":hint") {
          const step = runner.challenge?.steps[runner.store.stepIndex];
          console.log(step?.hint ?? "(no hint)");
          console.log(`answer: ${step?.command ?? "(keyboard-driven)"}`);
        } else if (trimmed.startsWith(":")) {
          console.log(`Unknown REPL command. ${HELP}`);
        } else {
          const res = await runner.run(trimmed);
          if (res.rawOutput) console.log(res.rawOutput.replace(/\r\n/g, "\n").trimEnd());
          if (res.startSession) {
            console.log(
              `[${res.startSession.type} session — not drivable headlessly; use :write PATH TEXT instead]`
            );
          }
        }
      } catch (e) {
        console.error(`\x1b[31m${e instanceof Error ? e.message : String(e)}\x1b[0m`);
      }
      reportProgress(before);
      process.stdout.write(prompt());
    }
  }
}

if (process.argv[1]?.endsWith("play.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
