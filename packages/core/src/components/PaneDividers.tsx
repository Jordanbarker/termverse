"use client";

import { useRef } from "react";
import { Box, PaneNode, splitChildBoxes } from "../terminal/paneTypes";

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
  const { a, b } = splitChildBoxes(node, { x, y, w, h });
  const divider: DividerRect =
    node.direction === "h"
      ? { splitId: node.id, direction: "h", x: b.x - DIVIDER_THICKNESS / 2, y, w: DIVIDER_THICKNESS, h, boxX: x, boxY: y, boxW: w, boxH: h }
      : { splitId: node.id, direction: "v", x, y: b.y - DIVIDER_THICKNESS / 2, w, h: DIVIDER_THICKNESS, boxX: x, boxY: y, boxW: w, boxH: h };
  return [
    divider,
    ...computeDividers(node.a, a.x, a.y, a.w, a.h),
    ...computeDividers(node.b, b.x, b.y, b.w, b.h),
  ];
}

/**
 * Which side of a divider the active pane sits on, if the divider abuts an edge
 * of the active pane (and their cross-axis ranges overlap) — else `null`.
 * The seam is then split half/half: gold flush to the active pane's edge, grey
 * flush to the inactive neighbour's edge, so the colour shows which pane owns
 * each side of the shared border.
 *   "h" divider (vertical line): "L" = active pane left, "R" = active pane right.
 *   "v" divider (horizontal line): "T" = active pane above, "B" = active pane below.
 */
type ActiveSide = "L" | "R" | "T" | "B" | null;
function activeSide(d: DividerRect, active: Box): ActiveSide {
  if (d.direction === "h") {
    const lineX = d.x + DIVIDER_THICKNESS / 2;
    const overlaps = active.y < d.boxY + d.boxH && active.y + active.h > d.boxY;
    if (!overlaps) return null;
    if (Math.abs(lineX - active.x) <= 1) return "R"; // active pane's left edge is the seam
    if (Math.abs(lineX - (active.x + active.w)) <= 1) return "L"; // active pane's right edge is the seam
    return null;
  }
  const lineY = d.y + DIVIDER_THICKNESS / 2;
  const overlaps = active.x < d.boxX + d.boxW && active.x + active.w > d.boxX;
  if (!overlaps) return null;
  if (Math.abs(lineY - active.y) <= 1) return "B"; // active pane's top edge is the seam
  if (Math.abs(lineY - (active.y + active.h)) <= 1) return "T"; // active pane's bottom edge is the seam
  return null;
}

interface PaneDividersProps {
  root: PaneNode;
  width: number;
  height: number;
  onResize: (splitId: string, ratio: number) => void;
  /** The active pane's wrapper-relative rect; seams bordering it render gold. */
  activePaneRect?: Box;
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
        const side = activePaneRect ? activeSide(d, activePaneRect) : null;
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
          {/* The seam line, centered in the hit-strip. When it borders the active
              pane it splits half/half — gold flush to the active pane's edge, grey
              flush to the inactive neighbour's — so each side shows which pane owns
              it. Otherwise it's a single dim line that goes gold on hover/drag. */}
          {side ? (
            <>
              <div
                className="absolute bg-[#e6b450]"
                style={
                  d.direction === "h"
                    ? { left: "50%", top: 0, width: 1, height: "100%", transform: side === "L" ? "translateX(-1px)" : "translateX(0)", pointerEvents: "none" }
                    : { top: "50%", left: 0, height: 1, width: "100%", transform: side === "T" ? "translateY(-1px)" : "translateY(0)", pointerEvents: "none" }
                }
              />
              <div
                className="absolute bg-[#3d4751]"
                style={
                  d.direction === "h"
                    ? { left: "50%", top: 0, width: 1, height: "100%", transform: side === "L" ? "translateX(0)" : "translateX(-1px)", pointerEvents: "none" }
                    : { top: "50%", left: 0, height: 1, width: "100%", transform: side === "T" ? "translateY(0)" : "translateY(-1px)", pointerEvents: "none" }
                }
              />
            </>
          ) : (
            <div
              className="absolute bg-[#3d4751] group-hover:bg-[#e6b450] transition-colors"
              style={
                d.direction === "h"
                  ? { left: "50%", top: 0, width: 1, height: "100%", transform: "translateX(-50%)", pointerEvents: "none" }
                  : { top: "50%", left: 0, height: 1, width: "100%", transform: "translateY(-50%)", pointerEvents: "none" }
              }
            />
          )}
        </div>
        );
      })}
    </div>
  );
}
