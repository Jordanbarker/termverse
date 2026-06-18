"use client";

import { WindowState, allLeaves, findLeaf, firstLeaf } from "@tt/core/terminal/paneTypes";
import { ANSI_COLORS } from "@tt/core/terminal/ansiPalette";
import { usePuzzleStore } from "../state/puzzleStore";
import { USERNAME } from "../lib/machine";

const PREFIX_BLUE = ANSI_COLORS.blue;

// Static status-line palette (the puzzle has no ~/.tmux.conf to parse).
const THEME = {
  statusBg: "#11161d",
  statusFg: "#6b7680",
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

function abbreviateCwd(cwd: string): string {
  const homeDir = `/home/${USERNAME}`;
  let display = cwd;
  if (display === homeDir) return "~";
  if (display.startsWith(homeDir + "/")) {
    display = "~" + display.slice(homeDir.length);
  }
  // Show only the last path segment for brevity.
  const lastSlash = display.lastIndexOf("/");
  if (lastSlash > 0) {
    return display.slice(lastSlash + 1);
  }
  return display;
}

/** A window's status-line label comes from its focused pane; a pane count is
 *  appended (tmux-style) when the window is split. */
function windowLabel(win: WindowState): string {
  const count = allLeaves(win.root).length;
  const base = win.name
    ? win.name
    : (() => {
        const leaf = findLeaf(win.root, win.activePaneId) ?? firstLeaf(win.root);
        return `puzzle:${abbreviateCwd(leaf.cwd)}`;
      })();
  return count > 1 ? `${base} (${count})` : base;
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
    <div
      className="flex items-center border-b font-mono text-xs select-none"
      style={{ backgroundColor: THEME.statusBg, borderBottomColor: THEME.statusBg }}
    >
      {renamePrompt ? (
        // tmux rename-window takes over the status line.
        <span className="px-2 py-0.5 font-bold" style={{ color: THEME.currentFg }}>
          {renamePrompt}
        </span>
      ) : (
        <>
          {/* tmux status-left: prefix-state indicator. Blank (space reserved) at
              rest; "PREFIX" in blue when armed. */}
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
                    ? { backgroundColor: THEME.currentBg, color: THEME.currentFg }
                    : { color: THEME.windowFg }
                }
              >
                <span className="truncate max-w-[220px]">
                  {idx + 1}:{windowLabel(win)}
                  {isActive && " *"}
                </span>
                {windows.length > 1 && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseWindow(win.id);
                    }}
                    className="ml-1 hover:text-red-500 transition-colors"
                  >
                    x
                  </span>
                )}
              </button>
            );
          })}
          <button
            onClick={onNewWindow}
            disabled={windows.length >= 5}
            className="px-2 py-0.5 opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
            style={{ color: THEME.statusFg }}
          >
            +
          </button>
        </>
      )}
    </div>
  );
}
