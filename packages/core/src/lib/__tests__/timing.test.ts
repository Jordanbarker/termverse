import { describe, it, expect } from "vitest";
import { jitterDelay } from "../timing";

describe("jitterDelay", () => {
  it("returns values within clamped range", () => {
    const base = 500;
    for (let i = 0; i < 100; i++) {
      const result = jitterDelay(base);
      expect(result).toBeGreaterThanOrEqual(base * 0.5);
      expect(result).toBeLessThanOrEqual(base * 1.5);
    }
  });

  it("returns zero for zero input", () => {
    expect(jitterDelay(0)).toBe(0);
  });

  it("returns integer values", () => {
    for (let i = 0; i < 50; i++) {
      const result = jitterDelay(200);
      expect(result).toBe(Math.floor(result));
    }
  });

  it("returns at least 1 for non-zero input", () => {
    for (let i = 0; i < 50; i++) {
      const result = jitterDelay(1);
      expect(result).toBeGreaterThanOrEqual(1);
    }
  });

  it("respects custom stddevFraction", () => {
    const base = 1000;
    // With a very small stddev, values should cluster near the base
    const results = Array.from({ length: 100 }, () => jitterDelay(base, 0.01));
    const avg = results.reduce((a, b) => a + b, 0) / results.length;
    expect(avg).toBeGreaterThan(base * 0.9);
    expect(avg).toBeLessThan(base * 1.1);
  });
});
