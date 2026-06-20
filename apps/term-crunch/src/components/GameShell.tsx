"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useGameStore } from "../state/gameStore";
import ChallengePanel from "./ChallengePanel";

// xterm needs `window`; load the terminal only on the client.
const TabManager = dynamic(() => import("./TabManager"), { ssr: false });

export default function GameShell() {
  const windowCount = useGameStore((s) => s.windows.length);
  const loadChallenge = useGameStore((s) => s.loadChallenge);

  useEffect(() => {
    if (windowCount === 0) loadChallenge(0);
  }, [windowCount, loadChallenge]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0a0e14]">
      <div className="relative flex-1">
        <TabManager />
      </div>
      <ChallengePanel />
    </div>
  );
}
