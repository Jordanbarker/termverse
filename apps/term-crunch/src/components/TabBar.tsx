"use client";

import { useGameStore } from "../state/gameStore";
import { windowLabel } from "../lib/windowLabel";
import { MAX_WINDOWS } from "../lib/machine";
import TmuxStatusBar, { StatusBarTheme } from "@tt/core/components/TmuxStatusBar";

interface TabBarProps {
  /** Status-line palette, parsed from the player's ~/.tmux.conf by TabManager. */
  theme: StatusBarTheme;
  /** True while the tmux prefix key is pending (lights up the PREFIX block). */
  prefixActive: boolean;
  /** tmux rename-window inline prompt text; takes over the bar when non-null. */
  renamePrompt?: string | null;
  /** Attached tmux session name, rendered `[name]` at status-left. */
  sessionName?: string;
  onNewWindow: () => void;
  onSelectWindow: (windowId: string) => void;
  onCloseWindow: (windowId: string) => void;
}

export default function TabBar({
  theme,
  prefixActive,
  renamePrompt,
  sessionName,
  onNewWindow,
  onSelectWindow,
  onCloseWindow,
}: TabBarProps) {
  const windows = useGameStore((s) => s.windows);
  const activeWindowId = useGameStore((s) => s.activeWindowId);

  return (
    <TmuxStatusBar
      windows={windows}
      activeWindowId={activeWindowId}
      label={windowLabel}
      onSelectWindow={onSelectWindow}
      onCloseWindow={onCloseWindow}
      prefixActive={prefixActive}
      modalText={renamePrompt}
      theme={theme}
      sessionName={sessionName}
      trailing={
        <button
          onClick={onNewWindow}
          disabled={windows.length >= MAX_WINDOWS}
          className="px-2 py-0.5 opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          style={{ color: theme.statusFg }}
        >
          +
        </button>
      }
    />
  );
}
