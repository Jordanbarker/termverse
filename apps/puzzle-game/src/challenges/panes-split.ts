import { makeLeaf, makeWindow, splitNode, type WindowState } from "@tt/core/terminal/paneTypes";
import { PUZZLE_MACHINE, HOME_DIR } from "../lib/machine";
import { paneTreeMatches } from "../lib/paneCompare";
import type { Challenge } from "./types";

/**
 * Build the target layout with the same pure helpers the player drives, so the
 * `a`/`b` ordering (original stays as `a`, new pane becomes `b`) lines up with
 * what `splitPane` produces. Ids differ from the player's, but the structural
 * compare ignores them.
 *
 * Shape: split the single root pane side-by-side (h), then stack the new RIGHT
 * pane (v) -> root is `(h L (v L L))`.
 */
function buildTargetWindow(): WindowState {
  const win = makeWindow(PUZZLE_MACHINE, HOME_DIR);
  const first = splitNode(win.root, win.activePaneId, "h", () => makeLeaf(PUZZLE_MACHINE, HOME_DIR));
  if (!first) throw new Error("panes-split: horizontal split failed");
  const second = splitNode(first.root, first.newPaneId, "v", () => makeLeaf(PUZZLE_MACHINE, HOME_DIR));
  if (!second) throw new Error("panes-split: vertical split failed");
  return { ...win, root: second.root, activePaneId: second.newPaneId };
}

const targetWindow = buildTargetWindow();

export const panesSplit: Challenge = {
  id: "panes-split",
  title: "Split the window",
  type: "pane",
  targetWindow,
  setup: (base) => base,
  steps: [
    {
      instruction:
        "Match the TARGET layout: split the pane side-by-side with prefix |, " +
        "then stack the new right-hand pane with prefix - (prefix = Ctrl+Space).",
      isComplete: (s) => paneTreeMatches(s.activeWindow.root, targetWindow.root),
    },
  ],
};
