import { describe, it, expect } from "vitest";
import { gameNowFor } from "../gameClock";

describe("gameNowFor", () => {
  it("returns Day 1 morning when no Piper deliveries have fired (nexacorp)", () => {
    const d = gameNowFor([], "jbaxter", "nexacorp");
    // INITIAL_SEGMENTS.nexacorp = "nexacorp_day1" → calendar Feb 23 2026, startMinutes 510 (08:30)
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1); // Feb is 0-indexed month 1
    expect(d.getDate()).toBe(23);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(30);
  });

  it("returns Day 1 pre-work morning when on home computer", () => {
    const d = gameNowFor([], "jbaxter", "home");
    // INITIAL_SEGMENTS.home = "home_pre_work" → Feb 23 2026 (matches log baseline + email Date: headers)
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1);
  });

  it("returns a Date object (not a string)", () => {
    expect(gameNowFor([], "jbaxter", "nexacorp")).toBeInstanceOf(Date);
  });
});
