import { makeLeaf, makeWindow, splitNode, type WindowState } from "@tt/core/terminal/paneTypes";
import { CRUNCH_MACHINE, HOME_DIR } from "../lib/machine";
import { paneTreeMatches } from "../lib/paneCompare";
import type { Challenge } from "./types";

/**
 * Build a 2x2 grid target: split the root side-by-side (h), then split EACH
 * column vertically (v) -> root is `(h (v L L) (v L L))`.
 *
 * `splitNode(root, paneId, ...)` targets an existing pane id, so we can split
 * the original left leaf (`win.activePaneId`) directly — the target is pure
 * data, no focus to thread. That's the difficulty step over panes-split: for
 * the PLAYER, `|`/`-` split the *focused* pane, so reaching the left column's
 * second row means moving focus back (prefix o / hjkl) before the second `-`.
 * Focus isn't part of the structural compare, so the target ignores it.
 */
function buildTargetWindow(): WindowState {
  const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
  const cols = splitNode(win.root, win.activePaneId, "h", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR));
  if (!cols) throw new Error("panes-grid: column split failed");
  const left = splitNode(cols.root, win.activePaneId, "v", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR));
  if (!left) throw new Error("panes-grid: left-column split failed");
  const right = splitNode(left.root, cols.newPaneId, "v", () => makeLeaf(CRUNCH_MACHINE, HOME_DIR));
  if (!right) throw new Error("panes-grid: right-column split failed");
  return { ...win, root: right.root, activePaneId: right.newPaneId };
}

const targetWindow = buildTargetWindow();

export const panesGrid: Challenge = {
  id: "panes-grid",
  title: "Build a 2×2 grid",
  type: "pane",
  targetWindow,
  // Pure keyboard-chord challenge — no shell commands needed.
  commands: [],
  setup: (base) => base,
  steps: [
    {
      instruction:
        "Match the TARGET 2×2 grid. Remember: | and - split the FOCUSED pane " +
        "(prefix = Ctrl+Space), so you'll need to move focus between panes.",
      hint:
        "Split into two columns first, then split each column into two rows. After " +
        "splitting the right column, move focus back to the left column before splitting it.",
      command: "prefix | , prefix - , prefix o (focus left column) , prefix -",
      isComplete: (s) => paneTreeMatches(s.activeWindow.root, targetWindow.root),
    },
  ],
};
