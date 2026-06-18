import { describe, it, expect, beforeEach } from "vitest";
import {
  makeWindow,
  makeLeaf,
  allLeaves,
  firstLeaf,
  findLeaf,
  findSplit,
  splitNode,
  collapsePane,
  prunePanesByComputer,
  setSplitRatio,
  paneRects,
  focusDirectionTarget,
  nextLeafId,
  resetPaneIdCounters,
  PaneNode,
} from "../paneTypes";

beforeEach(() => resetPaneIdCounters());

describe("makeWindow", () => {
  it("creates a single-leaf window focused on that leaf", () => {
    const w = makeWindow("home", "/home/player");
    expect(w.root.kind).toBe("leaf");
    expect(allLeaves(w.root)).toHaveLength(1);
    expect(w.activePaneId).toBe(firstLeaf(w.root).id);
  });
});

describe("splitNode", () => {
  it("replaces a leaf with a split (original=a, new=b)", () => {
    const w = makeWindow("home", "/a");
    const leafId = firstLeaf(w.root).id;
    const res = splitNode(w.root, leafId, "h", () => makeLeaf("home", "/a"))!;
    expect(res.root.kind).toBe("split");
    const split = res.root as Extract<PaneNode, { kind: "split" }>;
    expect(split.direction).toBe("h");
    expect(split.ratio).toBe(0.5);
    expect((split.a as { id: string }).id).toBe(leafId);
    expect((split.b as { id: string }).id).toBe(res.newPaneId);
    expect(allLeaves(res.root)).toHaveLength(2);
  });

  it("can nest splits arbitrarily", () => {
    const w = makeWindow("home", "/a");
    const first = firstLeaf(w.root).id;
    const r1 = splitNode(w.root, first, "h", () => makeLeaf("home", "/a"))!;
    const r2 = splitNode(r1.root, r1.newPaneId, "v", () => makeLeaf("home", "/a"))!;
    expect(allLeaves(r2.root)).toHaveLength(3);
  });

  it("returns null for an unknown pane", () => {
    const w = makeWindow("home", "/a");
    expect(splitNode(w.root, "nope", "h", () => makeLeaf("home", "/a"))).toBeNull();
  });
});

describe("collapsePane", () => {
  it("promotes the sibling when one of two panes closes", () => {
    const w = makeWindow("home", "/a");
    const first = firstLeaf(w.root).id;
    const split = splitNode(w.root, first, "h", () => makeLeaf("nexacorp", "/b"))!;
    const collapsed = collapsePane(split.root, first);
    expect(collapsed).not.toBeNull();
    expect(collapsed!.kind).toBe("leaf");
    expect((collapsed as { id: string }).id).toBe(split.newPaneId);
  });

  it("returns null when the only pane is closed", () => {
    const w = makeWindow("home", "/a");
    expect(collapsePane(w.root, firstLeaf(w.root).id)).toBeNull();
  });

  it("keeps the rest of the tree when a nested pane closes", () => {
    const w = makeWindow("home", "/a");
    const first = firstLeaf(w.root).id;
    const r1 = splitNode(w.root, first, "h", () => makeLeaf("home", "/b"))!;
    const r2 = splitNode(r1.root, r1.newPaneId, "v", () => makeLeaf("home", "/c"))!;
    const collapsed = collapsePane(r2.root, r2.newPaneId)!;
    expect(allLeaves(collapsed)).toHaveLength(2);
  });
});

