"use client";

import { useEffect, useState } from "react";
import { formatElapsed } from "@tt/core/lib/format";
import { useGameStore } from "../state/gameStore";
import { getCategory, SELECTABLE_CATEGORIES } from "../challenges/categories";
import { readGitState } from "../lib/gitState";
import SchematicView from "./SchematicView";
import WindowStripView from "./WindowStripView";
import FsTreeView from "./FsTreeView";

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

  // Auto-clear the transient "✓ complete" banner.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(clearFlash, 2200);
    return () => clearTimeout(t);
  }, [flash, clearFlash]);

  const category = getCategory(activeCategory);
  const challenge = category.challenges[challengeIndex];
  const activeWindow = windows.find((w) => w.id === activeWindowId) ?? windows[0];

  // Tick once a second to re-render the live timer while a challenge is in progress.
  const ticking = !completed && !awaitingContinue && !!challenge;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  const best = challenge ? bestTimes[challenge.id] : undefined;
  const liveElapsed = challengeStartTime ? Math.max(0, Date.now() - challengeStartTime) : 0;

  return (
    <aside className="flex h-full w-[420px] shrink-0 flex-col gap-4 border-l border-[#1c2430] bg-[#0d1117] p-5 text-[#b3b1ad]">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-sm font-semibold tracking-wide text-[#e6b450]">TERM CRUNCH</h1>
          <select
            aria-label="Select category"
            value={activeCategory}
            onChange={(e) => selectCategory(e.target.value)}
            className="max-w-[200px] truncate rounded border border-[#1c2430] bg-[#11161d] px-2 py-1 text-xs text-[#6b7680] hover:border-[#6b7680] hover:text-[#b3b1ad] focus:outline-none"
          >
            {SELECTABLE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
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
              Step {stepIndex + 1}/{challenge.steps.length} · ⏱ {formatElapsed(liveElapsed)}
              {best != null && <> · best {formatElapsed(best)}</>}
            </div>
          </div>

          <p className="whitespace-pre-line rounded bg-[#11161d] p-3 text-sm leading-relaxed text-[#b3b1ad]">
            {challenge.steps[stepIndex]?.instruction}
          </p>

          {challenge.type === "pane" && challenge.targetWindow && activeWindow && (
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

          {challenge.type === "pane" && challenge.targetWindows && (
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

          {challenge.type === "git" && challenge.gitRepoPath && (
            <GitReadout fs={fs} repoPath={challenge.gitRepoPath} />
          )}

          {challenge.type === "fs" && challenge.fsWatchPath && (
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

      <div className="text-xs leading-relaxed text-[#4a5560]">
        Prefix is <span className="text-[#b3b1ad]">Ctrl+Space</span>. Split: prefix then{" "}
        <span className="text-[#b3b1ad]">|</span> / <span className="text-[#b3b1ad]">-</span>. Move
        focus: prefix then arrows. Windows: prefix then{" "}
        <span className="text-[#b3b1ad]">c</span> (new) /{" "}
        <span className="text-[#b3b1ad]">n</span>,<span className="text-[#b3b1ad]">p</span> (switch) /{" "}
        <span className="text-[#b3b1ad]">r</span> (rename).
      </div>
    </aside>
  );
}

function GitReadout({ fs, repoPath }: { fs: ReturnType<typeof useGameStore.getState>["fs"]; repoPath: string }) {
  const g = readGitState(fs, repoPath);
  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-3 border-b border-[#1c2430] py-1 last:border-0">
      <span className="text-[#6b7680]">{label}</span>
      <span className="truncate text-right">{value}</span>
    </div>
  );
  return (
    <div className="rounded border border-[#1c2430] bg-[#11161d] p-3 text-xs">
      {row("repo", g.hasRepo ? "initialized" : "none")}
      {row("branch", g.branch ?? "-")}
      {row("commits", String(g.commitCount))}
      {row("latest", g.latestMessage ?? "-")}
      {row("staged", g.staged.length ? g.staged.join(", ") : "-")}
      {row("working tree", g.clean ? "clean" : "dirty")}
    </div>
  );
}
