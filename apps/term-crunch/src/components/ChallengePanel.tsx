"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { formatElapsed } from "@tt/core/lib/format";
import { formatElapsedPrecise } from "../lib/format";
import { isGradeGateUp, useGameStore } from "../state/gameStore";
import { getCategory, SELECTABLE_CATEGORIES } from "../challenges/categories";
import { CHALLENGES } from "../challenges/registry";
import {
  GRADES,
  GRADE_LABELS,
  countDue,
  formatInterval,
  nextIntervalMs,
  type ReviewStat,
} from "../challenges/scheduler";
import { levelFor, progressInLevel } from "../challenges/mastery";
import type { Step } from "../challenges/types";
import SchematicView from "./SchematicView";
import WindowStripView from "./WindowStripView";
import FsTreeView from "./FsTreeView";
import SettingsModal from "./SettingsModal";
import VimCheatSheet from "./VimCheatSheet";
import TmuxCheatSheet from "./TmuxCheatSheet";

export default function ChallengePanel() {
  const challengeIndex = useGameStore((s) => s.challengeIndex);
  const stepIndex = useGameStore((s) => s.stepIndex);
  const completed = useGameStore((s) => s.completed);
  const awaitingContinue = useGameStore((s) => s.awaitingContinue);
  const flash = useGameStore((s) => s.flash);
  const failure = useGameStore((s) => s.failure);
  const windows = useGameStore((s) => s.windows);
  const activeWindowId = useGameStore((s) => s.activeWindowId);
  const fs = useGameStore((s) => s.fs);
  const clearFlash = useGameStore((s) => s.clearFlash);
  const restartChallenge = useGameStore((s) => s.restartChallenge);
  const jumpToChallenge = useGameStore((s) => s.jumpToChallenge);
  const activeCategory = useGameStore((s) => s.activeCategory);
  const selectCategory = useGameStore((s) => s.selectCategory);
  const challengeStartTime = useGameStore((s) => s.challengeStartTime);
  const bestTimes = useGameStore((s) => s.bestTimes);
  const lastElapsedMs = useGameStore((s) => s.lastElapsedMs);
  const lastWasBest = useGameStore((s) => s.lastWasBest);
  const reviewStats = useGameStore((s) => s.reviewStats);
  const reviewQueue = useGameStore((s) => s.reviewQueue);
  const reviewTotal = useGameStore((s) => s.reviewTotal);
  const reviewReturn = useGameStore((s) => s.reviewReturn);
  const pendingGradeId = useGameStore((s) => s.pendingGradeId);
  const mastery = useGameStore((s) => s.mastery);
  const lastAwards = useGameStore((s) => s.lastAwards);

  const [settingsOpen, setSettingsOpen] = useState(false);

  // Auto-clear the transient "✓ complete" banner.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(clearFlash, 2200);
    return () => clearTimeout(t);
  }, [flash, clearFlash]);

  // Jumping away while the gate is up would drop the pending grade (loadChallenge
  // clears pendingGradeId), so the dropdowns are frozen exactly like the terminal
  // input is by TabManager's interceptEarly.
  const gateUp = isGradeGateUp({ awaitingContinue, completed, pendingGradeId });

  const category = getCategory(activeCategory);
  const challenge = category.challenges[challengeIndex];
  const activeWindow = windows.find((w) => w.id === activeWindowId) ?? windows[0];

  const best = challenge ? bestTimes[challenge.id] : undefined;
  const reviewProgress = reviewTotal - reviewQueue.length;

  return (
    <aside className="flex h-full w-[420px] shrink-0 flex-col gap-4 border-l border-[#1c2430] bg-[#0d1117] p-5 text-[#b3b1ad]">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-sm font-semibold tracking-wide text-[#e6b450]">TERM CRUNCH</h1>
          <div className="flex items-center gap-2">
            <select
              aria-label="Select category"
              value={activeCategory}
              onChange={(e) => selectCategory(e.target.value)}
              disabled={gateUp}
              title={gateUp ? "Grade this challenge first" : undefined}
              className="max-w-[180px] truncate rounded border border-[#1c2430] bg-[#11161d] px-2 py-1 text-xs text-[#6b7680] hover:border-[#6b7680] hover:text-[#b3b1ad] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[#1c2430] disabled:hover:text-[#6b7680]"
            >
              {SELECTABLE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="Settings"
              title="Edit ~/.zshrc and ~/.tmux.conf"
              onClick={() => setSettingsOpen(true)}
              className="rounded border border-[#1c2430] px-2 py-1 text-lg leading-none text-[#6b7680] hover:border-[#6b7680] hover:text-[#b3b1ad] focus:outline-none"
            >
              ⚙
            </button>
          </div>
        </div>
        <select
          aria-label="Select challenge"
          value={challengeIndex}
          onChange={(e) => jumpToChallenge(Number(e.target.value))}
          disabled={gateUp}
          title={gateUp ? "Grade this challenge first" : undefined}
          className="w-full truncate rounded border border-[#1c2430] bg-[#11161d] px-2 py-1 text-xs text-[#6b7680] hover:border-[#6b7680] hover:text-[#b3b1ad] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[#1c2430] disabled:hover:text-[#6b7680]"
        >
          {category.challenges.map((c, i) => (
            <option key={c.id} value={i}>
              {i + 1}/{category.challenges.length} · {c.title}
            </option>
          ))}
        </select>
        {/* challengeStartTime !== 0 = post-mount, the same hydration signal the
            body's placeholder uses: reviewStats is persisted, so due-ness would
            otherwise diverge between server HTML and a returning player's first
            client render. */}
        {challengeStartTime !== 0 && reviewReturn === null && <DueNotice reviewStats={reviewStats} />}
        {/* Same post-mount gate: `mastery` is persisted too. */}
        {challengeStartTime !== 0 && <MasteryBlock mp={mastery.mp} />}
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto">
      {flash && (
        <div className="rounded border border-[#2e7d32] bg-[#11231a] px-3 py-2 text-sm text-[#7ee787]">
          {flash}
        </div>
      )}

      {awaitingContinue && challenge ? (
        <div className="panel-in rounded border border-[#2e7d32] bg-[#11231a] p-4 text-[#7ee787]">
          <div className="text-base font-semibold">✓ {challenge.title} complete!</div>
          {/* The MP payoff animates in the sidebar header, which is not where the
              player is looking — name the award here too, at the box they are
              actually reading. */}
          {lastAwards.length > 0 && (
            <div className="mt-1 text-sm font-semibold text-[#e6b450]">
              {lastAwards.map((a) => `+${a.mp} MP · ${a.label}`).join("  ")}
            </div>
          )}
          {lastElapsedMs != null && (
            <div className="mt-2 text-sm text-[#b3b1ad]">
              Time: <span className="font-semibold text-[#e6b450]">{formatElapsedPrecise(lastElapsedMs)}</span>
              {best != null && <> · best {formatElapsedPrecise(best)}</>}
              {lastWasBest && <div className="text-[#7ee787]">🏆 New best!</div>}
            </div>
          )}
          {reviewReturn !== null && (
            <div className="mt-2 text-xs text-[#6b7680]">{`Review ${reviewProgress} of ${reviewTotal}`}</div>
          )}
          {/* pendingGradeId === challenge.id whenever awaitingContinue is up. */}
          <GradeBar stat={reviewStats[challenge.id]} />
        </div>
      ) : completed || !challenge ? (
        <div className="panel-in rounded border border-[#2e7d32] bg-[#11231a] p-4 text-sm text-[#7ee787]">
          🎉 All {activeCategory === "all" ? "" : `${category.label} `}challenges complete. Nicely done.
          {lastAwards.length > 0 && (
            <div className="mt-1 font-semibold text-[#e6b450]">
              {lastAwards.map((a) => `+${a.mp} MP · ${a.label}`).join("  ")}
            </div>
          )}
          {completed && pendingGradeId !== null ? (
            <GradeBar stat={reviewStats[pendingGradeId]} />
          ) : (
            // Once the last grade is in there is nothing left to press: point at
            // the two ways forward instead of leaving a dead end.
            <div className="mt-2 text-xs text-[#b3b1ad]">
              {"Pick another track above, or type "}
              <code className="text-[#e6b450]">review</code>
              {" to replay what's due."}
            </div>
          )}
        </div>
      ) : challengeStartTime === 0 ? (
        // Pre-mount / pre-seed: challengeStartTime is 0 at SSR and on the first
        // client render (loadChallenge runs in a post-mount effect). Render a
        // neutral placeholder so the server HTML and first client render agree —
        // this defers the persisted-bestTimes and Date.now() reads below past
        // hydration, where they'd otherwise diverge for a returning player.
        <div className="text-sm text-[#6b7680]">Loading challenge…</div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <div className="text-base font-semibold">{challenge.title}</div>
            <div className="mt-0.5 text-xs text-[#6b7680]">
              Step {stepIndex + 1}/{challenge.steps.length} · ⏱ <LiveTimer challengeStartTime={challengeStartTime} />
              {best != null && <> · best {formatElapsedPrecise(best)}</>}
            </div>
            {reviewReturn !== null && (
              // A mid-review player needs to know why the category flipped to All.
              <div className="mt-0.5 text-xs text-[#e6b450]">{`Reviewing: ${reviewProgress} of ${reviewTotal}`}</div>
            )}
          </div>

          {challenge.brief && (
            <p className="whitespace-pre-line rounded bg-[#11161d] p-3 text-sm leading-relaxed text-[#b3b1ad]">
              {challenge.brief}
            </p>
          )}

          {failure && (
            // A lost sandbox: the step can't advance until Restart, so say why
            // here, where the player is reading, rather than leaving the board
            // silently dead.
            <div className="flex flex-col gap-2 rounded border border-[#8b3a3a] bg-[#2a1416] p-3 text-sm text-[#f28b82]">
              <div>{`✗ ${failure}`}</div>
              <button
                type="button"
                onClick={restartChallenge}
                className="self-start rounded border border-[#8b3a3a] px-2 py-1 text-xs text-[#f28b82] hover:border-[#f28b82]"
              >
                ↺ Restart challenge
              </button>
            </div>
          )}

          {challenge.steps[stepIndex] && (
            <StepGoal
              step={challenge.steps[stepIndex]}
              hasBrief={!!challenge.brief}
              // Reset the reveal level whenever the player moves to a new step or
              // challenge, so a fresh step never leaks the previous command.
              resetKey={`${activeCategory}:${challengeIndex}:${stepIndex}`}
            />
          )}

          {/* Gated on the field, not the type (same rule as fsWatchPath below):
              any challenge that declares a target layout gets the schematic. */}
          {challenge.targetWindow && activeWindow && (
            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-[#6b7680]">Current</div>
                <SchematicView root={activeWindow.root} />
              </div>
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-[#e6b450]">Target</div>
                <SchematicView root={challenge.targetWindow.root} />
              </div>
            </div>
          )}

          {challenge.targetWindows && (
            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-[#6b7680]">Current</div>
                <WindowStripView
                  windows={windows}
                  activeIndex={windows.findIndex((w) => w.id === activeWindowId)}
                />
              </div>
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-[#e6b450]">Target</div>
                <WindowStripView windows={challenge.targetWindows} />
              </div>
            </div>
          )}

          {challenge.type === "vim" && <VimCheatSheet />}

          {challenge.type === "tmux" && <TmuxCheatSheet />}

          {/* Gated on the field, not the type: an fs-detected challenge in any
              track (e.g. the copy-mode tmux challenge) still gets the tree. */}
          {challenge.fsWatchPath && (
            <FsTreeView fs={fs} watchPath={challenge.fsWatchPath} dangerPath={challenge.fsDangerPath} />
          )}
        </div>
      )}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </aside>
  );
}

/**
 * Registry-wide overdue count ("N due for review"). Owns its clock the same
 * way LiveTimer does (useState initializer + slow interval keep Date.now out
 * of render, per react-hooks/purity), so it re-derives on grading via the new
 * reviewStats object and stays fresh on long-open tabs. Hidden while nothing
 * is due; the parent unmounts it during review sessions and pre-hydration.
 */
function DueNotice({ reviewStats }: { reviewStats: Record<string, ReviewStat> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const dueCount = countDue(reviewStats, CHALLENGES.map((c) => c.id), now);
  if (dueCount === 0) return null;
  return <div className="text-xs text-[#e6b450]">{`${dueCount} due for review: type 'review'`}</div>;
}

/**
 * Mastery readout: total MP, level title, progress through the current band,
 * and the next named unlock. When `mp` rises (an award landed) the reward plays
 * as two beats, so only one number is ever moving:
 *
 *   beat 1  the "+N MP" chip pops in and tallies the award (~0.3s), alone
 *   beat 2  the chip holds while the total and the bar count up in lockstep
 *           (0.4-0.9s, pulsing gold), landing together on a flash + sweep
 *
 * Multiple awards land in one store set, so the diff is naturally their sum.
 * Crossing a level threshold pauses the transfer to fire a transient
 * "▲ Level up" callout and flash the title; both derive here, never from the
 * store. State initializes from the mounted `mp` (persisted), so hydration
 * never animates from 0.
 */
const CHIP_TALLY_MS = 300;
// A beat of stillness between the two, so the chip has visibly stopped before
// the total starts.
const BEAT_GAP_MS = 120;
// The transfer is duration-clamped rather than rate-fixed: at a fixed rate a
// stacked award (first clear + weekly + deck cleared = 125) would run ~3x as long
// as a lone one. Clamping keeps every award on the same beat — a typical +50
// lands ~1.05s after the win, the whole reward is over inside ~1.5s.
const TRANSFER_MIN_MS = 350;
const TRANSFER_MAX_MS = 800;
const TRANSFER_MP_PER_SECOND = 80;
const LEVEL_UP_PAUSE_MS = 600;
// These two mirror CSS durations in globals.css and must move with them:
// .mp-gain-out (0.3s + 0.08s delay) and .mp-bar-flash / .mp-bar-sweep.
const CHIP_OUT_MS = 400;
const BAR_ACCENT_MS = 600;

type Gain = { key: number; done: boolean; total: number };

function MasteryBlock({ mp }: { mp: number }) {
  const [display, setDisplay] = useState(mp);
  // Bar width (percent through the current band), kept separate from `display`
  // because the text is rounded and the bar must not be: round(499.6) is 500,
  // and progressInLevel(500) re-bases to 0% of the NEXT band a frame before the
  // real value crosses, flashing the bar empty.
  const [progress, setProgress] = useState(() => progressInLevel(mp) * 100);
  const [chip, setChip] = useState(0);
  const [gain, setGain] = useState<Gain | null>(null);
  const [counting, setCounting] = useState(false);
  const [levelUp, setLevelUp] = useState<{ title: string; key: number } | null>(null);
  // While paused at a just-reached threshold the bar renders 100% of the old
  // band instead of re-basing to 0% of the new one.
  const [barHold, setBarHold] = useState(false);
  // Keys the bar's arrival accents (flash + sweep); bumped when the transfer lands.
  const [sweep, setSweep] = useState<number | null>(null);
  const fromRef = useRef(mp);
  // Live displayed value (fractional): a second award mid-count must animate
  // from what's on screen, not from the previous target (which would snap the
  // number up).
  const displayRef = useRef(mp);
  // Live chip value and the award it is tallying toward. The rAF loop needs both
  // synchronously (state updates land too late), so the refs are the source of
  // truth and the state is the render mirror.
  const chipRef = useRef(0);
  const gainRef = useRef<Gain | null>(null);
  useEffect(() => {
    const prev = fromRef.current;
    fromRef.current = mp;
    if (mp === prev) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animate = mp > prev && !reduced;
    let target = 0;
    if (mp > prev) {
      // A changing key remounts the chip so its pop-in restarts when a second
      // award (deck-cleared at grade time) lands mid-fade. An award landing
      // while the chip is still live folds into its running total and keeps
      // tallying from what's on screen; `done` starts the fade-out.
      const live = gainRef.current;
      target = (live && !live.done ? live.total : 0) + (mp - prev);
      if (!live || live.done) chipRef.current = 0;
      gainRef.current = { key: (live?.key ?? 0) + 1, done: !animate, total: target };
      setGain(gainRef.current);
      if (!animate) {
        chipRef.current = target;
        setChip(target);
      }
    }
    // A decrease (reset/newgame) snaps in one frame with no celebration; under
    // reduced motion the snap still gets the level-up callout (informational).
    // Both directions go through rAF so the effect never sets state
    // synchronously.
    let raf = 0;
    let last = 0;
    let startedAt: number | null = null;
    let pauseUntil = 0;
    // Non-null once beat 2 has begun: MP per second for the transfer.
    let rate: number | null = null;
    const tallyFrom = chipRef.current;
    const finish = () => {
      displayRef.current = mp;
      setDisplay(mp);
      setProgress(progressInLevel(mp) * 100);
      setBarHold(false);
      setCounting(false);
      if (gainRef.current) {
        gainRef.current = { ...gainRef.current, done: true };
        setGain(gainRef.current);
      }
      // The bar's accents fire on ARRIVAL, not on award: while the fill is still
      // resizing, anything riding it reads as a pale leading edge, not motion.
      if (animate) setSweep((s) => (s ?? 0) + 1);
    };
    const tick = (t: number) => {
      if (startedAt === null) startedAt = t;
      // Beat 1: the chip tallies alone — the total and the bar stay put.
      if (t - startedAt < CHIP_TALLY_MS + BEAT_GAP_MS) {
        const p = Math.min(1, (t - startedAt) / CHIP_TALLY_MS);
        chipRef.current = tallyFrom + (target - tallyFrom) * p;
        setChip(Math.round(chipRef.current));
        raf = requestAnimationFrame(tick);
        return;
      }
      if (rate === null) {
        // Beat 2 opens: pin the chip to the exact award, then start the total.
        chipRef.current = target;
        setChip(target);
        setCounting(true);
        const remaining = mp - displayRef.current;
        const ms = Math.min(
          TRANSFER_MAX_MS,
          Math.max(TRANSFER_MIN_MS, (remaining / TRANSFER_MP_PER_SECOND) * 1000)
        );
        rate = remaining / (ms / 1000);
        last = t;
      }
      const dt = (t - last) / 1000;
      last = t;
      if (t < pauseUntil) {
        raf = requestAnimationFrame(tick);
        return;
      }
      setBarHold(false);
      const from = displayRef.current;
      let value = Math.min(mp, from + rate * dt);
      // Transfer pauses at each level threshold: clamp the bar full, fire the
      // level-up feedback, hold, then continue with the overflow.
      const { next } = levelFor(from);
      if (next !== null && from < next && value >= next) {
        value = next;
        pauseUntil = t + LEVEL_UP_PAUSE_MS;
        setBarHold(true);
        setLevelUp((l) => ({ title: levelFor(next).title, key: (l?.key ?? 0) + 1 }));
      }
      displayRef.current = value;
      setDisplay(Math.round(value));
      setProgress(progressInLevel(value) * 100);
      if (value < mp || t < pauseUntil) raf = requestAnimationFrame(tick);
      else finish();
    };
    if (!animate) {
      if (mp > prev && levelFor(mp).title !== levelFor(prev).title) {
        setLevelUp((l) => ({ title: levelFor(mp).title, key: (l?.key ?? 0) + 1 }));
      }
      raf = requestAnimationFrame(finish);
      return () => cancelAnimationFrame(raf);
    }
    // An award landing mid-transfer restarts at beat 1, where the total is
    // frozen — the pulse must not imply otherwise.
    setCounting(false);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mp]);

  // Remove the +N MP chip after its fade-out ends (once the transfer is done):
  // the node must not linger (it pollutes select-by-text panel reads, and
  // under reduced motion there is no animation left to hide it).
  useEffect(() => {
    if (!gain?.done) return;
    const id = setTimeout(() => {
      gainRef.current = null;
      chipRef.current = 0;
      setGain(null);
      setChip(0);
    }, CHIP_OUT_MS);
    return () => clearTimeout(id);
  }, [gain]);

  // Remove the level-up callout after its 2.5s CSS animation ends, rather than
  // leaving an invisible node in the DOM.
  useEffect(() => {
    if (!levelUp) return;
    const id = setTimeout(() => setLevelUp(null), 2500);
    return () => clearTimeout(id);
  }, [levelUp]);

  // Same for the bar accents, whose overlays would otherwise sit on the fill.
  useEffect(() => {
    if (sweep === null) return;
    const id = setTimeout(() => setSweep(null), BAR_ACCENT_MS);
    return () => clearTimeout(id);
  }, [sweep]);

  const { title } = levelFor(display);
  // The rAF loop drives the width directly — no CSS transition, which would
  // leave the bar a transition behind the count-up.
  const pct = barHold ? 100 : progress;
  // The footer reads off the FINAL mp, not the animating display: the total, the
  // chip and the bar are already moving, and a fourth number counting down at
  // the same time is just noise.
  const { next } = levelFor(mp);
  return (
    <div className="flex flex-col gap-1">
      <div className="relative text-xs text-[#b3b1ad]">
        <span className={`font-semibold text-[#e6b450]${counting ? " mp-counting" : ""}`}>
          {`${display.toLocaleString("en-US")} MP`}
        </span>
        <span key={levelUp ? `lvl-${levelUp.key}` : "title"} className={`text-[#6b7680]${levelUp ? " title-flash" : ""}`}>
          {` · ${title}`}
        </span>
        {gain && (
          <span
            key={`gain-${gain.key}`}
            className={`mp-gain absolute right-0 top-0 font-semibold text-[#e6b450]${gain.done ? " mp-gain-out" : ""}`}
          >
            {`+${chip.toLocaleString("en-US")} MP`}
          </span>
        )}
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded bg-[#1c2430]">
        <div className="relative h-full overflow-hidden bg-[#e6b450]" style={{ width: `${pct}%` }}>
          {sweep !== null && <div key={`flash-${sweep}`} className="mp-bar-flash absolute inset-0" />}
        </div>
        {/* Sibling of the fill, not a child: the sweep needs the whole track to
            travel across (see globals.css). */}
        {sweep !== null && <div key={`sweep-${sweep}`} className="mp-bar-sweep absolute inset-0" />}
      </div>
      {levelUp && (
        <div
          key={levelUp.key}
          className="level-up self-start rounded border border-[#e6b450] px-2 py-0.5 text-xs font-semibold text-[#e6b450]"
        >
          {`▲ Level up: ${levelUp.title}`}
        </div>
      )}
      {next !== null && (
        <div className="text-xs text-[#6b7680]">
          {`${(next - mp).toLocaleString("en-US")} MP to ${levelFor(next).title}`}
        </div>
      )}
    </div>
  );
}

/**
 * Anki-style self-grade prompt shown while a completion gate is up (keys are
 * handled by TabManager's interceptEarly; this is display only). Each grade
 * previews the next-review interval it would schedule for this challenge.
 */
function GradeBar({ stat }: { stat: ReviewStat | undefined }) {
  return (
    <div className="mt-2 text-sm text-[#b3b1ad]">
      <div className="grid w-max grid-cols-[auto_auto_auto] gap-x-3 gap-y-0.5">
        {GRADES.map((g, i) => (
          <Fragment key={g}>
            <span className="font-semibold text-[#7ee787]">{`[${i + 1}]`}</span>
            <span>{GRADE_LABELS[g]}</span>
            <span className="text-[#6b7680]">{formatInterval(nextIntervalMs(stat, g))}</span>
          </Fragment>
        ))}
      </div>
      <div className="mt-1 text-xs text-[#6b7680]">Enter = Good</div>
    </div>
  );
}

/**
 * The current step's goal plus a progressive, hidden-by-default hint control.
 * Level 0 shows nothing extra; level 1 reveals the conceptual nudge (`step.hint`);
 * level 2 reveals the exact command (`step.command`). `resetKey` changes whenever
 * the player advances a step or loads another challenge, collapsing the reveal so
 * the next step never starts with the previous command on screen.
 */
function StepGoal({ step, hasBrief, resetKey }: { step: Step; hasBrief: boolean; resetKey: string }) {
  const [hintLevel, setHintLevel] = useState(0);

  // Collapse hints back to hidden on every step/challenge change (render-time
  // reset — see react.dev "You Might Not Need an Effect").
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setHintLevel(0);
  }

  const linkBtn =
    "self-start text-xs text-[#6b7680] underline decoration-dotted underline-offset-2 hover:text-[#e6b450]";

  return (
    <div className="flex flex-col gap-2">
      {hasBrief ? (
        step.instruction && (
          <div>
            <div className="text-xs uppercase tracking-wide text-[#6b7680]">Now</div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-[#e6e6d9]">{step.instruction}</p>
          </div>
        )
      ) : (
        <p className="whitespace-pre-line rounded bg-[#11161d] p-3 text-sm leading-relaxed text-[#b3b1ad]">
          {step.instruction}
        </p>
      )}

      {step.hint && (
        <div className="flex flex-col gap-1.5">
          {hintLevel === 0 ? (
            <button type="button" onClick={() => setHintLevel(1)} className={linkBtn}>
              Show hint
            </button>
          ) : (
            <>
              <p className="whitespace-pre-line rounded border border-[#1c2430] bg-[#11161d] p-2.5 text-sm leading-relaxed text-[#b3b1ad]">
                {step.hint}
              </p>
              {step.command &&
                (hintLevel >= 2 ? (
                  <code className="block rounded border border-[#3a3320] bg-[#1a1710] px-2.5 py-2 font-mono text-sm text-[#e6b450]">
                    {step.command}
                  </code>
                ) : (
                  <button type="button" onClick={() => setHintLevel(2)} className={linkBtn}>
                    Show command
                  </button>
                ))}
              <button type="button" onClick={() => setHintLevel(0)} className={linkBtn}>
                Hide hints
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Live elapsed-time display. Owns its own 1s interval so the tick only re-renders
 * this leaf, not the whole ChallengePanel (which would re-run the git/fs readouts).
 * Mounted only while a challenge is active, so the interval starts/stops with it.
 */
function LiveTimer({ challengeStartTime }: { challengeStartTime: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = challengeStartTime ? Math.max(0, now - challengeStartTime) : 0;
  return <>{formatElapsed(elapsed)}</>;
}
