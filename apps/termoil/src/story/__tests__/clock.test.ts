import { describe, it, expect } from "vitest";
import { createGameClock } from "../clock";

describe("createGameClock().now()", () => {
  it("returns Day 1 morning when no Piper deliveries have fired (nexacorp)", () => {
    const d = createGameClock([], "jbaxter", "nexacorp").now();
    // INITIAL_SEGMENTS.nexacorp = "nexacorp_day1" → calendar Feb 23 2026, startMinutes 510 (08:30)
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1); // Feb is 0-indexed month 1
    expect(d.getDate()).toBe(23);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(30);
  });

  it("returns Day 1 pre-work morning when on home computer", () => {
    const d = createGameClock([], "jbaxter", "home").now();
    // INITIAL_SEGMENTS.home = "home_pre_work" → Feb 23 2026 (matches log baseline + email Date: headers)
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1);
  });

  it("returns a Date object (not a string)", () => {
    expect(createGameClock([], "jbaxter", "nexacorp").now()).toBeInstanceOf(Date);
  });
});
