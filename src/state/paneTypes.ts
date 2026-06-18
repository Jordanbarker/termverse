/**
 * tmux-style window/pane model (pure, no React, no store).
 *
 * A "window" is what the status bar shows as a tab. Each window owns a binary
 * tree of panes: a `PaneSplit` divides its box between two children, a
 * `PaneLeaf` is an actual shell (one xterm + cwd + computerId + session).
 *
 * Every helper here is a pure function over the tree, so it's unit-testable
 * without a browser. Tree edits return NEW nodes (immutable, matching the
 * VirtualFS convention) — never mutate in place.
 */

import { ComputerId } from "./types";

/** `h` = panes side-by-side (vertical divider, tmux `split-window -h`, prefix `|`).
 *  `v` = panes stacked (horizontal divider, tmux `split-window -v`, prefix `-`). */
export type SplitDirection = "h" | "v";

export interface PaneLeaf {
  kind: "leaf";
  id: string;
  computerId: ComputerId;
  cwd: string;
}

export interface PaneSplit {
  kind: "split";
  id: string;
  direction: SplitDirection;
  /** Fraction of the parent box given to child `a` (the rest goes to `b`). */
  ratio: number;
  a: PaneNode;
  b: PaneNode;
}

export type PaneNode = PaneLeaf | PaneSplit;

export interface WindowState {
  id: string;
  root: PaneNode;
  /** The focused leaf within this window (restored when the window is reactivated). */
  activePaneId: string;
}

/** A leaf's computed rectangle (normalized or pixel space, caller's choice). */
export interface PaneRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Smallest fraction a split child may shrink to (keeps panes usable). */
export const MIN_PANE_RATIO = 0.1;

// --- id generation -------------------------------------------------------
// Module-scope counters mirror the store's old `tabCounter`. resetPaneIdCounters()
// is called from resetGame/loadGame/merge so ids stay deterministic per session.

let paneCounter = 0;
let splitCounter = 0;
let windowCounter = 0;

export function nextPaneId(): string {
  return `pane-${++paneCounter}`;
}
export function nextSplitId(): string {
  return `split-${++splitCounter}`;
}
export function nextWindowId(): string {
  return `win-${++windowCounter}`;
}
export function resetPaneIdCounters(): void {
  paneCounter = 0;
  splitCounter = 0;
  windowCounter = 0;
}

// --- constructors --------------------------------------------------------

export function makeLeaf(computerId: ComputerId, cwd: string): PaneLeaf {
  return { kind: "leaf", id: nextPaneId(), computerId, cwd };
}

export function makeWindow(computerId: ComputerId, cwd: string): WindowState {
  const leaf = makeLeaf(computerId, cwd);
  return { id: nextWindowId(), root: leaf, activePaneId: leaf.id };
}

// --- queries -------------------------------------------------------------

/** Depth-first list of all leaves under a node (left-to-right). */
export function allLeaves(node: PaneNode): PaneLeaf[] {
  if (node.kind === "leaf") return [node];
  return [...allLeaves(node.a), ...allLeaves(node.b)];
}

/** First (top-left-most) leaf under a node. */
export function firstLeaf(node: PaneNode): PaneLeaf {
  let cur = node;
  while (cur.kind === "split") cur = cur.a;
  return cur;
}

/** Find a leaf by id, or undefined. */
export function findLeaf(node: PaneNode, id: string): PaneLeaf | undefined {
  return allLeaves(node).find((l) => l.id === id);
}

/** Find a split by id, or undefined. */
export function findSplit(node: PaneNode, id: string): PaneSplit | undefined {
  if (node.kind === "leaf") return undefined;
  if (node.id === id) return node;
  return findSplit(node.a, id) ?? findSplit(node.b, id);
}

// --- immutable edits -----------------------------------------------------

/** Return a copy of the tree with leaf `id` replaced by `fn(leaf)`. */
export function mapLeaf(node: PaneNode, id: string, fn: (leaf: PaneLeaf) => PaneLeaf): PaneNode {
  if (node.kind === "leaf") return node.id === id ? fn(node) : node;
  const a = mapLeaf(node.a, id, fn);
  const b = mapLeaf(node.b, id, fn);
  if (a === node.a && b === node.b) return node;
  return { ...node, a, b };
}

