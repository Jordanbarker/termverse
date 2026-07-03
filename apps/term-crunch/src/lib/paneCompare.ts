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

/**
 * Like paneTreeMatches, but ALSO requires each split's ratio to be within `tol`
 * of the reference. For resize challenges, where the structure alone can't tell
 * a moved divider from the starting layout. Tolerance lives at the call site so
 * each challenge picks its own precision (e.g. ±0.05 for a "~70% wide" goal).
 */
export function paneTreeMatchesWithRatio(a: PaneNode, b: PaneNode, tol: number): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "leaf" || b.kind === "leaf") return a.kind === "leaf" && b.kind === "leaf";
  if (a.direction !== b.direction) return false;
  if (Math.abs(a.ratio - b.ratio) > tol) return false;
  return paneTreeMatchesWithRatio(a.a, b.a, tol) && paneTreeMatchesWithRatio(a.b, b.b, tol);
}
