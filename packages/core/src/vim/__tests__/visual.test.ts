import { describe, it, expect } from "vitest";
import { EMPTY_VISUAL_PENDING, VisualPending, orderedRange, stepVisual } from "../visual";

function feed(keys: string) {
  let pending: VisualPending = EMPTY_VISUAL_PENDING;
  let command = null;
  for (const ch of keys) {
    const step = stepVisual(pending, ch);
    pending = step.pending;
    command = step.command;
  }
  return { pending, command };
}

describe("stepVisual", () => {
  it("emits motions with counts and char arguments", () => {
    expect(feed("j").command).toMatchObject({ kind: "move", motion: "j", count: null });
    expect(feed("3w").command).toMatchObject({ kind: "move", motion: "w", count: 3 });
    expect(feed("f.").command).toMatchObject({ kind: "move", motion: "f", char: "." });
    expect(feed("gg").command).toMatchObject({ kind: "move", motion: "gg" });
    expect(feed("0").command).toMatchObject({ kind: "move", motion: "0" });
    expect(feed("10l").command).toMatchObject({ kind: "move", motion: "l", count: 10 });
  });

  it("maps d/x/y/c to selection operators", () => {
    expect(feed("d").command).toEqual({ kind: "operate", op: "d" });
    expect(feed("x").command).toEqual({ kind: "operate", op: "d" });
    expect(feed("y").command).toEqual({ kind: "operate", op: "y" });
    expect(feed("c").command).toEqual({ kind: "operate", op: "c" });
  });

  it("maps o to swap-ends and v/V to wise changes", () => {
    expect(feed("o").command).toEqual({ kind: "swapEnds" });
    expect(feed("v").command).toEqual({ kind: "setWise", linewise: false });
    expect(feed("V").command).toEqual({ kind: "setWise", linewise: true });
  });

  it("clears on unknown keys", () => {
    const { pending, command } = feed("3q");
    expect(command).toBeNull();
    expect(pending).toEqual(EMPTY_VISUAL_PENDING);
  });
});

describe("orderedRange", () => {
  it("orders positions across rows and within a row", () => {
    const a = { row: 2, col: 1 };
    const b = { row: 0, col: 5 };
    expect(orderedRange(a, b)).toEqual({ start: b, end: a });
    expect(orderedRange(b, a)).toEqual({ start: b, end: a });
    const c = { row: 1, col: 7 };
    const d = { row: 1, col: 2 };
    expect(orderedRange(c, d)).toEqual({ start: d, end: c });
    expect(orderedRange(d, d)).toEqual({ start: d, end: d });
  });
});
