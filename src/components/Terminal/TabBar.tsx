"use client";

import { useState, useRef, useEffect } from "react";
import { useGameStore } from "../../state/gameStore";
import { WindowState, allLeaves, findLeaf, firstLeaf } from "../../state/paneTypes";
import { COMPUTERS, ComputerId } from "../../state/types";
import { TabBarTheme } from "@tt/core/terminal/tmuxConfig";
import { ANSI_COLORS } from "@tt/core/terminal/ansiPalette";

const PREFIX_BLUE = ANSI_COLORS.blue;

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

function abbreviateCwd(cwd: string, username: string): string {
  const homeDir = `/home/${username}`;
  let display = cwd;
  if (display === homeDir) return "~";
  if (display.startsWith(homeDir + "/")) {
    display = "~" + display.slice(homeDir.length);
  }
  // Show only the last path segment for brevity
  const lastSlash = display.lastIndexOf("/");
  if (lastSlash > 0) {
    return display.slice(lastSlash + 1);
  }
  return display;
}

/** A window's status-line label comes from its focused pane; a pane count is
 *  appended (tmux-style) when the window is split. */
function windowLabel(win: WindowState, username: string): string {
  const count = allLeaves(win.root).length;
  // A custom name (tmux rename-window) replaces the derived host:dir; the pane
  // count is still appended when split, matching tmux.
  const base = win.name
    ? win.name
    : (() => {
        const leaf = findLeaf(win.root, win.activePaneId) ?? firstLeaf(win.root);
        const host = COMPUTERS[leaf.computerId]?.promptHostname ?? leaf.computerId;
        return `${host}:${abbreviateCwd(leaf.cwd, username)}`;
      })();
  return count > 1 ? `${base} (${count})` : base;
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

  return (
    <div
      className="flex items-center border-b font-mono text-xs select-none"
      style={{ backgroundColor: theme.statusBg, borderBottomColor: theme.statusBg }}
    >
      {closeConfirm || renamePrompt ? (
        // tmux confirm-before-kill / rename-window takes over the status line.
        <span className="px-2 py-0.5 font-bold" style={{ color: theme.currentFg }}>
          {closeConfirm ?? renamePrompt}
        </span>
      ) : (
      <>
      {/* tmux status-left: prefix-state indicator. Blank (space reserved) at rest; "PREFIX" in blue when armed. */}
      <span
        className={`px-2 py-0.5 font-bold transition-colors ${prefixActive ? "animate-pulse" : ""}`}
        style={{
          visibility: prefixActive ? "visible" : "hidden",
          color: PREFIX_BLUE,
        }}
      >
        PREFIX
      </span>
      {windows.map((win, idx) => {
        const isActive = win.id === activeWindowId;
        return (
          <button
            key={win.id}
            onClick={() => onSelectWindow(win.id)}
            className={`relative flex items-center gap-1.5 px-3 py-0.5 transition-opacity ${
              isActive ? "font-medium" : "opacity-70 hover:opacity-100"
            }`}
            style={
              isActive
                ? { backgroundColor: theme.currentBg, color: theme.currentFg }
                : { backgroundColor: theme.windowBg, color: theme.windowFg }
            }
          >
            <span className="truncate max-w-[220px]">
              {idx + 1}:{windowLabel(win, username)}
              {isActive && " *"}
            </span>
            {windows.length > 1 && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseWindow(win.id);
                }}
                className="ml-1 hover:text-red-700 transition-colors"
              >
                x
              </span>
            )}
          </button>
        );
      })}
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
      </>
      )}
    </div>
  );
}
