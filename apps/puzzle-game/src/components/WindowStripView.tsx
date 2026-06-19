"use client";

import type { WindowState } from "@tt/core/terminal/paneTypes";
import { windowLabel } from "../lib/windowLabel";

interface Props {
  windows: WindowState[];
  /** Index of the active window (highlighted like the real status line). */
  activeIndex?: number;
}

/**
 * Pure, prop-driven diagram of a window strip — the tmux status-line tabs,
 * reusing the same `windowLabel` the live `PuzzleTabBar` renders. This is the
 * window-count analog of `SchematicView`'s pane-tree diagram.
 */
export default function WindowStripView({ windows, activeIndex }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded border border-[#3d4751] bg-[#0a0e14] p-2 font-mono text-xs">
      {windows.map((win, idx) => {
        const isActive = idx === activeIndex;
        return (
          <span
            key={win.id}
            className="rounded-sm border px-2 py-0.5"
            style={
              isActive
                ? { backgroundColor: "#253340", color: "#e6b450", borderColor: "#3d4751" }
                : { color: "#b3b1ad", borderColor: "#3d4751" }
            }
          >
            {idx + 1}:{windowLabel(win)}
          </span>
        );
      })}
    </div>
  );
}
