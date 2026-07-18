import { describe, it, expect } from "vitest";
import { applyMotion, charClass, firstNonBlank, Motion } from "../motions";
import { CursorPosition } from "../../editor/types";

const LINES = ["foo.bar baz", "", "  indent line", "last"];

function motion(lines: string[], cursor: CursorPosition, m: Partial<Motion> & { key: Motion["key"] }, forOperator = false) {
  return applyMotion(lines, cursor, { count: null, ...m }, { forOperator });
}

describe("charClass", () => {
  it("splits space / word / punctuation", () => {
    expect(charClass(" ")).toBe(0);
    expect(charClass("\t")).toBe(0);
    expect(charClass("a")).toBe(1);
    expect(charClass("_")).toBe(1);
    expect(charClass("9")).toBe(1);
    expect(charClass(".")).toBe(2);
    expect(charClass("(")).toBe(2);
  });
});

describe("firstNonBlank", () => {
  it("finds the first non-blank column", () => {
    expect(firstNonBlank("  indent")).toBe(2);
    expect(firstNonBlank("plain")).toBe(0);
    expect(firstNonBlank("")).toBe(0);
    expect(firstNonBlank("   ")).toBe(0);
  });
});

describe("w motion (3-class words)", () => {
  it("treats foo.bar as three words", () => {
    expect(motion(LINES, { row: 0, col: 0 }, { key: "w" })!.target).toEqual({ row: 0, col: 3 });
    expect(motion(LINES, { row: 0, col: 3 }, { key: "w" })!.target).toEqual({ row: 0, col: 4 });
    expect(motion(LINES, { row: 0, col: 4 }, { key: "w" })!.target).toEqual({ row: 0, col: 8 });
  });

  it("stops on an empty line (it counts as a word)", () => {
    expect(motion(LINES, { row: 0, col: 8 }, { key: "w" })!.target).toEqual({ row: 1, col: 0 });
  });

  it("continues from an empty line to the next word", () => {
    expect(motion(LINES, { row: 1, col: 0 }, { key: "w" })!.target).toEqual({ row: 2, col: 2 });
  });

  it("honors counts", () => {
    expect(motion(LINES, { row: 0, col: 0 }, { key: "w", count: 3 })!.target).toEqual({ row: 0, col: 8 });
  });

  it("is exclusive", () => {
    expect(motion(LINES, { row: 0, col: 0 }, { key: "w" })!.wise).toBe("exclusive");
  });

  it("clamps the final operator step at end-of-line (dw on the last word)", () => {
    const lines = ["foo bar", "baz"];
    expect(motion(lines, { row: 0, col: 4 }, { key: "w" }, true)!.target).toEqual({ row: 0, col: 7 });
  });

  it("does not clamp the operator step on an empty line (dw eats the line break)", () => {
    const lines = ["", "next"];
    expect(motion(lines, { row: 0, col: 0 }, { key: "w" }, true)!.target).toEqual({ row: 1, col: 0 });
  });
});

describe("b motion", () => {
  it("moves to previous word starts across classes", () => {
    expect(motion(LINES, { row: 0, col: 8 }, { key: "b" })!.target).toEqual({ row: 0, col: 4 });
    expect(motion(LINES, { row: 0, col: 4 }, { key: "b" })!.target).toEqual({ row: 0, col: 3 });
    expect(motion(LINES, { row: 0, col: 3 }, { key: "b" })!.target).toEqual({ row: 0, col: 0 });
  });

  it("stops on an empty line and crosses line boundaries", () => {
    expect(motion(LINES, { row: 2, col: 2 }, { key: "b" })!.target).toEqual({ row: 1, col: 0 });
    expect(motion(LINES, { row: 1, col: 0 }, { key: "b" })!.target).toEqual({ row: 0, col: 8 });
  });

  it("stays at the buffer start", () => {
    expect(motion(LINES, { row: 0, col: 0 }, { key: "b" })!.target).toEqual({ row: 0, col: 0 });
  });
});

