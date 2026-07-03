import { makeLeaf, makeWindow, splitNode, type WindowState } from "@tt/core/terminal/paneTypes";
import { CRUNCH_MACHINE, HOME_DIR } from "../lib/machine";
import { paneTreeMatches } from "../lib/paneCompare";
import type { Challenge } from "./types";

/**
 * The inverse of panes-grid: the player STARTS from a messy 2×2 grid and prunes
 * it down to two side-by-side columns with `prefix x` (kill pane).
 *
 * Start:  (h (v L L) (v L L))   Target: (h L L)
 *
 * Killing a pane runs `collapsePane`, which promotes the surviving sibling and
 * collapses the parent split. So killing the bottom leaf of a `(v L L)` column
 * collapses that column back to a single `L`. Two kills (one per column) take
 * the grid to `(h L L)`. Ratios/ids are ignored by paneTreeMatches, so where the
 * player leaves the dividers or which bottom pane they kill doesn't matter.
 *
 * `initialWindow` is a BUILDER (not stored data) — each load mints fresh ids
 * from the monotonic pane counters, so ids never collide across loads or with
 * mid-challenge splits (pane chords are always available).
 */
function buildInitialWindow(): WindowState {
  const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
  const cols = splitNode(win.root, win.activePaneId, "h", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR));
  if (!cols) throw new Error("panes-cleanup: column split failed");
  const left = splitNode(cols.root, win.activePaneId, "v", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR));
  if (!left) throw new Error("panes-cleanup: left-column split failed");
  const right = splitNode(left.root, cols.newPaneId, "v", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR));
  if (!right) throw new Error("panes-cleanup: right-column split failed");
  return { ...win, root: right.root, activePaneId: right.newPaneId };
}

function buildTargetWindow(): WindowState {
  const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
  const cols = splitNode(win.root, win.activePaneId, "h", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR));
  if (!cols) throw new Error("panes-cleanup: target column split failed");
  return { ...win, root: cols.root, activePaneId: cols.newPaneId };
}

const targetWindow = buildTargetWindow();

export const panesCleanup: Challenge = {
  id: "panes-cleanup",
  title: "Prune the panes",
  type: "tmux",
  targetWindow,
  initialWindow: buildInitialWindow,
  // Pure keyboard-chord challenge — no shell commands needed.
  commands: [],
  setup: (base) => base,
  steps: [
    {
      instruction:
        "You inherited a cluttered 2×2 grid. Prune it down to the TARGET: two " +
        "side-by-side panes (prefix = Ctrl+Space).",
      hint:
        "Kill the focused pane with prefix x. Killing one pane of a stacked pair " +
        "collapses that column back into a single pane, so drop a bottom pane in each column.",
      command: "prefix x (focus other bottom pane) prefix x",
      isComplete: (s) => paneTreeMatches(s.activeWindow.root, targetWindow.root),
    },
  ],
};
