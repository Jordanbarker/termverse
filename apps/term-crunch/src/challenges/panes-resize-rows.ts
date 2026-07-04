import { makeLeaf, makeWindow, setSplitRatio, splitNode, type WindowState } from "@tt/core/terminal/paneTypes";
import { CRUNCH_MACHINE, HOME_DIR } from "../lib/machine";
import { paneTreeMatchesWithRatio } from "../lib/paneCompare";
import type { Challenge } from "./types";

/**
 * Vertical-resize skill: the player starts from a 50/50 stacked split and nudges
 * the divider down until the top pane is ~70% tall — the row-wise counterpart of
 * `panes-resize`.
 *
 * Same trap as `panes-resize`: start and target are structurally identical
 * `(v L L)` trees, so `paneTreeMatches` would auto-complete on load — the
 * ratio-aware compare with a tolerance band is required. `ratio` is child `a`'s
 * (the TOP pane's) fraction, so "top = 70%" is `ratio ≈ 0.70`; `<prefix> J`
 * (resize down) grows child `a`, so J is the solution key. The per-nudge delta
 * is geometry-dependent but capped at MAX_NUDGE_RATIO (0.05) ≤ the ±0.05
 * tolerance, so a reachable stopping point always exists, and overshooting is
 * reversible via K.
 *
 * Both windows are BUILDERS so each load mints fresh ids from the monotonic
 * counters; the target is captured once since it never changes.
 */
const TARGET_RATIO = 0.7;
const RATIO_TOLERANCE = 0.05;

function buildInitialWindow(): WindowState {
  const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
  // splitNode keeps the original pane as child `a` (top) and adds the new pane
  // as child `b` (bottom), at the default ratio 0.5.
  const rows = splitNode(win.root, win.activePaneId, "v", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR));
  if (!rows) throw new Error("panes-resize-rows: row split failed");
  // Start focused on the top (original) pane — the one the player grows.
  return { ...win, root: rows.root, activePaneId: win.activePaneId };
}

function buildTargetWindow(): WindowState {
  const win = buildInitialWindow();
  if (win.root.kind !== "split") throw new Error("panes-resize-rows: target root is not a split");
  return { ...win, root: setSplitRatio(win.root, win.root.id, TARGET_RATIO) };
}

const targetWindow = buildTargetWindow();

export const panesResizeRows: Challenge = {
  id: "panes-resize-rows",
  title: "Resize a pane: rows",
  type: "tmux",
  targetWindow,
  initialWindow: buildInitialWindow,
  // Pure keyboard-chord challenge — resize keys come from ~/.tmux.conf.
  commands: [],
  setup: (base) => base,
  steps: [
    {
      instruction: "Grow the top pane to about 70% of the window.",
      hint:
        "tmux moves a divider in whole cells, so nudge it a few times. The default " +
        "~/.tmux.conf binds repeatable resize keys under your prefix (Ctrl+Space): " +
        "the capital vim keys H/J/K/L. Grow the top pane by pushing the divider down.",
      command: "prefix J (repeat until the top pane is ~70%)",
      // paneTreeMatches ignores ratios, so compare with a tolerance band instead.
      isComplete: (s) => paneTreeMatchesWithRatio(s.activeWindow.root, targetWindow.root, RATIO_TOLERANCE),
    },
  ],
};
