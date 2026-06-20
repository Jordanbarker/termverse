"use client";

import { usePuzzleStore } from "../state/puzzleStore";
import { windowLabel } from "../lib/windowLabel";
import TmuxStatusBar, { StatusBarTheme } from "@tt/core/components/TmuxStatusBar";

// Static status-line palette (the puzzle has no ~/.tmux.conf to parse).
// windowBg "transparent" matches the live game's inactive-tab look.
const THEME: StatusBarTheme = {
  statusBg: "#11161d",
  statusFg: "#6b7680",
  windowBg: "transparent",
  windowFg: "#b3b1ad",
  currentBg: "#253340",
  currentFg: "#e6b450",
};

interface PuzzleTabBarProps {
  /** True while the tmux prefix key is pending (lights up the PREFIX block). */
  prefixActive: boolean;
  /** tmux rename-window inline prompt text; takes over the bar when non-null. */
  renamePrompt?: string | null;
  onNewWindow: () => void;
  onSelectWindow: (windowId: string) => void;
  onCloseWindow: (windowId: string) => void;
}

export default function PuzzleTabBar({
  prefixActive,
  renamePrompt,
  onNewWindow,
  onSelectWindow,
  onCloseWindow,
}: PuzzleTabBarProps) {
  const windows = usePuzzleStore((s) => s.windows);
  const activeWindowId = usePuzzleStore((s) => s.activeWindowId);

  return (
    <TmuxStatusBar
      windows={windows}
      activeWindowId={activeWindowId}
      label={windowLabel}
      onSelectWindow={onSelectWindow}
      onCloseWindow={onCloseWindow}
      prefixActive={prefixActive}
      modalText={renamePrompt}
      theme={THEME}
      trailing={
        <button
          onClick={onNewWindow}
          disabled={windows.length >= 5}
          className="px-2 py-0.5 opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          style={{ color: THEME.statusFg }}
        >
          +
        </button>
      }
    />
  );
}
