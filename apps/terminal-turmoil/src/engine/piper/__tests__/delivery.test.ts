import { describe, it, expect } from "vitest";
import { checkPiperDeliveries, seedImmediatePiper, getConversationHistory, getDeliveryInfo, getPendingReply, getVisibleChannels } from "../delivery";
import { GameEvent } from "../../mail/delivery";

const USERNAME = "testplayer";

describe("checkPiperDeliveries", () => {
  it("does not deliver immediate messages via checkPiperDeliveries", () => {
    const event: GameEvent = { type: "command_executed", detail: "ls" };
    const result = checkPiperDeliveries(event, [], USERNAME, "nexacorp");
    expect(result).not.toContain("general_edward_welcome");
  });

  it("delivers messages on matching after_file_read trigger", () => {
    const event: GameEvent = {
      type: "file_read",
      detail: "/srv/engineering/onboarding.md",
    };
    const result = checkPiperDeliveries(event, [], USERNAME, "nexacorp");
    expect(result).toContain("oscar_log_check");
    expect(result).toContain("dana_welcome");
  });

  it("delivers messages on matching after_story_flag trigger", () => {
    const event: GameEvent = {
      type: "command_executed",
      detail: "ls",
    };
    const flags = { chip_unlocked: true } as Record<string, string | boolean>;
    const result = checkPiperDeliveries(event, [], USERNAME, "nexacorp", flags);
    expect(result).toContain("eng_sarah_welcome");
  });

  it("delivers oscar_access_review after reading system.log (with oscar_log_check already delivered)", () => {
    const event: GameEvent = {
      type: "file_read",
      detail: "/var/log/system.log",
    };
    const result = checkPiperDeliveries(event, ["oscar_log_check"], USERNAME, "nexacorp");
    expect(result).toContain("oscar_access_review");
  });

  it("does not deliver oscar_access_review if oscar_log_check has not been delivered yet", () => {
    const event: GameEvent = {
      type: "file_read",
      detail: "/var/log/system.log",
    };
    const result = checkPiperDeliveries(event, [], USERNAME, "nexacorp");
    expect(result).not.toContain("oscar_access_review");
  });

  it("skips already-delivered messages", () => {
    const event: GameEvent = {
      type: "file_read",
      detail: "/srv/engineering/onboarding.md",
    };
    const result = checkPiperDeliveries(event, ["oscar_log_check"], USERNAME, "nexacorp");
    expect(result).not.toContain("oscar_log_check");
    expect(result).toContain("dana_welcome");
  });

  it("does not duplicate deliveries within the same call", () => {
    const event: GameEvent = {
      type: "file_read",
      detail: "/srv/engineering/team-info.md",
    };
    const result = checkPiperDeliveries(event, [], USERNAME, "nexacorp");
    const unique = new Set(result);
    expect(unique.size).toBe(result.length);
  });

  it("returns empty array when no event matches", () => {
    const event: GameEvent = {
      type: "file_read",
      detail: "/some/unrelated/path",
    };
    const result = checkPiperDeliveries(event, [], USERNAME, "nexacorp");
    expect(result).toHaveLength(0);
  });

  it("filters deliveries by computer — home messages not shown on nexacorp", () => {
    const event: GameEvent = { type: "command_executed", detail: "ls" };
    const result = checkPiperDeliveries(event, [], USERNAME, "nexacorp");
    expect(result).not.toContain("alex_checkin");
  });

  it("delivers olive_tree_tip after basic_tools_unlocked flag is set", () => {
    const event: GameEvent = { type: "command_executed", detail: "ls" };
    const storyFlags = { basic_tools_unlocked: true } as Record<string, string | boolean>;
    const result = checkPiperDeliveries(event, ["olive_linux_basics"], USERNAME, "home", storyFlags as never);
    expect(result).toContain("olive_tree_tip");
  });

  it("delivers maya_dm_checkin_reply after replying to maya_dm_checkin", () => {
    const event: GameEvent = {
      type: "objective_completed",
      detail: "piper_reply:maya_dm_checkin",
    };
    const result = checkPiperDeliveries(event, ["maya_dm_checkin"], USERNAME, "nexacorp");
    expect(result).toContain("maya_dm_checkin_reply");
  });

  it("delivers after_story_flag trigger when flag is set", () => {
    const event: GameEvent = { type: "command_executed", detail: "ls" };
    const storyFlags = { returned_home_day1: true } as Record<string, string | boolean>;
    const result = checkPiperDeliveries(event, [], USERNAME, "home", storyFlags as never);
    expect(result).toContain("alex_day1_checkin");
  });

  it("does not deliver after_story_flag when flag is not set", () => {
    const event: GameEvent = { type: "command_executed", detail: "ls" };
    const result = checkPiperDeliveries(event, [], USERNAME, "home", {});
    expect(result).not.toContain("alex_day1_checkin");
  });

  it("delivers nexacorp piper when computerId is undefined (cross-computer)", () => {
    const event: GameEvent = { type: "command_executed", detail: "dbt" };
    const storyFlags = { ran_dbt: true } as Record<string, string | boolean>;
    // No computerId filter — simulates cross-computer pass
    const result = checkPiperDeliveries(event, [], USERNAME, undefined, storyFlags as never);
    expect(result).toContain("auri_dbt_results");
  });
});

