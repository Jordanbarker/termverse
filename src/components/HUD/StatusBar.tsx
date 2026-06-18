"use client";

import { useGameStore, getActiveLeaf } from "../../state/gameStore";

export default function StatusBar() {
  // Re-render when windows or the active window/pane change; derive the focused leaf.
  const activeLeaf = useGameStore((s) => getActiveLeaf(s));
  const chapter = useGameStore((s) => s.currentChapter);
  const gamePhase = useGameStore((s) => s.gamePhase);
  const terminated = useGameStore((s) => s.storyFlags.terminated_for_misconduct);

  const activeComputer = activeLeaf?.computerId ?? "home";
  const cwd = activeLeaf?.cwd ?? "";

  let leftText: string;
  if (gamePhase === "playing" || gamePhase === "transitioning") {
    leftText = cwd;
  } else if (activeComputer === "home") {
    leftText = "Personal Workstation";
  } else if (activeComputer === "devcontainer") {
    leftText = "NexaCorp Dev Container";
  } else {
    leftText = "NexaCorp Internal Systems";
  }

  let rightText: string;
  if (gamePhase === "login") {
    rightText = "Login Required";
  } else if (gamePhase === "booting") {
    rightText = "Authenticating...";
  } else if (terminated) {
    rightText = "Terminated";
  } else {
    rightText = chapter.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <div className="flex items-center justify-between px-4 py-1 bg-[#1a1f29] text-[#6c7380] text-xs font-mono border-t border-[#2a2f3a]">
      <span>{leftText}</span>
      <span>{rightText}</span>
    </div>
  );
}
