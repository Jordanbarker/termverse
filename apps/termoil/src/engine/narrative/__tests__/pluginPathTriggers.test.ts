import { describe, it, expect } from "vitest";
import { checkStoryFlagTriggers } from "../storyFlags";
import { getChipinfraStoryFlagTriggers } from "../../../story/storyFlags";
import { GameEvent } from "../../mail/delivery";
import { StoryFlags } from "../../../state/types";

const username = "ren";

function fireFlags(event: GameEvent, flags: StoryFlags): string[] {
  const triggers = getChipinfraStoryFlagTriggers(username);
  return checkStoryFlagTriggers(event, triggers, flags).map((r) => r.flag);
}

// The plugin quest detection uses pathPrefix + pathSuffix so the player can
// pick any plugin name (e.g. meeting-notes/, pr-summary/) and still credit the
// quest, mirroring the seeded /opt/chip/plugins/<plugin-name>/ convention.
describe("chip plugin path triggers — player picks the plugin name", () => {
  it("fires created_chip_plugin_dir for any new dir under /opt/chip/plugins/", () => {
    const event: GameEvent = { type: "directory_created", detail: "/opt/chip/plugins/meeting-notes" };
    expect(fireFlags(event, {})).toContain("created_chip_plugin_dir");
  });

  it("fires wrote_plugin_manifest for plugin.json under any chosen plugin name", () => {
    const event: GameEvent = { type: "file_created", detail: "/opt/chip/plugins/pr-summary/plugin.json" };
    expect(fireFlags(event, {})).toContain("wrote_plugin_manifest");
  });

  it("fires wrote_plugin_skill for SKILL.md under any chosen plugin name", () => {
    const event: GameEvent = { type: "file_created", detail: "/opt/chip/plugins/standup-recap/SKILL.md" };
    expect(fireFlags(event, {})).toContain("wrote_plugin_skill");
  });

  it("fires registered_chip_plugin when registry.json is modified", () => {
    const event: GameEvent = { type: "file_modified", detail: "/opt/chip/plugins/registry.json" };
    expect(fireFlags(event, {})).toContain("registered_chip_plugin");
  });

  it("does NOT fire wrote_plugin_manifest when registry.json is created (suffix mismatch)", () => {
    // Even if registry.json were emitted as file_created, it would not match
    // the /plugin.json suffix — guards against crediting the wrong objective.
    const event: GameEvent = { type: "file_created", detail: "/opt/chip/plugins/registry.json" };
    expect(fireFlags(event, {})).not.toContain("wrote_plugin_manifest");
  });

  it("does NOT fire wrote_plugin_manifest for a stray top-level file under plugins/", () => {
    // /opt/chip/plugins/myplugin.json ends in `myplugin.json` not `/plugin.json`
    const event: GameEvent = { type: "file_created", detail: "/opt/chip/plugins/myplugin.json" };
    expect(fireFlags(event, {})).not.toContain("wrote_plugin_manifest");
  });

  it("does NOT fire wrote_plugin_skill for the wrong-cased filename", () => {
    const event: GameEvent = { type: "file_created", detail: "/opt/chip/plugins/meeting-notes/Skill.md" };
    expect(fireFlags(event, {})).not.toContain("wrote_plugin_skill");
  });

  it("does NOT fire wrote_plugin_manifest for plugin.json outside the plugins tree", () => {
    const event: GameEvent = { type: "file_created", detail: "/home/ren/plugin.json" };
    expect(fireFlags(event, {})).not.toContain("wrote_plugin_manifest");
  });

  it("does NOT re-fire created_chip_plugin_dir once already set", () => {
    const event: GameEvent = { type: "directory_created", detail: "/opt/chip/plugins/another-name" };
    expect(fireFlags(event, { created_chip_plugin_dir: true })).not.toContain("created_chip_plugin_dir");
  });
});

// Regression: pathSuffix is a new field; existing pathPrefix-only and exact-path
// triggers must keep working.
describe("trigger matcher — preserves existing behavior", () => {
  it("pathPrefix-only still fires (read_plugin_template)", () => {
    const event: GameEvent = { type: "file_read", detail: "/opt/chip/plugins/ticket-triage/SKILL.md" };
    expect(fireFlags(event, {})).toContain("read_plugin_template");
  });

  it("exact path still fires (registered_chip_plugin)", () => {
    const event: GameEvent = { type: "file_modified", detail: "/opt/chip/plugins/registry.json" };
    expect(fireFlags(event, {})).toContain("registered_chip_plugin");
  });

  it("exact path does not fire on a near-miss", () => {
    const event: GameEvent = { type: "file_modified", detail: "/opt/chip/plugins/registry.json.bak" };
    expect(fireFlags(event, {})).not.toContain("registered_chip_plugin");
  });
});
