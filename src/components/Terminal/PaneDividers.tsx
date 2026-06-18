"use client";

import { useRef } from "react";
import { PaneNode } from "../../state/paneTypes";

/** Pixel thickness of the draggable seam between two panes. */
const DIVIDER_THICKNESS = 6;

interface DividerRect {
  splitId: string;
  direction: "h" | "v";
  /** The divider strip itself (wrapper-relative px). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The split's full box — used to convert a drag position into a ratio. */
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
}

/** Walk the tree, emitting one divider strip per split along its child boundary. */
function computeDividers(node: PaneNode, x: number, y: number, w: number, h: number): DividerRect[] {
  if (node.kind === "leaf") return [];
  if (node.direction === "h") {
    const wa = w * node.ratio;
    const bx = x + wa;
    return [
      { splitId: node.id, direction: "h", x: bx - DIVIDER_THICKNESS / 2, y, w: DIVIDER_THICKNESS, h, boxX: x, boxY: y, boxW: w, boxH: h },
      ...computeDividers(node.a, x, y, wa, h),
      ...computeDividers(node.b, bx, y, w - wa, h),
    ];
  }
  const ha = h * node.ratio;
  const by = y + ha;
  return [
    { splitId: node.id, direction: "v", x, y: by - DIVIDER_THICKNESS / 2, w, h: DIVIDER_THICKNESS, boxX: x, boxY: y, boxW: w, boxH: h },
    ...computeDividers(node.a, x, y, w, ha),
    ...computeDividers(node.b, x, by, w, h - ha),
  ];
}

interface PaneDividersProps {
  root: PaneNode;
  width: number;
  height: number;
  onResize: (splitId: string, ratio: number) => void;
}

/**
 * Absolutely-positioned, draggable seams for the active window's pane tree.
 * Each seam maps a pointer drag to a new split ratio (clamped by the store).
 */
export default function PaneDividers({ root, width, height, onResize }: PaneDividersProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  if (width === 0 || height === 0) return null;
  const dividers = computeDividers(root, 0, 0, width, height);
  if (dividers.length === 0) return null;

  return (
    <div ref={layerRef} className="absolute inset-0 z-10" style={{ pointerEvents: "none" }}>
      {dividers.map((d) => (
        <div
          key={d.splitId}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            const layer = layerRef.current;
            if (!layer) return;
            const rect = layer.getBoundingClientRect();
            const move = (ev: PointerEvent) => {
              const ratio =
                d.direction === "h"
                  ? (ev.clientX - rect.left - d.boxX) / d.boxW
                  : (ev.clientY - rect.top - d.boxY) / d.boxH;
              onResize(d.splitId, ratio);
            };
            const up = (ev: PointerEvent) => {
              (e.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
          className="group absolute"
          style={{
            left: d.x,
            top: d.y,
            width: d.w,
            height: d.h,
            cursor: d.direction === "h" ? "col-resize" : "row-resize",
            pointerEvents: "auto",
          }}
        >
          {/* Always-visible dim line, centered in the hit-strip; gold on hover/drag. */}
          <div
            className="absolute bg-[#3d4751] group-hover:bg-[#e6b450] transition-colors"
            style={
              d.direction === "h"
                ? { left: "50%", top: 0, width: 1, height: "100%", transform: "translateX(-50%)", pointerEvents: "none" }
                : { top: "50%", left: 0, height: 1, width: "100%", transform: "translateY(-50%)", pointerEvents: "none" }
            }
          />
        </div>
      ))}
    </div>
  );
}
