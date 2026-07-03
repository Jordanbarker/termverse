import { makeLeaf, makeWindow, setSplitRatio, splitNode, type PaneNode, type WindowState } from "@tt/core/terminal/paneTypes";
import { CRUNCH_MACHINE, HOME_DIR } from "../lib/machine";
import { paneTreeMatchesWithRatio } from "../lib/paneCompare";
import type { Challenge } from "./types";

/**
 * Two-axis resize skill: a sidebar column on the left (file tree over a build
 * log) next to an editor on the right, everything 50/50. The player first grows
 * the bottom-left build log with `<prefix> K` (resize up shrinks child `a`, the
 * top pane → column ratio 0.5 → ~0.3), then shrinks the whole sidebar with
 * `<prefix> H` (resize left shrinks child `a`, the left column → root ratio
 * 0.5 → ~0.3).
 *
 * Focus starts on the BOTTOM-LEFT pane so `nearestResizableSplit` resolves both
 * dividers from one spot: the column's `v` split for K/J and the root `h` split
 * for H/L. (Focusing the right pane would make K a no-op — no `v` ancestor —
 * but never soft-locks; H still resolves the root split from anywhere.)
 *
 * Step 1 can't use the full-tree ratio compare — the root ratio is still 0.5
 * then — so it walks to the column split and checks only its ratio. Step 2
 * compares the whole tree against the target. Per-nudge delta is ~0.05–0.07,
 * so ±0.05 contains a reachable stopping point and overshoot is reversible.
 *
 * Both windows are BUILDERS so loadChallenge's resetPaneIdCounters() yields
 * fresh ids; the target is captured once since it never changes.
 */
const COLUMN_RATIO = 0.3; // file tree 30% / build log 70% of the left column
const ROOT_RATIO = 0.3; // left column 30% / editor 70% of the window
const RATIO_TOLERANCE = 0.05;

function buildInitialWindow(): WindowState {
  const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
  // Root h-split: original pane becomes the left column (child `a`), editor right.
  const cols = splitNode(win.root, win.activePaneId, "h", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR));
  if (!cols) throw new Error("panes-resize-corner: column split failed");
  // Left column v-split: original pane on top (file tree), build log below.
  const rows = splitNode(cols.root, win.activePaneId, "v", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR));
  if (!rows) throw new Error("panes-resize-corner: row split failed");
  // Start focused on the bottom-left build log (see focus note above).
  return { ...win, root: rows.root, activePaneId: rows.newPaneId };
}

/** The left column's v-split (child `a` of the root h-split), or undefined off-structure. */
function columnSplit(root: PaneNode): Extract<PaneNode, { kind: "split" }> | undefined {
  if (root.kind !== "split" || root.direction !== "h") return undefined;
  return root.a.kind === "split" && root.a.direction === "v" ? root.a : undefined;
}

function buildTargetWindow(): WindowState {
  const win = buildInitialWindow();
  if (win.root.kind !== "split") throw new Error("panes-resize-corner: target root is not a split");
  const col = columnSplit(win.root);
  if (!col) throw new Error("panes-resize-corner: target column is not a split");
  const withColumn = setSplitRatio(win.root, col.id, COLUMN_RATIO);
  return { ...win, root: setSplitRatio(withColumn, win.root.id, ROOT_RATIO) };
}

const targetWindow = buildTargetWindow();

export const panesResizeCorner: Challenge = {
  id: "panes-resize-corner",
  title: "Resize a pane: two axes",
  type: "tmux",
  targetWindow,
  initialWindow: buildInitialWindow,
  // Pure keyboard-chord challenge — resize keys come from ~/.tmux.conf.
  commands: [],
  brief:
    "Editor on the right, sidebar column on the left: a file tree over a build " +
    "log, everything split 50/50. The build log is cramped and the sidebar is " +
    "hogging half the screen.",
  setup: (base) => base,
  steps: [
    {
      instruction: "Grow the bottom-left (build log) pane to about 70% of the left column.",
      hint:
        "The repeatable resize keys from ~/.tmux.conf are the capital vim keys " +
        "H/J/K/L under your prefix (Ctrl+Space). Resizing up pulls the horizontal " +
        "divider toward the top, growing the bottom pane.",
      command: "prefix K (repeat until the build log is ~70% of the column)",
      isComplete: (s) => {
        const col = columnSplit(s.activeWindow.root);
        return col !== undefined && Math.abs(col.ratio - COLUMN_RATIO) <= RATIO_TOLERANCE;
      },
    },
    {
      instruction: "Now shrink the whole left column to about 30% of the window width.",
      hint:
        "Resizing left pushes the vertical divider toward the left edge, shrinking " +
        "the sidebar. It works from either left pane — the nearest side-by-side " +
        "divider is the one that moves.",
      command: "prefix H (repeat until the left column is ~30% wide)",
      isComplete: (s) => paneTreeMatchesWithRatio(s.activeWindow.root, targetWindow.root, RATIO_TOLERANCE),
    },
  ],
};