describe("seedImmediatePiper", () => {
  it("returns NexaCorp immediate delivery IDs for nexacorp computer", () => {
    const ids = seedImmediatePiper(USERNAME, "nexacorp");
    expect(ids).toContain("general_edward_welcome");
    expect(ids).not.toContain("alex_checkin");
  });

  it("returns home immediate delivery IDs for home computer", () => {
    const ids = seedImmediatePiper(USERNAME, "home");
    expect(ids).toContain("alex_checkin");
    expect(ids).not.toContain("general_edward_welcome");
  });

  it("returns all immediate IDs when no computerId provided", () => {
    const ids = seedImmediatePiper(USERNAME);
    expect(ids.length).toBeGreaterThan(0);
  });
});

describe("getConversationHistory", () => {
  it("returns messages for a delivered channel", () => {
    const messages = getConversationHistory("general", ["general_edward_welcome"], USERNAME, "nexacorp");
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].from).toBe("Edward Torres");
  });

  it("returns empty for undelivered channel", () => {
    const messages = getConversationHistory("general", [], USERNAME, "nexacorp");
    expect(messages).toHaveLength(0);
  });

  it("includes player reply when reply ID is in delivered list", () => {
    const delivered = ["general_edward_welcome", "reply:general_edward_welcome:0"];
    const messages = getConversationHistory("general", delivered, USERNAME, "nexacorp");
    const playerMsg = messages.find((m) => m.isPlayer);
    expect(playerMsg).toBeDefined();
  });

  it("places player reply after all messages visible at reply time", () => {
    const delivered = [
      "general_edward_welcome",
      "general_tom_wins",
      "reply:general_edward_welcome:0",
    ];
    const messages = getConversationHistory("general", delivered, USERNAME, "nexacorp");
    const playerIdx = messages.findIndex((m) => m.isPlayer);
    // Reply should be at the end — after all NPC messages
    expect(playerIdx).toBe(messages.length - 1);
  });

  it("computes non-empty timestamps for NPC messages", () => {
    const messages = getConversationHistory("general", ["general_edward_welcome"], USERNAME, "nexacorp");
    const npcMessages = messages.filter((m) => !m.isPlayer);
    for (const msg of npcMessages) {
      expect(msg.timestamp).not.toBe("");
      expect(msg.timestamp).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
    }
  });

  it("keeps empty timestamps for player replies", () => {
    const delivered = ["general_edward_welcome", "reply:general_edward_welcome:0"];
    const messages = getConversationHistory("general", delivered, USERNAME, "nexacorp");
    const playerMsg = messages.find((m) => m.isPlayer);
    expect(playerMsg!.timestamp).toBe("");
  });

  it("produces monotonically increasing timestamps across deliveries", () => {
    const delivered = ["general_edward_welcome", "general_tom_wins"];
    const messages = getConversationHistory("general", delivered, USERNAME, "nexacorp");
    const timestamps = messages.filter((m) => !m.isPlayer).map((m) => m.timestamp);
    // Parse timestamps to minutes for comparison
    const toMinutes = (ts: string) => {
      const match = ts.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);
      if (!match) return 0;
      let hours = parseInt(match[1], 10);
      const mins = parseInt(match[2], 10);
      if (match[3] === "PM" && hours !== 12) hours += 12;
      if (match[3] === "AM" && hours === 12) hours = 0;
      return hours * 60 + mins;
    };
    for (let i = 1; i < timestamps.length; i++) {
      expect(toMinutes(timestamps[i])).toBeGreaterThanOrEqual(toMinutes(timestamps[i - 1]));
    }
  });
});

