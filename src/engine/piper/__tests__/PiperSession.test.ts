import { describe, it, expect } from "vitest";
import { consumeDigit } from "../PiperSession";

describe("consumeDigit", () => {
  describe("single-digit shortcut for high digits", () => {
    it("commits '2'-'9' immediately when max < 20", () => {
      for (const ch of ["2", "3", "4", "5", "6", "7", "8", "9"]) {
        const result = consumeDigit("", ch, 15);
        expect(result).toEqual({ buffer: "", commit: parseInt(ch, 10) });
      }
    });

    it("commits '1' immediately when menu has fewer than 10 items", () => {
      expect(consumeDigit("", "1", 9)).toEqual({ buffer: "", commit: 1 });
      expect(consumeDigit("", "1", 5)).toEqual({ buffer: "", commit: 1 });
    });
  });

  describe("buffering '1' for menus with 10+ items", () => {
    it("buffers '1' when menu has 10+ items (extension possible)", () => {
      expect(consumeDigit("", "1", 10)).toEqual({ buffer: "1", commit: null });
      expect(consumeDigit("", "1", 15)).toEqual({ buffer: "1", commit: null });
    });

    it("commits 10 after typing '1' then '0' with max=15", () => {
      const first = consumeDigit("", "1", 15);
      expect(first).toEqual({ buffer: "1", commit: null });
      const second = consumeDigit(first.buffer, "0", 15);
      expect(second).toEqual({ buffer: "", commit: 10 });
    });

    it("commits 15 after '1' then '5' with max=15", () => {
      const second = consumeDigit("1", "5", 15);
      expect(second).toEqual({ buffer: "", commit: 15 });
    });

    it("rejects '1' then '6' when max=15 (would be 16), preserves '1' in buffer", () => {
      const second = consumeDigit("1", "6", 15);
      expect(second).toEqual({ buffer: "1", commit: null });
    });

    it("rejects '1' then '9' when max=15 (would be 19), preserves '1' in buffer", () => {
      const second = consumeDigit("1", "9", 15);
      expect(second).toEqual({ buffer: "1", commit: null });
    });
  });

  describe("invalid digits", () => {
    it("rejects '0' as the first digit (would be 0, not >= 1)", () => {
      expect(consumeDigit("", "0", 15)).toEqual({ buffer: "", commit: null });
    });

    it("rejects digits that exceed max even at single digit", () => {
      // max=3, "5" would be 5 > 3
      expect(consumeDigit("", "5", 3)).toEqual({ buffer: "", commit: null });
    });

    it("rejects non-digit characters", () => {
      expect(consumeDigit("", "a", 15)).toEqual({ buffer: "", commit: null });
      expect(consumeDigit("1", "x", 15)).toEqual({ buffer: "1", commit: null });
    });

    it("returns buffer unchanged when max is 0 (empty menu)", () => {
      expect(consumeDigit("", "1", 0)).toEqual({ buffer: "", commit: null });
    });
  });

  describe("3-digit menus (boundary check)", () => {
    it("buffers '1' for max=100 (10-99 still reachable), commits at second digit", () => {
      // With max=100, "1" could extend to 10-19, all valid
      expect(consumeDigit("", "1", 100)).toEqual({ buffer: "1", commit: null });
      // "10" with max=100: 10*10 = 100, not > 100, so still buffered
      expect(consumeDigit("1", "0", 100)).toEqual({ buffer: "10", commit: null });
      // "100" with max=100: 100*10 = 1000 > 100, commit
      expect(consumeDigit("10", "0", 100)).toEqual({ buffer: "", commit: 100 });
    });
  });
});
