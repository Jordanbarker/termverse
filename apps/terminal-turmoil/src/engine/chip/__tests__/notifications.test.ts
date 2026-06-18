import { describe, it, expect } from "vitest";
import { findNewlyAvailableChipTopics } from "../notifications";
import { StoryFlags } from "../../../state/types";

describe("findNewlyAvailableChipTopics", () => {
  it("returns no IDs when no opt-in topics are unlocked", () => {
    const flags: StoryFlags = {};
    const result = findNewlyAvailableChipTopics(flags, "nexacorp", []);
    expect(result).toEqual([]);
  });

  it("returns review_access_log on nexacorp once processing_tools_unlocked flips", () => {
    const flags: StoryFlags = { processing_tools_unlocked: true };
    const result = findNewlyAvailableChipTopics(flags, "nexacorp", []);
    expect(result).toContain("review_access_log");
  });

  it("does not return the topic again once it has been notified", () => {
    const flags: StoryFlags = { processing_tools_unlocked: true };
    const result = findNewlyAvailableChipTopics(flags, "nexacorp", ["review_access_log"]);
    expect(result).not.toContain("review_access_log");
  });

  it("respects the computer gate (review_access_log is nexacorp-only)", () => {
    const flags: StoryFlags = { processing_tools_unlocked: true };
    expect(findNewlyAvailableChipTopics(flags, "home", [])).not.toContain("review_access_log");
    expect(findNewlyAvailableChipTopics(flags, "devcontainer", [])).not.toContain("review_access_log");
  });

  it("ignores items without notifyOnUnlock set, even when unlocked", () => {
    const flags: StoryFlags = { dbt_test_failed_day2: true };
    const result = findNewlyAvailableChipTopics(flags, "devcontainer", []);
    expect(result).not.toContain("null_sql_help");
  });

  it("does not re-fire after downstream gates suppress the item", () => {
    const flags: StoryFlags = { processing_tools_unlocked: true, oscar_access_completed: true };
    const result = findNewlyAvailableChipTopics(flags, "nexacorp", []);
    expect(result).not.toContain("review_access_log");
  });
});
