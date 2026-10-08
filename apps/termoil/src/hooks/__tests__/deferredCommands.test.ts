import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeferredCommands } from "../deferredCommands";
import { execute } from "@tt/core/commands/registry";
import { computeEffects } from "@tt/core/commands/applyResult";
import { runPipeline } from "@tt/core/commands/runPipeline";
import { parseChainedPipeline } from "@tt/core/commands/parser";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import type { CommandContext } from "@tt/core/commands/types";
import "../../engine/commands/builtins";

describe("machine-owned background shutdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const deferred = createDeferredCommands<string>();
    const fs = new VirtualFS({ type: "directory", name: "/", permissions: "rwxr-xr-x", hidden: false, children: {} });
    const ctx = (computer: string): CommandContext => ({
      fs, cwd: "/", homeDir: "/", username: "ren", activeComputer: computer,
      storyFlags: {}, pendingCommands: deferred.pending(computer),
    });
    const completed = vi.fn((computer: string, action: { command: string; args: string[]; flags: Record<string, boolean> }) =>
      execute(action.command, action.args, action.flags, ctx(computer)));
    const run = (computer: string, args: string[] = [], flags: Record<string, boolean> = {}) => {
      const result = execute("shutdown", args, flags, ctx(computer));
      for (const action of result.deferredCommands ?? []) deferred.apply(computer, action, (a) => completed(computer, a));
      return result;
    };
    return { deferred, ctx, completed, run, fs };
  }

  it("returns the shell immediately and powers off only after 60 seconds", () => {
    const { run, ctx, completed } = setup();
    run("home");
    expect(execute("echo", ["still working"], {}, ctx("home")).output).toContain("still working");
    vi.advanceTimersByTime(59999);
    expect(completed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(completed).toHaveBeenCalledOnce();
    expect(completed.mock.results[0].value.gameAction).toEqual({ type: "reboot" });
  });

  it("cancels from another shell on the same machine, without cancelling other machines", () => {
    const { run, deferred, completed } = setup();
    run("home");
    run("nexacorp");
    vi.advanceTimersByTime(45000);
    run("home", [], { c: true });
    expect(deferred.pending("home")).toEqual([]);
    vi.advanceTimersByTime(15000);
    expect(completed).toHaveBeenCalledOnce();
    expect(completed.mock.calls[0][0]).toBe("nexacorp");
    expect(completed.mock.results[0].value.closeTabsForComputer).toBe("nexacorp");
  });

  it("drops pending timers when a machine is removed or the game is reloaded", () => {
    const { run, deferred, completed } = setup();
    run("home");
    run("chipinfra");
    deferred.clear("chipinfra");
    expect(deferred.pending("home")).toEqual(["shutdown"]);
    deferred.clear();
    vi.advanceTimersByTime(60000);
    expect(completed).not.toHaveBeenCalled();
  });

  it("keeps chaining usable, including cancellation on the same submitted line", async () => {
    const { deferred, ctx, fs, completed } = setup();
    let text = "";
    const result = await runPipeline({
      chain: parseChainedPipeline("shutdown && echo working && shutdown -c"), fs, cwd: "/", homeDir: "/",
      buildContext: () => ctx("home"), write: (s) => { text += s; },
      applySegment: (result, parsed) => {
        const effects = computeEffects(result, {
          parsedCommand: parsed.command, parsedArgs: parsed.args, cwd: "/", homeDir: "/",
          activeComputer: "home", username: "ren", fs, storyFlags: {}, deliveredEmailIds: [], deliveredPiperIds: [],
        });
        text += effects.output;
        for (const action of effects.deferredCommands ?? []) deferred.apply("home", action, (a) => completed("home", a));
        return { earlyReturn: effects.suppressPrompt };
      },
    });
    expect(result.earlyReturn).toBe(false);
    expect(text).toContain("working");
    expect(text).toContain("cancelled");
    vi.advanceTimersByTime(60000);
    expect(completed).not.toHaveBeenCalled();
  });

  it("preserves a shutdown effect when its output is piped", async () => {
    const { deferred, ctx, fs, completed } = setup();
    await runPipeline({
      chain: parseChainedPipeline("shutdown | cat"), fs, cwd: "/", homeDir: "/",
      buildContext: ({ stdin }) => ({ ...ctx("home"), stdin }), write: () => {},
      applySegment: (result) => {
        for (const action of result.deferredCommands ?? []) deferred.apply("home", action, (a) => completed("home", a));
      },
    });
    vi.advanceTimersByTime(60000);
    expect(completed).toHaveBeenCalledOnce();
  });
});
