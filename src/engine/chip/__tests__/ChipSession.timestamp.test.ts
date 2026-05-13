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
      () => sessionStart,
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
      () => sessionStart,
    );

    (session as unknown as { transcript: Array<{ timestamp: Date; role: string; text: string }> }).transcript.push(
      { timestamp: sessionStart, role: "user", text: "hi" },
    );

    const result = (session as unknown as { exitSession: () => SessionResult }).exitSession();
    const newFs = result.newFs as VirtualFS;
    const dir = newFs.listDirectory("/home/ren/.chip/sessions");
    expect(dir.entries[0].name).toBe("2025-07-04-090000.log");
  });

  it("stamps each exchange with the live game time, not wall-clock elapsed", () => {
    const fs = createTestFS();
    const term = createMockTerminal();
    const sessionStart = new Date(2026, 1, 23, 9, 0, 0);

    // Game time advances story-wise, not by real elapsed time. Return a
    // changing value across calls to simulate the clock ticking forward
    // (e.g. a Piper message delivered between two menu selections).
    const fakeTimes = [
      new Date(2026, 1, 23, 9, 0, 5),
      new Date(2026, 1, 23, 9, 0, 5),
      new Date(2026, 1, 23, 9, 12, 0),
      new Date(2026, 1, 23, 9, 12, 0),
    ];
    let i = 0;
    const getGameNow = () => fakeTimes[Math.min(i++, fakeTimes.length - 1)];

    const session = new ChipSession(
      term,
      fs,
      "/home/ren",
      { storyFlags: {}, currentComputer: "nexacorp" },
      sessionStart,
      getGameNow,
    );

    // Bypass the animated render path: stub menu items and override the
    // post-push animation so the test does not leak a setTimeout.
    const internals = session as unknown as {
      menuItems: Array<{ id: string; label: string; response: string }>;
      selectCurrent: () => void;
      transcript: Array<{ timestamp: Date; role: string; text: string }>;
      writeLineByLine: () => void;
    };
    internals.menuItems = [
      { id: "stub_a", label: "First question", response: "First answer." },
      { id: "stub_b", label: "Second question", response: "Second answer." },
    ];
    internals.writeLineByLine = () => {};

    internals.selectCurrent();
    internals.selectCurrent();

    const stamps = internals.transcript.map((e) => e.timestamp.getTime());
    expect(stamps).toEqual([
      fakeTimes[0].getTime(),
      fakeTimes[1].getTime(),
      fakeTimes[2].getTime(),
      fakeTimes[3].getTime(),
    ]);

    // Cancel the pending animation timer scheduled by selectCurrent so the
    // test does not keep the event loop alive.
    const timerHolder = session as unknown as {
      animationTimer: ReturnType<typeof setTimeout> | null;
    };
    if (timerHolder.animationTimer) clearTimeout(timerHolder.animationTimer);
  });
});
