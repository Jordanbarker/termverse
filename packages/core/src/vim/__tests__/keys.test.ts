import { describe, it, expect } from "vitest";
import { decodeKeys } from "../keys";

describe("decodeKeys", () => {
  it("decodes printable characters", () => {
    expect(decodeKeys("abc")).toEqual([
      { type: "char", char: "a" },
      { type: "char", char: "b" },
      { type: "char", char: "c" },
    ]);
  });

  it("decodes CSI arrow and navigation sequences", () => {
    expect(decodeKeys("\x1b[A")).toEqual([{ type: "up" }]);
    expect(decodeKeys("\x1b[B")).toEqual([{ type: "down" }]);
    expect(decodeKeys("\x1b[C")).toEqual([{ type: "right" }]);
    expect(decodeKeys("\x1b[D")).toEqual([{ type: "left" }]);
    expect(decodeKeys("\x1b[H")).toEqual([{ type: "home" }]);
    expect(decodeKeys("\x1b[F")).toEqual([{ type: "end" }]);
    expect(decodeKeys("\x1b[3~")).toEqual([{ type: "delete" }]);
    expect(decodeKeys("\x1b[5~")).toEqual([{ type: "pageUp" }]);
    expect(decodeKeys("\x1b[6~")).toEqual([{ type: "pageDown" }]);
  });

  it("treats a bare ESC as the ESC key", () => {
    expect(decodeKeys("\x1b")).toEqual([{ type: "esc" }]);
  });

  it("decodes an ESC not opening a CSI as ESC plus the following key", () => {
    expect(decodeKeys("\x1bx")).toEqual([{ type: "esc" }, { type: "char", char: "x" }]);
  });

  it("decodes mixed chunks in order", () => {
    expect(decodeKeys("ihi\x1b")).toEqual([
      { type: "char", char: "i" },
      { type: "char", char: "h" },
      { type: "char", char: "i" },
      { type: "esc" },
    ]);
  });

  it("decodes enter, backspace, tab, and control codes", () => {
    expect(decodeKeys("\r")).toEqual([{ type: "enter" }]);
    expect(decodeKeys("\x7f")).toEqual([{ type: "backspace" }]);
    expect(decodeKeys("\x08")).toEqual([{ type: "backspace" }]);
    expect(decodeKeys("\t")).toEqual([{ type: "char", char: "\t" }]);
    expect(decodeKeys("\x12")).toEqual([{ type: "ctrl", code: 18 }]);
  });

  it("ignores unknown CSI finals", () => {
    expect(decodeKeys("\x1b[1;5Z")).toEqual([]);
  });
});
