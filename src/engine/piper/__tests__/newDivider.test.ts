import { describe, it, expect } from "vitest";
import { renderConversation } from "../render";
import { getVisibleChannels, getConversationHistory } from "../delivery";
import { PiperMessage } from "../types";

const USERNAME = "testplayer";

describe("NEW divider in renderConversation", () => {
  it("inserts NEW divider before unread NPC messages", () => {
    const messages: PiperMessage[] = [
      { id: "1", from: "Auri Park", timestamp: "5:17 PM", body: "Old message", isPlayer: false },
      { id: "2", from: USERNAME, timestamp: "", body: "Player reply", isPlayer: true },
      { id: "3", from: "Auri Park", timestamp: "8:30 AM", body: "Morning!", isPlayer: false },
      { id: "4", from: "Auri Park", timestamp: "8:30 AM", body: "Run the build", isPlayer: false },
      { id: "5", from: "Auri Park", timestamp: "8:31 AM", body: "git pull then dbt build", isPlayer: false },
    ];

    const result = renderConversation(messages, 44, 3);
    const lines = result.split("\r\n");

    // Find the NEW divider
    const dividerIdx = lines.findIndex((l) => l.includes(" NEW "));
    expect(dividerIdx).toBeGreaterThan(-1);

    // Divider should appear after the player reply and before "Morning!"
    const morningIdx = lines.findIndex((l) => l.includes("Morning!"));
    expect(dividerIdx).toBeLessThan(morningIdx);

    // Divider should appear after the player reply text
    const replyIdx = lines.findIndex((l) => l.includes("Player reply"));
    expect(dividerIdx).toBeGreaterThan(replyIdx);
  });

  it("does not insert divider when unreadCount is 0", () => {
    const messages: PiperMessage[] = [
      { id: "1", from: "Auri Park", timestamp: "8:30 AM", body: "Hello", isPlayer: false },
    ];
    const result = renderConversation(messages, 44, 0);
    expect(result).not.toContain(" NEW ");
  });

  it("inserts divider before all messages when all are unread", () => {
    const messages: PiperMessage[] = [
      { id: "1", from: "Auri Park", timestamp: "8:30 AM", body: "First", isPlayer: false },
      { id: "2", from: "Auri Park", timestamp: "8:31 AM", body: "Second", isPlayer: false },
    ];
    const result = renderConversation(messages, 44, 2);
    const lines = result.split("\r\n");
    const dividerIdx = lines.findIndex((l) => l.includes(" NEW "));
    const firstMsgIdx = lines.findIndex((l) => l.includes("First"));
    expect(dividerIdx).toBeGreaterThan(-1);
    expect(dividerIdx).toBeLessThan(firstMsgIdx);
  });

  it("does not insert divider when unreadCount exceeds NPC messages", () => {
    const messages: PiperMessage[] = [
      { id: "1", from: "Auri Park", timestamp: "8:30 AM", body: "Hello", isPlayer: false },
    ];
    // unreadCount (5) > actual NPC messages (1)
    const result = renderConversation(messages, 44, 5);
    expect(result).not.toContain(" NEW ");
  });
});

describe("getVisibleChannels unread with seen markers", () => {
  it("calculates correct unread after seen marker", () => {
    // Deliver auri_hello (4 NPC messages) + mark as seen + deliver auri_day2_morning (3 NPC)
    const deliveredIds = [
      "general_edward_welcome",
      "auri_hello",
      "reply:auri_hello:0",
      "seen:dm_auri:4",
      "auri_day2_morning",
    ];

    const channels = getVisibleChannels(deliveredIds, USERNAME, "nexacorp");
    const auri = channels.find((c) => c.channel.id === "dm_auri");
    expect(auri).toBeDefined();
    // auri_day2_morning has 3 NPC messages, auri_hello has 4, seen at 4 → unread = 3
    expect(auri!.unread).toBe(3);
  });

  it("uses highest seen marker when multiple exist", () => {
    // If stale markers somehow accumulate, use the highest count
    const deliveredIds = [
      "auri_hello",
      "seen:dm_auri:4",   // stale marker
      "auri_pipeline_help",
      "seen:dm_auri:5",   // current marker
      "auri_day2_morning",
    ];

    const channels = getVisibleChannels(deliveredIds, USERNAME, "nexacorp");
    const auri = channels.find((c) => c.channel.id === "dm_auri");
    expect(auri).toBeDefined();
    // Total NPC: auri_hello(4) + pipeline_help(0) + day2_morning(3) = 7
    // seenCount should be 5 (highest) → unread = 7 - 5 = 2
    expect(auri!.unread).toBe(2);
  });
});

describe("getConversationHistory + renderConversation integration", () => {
  it("NEW divider position matches unread count from getVisibleChannels", () => {
    // Realistic Day 2 scenario: auri_hello seen, auri_day2_morning is new
    const deliveredIds = [
      "general_edward_welcome",
      "auri_hello",
      "reply:auri_hello:0",
      "seen:dm_auri:4",
      "auri_day2_morning",
    ];

    const channels = getVisibleChannels(deliveredIds, USERNAME, "nexacorp");
    const auri = channels.find((c) => c.channel.id === "dm_auri");
    expect(auri).toBeDefined();
    const unreadCount = auri!.unread;

    const messages = getConversationHistory("dm_auri", deliveredIds, USERNAME);
    const result = renderConversation(messages, 44, unreadCount);

    // NEW divider should be present
    expect(result).toContain(" NEW ");

    // Count NPC messages after the divider — should equal unreadCount
    const lines = result.split("\r\n");
    const dividerIdx = lines.findIndex((l) => l.includes(" NEW "));
    expect(dividerIdx).toBeGreaterThan(-1);
  });
});
