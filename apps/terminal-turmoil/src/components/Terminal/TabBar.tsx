"use client";

import { useState, useRef, useEffect } from "react";
import { useGameStore } from "../../state/gameStore";
import { PaneLeaf, allLeaves } from "@tt/core/terminal/paneTypes";
import { windowLabel } from "@tt/core/terminal/windowLabel";
import { COMPUTERS, ComputerId } from "../../state/types";
import { TabBarTheme } from "@tt/core/terminal/tmuxConfig";
import TmuxStatusBar from "@tt/core/components/TmuxStatusBar";

interface TabBarProps {
  onNewWindow: (computerId?: ComputerId) => void;
  onCloseWindow: (windowId: string) => void;
  onSelectWindow: (windowId: string) => void;
  /** True while the tmux prefix key is pending (lights up the session block). */
  prefixActive: boolean;
  /** tmux confirm-before-kill prompt text; takes over the bar when non-null. */
  closeConfirm?: string | null;
  /** tmux rename-window inline prompt text; takes over the bar when non-null. */
  renamePrompt?: string | null;
  /** Bar colors parsed from `~/.tmux.conf` (drives the inline styles). */
  theme: TabBarTheme;
}

export default function TabBar({
  onNewWindow,
  onCloseWindow,
  onSelectWindow,
  prefixActive,
  closeConfirm,
  renamePrompt,
  theme,
}: TabBarProps) {
  const windows = useGameStore((s) => s.windows);
  const activeWindowId = useGameStore((s) => s.activeWindowId);
  const username = useGameStore((s) => s.username);
  const computerState = useGameStore((s) => s.computerState);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // Home (the physical machine) is always offered; a remote machine is only
  // offered while at least one pane is connected to it. Preserved-but-
  // disconnected state (mid-shift soft disconnect) stays reachable via
  // ssh/coder only, never one click from the "+" button.
  const openComputerIds = new Set(windows.flatMap((w) => allLeaves(w.root).map((l) => l.computerId)));
  const availableComputers = (Object.keys(computerState) as ComputerId[]).filter(
    (id) => computerState[id] && (id === "home" || openComputerIds.has(id))
  );
  const hasMultipleComputers = availableComputers.length > 1;

  const handlePlusClick = () => {
    if (windows.length >= 5) return;
    if (hasMultipleComputers) {
      setDropdownOpen(!dropdownOpen);
    } else {
      onNewWindow();
    }
  };

  const handleComputerSelect = (computerId: ComputerId) => {
    setDropdownOpen(false);
    onNewWindow(computerId);
  };

  const resolveHost = (leaf: PaneLeaf) =>
    COMPUTERS[leaf.computerId as ComputerId]?.promptHostname ?? leaf.computerId;

  return (
    <TmuxStatusBar
      windows={windows}
      activeWindowId={activeWindowId}
      label={(win) => windowLabel(win, { username, resolveHost })}
      onSelectWindow={onSelectWindow}
      onCloseWindow={onCloseWindow}
      prefixActive={prefixActive}
      modalText={closeConfirm ?? renamePrompt}
      theme={theme}
      trailing={
        // Multi-computer new-window dropdown — the one piece beyond the shared bar.
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={handlePlusClick}
            disabled={windows.length >= 5}
            className="px-2 py-0.5 opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
            style={{ color: theme.statusFg }}
          >
            +
          </button>
          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-0.5 bg-[#1a1f29] border border-[#2a2f3a] rounded shadow-lg z-50 min-w-[140px]">
              {availableComputers.map((id) => (
                <button
                  key={id}
                  onClick={() => handleComputerSelect(id)}
                  className="block w-full text-left px-3 py-1 text-[#b3b1ad] hover:bg-[#253340] transition-colors"
                >
                  {COMPUTERS[id]?.promptHostname ?? id}
                </button>
              ))}
            </div>
          )}
        </div>
      }
    />
  );
}
