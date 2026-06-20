import { describe, it, expect } from "vitest";
import {
  computeTimestamp,
  interpolateDeliveries,
  getGameTime,
  SEGMENTS,
  getSegmentById,
} from "../timestamp";
import { PiperDelivery } from "../types";

// ---------------------------------------------------------------------------
// computeTimestamp — now takes absolute minutes from midnight
// ---------------------------------------------------------------------------

describe("computeTimestamp", () => {
  it("formats 8:30 AM (510 min) correctly", () => {
    expect(computeTimestamp(510, 0)).toBe("8:30 AM");
  });

  it("formats 2:00 PM (840 min) correctly", () => {
    expect(computeTimestamp(840, 0)).toBe("2:00 PM");
  });

  it("pairs messages within a delivery (floor(i/2) offset)", () => {
    expect(computeTimestamp(510, 0)).toBe("8:30 AM");
    expect(computeTimestamp(510, 1)).toBe("8:30 AM");
    expect(computeTimestamp(510, 2)).toBe("8:31 AM");
    expect(computeTimestamp(510, 3)).toBe("8:31 AM");
    expect(computeTimestamp(510, 4)).toBe("8:32 AM");
  });

  it("formats 12:00 PM correctly", () => {
    expect(computeTimestamp(720, 0)).toBe("12:00 PM");
  });

  it("formats 12:xx PM correctly", () => {
    expect(computeTimestamp(735, 0)).toBe("12:15 PM");
  });
});

// ---------------------------------------------------------------------------
// interpolateDeliveries
// ---------------------------------------------------------------------------

function makeDef(
  id: string,
  trigger: PiperDelivery["trigger"],
  computer?: PiperDelivery["computer"]
): PiperDelivery {
  return {
    id,
    channelId: "test",
    messages: [{ id: `${id}_m1`, from: "Test", timestamp: "", body: "hi" }],
    trigger,
    computer,
  };
}

describe("interpolateDeliveries", () => {
  it("spreads 3 NexaCorp deliveries across 8:30 AM – 6:15 PM", () => {
    const defs: PiperDelivery[] = [
      makeDef("a", { type: "immediate" }),
      makeDef("b", { type: "after_command", command: "ls" }),
      makeDef("c", { type: "after_command", command: "cat" }),
    ];
    const defMap = new Map(defs.map((d) => [d.id, d]));
    const { deliveryMinutes } = interpolateDeliveries(
      ["a", "b", "c"],
      defMap
    );

    // First delivery at segment start (510 = 8:30 AM)
    expect(deliveryMinutes.get("a")).toBe(510);
    // Last delivery at segment start + duration (510 + 585 = 1095 = 6:15 PM)
    expect(deliveryMinutes.get("c")).toBe(1095);
    // Middle delivery halfway
    expect(deliveryMinutes.get("b")).toBe(Math.floor(510 + 585 / 2));
  });

  it("single delivery in segment gets segment start time", () => {
    const defs: PiperDelivery[] = [
      makeDef("only", { type: "immediate" }),
    ];
    const defMap = new Map(defs.map((d) => [d.id, d]));
    const { deliveryMinutes } = interpolateDeliveries(["only"], defMap);
    expect(deliveryMinutes.get("only")).toBe(510); // nexacorp_day1 start
  });

  it("detects segment boundary and switches to Day 2", () => {
    const defs: PiperDelivery[] = [
      makeDef("day1_msg", { type: "immediate" }),
      makeDef("day2_msg", { type: "after_story_flag", flag: "ssh_day2" }),
    ];
    const defMap = new Map(defs.map((d) => [d.id, d]));
    const { deliveryMinutes, lastSegment } = interpolateDeliveries(
      ["day1_msg", "day2_msg"],
      defMap
    );

    // day1_msg is alone in nexacorp_day1 → segment start (510)
    expect(deliveryMinutes.get("day1_msg")).toBe(510);
    // day2_msg is alone in nexacorp_day2 → segment start (510)
    expect(deliveryMinutes.get("day2_msg")).toBe(510);
    expect(lastSegment["nexacorp"]).toBe("nexacorp_day2");
  });

  it("reply follow-up gets parent + 2 min", () => {
    const defs: PiperDelivery[] = [
      makeDef("parent", { type: "immediate" }),
      makeDef("followup", { type: "after_piper_reply", deliveryId: "parent" }),
      makeDef("next", { type: "after_command", command: "ls" }),
    ];
    const defMap = new Map(defs.map((d) => [d.id, d]));
    const { deliveryMinutes } = interpolateDeliveries(
      ["parent", "followup", "next"],
      defMap
    );

    // parent and next are the 2 non-reply deliveries in nexacorp_day1
    // parent = 510, next = 510 + 585 = 1095
    expect(deliveryMinutes.get("parent")).toBe(510);
    expect(deliveryMinutes.get("next")).toBe(1095);
    // followup = parent + 2
    expect(deliveryMinutes.get("followup")).toBe(512);
  });

  it("skips reply: and seen: entries", () => {
    const defs: PiperDelivery[] = [
      makeDef("msg", { type: "immediate" }),
    ];
    const defMap = new Map(defs.map((d) => [d.id, d]));
    const { deliveryMinutes } = interpolateDeliveries(
      ["msg", "reply:msg:0", "seen:general:3"],
      defMap
    );
    expect(deliveryMinutes.size).toBe(1);
    expect(deliveryMinutes.get("msg")).toBe(510);
  });

  it("scales timestamps proportionally to total possible deliveries", () => {
    // 5 total definitions but only 2 delivered
    const defs: PiperDelivery[] = [
      makeDef("a", { type: "immediate" }),
      makeDef("b", { type: "after_command", command: "ls" }),
      makeDef("c", { type: "after_command", command: "cat" }),
      makeDef("d", { type: "after_command", command: "pwd" }),
      makeDef("e", { type: "after_command", command: "echo" }),
    ];
    const defMap = new Map(defs.map((d) => [d.id, d]));
    const { deliveryMinutes } = interpolateDeliveries(["a", "b"], defMap);

    // With 5 total, gap = 585 / 4 = 146.25
    // a at i=0: 510
    // b at i=1: 510 + 146.25 = 656
    expect(deliveryMinutes.get("a")).toBe(510);
    expect(deliveryMinutes.get("b")).toBe(656);
    // Crucially, b should NOT be at 1095 (end of day)
  });

  it("maps devcontainer deliveries to nexacorp clock", () => {
    const defs: PiperDelivery[] = [
      makeDef("nc", { type: "immediate" }),
      makeDef("dc", { type: "after_command", command: "ls" }, "devcontainer"),
    ];
    const defMap = new Map(defs.map((d) => [d.id, d]));
    const { deliveryMinutes } = interpolateDeliveries(
      ["nc", "dc"],
      defMap
    );
    // Both in nexacorp_day1: nc at start, dc at end
    expect(deliveryMinutes.get("nc")).toBe(510);
    expect(deliveryMinutes.get("dc")).toBe(1095);
  });

  it("handles home segment transitions correctly", () => {
    const defs: PiperDelivery[] = [
      makeDef("pre", { type: "immediate" }, "home"),
      makeDef("post", { type: "after_story_flag", flag: "returned_home_day1" }, "home"),
      makeDef("day2", { type: "after_story_flag", flag: "day1_shutdown" }, "home"),
    ];
    const defMap = new Map(defs.map((d) => [d.id, d]));
    const { deliveryMinutes, lastSegment } = interpolateDeliveries(
      ["pre", "post", "day2"],
      defMap
    );

    // pre in home_pre_work (start 840)
    expect(deliveryMinutes.get("pre")).toBe(840);
    // post in home_post_work (start 1095)
    expect(deliveryMinutes.get("post")).toBe(1095);
    // day2 in home_day2 (start 390)
    expect(deliveryMinutes.get("day2")).toBe(390);
    expect(lastSegment["home"]).toBe("home_day2");
  });
});

