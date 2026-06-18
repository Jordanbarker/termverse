import { describe, it, expect, vi } from "vitest";
import { Terminal } from "@xterm/xterm";
import { EditorSession } from "@tt/core/editor/EditorSession";
import { SnowSqlSession } from "../../snowflake/session/SnowSqlSession";
import { PiperSession } from "../../piper/PiperSession";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";
import { createInitialSnowflakeState } from "../../snowflake/seed/initial_data";
import { createDefaultContext } from "../../snowflake/session/context";
import { ISession } from "@tt/core/session/types";

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
            children: {
              "test.txt": {
                type: "file",
                name: "test.txt",
                content: "hello",
                permissions: "rw-r--r--",
                hidden: false,
              },
            },
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/player", "/home/player");
}

function createMockTerminal() {
  return { write: vi.fn(), rows: 24, cols: 80 } as unknown as Terminal;
}

describe("canClose() session contract", () => {
  it("EditorSession.canClose() returns false when modified", () => {
    const terminal = createMockTerminal();
    const fs = createMinimalFS();
    const session = new EditorSession(
      terminal,
      fs,
      "/home/player/test.txt",
      "hello",
      false,
      vi.fn()
    );
    session.enter();
    // Simulate a keystroke that modifies the buffer
    session.handleInput("x");
    expect(session.canClose()).toBe(false);
  });

  it("EditorSession.canClose() returns true when unmodified", () => {
    const terminal = createMockTerminal();
    const fs = createMinimalFS();
    const session = new EditorSession(
      terminal,
      fs,
      "/home/player/test.txt",
      "hello",
      false,
      vi.fn()
    );
    session.enter();
    expect(session.canClose()).toBe(true);
  });

  it("SnowSqlSession.canClose() returns true and calls onReleaseLock", () => {
    const terminal = createMockTerminal();
    const state = createInitialSnowflakeState();
    const context = createDefaultContext("player");
    const releaseSpy = vi.fn();
    const session = new SnowSqlSession(
      terminal,
      state,
      context,
      vi.fn(),
      releaseSpy
    );
    expect(session.canClose()).toBe(true);
    expect(releaseSpy).toHaveBeenCalledOnce();
  });

  it("PiperSession.canClose() returns true", () => {
    const terminal = createMockTerminal();
    const session = new PiperSession(
      terminal,
      { storyFlags: {}, deliveredPiperIds: [] },
      "player"
    );
    expect(session.canClose()).toBe(true);
  });

  it("default canClose (no method) yields true via optional chaining pattern", () => {
    // The pattern used in tab close logic: session.canClose?.() ?? true
    const bareSession: ISession = {
      enter: vi.fn(),
      handleInput: vi.fn(() => null),
    };
    // canClose is optional on ISession, so this pattern should yield true
    const result = bareSession.canClose?.() ?? true;
    expect(result).toBe(true);
  });
});
