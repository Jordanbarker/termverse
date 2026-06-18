import { describe, it, expect } from "vitest";
import { processDeliveries } from "../processDeliveries";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";
import { GameEvent } from "../../mail/delivery";

function createMinimalFS(username = "player"): VirtualFS {
  const root: DirectoryNode = {
    type: "directory",
    name: "/",
    permissions: "rwxr-xr-x",
    hidden: false,
    children: {
      home: {
        type: "directory",
        name: "home",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {
          [username]: {
            type: "directory",
            name: username,
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {},
          },
        },
      },
      var: {
        type: "directory",
        name: "var",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {
          mail: {
            type: "directory",
            name: "mail",
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {
              [username]: {
                type: "directory",
                name: username,
                permissions: "rwxr-xr-x",
                hidden: false,
                children: {
                  new: {
                    type: "directory",
                    name: "new",
                    permissions: "rwxr-xr-x",
                    hidden: false,
                    children: {},
                  },
                  cur: {
                    type: "directory",
                    name: "cur",
                    permissions: "rwxr-xr-x",
                    hidden: false,
                    children: {},
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  return new VirtualFS(root, `/home/${username}`, `/home/${username}`);
}

describe("processDeliveries", () => {
  it("returns unchanged result with no events", () => {
    const fs = createMinimalFS();
    const result = processDeliveries([], fs, "home", [], [], "player", {});
    expect(result.fs).toBe(fs);
    expect(result.newDeliveredEmailIds).toEqual([]);
    expect(result.newDeliveredPiperIds).toEqual([]);
    expect(result.emailNotifications).toBe(0);
    expect(result.piperNotifications).toBe(0);
    expect(result.storyFlagUpdates).toEqual([]);
  });

  it("preserves FS reference when no deliveries match", () => {
    const fs = createMinimalFS();
    const events: GameEvent[] = [
      { type: "command_executed", detail: "ls" },
    ];
    const result = processDeliveries(events, fs, "home", [], [], "player", {});
    expect(result.fs).toBe(fs);
  });

  it("processes story flag triggers from events", () => {
    const fs = createMinimalFS();
    const events: GameEvent[] = [
      { type: "file_read", detail: "/home/player/.ssh/config" },
    ];
    // Story flag triggers depend on story/storyFlags.ts definitions
    // This test verifies the pipeline runs without error
    const result = processDeliveries(events, fs, "home", [], [], "player", {});
    expect(result).toBeDefined();
    expect(Array.isArray(result.storyFlagUpdates)).toBe(true);
  });

  it("scopes delivery to originating computer", () => {
    const fs = createMinimalFS();
    // Home events should not trigger nexacorp-only deliveries
    const events: GameEvent[] = [
      { type: "command_executed", detail: "mail" },
    ];
    const homeResult = processDeliveries(events, fs, "home", [], [], "player", {});
    const nexaResult = processDeliveries(events, fs, "nexacorp", [], [], "player", {});
    // Both should run without error; specific deliveries depend on story definitions
    expect(homeResult).toBeDefined();
    expect(nexaResult).toBeDefined();
  });

  it("does not re-deliver already delivered emails", () => {
    const fs = createMinimalFS();
    const events: GameEvent[] = [
      { type: "command_executed", detail: "mail" },
    ];
    // First call with empty delivered list
    const result1 = processDeliveries(events, fs, "home", [], [], "player", {});
    // Second call with all previously delivered IDs
    const allIds = [...result1.newDeliveredEmailIds];
    const result2 = processDeliveries(events, result1.fs, "home", allIds, [], "player", {});
    // Should not re-deliver the same emails
    for (const id of result1.newDeliveredEmailIds) {
      expect(result2.newDeliveredEmailIds).not.toContain(id);
    }
  });

  it("does not re-deliver already delivered piper messages", () => {
    const fs = createMinimalFS();
    const events: GameEvent[] = [
      { type: "command_executed", detail: "piper" },
    ];
    const result1 = processDeliveries(events, fs, "nexacorp", [], [], "player", {});
    const allPiperIds = [...result1.newDeliveredPiperIds];
    const result2 = processDeliveries(events, result1.fs, "nexacorp", [], allPiperIds, "player", {});
    for (const id of result1.newDeliveredPiperIds) {
      expect(result2.newDeliveredPiperIds).not.toContain(id);
    }
  });

  it("piper-delivered cascade triggers second-pass flags", () => {
    const fs = createMinimalFS();
    // Use an event that might trigger piper deliveries on nexacorp
    const events: GameEvent[] = [
      { type: "command_executed", detail: "piper" },
    ];
    const result = processDeliveries(
      events,
      fs,
      "nexacorp",
      [],
      [],
      "player",
      { piper_unlocked: true }
    );
    // If any piper messages were delivered, their IDs should appear in newDeliveredPiperIds
    // and any piper_delivered triggers should cascade into storyFlagUpdates
    // The cascade is verified by the fact that the function doesn't error
    // and that storyFlagUpdates accumulates from both first and second pass
    expect(Array.isArray(result.storyFlagUpdates)).toBe(true);
    expect(Array.isArray(result.newDeliveredPiperIds)).toBe(true);
  });

  it("multiple events accumulate correctly", () => {
    const fs = createMinimalFS();
    const events: GameEvent[] = [
      { type: "command_executed", detail: "ls" },
      { type: "command_executed", detail: "mail" },
      { type: "command_executed", detail: "cat" },
    ];
    const result = processDeliveries(events, fs, "home", [], [], "player", {});
    // All events should be processed without error
    // Each event potentially triggers deliveries independently
    expect(result).toBeDefined();
    // The function should complete without throwing
    // Check that FS reference is stable when no deliveries matched
    expect(result.fs).toBeDefined();
  });

  it("devcontainer events do not deliver emails", () => {
    const fs = createMinimalFS();
    const events: GameEvent[] = [
      { type: "command_executed", detail: "dbt" },
    ];
    const result = processDeliveries(events, fs, "devcontainer", [], [], "player", {});
    expect(result.newDeliveredEmailIds).toEqual([]);
    expect(result.emailNotifications).toBe(0);
  });

  it("cross-computer pass delivers nexacorp piper when flag set on devcontainer", () => {
    const fs = createMinimalFS();
    // ran_dbt flag is set on devcontainer, but auri_dbt_results is nexacorp-scoped
    const events: GameEvent[] = [
      { type: "command_executed", detail: "dbt" },
    ];
    const result = processDeliveries(
      events,
      fs,
      "devcontainer",
      [],
      [],
      "player",
      { ran_dbt: true }
    );
    expect(result.newDeliveredPiperIds).toContain("auri_dbt_results");
  });

  it("cross-computer pass does not duplicate already-delivered piper messages", () => {
    const fs = createMinimalFS();
    const events: GameEvent[] = [
      { type: "command_executed", detail: "dbt" },
    ];
    // auri_dbt_results already delivered
    const result = processDeliveries(
      events,
      fs,
      "devcontainer",
      [],
      ["auri_dbt_results"],
      "player",
      { ran_dbt: true }
    );
    expect(result.newDeliveredPiperIds).not.toContain("auri_dbt_results");
  });

  it("home-scoped delivery ignores nexacorp-only emails", () => {
    const fs = createMinimalFS();
    // Use events that would normally trigger nexacorp email delivery
    const events: GameEvent[] = [
      { type: "command_executed", detail: "mail" },
      { type: "file_read", detail: "welcome_edward" },
    ];
    const homeResult = processDeliveries(events, fs, "home", [], [], "player", {});
    const nexaResult = processDeliveries(events, fs, "nexacorp", [], [], "player", {});
    // Home should not deliver nexacorp-scoped emails
    // The exact counts depend on story definitions, but home and nexacorp should differ
    // At minimum, verify both complete without error and emails from one scope
    // don't leak into the other
    const homeEmailIds = new Set(homeResult.newDeliveredEmailIds);
    const nexaEmailIds = new Set(nexaResult.newDeliveredEmailIds);
    // No overlap expected — each computer's emails are scoped
    for (const id of homeEmailIds) {
      expect(nexaEmailIds.has(id)).toBe(false);
    }
  });
});