// ---------------------------------------------------------------------------
// getGameTime
// ---------------------------------------------------------------------------

describe("getGameTime", () => {
  it("returns correct calendar for nexacorp day 1", () => {
    const defs: PiperDelivery[] = [
      makeDef("msg", { type: "immediate" }),
    ];
    const defMap = new Map(defs.map((d) => [d.id, d]));
    const time = getGameTime(["msg"], defMap, "nexacorp");
    expect(time.dow).toBe("Mon");
    expect(time.month).toBe("Feb");
    expect(time.day).toBe("23");
    expect(time.year).toBe("2026");
  });

  it("returns Day 2 calendar after ssh_day2 boundary", () => {
    const defs: PiperDelivery[] = [
      makeDef("d1", { type: "immediate" }),
      makeDef("d2", { type: "after_story_flag", flag: "ssh_day2" }),
    ];
    const defMap = new Map(defs.map((d) => [d.id, d]));
    const time = getGameTime(["d1", "d2"], defMap, "nexacorp");
    expect(time.dow).toBe("Tue");
    expect(time.day).toBe("24");
  });

  it("returns segment start time when no deliveries for clock", () => {
    const defMap = new Map<string, PiperDelivery>();
    const time = getGameTime([], defMap, "nexacorp");
    // Should use nexacorp_day1 start = 510 = 8:30
    expect(time.hour).toBe("08");
    expect(time.minute).toBe("30");
  });

  it("adds 3 min offset after last delivery", () => {
    const defs: PiperDelivery[] = [
      makeDef("msg", { type: "immediate" }),
    ];
    const defMap = new Map(defs.map((d) => [d.id, d]));
    // Single delivery at 510 (8:30 AM), +3 = 513 (8:33 AM)
    const time = getGameTime(["msg"], defMap, "nexacorp");
    expect(time.hour).toBe("08");
    expect(time.minute).toBe("33");
  });

  it("returns home pre-work calendar for home computer", () => {
    const defs: PiperDelivery[] = [
      makeDef("hmsg", { type: "immediate" }, "home"),
    ];
    const defMap = new Map(defs.map((d) => [d.id, d]));
    const time = getGameTime(["hmsg"], defMap, "home");
    expect(time.dow).toBe("Sat");
    expect(time.month).toBe("Feb");
    expect(time.day).toBe("21");
  });

  it("treats devcontainer as nexacorp clock", () => {
    const defs: PiperDelivery[] = [
      makeDef("msg", { type: "immediate" }),
    ];
    const defMap = new Map(defs.map((d) => [d.id, d]));
    const time = getGameTime(["msg"], defMap, "devcontainer");
    expect(time.dow).toBe("Mon");
    expect(time.hour).toBe("08");
    expect(time.minute).toBe("33");
  });
});

// ---------------------------------------------------------------------------
// Segment data integrity
// ---------------------------------------------------------------------------

describe("SEGMENTS", () => {
  it("has 5 segments", () => {
    expect(SEGMENTS).toHaveLength(5);
  });

  it("getSegmentById returns matching segment", () => {
    const seg = getSegmentById("nexacorp_day1");
    expect(seg.clockKey).toBe("nexacorp");
    expect(seg.startMinutes).toBe(510);
  });
});
