import { describe, it, expect } from "vitest";
import { checkEmailDeliveries, GameEvent } from "../delivery";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { createNexacorpFilesystem } from "../../../story/filesystem/nexacorp";
import { createHomeFilesystem } from "../../../story/filesystem/home";
import { StoryFlags } from "../../../state/types";

const USERNAME = "testplayer";

function makeFS(): VirtualFS {
  const root = createNexacorpFilesystem(USERNAME);
  return new VirtualFS(root, `/home/${USERNAME}`, `/home/${USERNAME}`);
}

function makeHomeFS(): VirtualFS {
  const root = createHomeFilesystem(USERNAME);
  return new VirtualFS(root, `/home/${USERNAME}`, `/home/${USERNAME}`);
}

describe("checkEmailDeliveries", () => {
  it("delivers email on matching after_file_read trigger", () => {
    const fs = makeFS();
    const event: GameEvent = {
      type: "file_read",
      detail: "/srv/engineering/chen-handoff/notes.txt",
    };

    const { newDeliveries } = checkEmailDeliveries(fs, event, []);
    expect(newDeliveries).toContain("edward_paranoid");
  });

  it("does not deliver immediate emails", () => {
    const fs = makeFS();
    // Even with a generic event, immediate emails should never be delivered
    const event: GameEvent = { type: "command_executed", detail: "ls" };
    const { newDeliveries } = checkEmailDeliveries(fs, event, []);
    expect(newDeliveries).not.toContain("welcome_edward");
    expect(newDeliveries).not.toContain("it_provisioned");
    expect(newDeliveries).not.toContain("chip_intro");
  });

  it("skips already-delivered emails", () => {
    const fs = makeFS();
    const event: GameEvent = {
      type: "file_read",
      detail: "/srv/engineering/chen-handoff/notes.txt",
    };

    const { newDeliveries } = checkEmailDeliveries(fs, event, ["edward_paranoid"]);
    expect(newDeliveries).not.toContain("edward_paranoid");
  });

  it("delivers email on matching after_command trigger", () => {
    const fs = makeFS();
    // No current emails have after_command triggers, but we still verify
    // the function handles command events without crashing
    const event: GameEvent = { type: "command_executed", detail: "ls" };
    const { newDeliveries } = checkEmailDeliveries(fs, event, []);
    // Should not deliver anything since no email has an after_command trigger for "ls"
    expect(newDeliveries).toHaveLength(0);
  });

  it("delivers email on matching after_objective trigger", () => {
    const fs = makeFS();
    const event: GameEvent = {
      type: "objective_completed",
      detail: "some_objective",
    };
    const { newDeliveries } = checkEmailDeliveries(fs, event, []);
    // No emails currently match this event
    expect(newDeliveries).toHaveLength(0);
  });

  it("delivers on after_file_read for handoff notes (edward_paranoid)", () => {
    const fs = makeFS();
    const event: GameEvent = {
      type: "file_read",
      detail: `/srv/engineering/chen-handoff/notes.txt`,
    };

    const { newDeliveries } = checkEmailDeliveries(fs, event, []);
    expect(newDeliveries).toContain("edward_paranoid");
  });

  it("returns updated filesystem with new email files", () => {
    const fs = makeFS();
    const event: GameEvent = {
      type: "file_read",
      detail: "/srv/engineering/chen-handoff/notes.txt",
    };

    const { fs: newFs, newDeliveries } = checkEmailDeliveries(fs, event, []);
    expect(newDeliveries.length).toBeGreaterThan(0);
    // The new FS should be different from the original (new mail files added)
    expect(newFs).not.toBe(fs);
  });

  it("does not duplicate deliveries within the same call", () => {
    const fs = makeFS();
    const event: GameEvent = {
      type: "file_read",
      detail: "/srv/engineering/chen-handoff/notes.txt",
    };

    const { newDeliveries } = checkEmailDeliveries(fs, event, []);
    const uniqueIds = new Set(newDeliveries);
    expect(uniqueIds.size).toBe(newDeliveries.length);
  });

  it("calculates correct sequence numbers from existing mail", () => {
    const fs = makeFS();
    // The initial FS has 2 immediate emails (seq 1, 2)
    const event: GameEvent = {
      type: "file_read",
      detail: "/srv/engineering/chen-handoff/notes.txt",
    };

    const { fs: newFs } = checkEmailDeliveries(fs, event, []);
    // Verify new email was written (seq 3 based on 2 existing immediate emails)
    const newNode = newFs.getNode(`/var/mail/${USERNAME}/new`);
    expect(newNode).toBeDefined();
    if (newNode && newNode.type === "directory") {
      const filenames = Object.keys(newNode.children);
      const hasSeq3 = filenames.some((f) => f.startsWith("003_"));
      expect(hasSeq3).toBe(true);
    }
  });

  it("returns empty array when no event matches", () => {
    const fs = makeFS();
    const event: GameEvent = {
      type: "file_read",
      detail: "/some/unrelated/file.txt",
    };

    const { newDeliveries, fs: newFs } = checkEmailDeliveries(fs, event, []);
    expect(newDeliveries).toHaveLength(0);
    expect(newFs).toBe(fs);
  });

  describe("hr_security_freeze (Erik-PC tracks-exposed branch)", () => {
    // Day-2 home-arrival event mirrors what runExitToHome dispatches.
    const headHomeEvent: GameEvent = { type: "objective_completed", detail: "head_home" };

    it("delivers when pivoted_to_erik_pc + tracks_exposed_chapter4 are both set", () => {
      const flags: StoryFlags = {
        returned_home_day2: true,
        accusation_made: true,
        pivoted_to_erik_pc: true,
        tracks_exposed_chapter4: true,
      };
      const { newDeliveries } = checkEmailDeliveries(makeHomeFS(), headHomeEvent, [], "home", flags);
      expect(newDeliveries).toContain("hr_security_freeze");
    });

    it("does NOT deliver when tracks were scrubbed (tracks_exposed_chapter4 false)", () => {
      const flags: StoryFlags = {
        returned_home_day2: true,
        accusation_made: true,
        pivoted_to_erik_pc: true,
        // tracks_exposed_chapter4 omitted → falsy
      };
      const { newDeliveries } = checkEmailDeliveries(makeHomeFS(), headHomeEvent, [], "home", flags);
      expect(newDeliveries).not.toContain("hr_security_freeze");
    });

    it("does NOT deliver when player skipped Act 5 (pivoted_to_erik_pc false)", () => {
      const flags: StoryFlags = {
        returned_home_day2: true,
        accusation_made: true,
        // pivoted_to_erik_pc + tracks_exposed_chapter4 both omitted
      };
      const { newDeliveries } = checkEmailDeliveries(makeHomeFS(), headHomeEvent, [], "home", flags);
      expect(newDeliveries).not.toContain("hr_security_freeze");
    });
  });
});
