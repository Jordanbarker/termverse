import { describe, it, expect } from "vitest";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { DirectoryNode } from "../../filesystem/types";
import { CommandContext } from "../types";
// Registers the turmoil gating policy (side effect) so unavailable commands
// produce the colleague hint / not-found behavior these tests assert.
import "../../../story/availabilityPolicy";

// We must test the registry in isolation, so we use dynamic imports
// to get a fresh module for each test. But the registry uses module-level
// Maps, so we test via the public API after importing builtins.

// Use the actual registry since it's a singleton
import {
  register,
  registerAsync,
  execute,
  executeAsync,
  isAsyncCommand,
  getCommandList,
} from "../registry";
import { setKnownFlags } from "../flagValidation";

function makeCtx(): CommandContext {
  const root: DirectoryNode = {
    type: "directory",
    name: "/",
    permissions: "rwxr-xr-x",
    hidden: false,
    children: {},
  };
  const fs = new VirtualFS(root, "/", "/");
  return { fs, cwd: "/", homeDir: "/", username: "ren", activeComputer: "nexacorp" as const };
}

describe("registry", () => {
  describe("register and execute", () => {
    it("executes a registered sync command", () => {
      register("test-sync-cmd", (_args, _flags, _ctx) => {
        return { output: "sync-ok" };
      }, "A test sync command");

      const result = execute("test-sync-cmd", [], {}, makeCtx());
      expect(result.output).toBe("sync-ok");
    });

    it("returns 'command not found' for unknown commands", () => {
      const result = execute("nonexistent-xyz", [], {}, makeCtx());
      expect(result.output).toContain("zsh: command not found: nonexistent-xyz");
      expect(result.exitCode).toBe(127);
    });

    it("devcontainer-only commands get 'command not found' on nexacorp, not the colleague hint", () => {
      // snow/dbt/git are never installed on the workstation — the yellow
      // "colleagues will help you get set up" hint would be a false promise
      for (const cmd of ["snow", "dbt", "git"]) {
        const result = execute(cmd, [], {}, makeCtx());
        expect(result.output).toContain("command not found");
        expect(result.output).not.toContain("not yet available");
        expect(result.exitCode).toBe(127);
      }
    });

    it("gated-but-unlockable commands on nexacorp still get the colleague hint", () => {
      const result = execute("grep", ["x"], {}, makeCtx());
      expect(result.output).toContain("not yet available");
    });

    it("passes args, flags, and context to the handler", () => {
      register("test-args-cmd", (args, flags, ctx) => {
        return { output: `${args.join(",")}|${flags["v"]}|${ctx.cwd}` };
      }, "Args test");
      setKnownFlags("test-args-cmd", { short: ["v"] });

      const result = execute("test-args-cmd", ["a", "b"], { v: true }, makeCtx());
      expect(result.output).toBe("a,b|true|/");
    });
  });

  describe("registerAsync and executeAsync", () => {
    it("executes a registered async command", async () => {
      registerAsync("test-async-cmd", async (_args, _flags, _ctx) => {
        return { output: "async-ok" };
      }, "A test async command");

      const result = await executeAsync("test-async-cmd", [], {}, makeCtx());
      expect(result.output).toBe("async-ok");
    });

    it("falls back to sync command when no async match", async () => {
      register("test-sync-fallback", (_args, _flags, _ctx) => {
        return { output: "fell-back" };
      }, "Fallback test");

      const result = await executeAsync("test-sync-fallback", [], {}, makeCtx());
      expect(result.output).toBe("fell-back");
    });

    it("returns 'command not found' when neither async nor sync match", async () => {
      const result = await executeAsync("totally-missing-cmd", [], {}, makeCtx());
      expect(result.output).toContain("command not found");
    });
  });

  describe("isAsyncCommand", () => {
    it("returns true for async commands", () => {
      registerAsync("test-is-async", async () => ({ output: "" }), "");
      expect(isAsyncCommand("test-is-async")).toBe(true);
    });

    it("returns false for sync commands", () => {
      register("test-is-sync", () => ({ output: "" }), "");
      expect(isAsyncCommand("test-is-sync")).toBe(false);
    });

    it("returns false for unknown commands", () => {
      expect(isAsyncCommand("does-not-exist-xyz")).toBe(false);
    });
  });

  describe("--help flag intercept", () => {
    it("returns help text when --help flag set and helpText provided", () => {
      register("test-help-cmd", () => ({ output: "normal output" }), "desc", "This is the help text");
      const result = execute("test-help-cmd", [], { help: true }, makeCtx());
      expect(result.output).toBe("This is the help text");
    });

    it("calls handler normally when --help not set", () => {
      register("test-no-help-flag", () => ({ output: "normal output" }), "desc", "Help text");
      const result = execute("test-no-help-flag", [], {}, makeCtx());
      expect(result.output).toBe("normal output");
    });

    it("calls handler when --help set but no helpText registered", () => {
      register("test-no-helptext", () => ({ output: "normal output" }), "desc");
      const result = execute("test-no-helptext", [], { help: true }, makeCtx());
      expect(result.output).toBe("normal output");
    });

    it("works for async commands", async () => {
      registerAsync("test-async-help", async () => ({ output: "async normal" }), "desc", "Async help text");
      const result = await executeAsync("test-async-help", [], { help: true }, makeCtx());
      expect(result.output).toBe("Async help text");
    });

    it("async falls through to sync help", async () => {
      register("test-sync-help-fallback", () => ({ output: "sync normal" }), "desc", "Sync help");
      const result = await executeAsync("test-sync-help-fallback", [], { help: true }, makeCtx());
      expect(result.output).toBe("Sync help");
    });
  });

  describe("getCommandList", () => {
    it("includes registered sync commands", () => {
      register("test-list-sync", () => ({ output: "" }), "Sync desc");
      const list = getCommandList();
      const entry = list.find((c) => c.name === "test-list-sync");
      expect(entry).toBeDefined();
      expect(entry!.description).toBe("Sync desc");
    });

    it("includes registered async commands", () => {
      registerAsync("test-list-async", async () => ({ output: "" }), "Async desc");
      const list = getCommandList();
      const entry = list.find((c) => c.name === "test-list-async");
      expect(entry).toBeDefined();
      expect(entry!.description).toBe("Async desc");
    });

    it("async description overrides sync when both exist", () => {
      register("test-override", () => ({ output: "" }), "Sync version");
      registerAsync("test-override", async () => ({ output: "" }), "Async version");
      const list = getCommandList();
      const entries = list.filter((c) => c.name === "test-override");
      expect(entries).toHaveLength(1);
      expect(entries[0].description).toBe("Async version");
    });

    it("returns an array of objects with name and description", () => {
      const list = getCommandList();
      expect(Array.isArray(list)).toBe(true);
      for (const entry of list) {
        expect(entry).toHaveProperty("name");
        expect(entry).toHaveProperty("description");
        expect(typeof entry.name).toBe("string");
        expect(typeof entry.description).toBe("string");
      }
    });
  });
});
