"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { usePuzzleStore } from "../state/puzzleStore";
import ChallengePanel from "./ChallengePanel";

// xterm needs `window`; load the terminal only on the client.
const PuzzleTerminal = dynamic(() => import("./PuzzleTerminal"), { ssr: false });

export default function PuzzleShell() {
  const windowCount = usePuzzleStore((s) => s.windows.length);
  const loadChallenge = usePuzzleStore((s) => s.loadChallenge);

  useEffect(() => {
    if (windowCount === 0) loadChallenge(0);
  }, [windowCount, loadChallenge]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0a0e14]">
      <div className="relative flex-1">
        <PuzzleTerminal />
      </div>
      <ChallengePanel />
    </div>
  );
}
