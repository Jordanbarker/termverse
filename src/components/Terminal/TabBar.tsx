"use client";

import { useState, useRef, useEffect } from "react";
import { useGameStore, TabState } from "../../state/gameStore";
import { COMPUTERS, ComputerId } from "../../state/types";
import { TabBarTheme } from "../../engine/terminal/tmuxConfig";

interface TabBarProps {
  onNewTab: (computerId?: ComputerId) => void;
  onCloseTab: (tabId: string) => void;
  onSelectTab: (tabId: string) => void;
  /** True while the tmux prefix key is pending (lights up the session block). */
  prefixActive: boolean;
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

function tabLabel(tab: TabState, username: string): string {
  const host = COMPUTERS[tab.computerId]?.promptHostname ?? tab.computerId;
  const dir = abbreviateCwd(tab.cwd, username);
  return `${host}:${dir}`;
}

export default function TabBar({
  onNewTab,
  onCloseTab,
  onSelectTab,
  prefixActive,
  theme,
}: TabBarProps) {
  const tabs = useGameStore((s) => s.tabs);
  const activeTabId = useGameStore((s) => s.activeTabId);
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

  const availableComputers = (Object.keys(computerState) as ComputerId[]).filter(
    (id) => computerState[id]
  );
  const hasMultipleComputers = availableComputers.length > 1;

  const handlePlusClick = () => {
    if (tabs.length >= 5) return;
    if (hasMultipleComputers) {
      setDropdownOpen(!dropdownOpen);
    } else {
      onNewTab();
    }
  };

  const handleComputerSelect = (computerId: ComputerId) => {
    setDropdownOpen(false);
    onNewTab(computerId);
  };

  return (
    <div
      className="flex items-center border-b font-mono text-xs select-none"
      style={{ backgroundColor: theme.statusBg, borderBottomColor: theme.statusBg }}
    >
      {/* tmux status-left: session block. Lights up gold while the prefix is pending. */}
      <span
        className={`px-2 py-0.5 font-bold transition-colors ${prefixActive ? "animate-pulse" : ""}`}
        style={
          prefixActive
            ? { backgroundColor: theme.currentBg, color: theme.currentFg }
            : { backgroundColor: theme.leftBg, color: theme.leftFg }
        }
      >
        [{username}]
      </span>
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`relative flex items-center gap-1.5 px-3 py-0.5 transition-opacity ${
              isActive ? "font-medium" : "opacity-70 hover:opacity-100"
            }`}
            style={
              isActive
                ? { backgroundColor: theme.currentBg, color: theme.currentFg }
                : { backgroundColor: theme.windowBg, color: theme.windowFg }
            }
          >
            <span className="truncate max-w-[200px]">
              {idx + 1}:{tabLabel(tab, username)}
              {isActive && " *"}
            </span>
            {tabs.length > 1 && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
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
          disabled={tabs.length >= 5}
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
    </div>
  );
}
