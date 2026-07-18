import { describe, it, expect } from "vitest";
import { EMPTY_PENDING, PendingState, showcmd, stepNormal } from "../normal";

/** Feed a key sequence, returning the last command and final pending state. */
function feed(keys: string) {
  let pending: PendingState = EMPTY_PENDING;
  let command = null;
  for (const ch of keys) {
    const step = stepNormal(pending, ch);
    pending = step.pending;
    command = step.command;
  }
  return { pending, command };
}

describe("stepNormal grammar", () => {
  it("emits a plain motion with no count", () => {
    expect(feed("w").command).toEqual({ kind: "move", motion: "w", count: null, char: undefined });
  });

  it("accumulates counts before a motion", () => {
    expect(feed("10j").command).toEqual({ kind: "move", motion: "j", count: 10, char: undefined });
  });

  it("treats a leading 0 as the line-start motion", () => {
    expect(feed("0").command).toEqual({ kind: "move", motion: "0", count: null, char: undefined });
  });

  it("treats 0 after digits as part of the count", () => {
    const { command } = feed("20l");
    expect(command).toMatchObject({ kind: "move", motion: "l", count: 20 });
  });

  it("builds operator + motion", () => {
    expect(feed("dw").command).toEqual({
      kind: "operate", op: "d", motion: "w", count: 1, countGiven: false, char: undefined,
    });
  });

  it("multiplies counts around the operator (2d3w = 6 words)", () => {
    expect(feed("2d3w").command).toMatchObject({ kind: "operate", op: "d", motion: "w", count: 6, countGiven: true });
  });

  it("doubles an operator into a linewise operation", () => {
    expect(feed("dd").command).toMatchObject({ kind: "operate", op: "d", motion: "line", count: 1 });
    expect(feed("3yy").command).toMatchObject({ kind: "operate", op: "y", motion: "line", count: 3 });
    expect(feed("cc").command).toMatchObject({ kind: "operate", op: "c", motion: "line", count: 1 });
  });

  it("aborts on mismatched operators", () => {
    const { pending, command } = feed("dy");
    expect(command).toBeNull();
    expect(pending).toEqual(EMPTY_PENDING);
  });

  it("handles the gg continuation, alone and with an operator", () => {
    expect(feed("gg").command).toMatchObject({ kind: "move", motion: "gg" });
    expect(feed("dgg").command).toMatchObject({ kind: "operate", op: "d", motion: "gg" });
    expect(feed("3gg").command).toMatchObject({ kind: "move", motion: "gg", count: 3 });
  });

  it("aborts g followed by anything else", () => {
    const { pending, command } = feed("gx");
    expect(command).toBeNull();
    expect(pending).toEqual(EMPTY_PENDING);
  });

  it("collects the f/t character argument", () => {
    expect(feed("fx").command).toMatchObject({ kind: "move", motion: "f", char: "x" });
    expect(feed("dt.").command).toMatchObject({ kind: "operate", op: "d", motion: "t", char: "." });
    expect(feed("2fb").command).toMatchObject({ kind: "move", motion: "f", count: 2, char: "b" });
  });

  it("collects the r replacement character with count", () => {
    expect(feed("rz").command).toEqual({ kind: "replaceChar", char: "z", count: 1 });
    expect(feed("3rz").command).toEqual({ kind: "replaceChar", char: "z", count: 3 });
  });

  it("rejects r while an operator is pending", () => {
    const { pending, command } = feed("dr");
    expect(command).toBeNull();
    expect(pending).toEqual(EMPTY_PENDING);
  });

  it("emits standalone commands", () => {
    expect(feed("x").command).toEqual({ kind: "deleteChar", count: 1 });
    expect(feed("3x").command).toEqual({ kind: "deleteChar", count: 3 });
    expect(feed("p").command).toEqual({ kind: "put", before: false, count: 1 });
    expect(feed("P").command).toEqual({ kind: "put", before: true, count: 1 });
    expect(feed("o").command).toEqual({ kind: "openLine", above: false });
    expect(feed("O").command).toEqual({ kind: "openLine", above: true });
    expect(feed("i").command).toEqual({ kind: "insert", variant: "i" });
    expect(feed("A").command).toEqual({ kind: "insert", variant: "A" });
    expect(feed("v").command).toEqual({ kind: "visual", linewise: false });
    expect(feed("V").command).toEqual({ kind: "visual", linewise: true });
    expect(feed("u").command).toEqual({ kind: "undo" });
    expect(feed(":").command).toEqual({ kind: "cmdline", prefix: ":" });
    expect(feed("/").command).toEqual({ kind: "cmdline", prefix: "/" });
    expect(feed("?").command).toEqual({ kind: "cmdline", prefix: "?" });
    expect(feed("n").command).toEqual({ kind: "searchNext", reverse: false });
    expect(feed("N").command).toEqual({ kind: "searchNext", reverse: true });
  });

  it("rejects standalone commands while an operator is pending", () => {
    expect(feed("dx").command).toBeNull();
    expect(feed("dp").command).toBeNull();
    expect(feed("dv").command).toBeNull();
  });

  it("clears on unknown keys", () => {
    const { pending, command } = feed("3dq");
    expect(command).toBeNull();
    expect(pending).toEqual(EMPTY_PENDING);
  });
});

describe("showcmd", () => {
  it("echoes the pending keys", () => {
    expect(showcmd(feed("2d3").pending)).toBe("2d3");
    expect(showcmd(feed("df").pending)).toBe("df");
    expect(showcmd(feed("g").pending)).toBe("g");
    expect(showcmd(EMPTY_PENDING)).toBe("");
  });
});
