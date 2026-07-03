"use client";

import { useEffect, useState } from "react";
import { formatElapsed } from "@tt/core/lib/format";
import { useGameStore } from "../state/gameStore";
import { getCategory, SELECTABLE_CATEGORIES } from "../challenges/categories";
import type { Step } from "../challenges/types";
import SchematicView from "./SchematicView";
import WindowStripView from "./WindowStripView";
import FsTreeView from "./FsTreeView";
import SettingsModal from "./SettingsModal";

export default function ChallengePanel() {
  const challengeIndex = useGameStore((s) => s.challengeIndex);
  const stepIndex = useGameStore((s) => s.stepIndex);
  const completed = useGameStore((s) => s.completed);
  const awaitingContinue = useGameStore((s) => s.awaitingContinue);
  const flash = useGameStore((s) => s.flash);
  const windows = useGameStore((s) => s.windows);
  const activeWindowId = useGameStore((s) => s.activeWindowId);
  const fs = useGameStore((s) => s.fs);
  const clearFlash = useGameStore((s) => s.clearFlash);
  const restartChallenge = useGameStore((s) => s.restartChallenge);
  const loadChallenge = useGameStore((s) => s.loadChallenge);
  const activeCategory = useGameStore((s) => s.activeCategory);
  const selectCategory = useGameStore((s) => s.selectCategory);
  const challengeStartTime = useGameStore((s) => s.challengeStartTime);
  const bestTimes = useGameStore((s) => s.bestTimes);
  const lastElapsedMs = useGameStore((s) => s.lastElapsedMs);
  const lastWasBest = useGameStore((s) => s.lastWasBest);

  const [settingsOpen, setSettingsOpen] = useState(false);

  // Auto-clear the transient "✓ complete" banner.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(clearFlash, 2200);
    return () => clearTimeout(t);
  }, [flash, clearFlash]);

  const category = getCategory(activeCategory);
  const challenge = category.challenges[challengeIndex];
  const activeWindow = windows.find((w) => w.id === activeWindowId) ?? windows[0];

  const best = challenge ? bestTimes[challenge.id] : undefined;

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
              className="max-w-[180px] truncate rounded border border-[#1c2430] bg-[#11161d] px-2 py-1 text-xs text-[#6b7680] hover:border-[#6b7680] hover:text-[#b3b1ad] focus:outline-none"
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
          onChange={(e) => loadChallenge(Number(e.target.value))}
          className="w-full truncate rounded border border-[#1c2430] bg-[#11161d] px-2 py-1 text-xs text-[#6b7680] hover:border-[#6b7680] hover:text-[#b3b1ad] focus:outline-none"
        >
          {category.challenges.map((c, i) => (
            <option key={c.id} value={i}>
              {i + 1}/{category.challenges.length} · {c.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto">
      {flash && (
        <div className="rounded border border-[#2e7d32] bg-[#11231a] px-3 py-2 text-sm text-[#7ee787]">
          {flash}
        </div>
      )}

      {awaitingContinue && challenge ? (
        <div className="rounded border border-[#2e7d32] bg-[#11231a] p-4 text-[#7ee787]">
          <div className="text-base font-semibold">✓ {challenge.title} complete!</div>
          {lastElapsedMs != null && (
            <div className="mt-2 text-sm text-[#b3b1ad]">
              Time: <span className="font-semibold text-[#e6b450]">{formatElapsed(lastElapsedMs)}</span>
              {best != null && <> · best {formatElapsed(best)}</>}
              {lastWasBest && <div className="text-[#7ee787]">🏆 New best!</div>}
            </div>
          )}
          <div className="mt-2 text-sm text-[#b3b1ad]">
            Press <span className="font-semibold text-[#7ee787]">Enter</span> to continue →
          </div>
        </div>
      ) : completed || !challenge ? (
        <div className="rounded border border-[#2e7d32] bg-[#11231a] p-4 text-sm text-[#7ee787]">
          🎉 All {activeCategory === "all" ? "" : `${category.label} `}challenges complete. Nicely done.
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
              {best != null && <> · best {formatElapsed(best)}</>}
            </div>
          </div>

          {challenge.brief && (
            <p className="whitespace-pre-line rounded bg-[#11161d] p-3 text-sm leading-relaxed text-[#b3b1ad]">
              {challenge.brief}
            </p>
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

          {challenge.type === "tmux" && challenge.targetWindow && activeWindow && (
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

          {challenge.type === "tmux" && challenge.targetWindows && (
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

          {/* Gated on the field, not the type: an fs-detected challenge in any
              track (e.g. the copy-mode tmux challenge) still gets the tree. */}
          {challenge.fsWatchPath && (
            <FsTreeView fs={fs} watchPath={challenge.fsWatchPath} />
          )}

          <button
            type="button"
            onClick={restartChallenge}
            className="self-start rounded border border-[#3d4751] px-2 py-1 text-xs text-[#6b7680] hover:border-[#6b7680] hover:text-[#b3b1ad]"
          >
            ↺ Restart challenge
          </button>
        </div>
      )}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </aside>
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

  // Collapse hints back to hidden on every step/challenge change.
  useEffect(() => setHintLevel(0), [resetKey]);

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
