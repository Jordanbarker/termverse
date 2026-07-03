import type { PaneNode } from "@tt/core/terminal/paneTypes";

/**
 * Exact structural key (nesting + split directions), ignoring ids/cwd/ratios.
 * Kept for tests that assert the precise tree a command sequence builds;
 * completion checks use the split-order-insensitive geometryKey below.
 */
export function structKey(n: PaneNode): string {
  return n.kind === "leaf" ? "L" : `(${n.direction} ${structKey(n.a)} ${structKey(n.b)})`;
}

/**
 * Canonical geometry key for a pane tree: each leaf's rectangle computed with
 * every split forced to 50/50, rounded and sorted. Ids, computerId, cwd, and
 * actual ratios are ignored (so a nudged divider still matches), and so is
 * split ORDER — a 2×2 grid built columns-first `(h (v L L) (v L L))` and one
 * built rows-first `(v (h L L) (h L L))` render identically, so they get the
 * same key. Intentionally NOT core's paneRects, which honors real ratios.
 */
function geometryKey(n: PaneNode): string {
  const rects: string[] = [];
  const walk = (node: PaneNode, x: number, y: number, w: number, h: number) => {
    if (node.kind === "leaf") {
      rects.push([x, y, w, h].map((v) => v.toFixed(4)).join(","));
      return;
    }
    if (node.direction === "h") {
      walk(node.a, x, y, w / 2, h);
      walk(node.b, x + w / 2, y, w / 2, h);
    } else {
      walk(node.a, x, y, w, h / 2);
      walk(node.b, x, y + h / 2, w, h / 2);
    }
  };
  walk(n, 0, 0, 1, 1);
  return rects.sort().join(";");
}

/** True when two pane trees render the same layout at equal splits (ratios/ids/cwd/split-order ignored). */
export function paneTreeMatches(a: PaneNode, b: PaneNode): boolean {
  return geometryKey(a) === geometryKey(b);
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
