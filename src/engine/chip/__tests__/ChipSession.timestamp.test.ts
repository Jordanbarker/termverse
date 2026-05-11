import { describe, it, expect, vi } from "vitest";
import { ChipSession } from "../ChipSession";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { DirectoryNode } from "../../filesystem/types";
import { SessionResult } from "../../session/types";

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
              ".chip": {
                type: "directory",
                name: ".chip",
                permissions: "rwxr-xr-x",
                hidden: true,
                children: {
                  sessions: {
                    type: "directory",
                    name: "sessions",
                    permissions: "rwxr-xr-x",
                    hidden: false,
                    children: {},
                  },
                },
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

describe("ChipSession timestamps", () => {
  it("uses the provided sessionStart for the transcript filename and header", () => {
    const fs = createTestFS();
    const term = createMockTerminal();
    const sessionStart = new Date(2026, 1, 24, 14, 10, 0); // Tue Feb 24 14:10:00 local

    const session = new ChipSession(
      term,
      fs,
      "/home/ren",
      { storyFlags: {}, currentComputer: "nexacorp" },
      sessionStart,
    );

    // Populate the transcript directly so we can exercise flushTranscript()
    // without driving the animated menu state machine.
    (session as unknown as { transcript: Array<{ timestamp: Date; role: string; text: string }> }).transcript.push(
      { timestamp: new Date(sessionStart.getTime() + 1000), role: "user", text: "Tell me about NexaCorp" },
      { timestamp: new Date(sessionStart.getTime() + 2000), role: "chip", text: "NexaCorp builds enterprise AI tools." },
    );

    const result = (session as unknown as { exitSession: () => SessionResult }).exitSession();

    expect(result.newFs).toBeDefined();
    const newFs = result.newFs as VirtualFS;
    const dir = newFs.listDirectory("/home/ren/.chip/sessions");
    expect(dir.error).toBeUndefined();
    expect(dir.entries.length).toBe(1);

    const filename = dir.entries[0].name;
    expect(filename).toBe("2026-02-24-141000.log");

    const read = newFs.readFile(`/home/ren/.chip/sessions/${filename}`);
    expect(read.error).toBeUndefined();
    const content = read.content ?? "";
    expect(content).toContain("session: sess_2026-02-24-141000");
    expect(content).toContain("started: 2026-02-24 14:10:00");
    expect(content).toContain("[14:10:01] ren: Tell me about NexaCorp");
    expect(content).toContain("[14:10:02] chip: NexaCorp builds enterprise AI tools.");
  });

  it("does not call new Date() for sessionStart — independent of wall clock", () => {
    const fs = createTestFS();
    const term = createMockTerminal();
    // Pin a sessionStart far away from "now"; assert the file uses that date,
    // not whatever the real system clock is.
    const sessionStart = new Date(2025, 6, 4, 9, 0, 0);

    const session = new ChipSession(
      term,
      fs,
      "/home/ren",
      { storyFlags: {}, currentComputer: "nexacorp" },
      sessionStart,
    );

    (session as unknown as { transcript: Array<{ timestamp: Date; role: string; text: string }> }).transcript.push(
      { timestamp: sessionStart, role: "user", text: "hi" },
    );

    const result = (session as unknown as { exitSession: () => SessionResult }).exitSession();
    const newFs = result.newFs as VirtualFS;
    const dir = newFs.listDirectory("/home/ren/.chip/sessions");
    expect(dir.entries[0].name).toBe("2025-07-04-090000.log");
  });
});
