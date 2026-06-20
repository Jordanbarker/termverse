import { describe, it, expect } from "vitest";
import type { ResolvedObjective } from "../../../engine/narrative/objectives";
import { splitGroupChildren, buildObjectiveTree } from "../ObjectiveTracker";

function makeObj(
  overrides: Partial<ResolvedObjective> & { id: string }
): ResolvedObjective {
  return {
    description: overrides.id,
    completed: false,
    failed: false,
    visible: true,
    optional: false,
    ...overrides,
  };
}

describe("splitGroupChildren", () => {
  const requiredChild = makeObj({ id: "r1" });
  const optionalChild = makeObj({ id: "o1", optional: true });

  it("splits children when parent is required", () => {
    const { required, optional } = splitGroupChildren(
      [requiredChild, optionalChild],
      false
    );
    expect(required).toEqual([requiredChild]);
    expect(optional).toEqual([optionalChild]);
  });

  it("puts all children in required when parent is optional (no nested divider)", () => {
    const { required, optional } = splitGroupChildren(
      [requiredChild, optionalChild],
      true
    );
    expect(required).toEqual([requiredChild, optionalChild]);
    expect(optional).toEqual([]);
  });

  it("returns all in required when all children are required", () => {
    const r2 = makeObj({ id: "r2" });
    const { required, optional } = splitGroupChildren(
      [requiredChild, r2],
      false
    );
    expect(required).toEqual([requiredChild, r2]);
    expect(optional).toEqual([]);
  });
});

describe("buildObjectiveTree", () => {
  it("groups children under their parent", () => {
    const parent = makeObj({ id: "parent" });
    const child1 = makeObj({ id: "c1", group: "parent" });
    const child2 = makeObj({ id: "c2", group: "parent" });

    const { required, childrenByParent } = buildObjectiveTree([
      parent,
      child1,
      child2,
    ]);

    expect(required).toHaveLength(1);
    expect(required[0].type).toBe("group");
    if (required[0].type === "group") {
      expect(required[0].group.parent.id).toBe("parent");
      expect(required[0].group.children).toEqual([child1, child2]);
    }
    expect(childrenByParent.get("parent")).toEqual([child1, child2]);
  });

  it("splits top-level items into required and optional", () => {
    const req = makeObj({ id: "req" });
    const opt = makeObj({ id: "opt", optional: true });

    const { required, optional } = buildObjectiveTree([req, opt]);

    expect(required).toHaveLength(1);
    expect(optional).toHaveLength(1);
    expect(required[0].type === "single" && required[0].obj.id).toBe("req");
    expect(optional[0].type === "single" && optional[0].obj.id).toBe("opt");
  });

  it("does not include grouped children at top level", () => {
    const parent = makeObj({ id: "parent" });
    const child = makeObj({ id: "child", group: "parent" });
    const standalone = makeObj({ id: "standalone" });

    const { required } = buildObjectiveTree([parent, child, standalone]);

    const ids = required.map((item) =>
      item.type === "single" ? item.obj.id : item.group.parent.id
    );
    expect(ids).toEqual(["parent", "standalone"]);
    expect(ids).not.toContain("child");
  });
});
