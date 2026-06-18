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

interface PaneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * True if a divider's center line abuts an edge of the active pane (and their
 * cross-axis ranges overlap). Such a seam IS the active pane's border on that
 * side, so it should render gold — matching tmux's pane-active-border-style and
 * filling the bottom/right edge the seam would otherwise paint over.
 */
function bordersActivePane(d: DividerRect, active: PaneRect): boolean {
  if (d.direction === "h") {
    const lineX = d.x + DIVIDER_THICKNESS / 2;
    const touchesEdge = Math.abs(lineX - active.x) <= 1 || Math.abs(lineX - (active.x + active.w)) <= 1;
    const overlaps = active.y < d.boxY + d.boxH && active.y + active.h > d.boxY;
    return touchesEdge && overlaps;
  }
  const lineY = d.y + DIVIDER_THICKNESS / 2;
  const touchesEdge = Math.abs(lineY - active.y) <= 1 || Math.abs(lineY - (active.y + active.h)) <= 1;
  const overlaps = active.x < d.boxX + d.boxW && active.x + active.w > d.boxX;
  return touchesEdge && overlaps;
}

interface PaneDividersProps {
  root: PaneNode;
  width: number;
  height: number;
  onResize: (splitId: string, ratio: number) => void;
  /** The active pane's wrapper-relative rect; seams bordering it render gold. */
  activePaneRect?: PaneRect;
}

/**
 * Absolutely-positioned, draggable seams for the active window's pane tree.
 * Each seam maps a pointer drag to a new split ratio (clamped by the store).
 */
export default function PaneDividers({ root, width, height, onResize, activePaneRect }: PaneDividersProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  if (width === 0 || height === 0) return null;
  const dividers = computeDividers(root, 0, 0, width, height);
  if (dividers.length === 0) return null;

  return (
    <div ref={layerRef} className="absolute inset-0 z-10" style={{ pointerEvents: "none" }}>
      {dividers.map((d) => {
        const active = activePaneRect ? bordersActivePane(d, activePaneRect) : false;
        return (
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
          {/* Centered line in the hit-strip. Gold when it borders the active pane
              (it IS that pane's border on this side) or on hover/drag; else dim. */}
          <div
            className={
              active
                ? "absolute bg-[#e6b450] transition-colors"
                : "absolute bg-[#3d4751] group-hover:bg-[#e6b450] transition-colors"
            }
            style={
              d.direction === "h"
                ? { left: "50%", top: 0, width: 1, height: "100%", transform: "translateX(-50%)", pointerEvents: "none" }
                : { top: "50%", left: 0, height: 1, width: "100%", transform: "translateY(-50%)", pointerEvents: "none" }
            }
          />
        </div>
        );
      })}
    </div>
  );
}
