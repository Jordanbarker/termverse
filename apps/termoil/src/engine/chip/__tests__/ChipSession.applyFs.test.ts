import { describe, it, expect, vi } from "vitest";
import { ChipSession } from "../ChipSession";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";
import { SessionResult } from "@tt/core/session/types";
import { ChipMenuItem } from "../types";

function createTestFS(): VirtualFS {
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
          ren: {
            type: "directory",
            name: "ren",
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {
              "model.sql": {
                type: "file",
                name: "model.sql",
                permissions: "rw-r--r--",
                hidden: false,
                content: "select broken_expr as conversion_rate",
              },
            },
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/ren", "/home/ren");
}

function createMockTerminal() {
  return {
    write: vi.fn(),
    writeln: vi.fn(),
    cols: 80,
    rows: 24,
  } as unknown as import("@xterm/xterm").Terminal;
}

/**
 * Drive a ChipSession on the devcontainer (no transcript flush) with stubbed
 * menu items, select the first item, and return the exit SessionResult.
 */
function selectAndExit(fs: VirtualFS, items: ChipMenuItem[]): SessionResult {
  const term = createMockTerminal();
  const sessionStart = new Date(2026, 1, 24, 14, 10, 0);
  const session = new ChipSession(
    term,
    fs,
    "/home/ren",
    { storyFlags: {}, currentComputer: "devcontainer" },
    sessionStart,
    () => sessionStart,
  );

  const internals = session as unknown as {
    menuItems: ChipMenuItem[];
    selectCurrent: () => void;
    writeLineByLine: () => void;
    animationTimer: ReturnType<typeof setTimeout> | null;
    exitSession: () => SessionResult;
  };
  internals.menuItems = items;
  internals.writeLineByLine = () => {};

  internals.selectCurrent();
  if (internals.animationTimer) clearTimeout(internals.animationTimer);
  return internals.exitSession();
}

describe("ChipSession applyFs", () => {
  it("threads an applyFs mutation out via SessionResult.newFs on exit", () => {
    const fs = createTestFS();
    const result = selectAndExit(fs, [
      {
        id: "fix_it",
        label: "Can you fix the model?",
        response: "Done.",
        applyFs: (f) => {
          const write = f.writeFile(
            "/home/ren/model.sql",
            "select coalesce(broken_expr, 0) as conversion_rate"
          );
          return write.fs ?? f;
        },
      },
    ]);

    expect(result.type).toBe("exit");
    expect(result.newFs).toBeDefined();
    const read = (result.newFs as VirtualFS).readFile("/home/ren/model.sql");
    expect(read.content).toBe(
      "select coalesce(broken_expr, 0) as conversion_rate"
    );
  });

  it("returns no newFs for a text-only item off nexacorp", () => {
    const fs = createTestFS();
    const result = selectAndExit(fs, [
      { id: "text_only", label: "Just a question", response: "Just an answer." },
    ]);

    expect(result.type).toBe("exit");
    expect(result.newFs).toBeUndefined();
  });
});
