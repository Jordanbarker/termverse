import { describe, it, expect } from "vitest";
import { execute } from "../registry";
import { CommandContext } from "../types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";

import "../builtins";

const root: DirectoryNode = {
  type: "directory",
  name: "/",
  permissions: "rwxr-xr-x",
  hidden: false,
  children: {},
};

function ctx(overrides?: Partial<CommandContext>): CommandContext {
  const fs = new VirtualFS(root);
  const { storyFlags, ...rest } = overrides ?? {};
  return {
    fs,
    cwd: "/",
    homeDir: "/",
    username: "ren",
    activeComputer: "home",
    storyFlags: { ...storyFlags },
    ...rest,
  };
}

/** Context for the scripted end-of-Day-1 questline shutdown. */
function day1Ctx(overrides?: Partial<CommandContext>) {
  const { storyFlags, ...rest } = overrides ?? {};
  return ctx({ storyFlags: { returned_home_day1: true, ...storyFlags }, ...rest });
}

describe("shutdown", () => {
  it("Day 1: bare shutdown emits gameAction with 60s countdown lines", () => {
    const result = execute("shutdown", [], {}, day1Ctx());
    expect(result.gameAction).toEqual({ type: "shutdown" });
    expect(result.incrementalLines?.some((l) => l.text.includes("1 minute"))).toBe(true);
  });

  it("Day 1: shutdown -h now skips the countdown", () => {
    const result = execute("shutdown", ["now"], { h: true }, day1Ctx());
    expect(result.gameAction).toEqual({ type: "shutdown" });
    expect(result.incrementalLines?.some((l) => l.text.includes("1 minute"))).toBe(false);
  });

  it("early game: home shutdown before returned_home_day1 is a cosmetic reboot", () => {
    const result = execute("shutdown", ["now"], { h: true }, ctx());
    expect(result.gameAction).toEqual({ type: "reboot" });
    expect(result.transitionTo).toBeUndefined();
  });

  it("mid Day 2: home shutdown between day1_shutdown and the debrief is a cosmetic reboot", () => {
    const result = execute(
      "shutdown",
      [],
      {},
      day1Ctx({ storyFlags: { day1_shutdown: true } })
    );
    expect(result.gameAction).toEqual({ type: "reboot" });
  });

  it("post-debrief: shutdown takes the endgame branch and emits gameAction", () => {
    const result = execute(
      "shutdown",
      [],
      {},
      day1Ctx({ storyFlags: { day1_shutdown: true, read_board_debrief_day2: true } })
    );
    expect(result.gameAction).toEqual({ type: "shutdown" });
  });

  it("post-debrief: bare shutdown skips the 60s countdown (no one else to broadcast to)", () => {
    const result = execute(
      "shutdown",
      [],
      {},
      day1Ctx({ storyFlags: { day1_shutdown: true, read_board_debrief_day2: true } })
    );
    expect(result.incrementalLines?.some((l) => l.text.includes("1 minute"))).toBe(false);
  });

  it("post-debrief: shutdown -h now still works", () => {
    const result = execute(
      "shutdown",
      ["now"],
      { h: true },
      day1Ctx({ storyFlags: { day1_shutdown: true, read_board_debrief_day2: true } })
    );
    expect(result.gameAction).toEqual({ type: "shutdown" });
  });

  it("nexacorp: shutdown drops the SSH session back home", () => {
    const result = execute("shutdown", ["now"], { h: true }, ctx({ activeComputer: "nexacorp" }));
    expect(result.gameAction).toBeUndefined();
    expect(result.transitionTo).toBe("home");
    expect(result.triggerEvents).toBeUndefined();
    expect(result.closeTabsForComputer).toBe("nexacorp");
    expect(
      result.incrementalLines?.some((l) =>
        l.text.includes("Connection to nexacorp-ws01 closed by remote host")
      )
    ).toBe(true);
  });

  it("nexacorp: bare shutdown broadcasts a 1-minute countdown", () => {
    const result = execute("shutdown", [], {}, ctx({ activeComputer: "nexacorp" }));
    expect(result.transitionTo).toBe("home");
    expect(result.incrementalLines?.some((l) => l.text.includes("1 minute"))).toBe(true);
  });

  it("nexacorp post-accusation: shutdown wraps Day 2 like exit does", () => {
    const result = execute(
      "shutdown",
      ["now"],
      { h: true },
      ctx({ activeComputer: "nexacorp", storyFlags: { accusation_made: true } })
    );
    expect(result.transitionTo).toBe("home");
    expect(result.triggerEvents).toEqual([
      { type: "command_executed", detail: "exit_day2_logoff" },
    ]);
  });

  it("coder workspaces: shutdown returns to nexacorp", () => {
    for (const computer of ["devcontainer", "chipinfra"] as const) {
      const result = execute("shutdown", ["now"], { h: true }, ctx({ activeComputer: computer }));
      expect(result.transitionTo).toBe("nexacorp");
      expect(result.gameAction).toBeUndefined();
      expect(result.closeTabsForComputer).toBe(computer);
    }
  });

  it("erik-pc: shutdown returns to chipinfra", () => {
    const result = execute("shutdown", ["now"], { h: true }, ctx({ activeComputer: "erik-pc" }));
    expect(result.transitionTo).toBe("chipinfra");
    expect(result.closeTabsForComputer).toBe("erik-pc");
    expect(
      result.incrementalLines?.some((l) =>
        l.text.includes("Connection to nexacorp-lt05 closed by remote host")
      )
    ).toBe(true);
  });

  it("rejects unknown argument forms", () => {
    const result = execute("shutdown", ["now"], {}, ctx());
    expect(result.output).toContain("Usage");
    expect(result.gameAction).toBeUndefined();
    expect(result.transitionTo).toBeUndefined();
  });
});
