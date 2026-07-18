import { describe, it, expect } from "vitest";
import {
  changeLinewise,
  deleteCharwise,
  deleteChars,
  deleteLinewise,
  openLine,
  putRegister,
  replaceChars,
  yankCharwise,
  yankLinewise,
} from "../edits";

const LINES = ["alpha beta", "gamma", "delta epsilon"];

describe("deleteCharwise", () => {
  it("deletes within a line and fills the register", () => {
    const r = deleteCharwise(LINES, { row: 0, col: 0 }, { row: 0, col: 6 });
    expect(r.lines[0]).toBe("beta");
    expect(r.register).toEqual({ text: ["alpha "], linewise: false });
    expect(r.cursor).toEqual({ row: 0, col: 0 });
    expect(LINES[0]).toBe("alpha beta"); // input untouched
  });

  it("deletes across lines, joining the remainders", () => {
    const r = deleteCharwise(LINES, { row: 0, col: 5 }, { row: 2, col: 5 });
    expect(r.lines).toEqual(["alpha epsilon"]);
    expect(r.register).toEqual({ text: [" beta", "gamma", "delta"], linewise: false });
  });

  it("clamps the end column to the line length", () => {
    const r = deleteCharwise(LINES, { row: 1, col: 0 }, { row: 1, col: 99 });
    expect(r.lines[1]).toBe("");
    expect(r.register.text).toEqual(["gamma"]);
  });
});

describe("yankCharwise", () => {
  it("captures without modifying", () => {
    expect(yankCharwise(LINES, { row: 0, col: 6 }, { row: 0, col: 10 })).toEqual({
      text: ["beta"],
      linewise: false,
    });
    expect(yankCharwise(LINES, { row: 0, col: 6 }, { row: 1, col: 3 })).toEqual({
      text: ["beta", "gam"],
      linewise: false,
    });
  });
});

describe("deleteLinewise / yankLinewise", () => {
  it("removes whole lines and lands on the first non-blank", () => {
    const r = deleteLinewise(LINES, 0, 1);
    expect(r.lines).toEqual(["delta epsilon"]);
    expect(r.register).toEqual({ text: ["alpha beta", "gamma"], linewise: true });
    expect(r.cursor).toEqual({ row: 0, col: 0 });
  });

  it("leaves [\"\"] when every line is deleted", () => {
    const r = deleteLinewise(LINES, 0, 2);
    expect(r.lines).toEqual([""]);
    expect(r.cursor).toEqual({ row: 0, col: 0 });
  });

  it("clamps the cursor row when deleting the tail", () => {
    const r = deleteLinewise(LINES, 1, 2);
    expect(r.lines).toEqual(["alpha beta"]);
    expect(r.cursor.row).toBe(0);
  });

  it("yankLinewise captures whole lines", () => {
    expect(yankLinewise(LINES, 1, 2)).toEqual({ text: ["gamma", "delta epsilon"], linewise: true });
  });
});

describe("changeLinewise", () => {
  it("replaces the rows with one empty line", () => {
    const r = changeLinewise(LINES, 0, 1);
    expect(r.lines).toEqual(["", "delta epsilon"]);
    expect(r.cursor).toEqual({ row: 0, col: 0 });
    expect(r.register).toEqual({ text: ["alpha beta", "gamma"], linewise: true });
  });
});

describe("putRegister", () => {
  const charReg = { text: ["XY"], linewise: false };
  const lineReg = { text: ["one", "two"], linewise: true };

  it("pastes charwise after the cursor (p)", () => {
    const r = putRegister(["abc"], { row: 0, col: 0 }, charReg, false, 1);
    expect(r.lines).toEqual(["aXYbc"]);
    expect(r.cursor).toEqual({ row: 0, col: 2 }); // on the last pasted char
  });

  it("pastes charwise at the cursor (P)", () => {
    const r = putRegister(["abc"], { row: 0, col: 1 }, charReg, true, 1);
    expect(r.lines).toEqual(["aXYbc"]);
  });

  it("pastes charwise on an empty line", () => {
    const r = putRegister([""], { row: 0, col: 0 }, charReg, false, 1);
    expect(r.lines).toEqual(["XY"]);
  });

  it("repeats charwise text for counts", () => {
    const r = putRegister(["ab"], { row: 0, col: 1 }, charReg, false, 3);
    expect(r.lines).toEqual(["abXYXYXY"]);
  });

  it("splices multi-segment charwise text into the line", () => {
    const r = putRegister(["startend"], { row: 0, col: 5 }, { text: ["AA", "BB"], linewise: false }, true, 1);
    expect(r.lines).toEqual(["startAA", "BBend"]);
    expect(r.cursor).toEqual({ row: 0, col: 5 });
  });

  it("pastes linewise below (p) and above (P)", () => {
    expect(putRegister(["a", "b"], { row: 0, col: 0 }, lineReg, false, 1).lines).toEqual(["a", "one", "two", "b"]);
    expect(putRegister(["a", "b"], { row: 0, col: 0 }, lineReg, true, 1).lines).toEqual(["one", "two", "a", "b"]);
  });

  it("puts the cursor on the first non-blank of the first pasted line", () => {
    const r = putRegister(["a"], { row: 0, col: 0 }, { text: ["  padded"], linewise: true }, false, 1);
    expect(r.cursor).toEqual({ row: 1, col: 2 });
  });

  it("repeats linewise text for counts", () => {
    const r = putRegister(["a"], { row: 0, col: 0 }, { text: ["x"], linewise: true }, false, 2);
    expect(r.lines).toEqual(["a", "x", "x"]);
  });
});

describe("deleteChars (x)", () => {
  it("deletes under the cursor and clamps at end-of-line", () => {
    const r = deleteChars(["abc"], { row: 0, col: 1 }, 5)!;
    expect(r.lines).toEqual(["a"]);
    expect(r.register.text).toEqual(["bc"]);
    expect(r.cursor).toEqual({ row: 0, col: 0 });
  });

  it("returns null on an empty line", () => {
    expect(deleteChars([""], { row: 0, col: 0 }, 1)).toBeNull();
  });
});

describe("replaceChars (r)", () => {
  it("overwrites count chars and parks on the last one", () => {
    const r = replaceChars(["abcdef"], { row: 0, col: 1 }, "z", 3)!;
    expect(r.lines).toEqual(["azzzef"]);
    expect(r.cursor).toEqual({ row: 0, col: 3 });
  });

  it("fails when the line is too short", () => {
    expect(replaceChars(["ab"], { row: 0, col: 1 }, "z", 3)).toBeNull();
  });
});

describe("openLine (o / O)", () => {
  it("opens below and above", () => {
    expect(openLine(["a", "b"], { row: 0, col: 0 }, false)).toEqual({
      lines: ["a", "", "b"],
      cursor: { row: 1, col: 0 },
    });
    expect(openLine(["a", "b"], { row: 1, col: 0 }, true)).toEqual({
      lines: ["a", "", "b"],
      cursor: { row: 1, col: 0 },
    });
  });
});