describe("prunePanesByComputer", () => {
  it("removes panes on downed computers, collapsing splits", () => {
    const w = makeWindow("home", "/a");
    const first = firstLeaf(w.root).id;
    const split = splitNode(w.root, first, "h", () => makeLeaf("nexacorp", "/b"))!;
    const pruned = prunePanesByComputer(split.root, new Set(["nexacorp"]));
    expect(pruned).not.toBeNull();
    expect(allLeaves(pruned!).every((l) => l.computerId === "home")).toBe(true);
  });

  it("never removes the protected pane even if its computer is down", () => {
    const w = makeWindow("nexacorp", "/a");
    const protectedId = firstLeaf(w.root).id;
    const split = splitNode(w.root, protectedId, "h", () => makeLeaf("nexacorp", "/b"))!;
    const pruned = prunePanesByComputer(split.root, new Set(["nexacorp"]), protectedId);
    expect(pruned).not.toBeNull();
    expect(allLeaves(pruned!)).toHaveLength(1);
    expect(allLeaves(pruned!)[0].id).toBe(protectedId);
  });

  it("returns null when all panes are downed and none protected", () => {
    const w = makeWindow("nexacorp", "/a");
    const split = splitNode(w.root, firstLeaf(w.root).id, "h", () => makeLeaf("devcontainer", "/b"))!;
    const pruned = prunePanesByComputer(split.root, new Set(["nexacorp", "devcontainer"]));
    expect(pruned).toBeNull();
  });
});

describe("setSplitRatio", () => {
  it("clamps the ratio to [MIN, 1-MIN]", () => {
    const w = makeWindow("home", "/a");
    const split = splitNode(w.root, firstLeaf(w.root).id, "h", () => makeLeaf("home", "/b"))!;
    const splitId = (split.root as Extract<PaneNode, { kind: "split" }>).id;
    const tiny = setSplitRatio(split.root, splitId, 0.0001) as Extract<PaneNode, { kind: "split" }>;
    expect(tiny.ratio).toBeGreaterThan(0);
    expect(tiny.ratio).toBeLessThan(0.5);
    const huge = setSplitRatio(split.root, splitId, 5) as Extract<PaneNode, { kind: "split" }>;
    expect(huge.ratio).toBeLessThan(1);
  });
});

describe("paneRects", () => {
  it("splits a unit box horizontally by ratio", () => {
    const w = makeWindow("home", "/a");
    const split = splitNode(w.root, firstLeaf(w.root).id, "h", () => makeLeaf("home", "/b"))!;
    const rects = paneRects(split.root);
    expect(rects).toHaveLength(2);
    expect(rects[0].w).toBeCloseTo(0.5);
    expect(rects[1].x).toBeCloseTo(0.5);
  });
});

describe("focusDirectionTarget", () => {
  it("moves right to the adjacent pane", () => {
    const w = makeWindow("home", "/a");
    const left = firstLeaf(w.root).id;
    const split = splitNode(w.root, left, "h", () => makeLeaf("home", "/b"))!;
    expect(focusDirectionTarget(split.root, left, "R")).toBe(split.newPaneId);
    expect(focusDirectionTarget(split.root, split.newPaneId, "L")).toBe(left);
  });

  it("returns undefined when there's no pane in that direction", () => {
    const w = makeWindow("home", "/a");
    const left = firstLeaf(w.root).id;
    const split = splitNode(w.root, left, "h", () => makeLeaf("home", "/b"))!;
    expect(focusDirectionTarget(split.root, left, "U")).toBeUndefined();
  });
});

describe("nextLeafId", () => {
  it("cycles through leaves in order, wrapping", () => {
    const w = makeWindow("home", "/a");
    const first = firstLeaf(w.root).id;
    const split = splitNode(w.root, first, "h", () => makeLeaf("home", "/b"))!;
    expect(nextLeafId(split.root, first)).toBe(split.newPaneId);
    expect(nextLeafId(split.root, split.newPaneId)).toBe(first);
  });
});

describe("findLeaf / findSplit", () => {
  it("locate nodes by id", () => {
    const w = makeWindow("home", "/a");
    const first = firstLeaf(w.root).id;
    const split = splitNode(w.root, first, "v", () => makeLeaf("home", "/b"))!;
    expect(findLeaf(split.root, first)?.id).toBe(first);
    expect(findLeaf(split.root, "nope")).toBeUndefined();
    const splitId = (split.root as Extract<PaneNode, { kind: "split" }>).id;
    expect(findSplit(split.root, splitId)?.id).toBe(splitId);
  });
});
