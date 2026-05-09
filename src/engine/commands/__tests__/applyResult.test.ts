import { describe, it, expect } from "vitest";
import { computeEffects, ApplyContext } from "../applyResult";
import { CommandResult } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { DirectoryNode } from "../../filesystem/types";
// Ensure builtins are registered so commandReadsFiles() returns correct values
import "../builtins";

function createMinimalFS(): VirtualFS {
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
          player: {
            type: "directory",
            name: "player",
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {},
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/player", "/home/player");
}

function createApplyCtx(overrides?: Partial<ApplyContext>): ApplyContext {
  return {
    parsedCommand: "ls",
    parsedArgs: [],
    cwd: "/home/player",
    homeDir: "/home/player",
    activeComputer: "nexacorp",
    username: "player",
    deliveredEmailIds: [],
    deliveredPiperIds: [],
    storyFlags: {},
    fs: createMinimalFS(),
    ...overrides,
  };
}

describe("computeEffects", () => {
  describe("basic output", () => {
    it("passes through output", () => {
      const result: CommandResult = { output: "hello world" };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.output).toBe("hello world");
    });

    it("defaults to empty output", () => {
      const result: CommandResult = { output: "" };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.output).toBe("");
    });

    it("passes through clearScreen", () => {
      const result: CommandResult = { output: "", clearScreen: true };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.clearScreen).toBe(true);
    });
  });

  describe("filesystem updates", () => {
    it("propagates newFs", () => {
      const newFs = createMinimalFS();
      const result: CommandResult = { output: "", newFs };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.newFs).toBe(newFs);
    });

    it("creates new VirtualFS for newCwd", () => {
      const result: CommandResult = { output: "", newCwd: "/" };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.newCwd).toBe("/");
      expect(effects.newFs).toBeDefined();
      expect(effects.newFs!.cwd).toBe("/");
    });
  });

  describe("session starts", () => {
    it("detects editor session and suppresses prompt", () => {
      const result: CommandResult = {
        output: "",
        editorSession: {
          filePath: "/home/player/test.txt",
          content: "hello",
          readOnly: false,
          isNewFile: true,
        },
      };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.startSession).toEqual({
        type: "editor",
        info: result.editorSession,
      });
      expect(effects.suppressPrompt).toBe(true);
    });

    it("detects snow-sql session", () => {
      const result: CommandResult = {
        output: "",
        snowSqlSession: { startInteractive: true },
      };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.startSession).toEqual({ type: "snow-sql" });
      expect(effects.suppressPrompt).toBe(true);
    });

    it("detects python repl session", () => {
      const result: CommandResult = {
        output: "",
        interactiveSession: { type: "pythonRepl" },
      };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.startSession).toEqual({ type: "pythonRepl" });
      expect(effects.suppressPrompt).toBe(true);
    });

    it("detects prompt session", () => {
      const promptInfo = {
        promptText: "Choose: ",
        options: [{ label: "A" }],
      };
      const result: CommandResult = {
        output: "",
        promptSession: promptInfo,
      };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.startSession).toEqual({
        type: "prompt",
        info: promptInfo,
      });
      expect(effects.suppressPrompt).toBe(true);
    });

    it("still processes events even when starting a session", () => {
      const result: CommandResult = {
        output: "",
        editorSession: {
          filePath: "/test.txt",
          content: "",
          readOnly: false,
          isNewFile: true,
        },
        triggerEvents: [{ type: "file_read", detail: "welcome" }],
      };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.events.length).toBeGreaterThan(0);
      expect(effects.startSession).toBeDefined();
    });
  });

  describe("game actions", () => {
    it("passes through save game action", () => {
      const result: CommandResult = {
        output: "",
        gameAction: { type: "save", slotId: "slot-1" },
      };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.gameAction).toEqual({ type: "save", slotId: "slot-1" });
      expect(effects.suppressPrompt).toBe(false);
    });

    it("suppresses prompt for load action", () => {
      const result: CommandResult = {
        output: "",
        gameAction: { type: "load", slotId: "slot-1" },
      };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.suppressPrompt).toBe(true);
    });

    it("suppresses prompt for newGame action", () => {
      const result: CommandResult = {
        output: "",
        gameAction: { type: "newGame" },
      };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.suppressPrompt).toBe(true);
    });

    it("appends listSaves output", () => {
      const result: CommandResult = {
        output: "",
        gameAction: { type: "listSaves" },
      };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.output).toContain("Save Slots:");
    });
  });

  describe("event pipeline", () => {
    it("always generates command_executed event", () => {
      const result: CommandResult = { output: "ok" };
      const effects = computeEffects(
        result,
        createApplyCtx({ parsedCommand: "ls" })
      );
      expect(effects.events).toContainEqual({
        type: "command_executed",
        detail: "ls",
      });
    });

    it("generates file_read events for cat command", () => {
      const result: CommandResult = { output: "content" };
      const fsWithFile = createMinimalFS().writeFile("/home/player/test.txt", "content").fs!;
      const effects = computeEffects(
        result,
        createApplyCtx({
          parsedCommand: "cat",
          parsedArgs: ["test.txt"],
          cwd: "/home/player",
          homeDir: "/home/player",
          fs: fsWithFile,
        })
      );
      expect(effects.events).toContainEqual({
        type: "file_read",
        detail: "/home/player/test.txt",
      });
    });

    it("includes trigger events from command result", () => {
      const triggerEvent = { type: "objective_completed" as const, detail: "test" };
      const result: CommandResult = {
        output: "",
        triggerEvents: [triggerEvent],
      };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.events).toContainEqual(triggerEvent);
    });
  });

  describe("story flags", () => {
    it("does not process story flags on nexacorp computer", () => {
      const result: CommandResult = { output: "" };
      const effects = computeEffects(
        result,
        createApplyCtx({ activeComputer: "nexacorp" })
      );
      expect(effects.storyFlagUpdates).toEqual([]);
    });

  });

  describe("ssh session detection", () => {
    it("detects ssh session and suppresses prompt", () => {
      const result: CommandResult = {
        output: "",
        sshSession: { host: "nexacorp-ws01.nexacorp.internal", username: "ren", targetComputer: "nexacorp" },
      };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.startSession).toEqual({
        type: "ssh",
        info: { host: "nexacorp-ws01.nexacorp.internal", username: "ren", targetComputer: "nexacorp" },
      });
      expect(effects.suppressPrompt).toBe(true);
    });

    it("still processes events even when starting ssh session", () => {
      const result: CommandResult = {
        output: "",
        sshSession: { host: "nexacorp-ws01.nexacorp.internal", username: "ren", targetComputer: "nexacorp" },
        triggerEvents: [{ type: "file_read", detail: "welcome" }],
      };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.events.length).toBeGreaterThan(0);
      expect(effects.startSession).toBeDefined();
    });
  });

  describe("prompt not suppressed for normal commands", () => {
    it("does not suppress prompt for simple output", () => {
      const result: CommandResult = { output: "hello" };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.suppressPrompt).toBe(false);
    });
  });

  describe("incrementalLines", () => {
    it("passes through incrementalLines from CommandResult", () => {
      const lines = [
        { text: "line 1", delayMs: 60 },
        { text: "line 2", delayMs: 120 },
        { text: "line 3", delayMs: 60 },
      ];
      const result: CommandResult = { output: "full output", incrementalLines: lines };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.incrementalLines).toEqual(lines);
    });

    it("omits incrementalLines when not present", () => {
      const result: CommandResult = { output: "no lines" };
      const effects = computeEffects(result, createApplyCtx());
      expect(effects.incrementalLines).toBeUndefined();
    });
  });

  describe("cross-computer transitions", () => {
    it("produces transitionTo for first-time visit (targetComputerExists = false)", () => {
      const result: CommandResult = {
        output: "",
        transitionTo: "nexacorp",
      };
      const effects = computeEffects(
        result,
        createApplyCtx({
          parsedCommand: "ssh",
          activeComputer: "home",
          targetComputerExists: false,
        })
      );
      expect(effects.transitionTo).toBe("nexacorp");
      expect(effects.suppressPrompt).toBe(true);
    });

    it("produces transitionTo for subsequent visit (targetComputerExists = true)", () => {
      const result: CommandResult = {
        output: "",
        transitionTo: "nexacorp",
      };
      const effects = computeEffects(
        result,
        createApplyCtx({
          parsedCommand: "ssh",
          activeComputer: "home",
          targetComputerExists: true,
        })
      );
      expect(effects.transitionTo).toBe("nexacorp");
      expect(effects.suppressPrompt).toBe(true);
    });

    it("exit command produces transitionTo", () => {
      const result: CommandResult = {
        output: "",
        transitionTo: "nexacorp",
      };
      const effects = computeEffects(
        result,
        createApplyCtx({
          parsedCommand: "exit",
          activeComputer: "devcontainer",
          targetComputerExists: true,
        })
      );
      expect(effects.transitionTo).toBe("nexacorp");
    });

    it("subsequent visit processes events", () => {
      const result: CommandResult = {
        output: "",
        transitionTo: "nexacorp",
      };
      const effects = computeEffects(
        result,
        createApplyCtx({
          parsedCommand: "ssh",
          activeComputer: "home",
          targetComputerExists: true,
        })
      );
      // Subsequent transitions should still generate events (unlike first-time which returns early)
      expect(effects.events.length).toBeGreaterThan(0);
    });

    it("subsequent visit processes trigger events from result", () => {
      const customEvent = { type: "file_read" as const, detail: "some_trigger" };
      const result: CommandResult = {
        output: "",
        transitionTo: "nexacorp",
        triggerEvents: [customEvent],
      };
      const effects = computeEffects(
        result,
        createApplyCtx({
          parsedCommand: "ssh",
          activeComputer: "home",
          targetComputerExists: true,
        })
      );
      expect(effects.transitionTo).toBe("nexacorp");
      expect(effects.events).toContainEqual(customEvent);
      expect(effects.events).toContainEqual({ type: "command_executed", detail: "ssh" });
    });

    it("first-time transition returns early without processing events", () => {
      const result: CommandResult = {
        output: "",
        transitionTo: "nexacorp",
        triggerEvents: [{ type: "file_read", detail: "test_trigger" }],
      };
      const effects = computeEffects(
        result,
        createApplyCtx({
          parsedCommand: "ssh",
          activeComputer: "home",
          targetComputerExists: false,
        })
      );
      expect(effects.transitionTo).toBe("nexacorp");
      expect(effects.events).toEqual([]);
    });
  });
});
