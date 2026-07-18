import { describe, it, expect } from "vitest";
import { searchBuffer } from "../search";

const LINES = ["one two one", "three", "one more"];

describe("searchBuffer", () => {
  it("finds the next forward match past the cursor", () => {
    expect(searchBuffer(LINES, { row: 0, col: 0 }, "one", false)).toEqual({
      pos: { row: 0, col: 8 },
      wrapped: false,
    });
  });

  it("continues to later lines", () => {
    expect(searchBuffer(LINES, { row: 0, col: 8 }, "one", false)).toEqual({
      pos: { row: 2, col: 0 },
      wrapped: false,
    });
  });

  it("wraps forward and reports it", () => {
    expect(searchBuffer(LINES, { row: 2, col: 0 }, "one", false)).toEqual({
      pos: { row: 0, col: 0 },
      wrapped: true,
    });
  });

  it("finds backward matches before the cursor", () => {
    expect(searchBuffer(LINES, { row: 0, col: 8 }, "one", true)).toEqual({
      pos: { row: 0, col: 0 },
      wrapped: false,
    });
  });

  it("wraps backward and reports it", () => {
    expect(searchBuffer(LINES, { row: 0, col: 0 }, "one", true)).toEqual({
      pos: { row: 2, col: 0 },
      wrapped: true,
    });
  });

  it("is case-sensitive and returns null on a miss", () => {
    expect(searchBuffer(LINES, { row: 0, col: 0 }, "ONE", false)).toBeNull();
    expect(searchBuffer(LINES, { row: 0, col: 0 }, "zebra", false)).toBeNull();
    expect(searchBuffer(LINES, { row: 0, col: 0 }, "", false)).toBeNull();
  });
});
