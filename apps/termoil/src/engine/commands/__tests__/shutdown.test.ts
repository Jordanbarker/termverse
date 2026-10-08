import { describe, it, expect } from "vitest";
import { execute } from "@tt/core/commands/registry";
import { CommandContext } from "@tt/core/commands/types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";
import { computeEffects } from "@tt/core/commands/applyResult";
import { processDeliveries } from "../processDeliveries";

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
  it("Day 1: bare shutdown schedules poweroff and leaves the shell usable", () => {
    const result = execute("shutdown", [], {}, day1Ctx());
    expect(result.gameAction).toBeUndefined();
    expect(result.incrementalLines).toBeUndefined();
    expect(result.output).toContain("1 minute");
    expect(result.deferredCommands).toEqual([
      { type: "schedule", command: "shutdown", args: ["now"], flags: { h: true }, delayMs: 60000 },
    ]);
  });

  it("Day 1: shutdown -h now skips the countdown", () => {
    const result = execute("shutdown", ["now"], { h: true }, day1Ctx());
    expect(result.gameAction).toEqual({ type: "shutdown" });
    expect(result.incrementalLines?.some((l) => l.text.includes("1 minute"))).toBe(false);
  });

  it("help lists shutdown before day1_shutdown and hides it after", () => {
    const before = execute("help", [], {}, ctx());
    expect(before.output).toContain("shutdown");

    const after = execute("help", [], {}, ctx({ storyFlags: { day1_shutdown: true } }));
    expect(after.output).not.toContain("shutdown");
  });

  it("early game: home shutdown before returned_home_day1 is a cosmetic reboot", () => {
    const result = execute("shutdown", ["now"], { h: true }, ctx());
    expect(result.gameAction).toEqual({ type: "reboot" });
    expect(result.transitionTo).toBeUndefined();
  });

  it("mid Day 2: home shutdown between day1_shutdown and the debrief is a cosmetic reboot", () => {
    const result = execute(
      "shutdown",
      ["now"],
      { h: true },
      day1Ctx({ storyFlags: { day1_shutdown: true } })
    );
    expect(result.gameAction).toEqual({ type: "reboot" });
  });

  it("post-debrief: shutdown takes the endgame branch and emits gameAction", () => {
    const result = execute(
      "shutdown",
      ["now"],
      { h: true },
      day1Ctx({ storyFlags: { day1_shutdown: true, read_board_debrief_day2: true } })
    );
    expect(result.gameAction).toEqual({ type: "shutdown" });
  });

  it("post-debrief: bare shutdown still schedules the normal one-minute delay", () => {
    const result = execute(
      "shutdown",
      [],
      {},
      day1Ctx({ storyFlags: { day1_shutdown: true, read_board_debrief_day2: true } })
    );
    expect(result.output).toContain("1 minute");
    expect(result.gameAction).toBeUndefined();
    expect(result.deferredCommands?.[0].type).toBe("schedule");
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
    expect(result.transitionTo).toBeUndefined();
    expect(result.closeTabsForComputer).toBeUndefined();
    expect(result.output).toContain("root@nexacorp-ws01");
    expect(result.output).toContain("1 minute");
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
    const result = execute("shutdown", ["later"], {}, ctx());
    expect(result.stderr).toContain("Usage");
    expect(result.exitCode).toBe(2);
    expect(result.gameAction).toBeUndefined();
    expect(result.transitionTo).toBeUndefined();
  });

  it("accepts shutdown now without -h", () => {
    expect(execute("shutdown", ["now"], {}, day1Ctx()).gameAction).toEqual({ type: "shutdown" });
  });

  it("cancels the machine's pending shutdown", () => {
    const result = execute("shutdown", [], { c: true }, day1Ctx({ pendingCommands: ["shutdown"] }));
    expect(result.deferredCommands).toEqual([{ type: "cancel", command: "shutdown" }]);
    expect(result.output).toContain("cancelled");
    expect(result.gameAction).toBeUndefined();
  });

  it("does not replace an already scheduled shutdown", () => {
    const result = execute("shutdown", [], {}, ctx({ pendingCommands: ["shutdown"] }));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("already scheduled");
    expect(result.deferredCommands).toBeUndefined();
  });

  it.each<{ name: string; flags: Record<string, boolean>; pendingCommands: string[] }>([
    { name: "scheduling", flags: {}, pendingCommands: [] },
    { name: "cancelling", flags: { c: true }, pendingCommands: ["shutdown"] },
    { name: "duplicate requests", flags: {}, pendingCommands: ["shutdown"] },
  ])("$name cannot advance the story", ({ flags, pendingCommands }) => {
    const args: string[] = [];
    const context = day1Ctx({ pendingCommands });
    const result = execute("shutdown", args, flags, context);
    const effects = computeEffects(result, {
      parsedCommand: "shutdown", parsedArgs: args, cwd: context.cwd, homeDir: context.homeDir,
      activeComputer: "home", username: context.username, fs: context.fs,
      storyFlags: context.storyFlags!, deliveredEmailIds: [], deliveredPiperIds: [], processDeliveries,
    });
    expect(effects.suppressPrompt).toBe(false);
    expect(effects.events).toEqual([]);
    expect(effects.storyFlagUpdates).toEqual([]);
    expect(effects.newDeliveredEmailIds).toEqual([]);
    expect(effects.newDeliveredPiperIds).toEqual([]);
  });

  it("immediate poweroff emits the Day-1 completion event", () => {
    const context = day1Ctx();
    const effects = computeEffects(execute("shutdown", ["now"], {}, context), {
      parsedCommand: "shutdown", parsedArgs: ["now"], cwd: context.cwd, homeDir: context.homeDir,
      activeComputer: "home", username: context.username, fs: context.fs,
      storyFlags: context.storyFlags!, deliveredEmailIds: [], deliveredPiperIds: [], processDeliveries,
    });
    expect(effects.events).toContainEqual({ type: "command_executed", detail: "shutdown" });
    expect(effects.storyFlagUpdates).toContainEqual(expect.objectContaining({ flag: "day1_shutdown", value: true }));
  });
});