/**
 * Split leaf `paneId` into two: the original stays as child `a`, the new leaf
 * (built by `newLeaf`) becomes child `b` — matching tmux, where the new pane
 * appears to the right (`-h`) or below (`-v`). Returns the rebuilt root and the
 * new leaf's id, or null if `paneId` wasn't found.
 */
export function splitNode(
  root: PaneNode,
  paneId: string,
  direction: SplitDirection,
  newLeaf: () => PaneLeaf,
): { root: PaneNode; newPaneId: string } | null {
  const existing = findLeaf(root, paneId);
  if (!existing) return null;
  const created = newLeaf();
  const split: PaneSplit = {
    kind: "split",
    id: nextSplitId(),
    direction,
    ratio: 0.5,
    a: existing,
    b: created,
  };
  const replace = (node: PaneNode): PaneNode => {
    if (node.kind === "leaf") return node.id === paneId ? split : node;
    return { ...node, a: replace(node.a), b: replace(node.b) };
  };
  return { root: replace(root), newPaneId: created.id };
}

/**
 * Remove leaf `paneId`, collapsing its parent split so the sibling subtree takes
 * the freed space. Returns the new root, or null when the removed leaf was the
 * window's only pane (caller should drop the window).
 */
export function collapsePane(root: PaneNode, paneId: string): PaneNode | null {
  if (root.kind === "leaf") return root.id === paneId ? null : root;
  const prune = (node: PaneNode): PaneNode | null => {
    if (node.kind === "leaf") return node.id === paneId ? null : node;
    const a = prune(node.a);
    const b = prune(node.b);
    if (a && b) return a === node.a && b === node.b ? node : { ...node, a, b };
    return a ?? b; // one child removed → promote the surviving sibling
  };
  return prune(root);
}

/**
 * Remove every leaf whose computer is in `downed`, except `protectedId` (kept
 * even if its computer is down — transitions retarget it afterward). Collapses
 * emptied splits. Returns null when the whole window should close.
 */
export function prunePanesByComputer(
  root: PaneNode,
  downed: Set<ComputerId>,
  protectedId?: string,
): PaneNode | null {
  const prune = (node: PaneNode): PaneNode | null => {
    if (node.kind === "leaf") {
      if (node.id === protectedId) return node;
      return downed.has(node.computerId) ? null : node;
    }
    const a = prune(node.a);
    const b = prune(node.b);
    if (a && b) return a === node.a && b === node.b ? node : { ...node, a, b };
    return a ?? b;
  };
  return prune(root);
}

/** Return a copy of the tree with split `splitId`'s ratio clamped + set. */
export function setSplitRatio(root: PaneNode, splitId: string, ratio: number): PaneNode {
  const clamped = Math.max(MIN_PANE_RATIO, Math.min(1 - MIN_PANE_RATIO, ratio));
  const update = (node: PaneNode): PaneNode => {
    if (node.kind === "leaf") return node;
    if (node.id === splitId) return { ...node, ratio: clamped, a: update(node.a), b: update(node.b) };
    return { ...node, a: update(node.a), b: update(node.b) };
  };
  return update(root);
}

// --- geometry ------------------------------------------------------------

/** Compute each leaf's rectangle within the given box (any units). */
export function paneRects(node: PaneNode, x = 0, y = 0, w = 1, h = 1): PaneRect[] {
  if (node.kind === "leaf") return [{ id: node.id, x, y, w, h }];
  if (node.direction === "h") {
    const wa = w * node.ratio;
    return [
      ...paneRects(node.a, x, y, wa, h),
      ...paneRects(node.b, x + wa, y, w - wa, h),
    ];
  }
  const ha = h * node.ratio;
  return [
    ...paneRects(node.a, x, y, w, ha),
    ...paneRects(node.b, x, y + ha, w, h - ha),
  ];
}

/**
 * tmux-style directional pane select. Given the focused pane, return the id of
 * the nearest pane in `dir` whose perpendicular span overlaps the current one,
 * or undefined if there's none.
 */
