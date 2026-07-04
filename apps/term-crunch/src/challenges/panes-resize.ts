import { makeLeaf, makeWindow, setSplitRatio, splitNode, type WindowState } from "@tt/core/terminal/paneTypes";
import { CRUNCH_MACHINE, HOME_DIR } from "../lib/machine";
import { paneTreeMatchesWithRatio } from "../lib/paneCompare";
import type { Challenge } from "./types";

/**
 * Resize skill: the player starts from a 50/50 side-by-side split and nudges the
 * divider until the left pane is ~70% wide.
 *
 * Structure alone can't detect this — `paneTreeMatches` ignores ratios, so the
 * starting `(h L L)` and the target `(h L L)` are structurally identical and the
 * challenge would auto-complete on load. Hence the ratio-aware compare with a
 * tolerance band: `ratio` is child `a`'s (the LEFT pane's) fraction, so "left =
 * 70%" is `ratio ≈ 0.70`. The per-nudge delta is capped at MAX_NUDGE_RATIO
 * (0.05) ≤ the ±0.05 tolerance, so a reachable stopping point always exists
 * (and overshooting is reversible — no lock).
 *
 * Both windows are BUILDERS so each load mints fresh ids from the monotonic
 * counters; the target is captured once since it never changes.
 */
const TARGET_RATIO = 0.7;
const RATIO_TOLERANCE = 0.05;

function buildInitialWindow(): WindowState {
  const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
  // splitNode keeps the original pane as child `a` (left) and adds the new pane
  // as child `b` (right), at the default ratio 0.5.
  const cols = splitNode(win.root, win.activePaneId, "h", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR));
  if (!cols) throw new Error("panes-resize: column split failed");
  // Start focused on the left (original) pane — the one the player widens.
  return { ...win, root: cols.root, activePaneId: win.activePaneId };
}

function buildTargetWindow(): WindowState {
  const win = buildInitialWindow();
  if (win.root.kind !== "split") throw new Error("panes-resize: target root is not a split");
  return { ...win, root: setSplitRatio(win.root, win.root.id, TARGET_RATIO) };
}

const targetWindow = buildTargetWindow();

export const panesResize: Challenge = {
  id: "panes-resize",
  title: "Resize a pane",
  type: "tmux",
  targetWindow,
  initialWindow: buildInitialWindow,
  // Pure keyboard-chord challenge — resize keys come from ~/.tmux.conf.
  commands: [],
  setup: (base) => base,
  steps: [
    {
      instruction: "Widen the left pane to about 70% of the window.",
      hint:
        "tmux moves a divider in whole cells, so nudge it a few times. The default " +
        "~/.tmux.conf binds repeatable resize keys under your prefix (Ctrl+Space): " +
        "the capital vim keys H/J/K/L. Grow the left pane by pushing the divider right.",
      command: "prefix L (repeat until the left pane is ~70%)",
      // paneTreeMatches ignores ratios, so compare with a tolerance band instead.
      isComplete: (s) => paneTreeMatchesWithRatio(s.activeWindow.root, targetWindow.root, RATIO_TOLERANCE),
    },
  ],
};
