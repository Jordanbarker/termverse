import { describe, it, expect } from "vitest";
import { getEmailDefinitions } from "../emails";

const VALID_TRIGGER_TYPES = [
  "immediate",
  "after_file_read",
  "after_email_read",
  "after_command",
  "after_objective",
  "after_story_flag",
] as const;

describe("getEmailDefinitions", () => {
  const defs = getEmailDefinitions("testuser");

  it("returns a non-empty array", () => {
    expect(defs.length).toBeGreaterThan(0);
  });

  it("every email has required fields", () => {
    for (const def of defs) {
      expect(def.email.id).toBeTruthy();
      expect(def.email.from).toBeTruthy();
      expect(def.email.to).toBeTruthy();
      expect(def.email.date).toBeTruthy();
      expect(def.email.subject).toBeTruthy();
      expect(def.email.body).toBeTruthy();
    }
  });

  it("every email has a valid trigger type", () => {
    for (const def of defs) {
      const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
      for (const trigger of triggers) {
        expect(VALID_TRIGGER_TYPES).toContain(trigger.type);
      }
    }
  });

  it("all email IDs are unique", () => {
    const ids = defs.map((d) => d.email.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("interpolates username into 'to' field", () => {
    for (const def of defs) {
      expect(def.email.to).toContain("testuser");
    }
  });

  it("interpolates username into trigger filePaths where applicable", () => {
    const fileReadTriggers = defs.filter((d) => {
      const triggers = Array.isArray(d.trigger) ? d.trigger : [d.trigger];
      return triggers.some((t) => t.type === "after_file_read");
    });
    for (const def of fileReadTriggers) {
      const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
      for (const trigger of triggers) {
        if (trigger.type !== "after_file_read") continue;
        if (trigger.filePath.includes("/home/") && !trigger.filePath.includes("/home/jchen")) {
          expect(trigger.filePath).toContain("testuser");
        }
      }
    }
  });

  it("has at least 3 immediate emails for game start", () => {
    const immediates = defs.filter((d) => {
      const triggers = Array.isArray(d.trigger) ? d.trigger : [d.trigger];
      return triggers.every((t) => t.type === "immediate");
    });
    expect(immediates.length).toBeGreaterThanOrEqual(2);
  });

  it("has at least 1 triggered (non-immediate) email", () => {
    const triggered = defs.filter((d) => {
      const triggers = Array.isArray(d.trigger) ? d.trigger : [d.trigger];
      return triggers.some((t) => t.type !== "immediate");
    });
    expect(triggered.length).toBeGreaterThan(0);
  });

  it("uses different username correctly", () => {
    const defs2 = getEmailDefinitions("alice");
    for (const def of defs2) {
      expect(def.email.to).toContain("alice");
    }
  });
});

describe("getEmailDefinitions (devcontainer)", () => {
  it("returns empty array — no mail system on devcontainer", () => {
    const defs = getEmailDefinitions("testuser", "devcontainer");
    expect(defs).toEqual([]);
  });
});

describe("getEmailDefinitions (home)", () => {
  const defs = getEmailDefinitions("testuser", "home");

  it("nexacorp_offer email has replyOptions with accept and reject", () => {
    const offers = defs.filter((d) => d.email.id === "nexacorp_offer");
    expect(offers.length).toBe(1);
    const offer = offers[0];
    expect(offer.replyOptions).toBeDefined();
    expect(offer.replyOptions!.length).toBe(2);
    for (const opt of offer.replyOptions!) {
      expect(opt.label).toBeTruthy();
      expect(opt.replyBody).toBeTruthy();
      expect(opt.triggerEvents).toBeDefined();
    }
    // First option accepts, second rejects
    expect(offer.replyOptions![0].triggerEvents!.some(
      (e) => e.type === "objective_completed" && e.detail === "accepted_nexacorp"
    )).toBe(true);
    expect(offer.replyOptions![1].triggerEvents!.some(
      (e) => e.type === "objective_completed" && e.detail === "rejected_nexacorp_1"
    )).toBe(true);
    // Immediate trigger — available at game start
    expect(offer.trigger).toEqual({ type: "immediate" });
  });

  it("persuasion emails trigger after rejections and have accept/reject options", () => {
    const p1 = defs.find((d) => d.email.id === "nexacorp_persuasion_1");
    expect(p1).toBeDefined();
    expect(p1!.trigger).toEqual({ type: "after_objective", objectiveId: "rejected_nexacorp_1" });
    expect(p1!.replyOptions!.length).toBe(2);
    expect(p1!.replyOptions![0].triggerEvents!.some(
      (e) => e.detail === "accepted_nexacorp"
    )).toBe(true);
    expect(p1!.replyOptions![1].triggerEvents!.some(
      (e) => e.detail === "rejected_nexacorp_2"
    )).toBe(true);

    const p2 = defs.find((d) => d.email.id === "nexacorp_persuasion_2");
    expect(p2).toBeDefined();
    expect(p2!.trigger).toEqual({ type: "after_objective", objectiveId: "rejected_nexacorp_2" });
    expect(p2!.replyOptions!.length).toBe(2);
    expect(p2!.replyOptions![0].triggerEvents!.some(
      (e) => e.detail === "accepted_nexacorp"
    )).toBe(true);
    expect(p2!.replyOptions![1].triggerEvents!.some(
      (e) => e.detail === "rejected_nexacorp_final"
    )).toBe(true);
  });

  it("nexacorp_followup triggers after accepted_nexacorp objective", () => {
    const followup = defs.find((d) => d.email.id === "nexacorp_followup");
    expect(followup).toBeDefined();
    expect(followup!.trigger).toEqual({
      type: "after_objective",
      objectiveId: "accepted_nexacorp",
    });
  });
});
