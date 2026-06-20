import type { PaneNode } from "@tt/core/terminal/paneTypes";

/**
 * Canonical structural key for a pane tree, ignoring volatile bits (ids,
 * computerId, cwd) AND split ratios. Two trees with the same key have the same
 * shape: same nesting, same split directions, same leaf arrangement.
 *
 * Ratio is intentionally ignored for v1 so "split side-by-side, then stack the
 * right one" matches regardless of where the player left the dividers. A
 * ratio-aware variant (bucketed via Math.round(ratio * 4) / 4) can be added when
 * a challenge needs divider precision.
 */
export function structKey(n: PaneNode): string {
  return n.kind === "leaf" ? "L" : `(${n.direction} ${structKey(n.a)} ${structKey(n.b)})`;
}

/** True when two pane trees have the same structure (ratios/ids/cwd ignored). */
export function paneTreeMatches(a: PaneNode, b: PaneNode): boolean {
  return structKey(a) === structKey(b);
}
