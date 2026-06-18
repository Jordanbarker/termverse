"use client";

import { useEffect } from "react";
import { usePuzzleStore } from "../state/puzzleStore";
import { CHALLENGES } from "../challenges/registry";
import { readGitState } from "../lib/gitState";
import SchematicView from "./SchematicView";

export default function ChallengePanel() {
  const challengeIndex = usePuzzleStore((s) => s.challengeIndex);
  const stepIndex = usePuzzleStore((s) => s.stepIndex);
  const completed = usePuzzleStore((s) => s.completed);
  const awaitingContinue = usePuzzleStore((s) => s.awaitingContinue);
  const flash = usePuzzleStore((s) => s.flash);
  const windows = usePuzzleStore((s) => s.windows);
  const activeWindowId = usePuzzleStore((s) => s.activeWindowId);
  const fs = usePuzzleStore((s) => s.fs);
  const clearFlash = usePuzzleStore((s) => s.clearFlash);

  // Auto-clear the transient "✓ complete" banner.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(clearFlash, 2200);
    return () => clearTimeout(t);
  }, [flash, clearFlash]);

  const challenge = CHALLENGES[challengeIndex];
  const activeWindow = windows.find((w) => w.id === activeWindowId) ?? windows[0];

  return (
    <aside className="flex h-full w-[420px] shrink-0 flex-col gap-4 border-l border-[#1c2430] bg-[#0d1117] p-5 text-[#b3b1ad]">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold tracking-wide text-[#e6b450]">TERMINAL PUZZLES</h1>
        <span className="text-xs text-[#6b7680]">
          Challenge {Math.min(challengeIndex + 1, CHALLENGES.length)}/{CHALLENGES.length}
        </span>
      </div>

      {flash && (
        <div className="rounded border border-[#2e7d32] bg-[#11231a] px-3 py-2 text-sm text-[#7ee787]">
          {flash}
        </div>
      )}

      {awaitingContinue && challenge ? (
        <div className="rounded border border-[#2e7d32] bg-[#11231a] p-4 text-[#7ee787]">
          <div className="text-base font-semibold">✓ {challenge.title} complete!</div>
          <div className="mt-2 text-sm text-[#b3b1ad]">
            Press <span className="font-semibold text-[#7ee787]">Enter</span> to continue →
          </div>
        </div>
      ) : completed || !challenge ? (
        <div className="rounded border border-[#2e7d32] bg-[#11231a] p-4 text-sm text-[#7ee787]">
          🎉 All challenges complete. Nicely done.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <div className="text-base font-semibold">{challenge.title}</div>
            <div className="mt-0.5 text-xs text-[#6b7680]">
              Step {stepIndex + 1}/{challenge.steps.length}
            </div>
          </div>

          <p className="rounded bg-[#11161d] p-3 text-sm leading-relaxed text-[#b3b1ad]">
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

          {challenge.type === "git" && challenge.gitRepoPath && (
            <GitReadout fs={fs} repoPath={challenge.gitRepoPath} />
          )}
        </div>
      )}

      <div className="mt-auto text-xs leading-relaxed text-[#4a5560]">
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

function GitReadout({ fs, repoPath }: { fs: ReturnType<typeof usePuzzleStore.getState>["fs"]; repoPath: string }) {
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
