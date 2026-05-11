import { describe, it, expect } from "vitest";
import { checkPiperDeliveries } from "../delivery";
import { getPiperDeliveries } from "../../../story/piper/messages";
import { GameEvent } from "../../mail/delivery";

const USERNAME = "testplayer";

describe("anon_usb_tip Piper delivery", () => {
  it("delivers on home after day1_shutdown is set", () => {
    const event: GameEvent = { type: "command_executed", detail: "shutdown" };
    const flags = { day1_shutdown: true } as Record<string, string | boolean>;
    const result = checkPiperDeliveries(event, [], USERNAME, "home", flags);
    expect(result).toContain("anon_usb_tip");
  });

  it("does not deliver before day1_shutdown is set", () => {
    const event: GameEvent = { type: "command_executed", detail: "shutdown" };
    const result = checkPiperDeliveries(event, [], USERNAME, "home", {});
    expect(result).not.toContain("anon_usb_tip");
  });

  it("offers Plug it in / Not interested replies that emit the right events", () => {
    const all = getPiperDeliveries(USERNAME);
    const tip = all.find((d) => d.id === "anon_usb_tip");
    expect(tip).toBeDefined();
    expect(tip!.replyOptions).toHaveLength(2);

    const accept = tip!.replyOptions!.find((r) => r.label === "Plug it in.");
    expect(accept).toBeDefined();
    expect(accept!.triggerEvents).toEqual([
      { type: "objective_completed", detail: "accepted_usb_drive" },
    ]);

    const decline = tip!.replyOptions!.find((r) => r.label === "Not interested.");
    expect(decline).toBeDefined();
    expect(decline!.triggerEvents).toEqual([
      { type: "objective_completed", detail: "declined_usb_tip" },
    ]);
  });
});