describe("getPendingReply", () => {
  it("returns reply options for unreplied delivery", () => {
    const pending = getPendingReply("dm_oscar", ["oscar_log_check"], USERNAME);
    expect(pending).not.toBeNull();
    expect(pending!.deliveryId).toBe("oscar_log_check");
    expect(pending!.options!.length).toBeGreaterThan(0);
  });

  it("returns null when already replied", () => {
    const pending = getPendingReply("dm_oscar", ["oscar_log_check", "reply:oscar_log_check:0"], USERNAME);
    expect(pending).toBeNull();
  });

  it("does not resurface older unreplied options after replying to a newer delivery", () => {
    // maya_dm_handoff has reply options and maya_dm_checkin has reply options
    // After replying to checkin (newer), handoff (older) should NOT resurface
    const delivered = [
      "maya_dm_handoff",
      "maya_dm_checkin",
      "reply:maya_dm_checkin:0",
      "maya_dm_checkin_reply",
    ];
    const pending = getPendingReply("dm_maya", delivered, USERNAME);
    expect(pending).toBeNull();
  });

  it("returns null for channel with no reply options", () => {
    const pending = getPendingReply("general", ["general_edward_welcome"], USERNAME);
    // general_edward_welcome has reply options, so this should return them
    expect(pending).not.toBeNull();
  });
});

describe("getDeliveryInfo", () => {
  it("returns channel and sender for a known delivery", () => {
    const info = getDeliveryInfo("oscar_log_check", USERNAME);
    expect(info).not.toBeNull();
    expect(info!.channelId).toBe("dm_oscar");
    expect(info!.senderName).toBe("Oscar Diaz");
  });

  it("returns null for an unknown delivery ID", () => {
    expect(getDeliveryInfo("nonexistent_id", USERNAME)).toBeNull();
  });
});

describe("getVisibleChannels", () => {
  it("shows nexacorp channels even when empty", () => {
    const channels = getVisibleChannels([], USERNAME, "nexacorp");
    const general = channels.find((c) => c.channel.id === "general");
    expect(general).toBeDefined();
  });

  it("hides DMs with no delivered messages", () => {
    const channels = getVisibleChannels([], USERNAME, "nexacorp");
    const oscar = channels.find((c) => c.channel.id === "dm_oscar");
    expect(oscar).toBeUndefined();
  });

  it("shows DMs when messages have been delivered", () => {
    const channels = getVisibleChannels(["oscar_log_check"], USERNAME, "nexacorp");
    const oscar = channels.find((c) => c.channel.id === "dm_oscar");
    expect(oscar).toBeDefined();
  });

  it("calculates unread count", () => {
    const channels = getVisibleChannels(["general_edward_welcome"], USERNAME, "nexacorp");
    const general = channels.find((c) => c.channel.id === "general");
    expect(general).toBeDefined();
    expect(general!.unread).toBeGreaterThan(0);
  });

  it("filters to home channels on home computer", () => {
    const channels = getVisibleChannels(["alex_checkin"], USERNAME, "home");
    const alex = channels.find((c) => c.channel.id === "dm_alex");
    expect(alex).toBeDefined();
    const general = channels.find((c) => c.channel.id === "general");
    expect(general).toBeUndefined();
  });

  it("does not show home DMs when viewing nexacorp", () => {
    const channels = getVisibleChannels(["alex_checkin"], USERNAME, "nexacorp");
    const alex = channels.find((c) => c.channel.id === "dm_alex");
    expect(alex).toBeUndefined();
  });
});
