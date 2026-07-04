import { describe, expect, it } from "vitest";
import {
  MAX_NUDGE_RATIO,
  makeLeaf,
  makeWindow,
  nudgeSplitRatio,
  splitNode,
  type PaneNode,
} from "../paneTypes";

function stackedWindow() {
  const win = makeWindow("test", "/home/test");
  const rows = splitNode(win.root, win.activePaneId, "v", () => makeLeaf("test", "/home/test"));
  if (!rows || rows.root.kind !== "split") throw new Error("split failed");
  return { root: rows.root as PaneNode & { kind: "split" }, splitId: rows.root.id };
}

describe("nudgeSplitRatio", () => {
  it("caps a single nudge at MAX_NUDGE_RATIO in either direction", () => {
    const { root, splitId } = stackedWindow();
    const grown = nudgeSplitRatio(root, splitId, 0.2);
    const shrunk = nudgeSplitRatio(root, splitId, -0.2);
    if (grown.kind !== "split" || shrunk.kind !== "split") throw new Error("expected splits");
    expect(grown.ratio).toBeCloseTo(0.5 + MAX_NUDGE_RATIO);
    expect(shrunk.ratio).toBeCloseTo(0.5 - MAX_NUDGE_RATIO);
  });

  it("reaches any ±MAX_NUDGE_RATIO band by repeated nudges even when the raw delta is huge", () => {
    // A short pane can ask for a ~0.16 step; the cap must guarantee some
    // stopping point lands within ±MAX_NUDGE_RATIO of a 0.7 target.
    const { root, splitId } = stackedWindow();
    let node: PaneNode = root;
    let landed = false;
    for (let i = 0; i < 20 && !landed; i++) {
      node = nudgeSplitRatio(node, splitId, 0.16);
      if (node.kind !== "split") throw new Error("expected a split");
      landed = Math.abs(node.ratio - 0.7) <= MAX_NUDGE_RATIO + 1e-9;
    }
    expect(landed).toBe(true);
  });
});