describe("e motion", () => {
  it("moves to word ends and is inclusive", () => {
    const res = motion(LINES, { row: 0, col: 0 }, { key: "e" })!;
    expect(res.target).toEqual({ row: 0, col: 2 });
    expect(res.wise).toBe("inclusive");
    expect(motion(LINES, { row: 0, col: 2 }, { key: "e" })!.target).toEqual({ row: 0, col: 3 });
    expect(motion(LINES, { row: 0, col: 3 }, { key: "e" })!.target).toEqual({ row: 0, col: 6 });
  });

  it("skips empty lines", () => {
    expect(motion(LINES, { row: 0, col: 10 }, { key: "e" })!.target).toEqual({ row: 2, col: 7 });
  });

  it("honors counts", () => {
    expect(motion(LINES, { row: 0, col: 0 }, { key: "e", count: 2 })!.target).toEqual({ row: 0, col: 3 });
  });
});

describe("line motions", () => {
  it("0 goes to column zero, ^ to first non-blank", () => {
    expect(motion(LINES, { row: 2, col: 9 }, { key: "0" })!.target).toEqual({ row: 2, col: 0 });
    expect(motion(LINES, { row: 2, col: 9 }, { key: "^" })!.target).toEqual({ row: 2, col: 2 });
  });

  it("$ targets the last character, moving down count-1 lines", () => {
    expect(motion(LINES, { row: 0, col: 2 }, { key: "$" })!.target).toEqual({ row: 0, col: 10 });
    expect(motion(LINES, { row: 0, col: 2 }, { key: "$", count: 3 })!.target).toEqual({ row: 2, col: 12 });
    expect(motion(LINES, { row: 1, col: 0 }, { key: "$" })!.target).toEqual({ row: 1, col: 0 });
  });

  it("j/k fail at buffer edges and clamp counts otherwise", () => {
    expect(motion(LINES, { row: 3, col: 0 }, { key: "j" })).toBeNull();
    expect(motion(LINES, { row: 0, col: 0 }, { key: "k" })).toBeNull();
    expect(motion(LINES, { row: 0, col: 0 }, { key: "j", count: 99 })!.target.row).toBe(3);
    expect(motion(LINES, { row: 0, col: 0 }, { key: "j" })!.wise).toBe("linewise");
  });
});

describe("gg / G", () => {
  it("default to first / last line at first non-blank", () => {
    expect(motion(LINES, { row: 3, col: 0 }, { key: "gg" })!.target).toEqual({ row: 0, col: 0 });
    expect(motion(LINES, { row: 0, col: 0 }, { key: "G" })!.target).toEqual({ row: 3, col: 0 });
  });

  it("jump to the counted line, clamped", () => {
    expect(motion(LINES, { row: 0, col: 0 }, { key: "G", count: 3 })!.target).toEqual({ row: 2, col: 2 });
    expect(motion(LINES, { row: 3, col: 0 }, { key: "gg", count: 99 })!.target.row).toBe(3);
  });

  it("are linewise", () => {
    expect(motion(LINES, { row: 0, col: 0 }, { key: "G" })!.wise).toBe("linewise");
  });
});

describe("f / t", () => {
  it("f finds the nth occurrence, inclusive", () => {
    const res = motion(LINES, { row: 0, col: 0 }, { key: "f", char: "b" })!;
    expect(res.target).toEqual({ row: 0, col: 4 });
    expect(res.wise).toBe("inclusive");
    expect(motion(LINES, { row: 0, col: 0 }, { key: "f", char: "b", count: 2 })!.target).toEqual({ row: 0, col: 8 });
  });

  it("t stops just before the target", () => {
    expect(motion(LINES, { row: 0, col: 0 }, { key: "t", char: "b" })!.target).toEqual({ row: 0, col: 3 });
  });

  it("misses return null", () => {
    expect(motion(LINES, { row: 0, col: 0 }, { key: "f", char: "z", count: 2 })).toBeNull();
    expect(motion(LINES, { row: 0, col: 0 }, { key: "f", char: "q" })).toBeNull();
    expect(motion(LINES, { row: 0, col: 3 }, { key: "t", char: "b" })).toBeNull();
  });
});
