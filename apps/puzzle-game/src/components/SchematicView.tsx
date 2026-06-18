"use client";

import { paneRects, type PaneNode } from "@tt/core/terminal/paneTypes";

interface Props {
  root: PaneNode;
  width?: number;
  height?: number;
}

/**
 * Pure, prop-driven diagram of a pane tree. Reuses the engine's `paneRects` so a
 * schematic is laid out exactly like the real terminal would lay out the panes.
 * This IS the "rendered target", no image assets.
 */
export default function SchematicView({ root, width = 300, height = 190 }: Props) {
  const rects = paneRects(root, 0, 0, width, height);
  return (
    <div
      className="relative rounded border border-[#3d4751] bg-[#0a0e14]"
      style={{ width, height }}
    >
      {rects.map((r, i) => (
        <div
          key={r.id}
          className="absolute flex items-center justify-center rounded-sm border border-[#3d4751] bg-[#11161d] text-xs text-[#6b7680]"
          style={{ left: r.x + 3, top: r.y + 3, width: r.w - 6, height: r.h - 6 }}
        >
          {i + 1}
        </div>
      ))}
    </div>
  );
}