export function focusDirectionTarget(
  root: PaneNode,
  fromId: string,
  dir: "L" | "R" | "U" | "D",
): string | undefined {
  const rects = paneRects(root);
  const cur = rects.find((r) => r.id === fromId);
  if (!cur) return undefined;
  const horizontal = dir === "L" || dir === "R";
  const candidates = rects.filter((r) => {
    if (r.id === fromId) return false;
    if (dir === "L") return r.x + r.w <= cur.x + 1e-6;
    if (dir === "R") return r.x >= cur.x + cur.w - 1e-6;
    if (dir === "U") return r.y + r.h <= cur.y + 1e-6;
    return r.y >= cur.y + cur.h - 1e-6; // D
  });
  if (candidates.length === 0) return undefined;
  // Prefer panes whose perpendicular range overlaps the current pane; among
  // those, pick the closest edge. Fall back to nearest center when none overlap.
  const overlaps = (r: PaneRect) =>
    horizontal
      ? r.y < cur.y + cur.h - 1e-6 && r.y + r.h > cur.y + 1e-6
      : r.x < cur.x + cur.w - 1e-6 && r.x + r.w > cur.x + 1e-6;
  const edgeDist = (r: PaneRect) => {
    if (dir === "L") return cur.x - (r.x + r.w);
    if (dir === "R") return r.x - (cur.x + cur.w);
    if (dir === "U") return cur.y - (r.y + r.h);
    return r.y - (cur.y + cur.h);
  };
  const ranked = candidates
    .map((r) => ({ r, overlap: overlaps(r), dist: Math.abs(edgeDist(r)) }))
    .sort((p, q) => {
      if (p.overlap !== q.overlap) return p.overlap ? -1 : 1;
      return p.dist - q.dist;
    });
  return ranked[0].r.id;
}

/** Next leaf id in DFS order (wrapping) — tmux `prefix o`. */
export function nextLeafId(root: PaneNode, fromId: string): string {
  const leaves = allLeaves(root);
  const idx = leaves.findIndex((l) => l.id === fromId);
  if (idx === -1) return leaves[0].id;
  return leaves[(idx + 1) % leaves.length].id;
}

// --- persistence ---------------------------------------------------------
// Saved shape drops volatile ids; the active pane is stored as its DFS-leaf
// index so it survives the fresh-id regeneration on load. (Defined here, not in
// saveTypes, so saveTypes can import these without a cycle.)

export type SavedPaneNode =
  | { kind: "leaf"; computerId: ComputerId; cwd: string }
  | { kind: "split"; direction: SplitDirection; ratio: number; a: SavedPaneNode; b: SavedPaneNode };

export interface SavedWindowState {
  root: SavedPaneNode;
  activePaneIndex: number;
}

function serializeNode(node: PaneNode): SavedPaneNode {
  if (node.kind === "leaf") return { kind: "leaf", computerId: node.computerId, cwd: node.cwd };
  return { kind: "split", direction: node.direction, ratio: node.ratio, a: serializeNode(node.a), b: serializeNode(node.b) };
}

export function serializeWindow(w: WindowState): SavedWindowState {
  const leaves = allLeaves(w.root);
  const idx = leaves.findIndex((l) => l.id === w.activePaneId);
  return { root: serializeNode(w.root), activePaneIndex: idx >= 0 ? idx : 0 };
}

function rebuildNode(s: SavedPaneNode): PaneNode {
  if (s.kind === "leaf") return makeLeaf(s.computerId, s.cwd);
  return { kind: "split", id: nextSplitId(), direction: s.direction, ratio: s.ratio, a: rebuildNode(s.a), b: rebuildNode(s.b) };
}

/** Rebuild a window from its saved shape, regenerating ids and restoring focus. */
export function rebuildWindow(s: SavedWindowState): WindowState {
  const root = rebuildNode(s.root);
  const leaves = allLeaves(root);
  const idx = Math.min(Math.max(0, s.activePaneIndex), leaves.length - 1);
  return { id: nextWindowId(), root, activePaneId: leaves[idx].id };
}
