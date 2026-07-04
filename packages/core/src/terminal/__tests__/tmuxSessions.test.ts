import { describe, it, expect, beforeEach } from "vitest";
import {
  nextSessionName,
  snapshotSession,
  restoreSession,
  formatTmuxLs,
} from "../tmuxSessions";
import {
  makeWindow,
  splitNode,
  allLeaves,
  resetPaneIdCounters,
  type WindowState,
} from "../paneTypes";
import type { MachineId } from "@tt/core/machine";

const HOME = "home" as MachineId;

// 2026-07-04 09:12:00 local time.
const CREATED = new Date(2026, 6, 4, 9, 12, 0).getTime();

beforeEach(() => resetPaneIdCounters());

describe("nextSessionName", () => {
  it("starts at 0", () => {
    expect(nextSessionName([])).toBe("0");
  });

  it("picks the lowest unused integer", () => {
    expect(nextSessionName(["0", "1", "3"])).toBe("2");
    expect(nextSessionName(["1", "work"])).toBe("0");
    expect(nextSessionName(["0", "1", "2"])).toBe("3");
  });
});

describe("snapshot/restore round-trip", () => {
  function makeTwoWindowClient(): { windows: WindowState[]; activeWindowId: string } {
    const w1 = makeWindow(HOME, "/home/user");
    const split = splitNode(w1.root, w1.activePaneId, "h", () => ({
      kind: "leaf" as const,
      id: "pane-99",
      computerId: HOME,
      cwd: "/home/user/projects",
    }));
    const win1: WindowState = { ...w1, root: split!.root, name: "code" };
    const win2 = makeWindow(HOME, "/tmp");
    return { windows: [win1, win2], activeWindowId: win2.id };
  }

  it("preserves layout, names, per-pane cwd/computer, and active window index", () => {
    const { windows, activeWindowId } = makeTwoWindowClient();
    const snap = snapshotSession("0", windows, activeWindowId, CREATED);
    expect(snap.name).toBe("0");
    expect(snap.activeWindowIndex).toBe(1);
    expect(snap.windows).toHaveLength(2);
    expect(snap.windows[0].name).toBe("code");

    const restored = restoreSession(snap);
    expect(restored.windows).toHaveLength(2);
    expect(restored.activeWindowId).toBe(restored.windows[1].id);
    const leaves = allLeaves(restored.windows[0].root);
    expect(leaves.map((l) => l.cwd)).toEqual(["/home/user", "/home/user/projects"]);
    expect(restored.windows[0].name).toBe("code");
  });

  it("mints fresh pane and window ids on restore", () => {
    const { windows, activeWindowId } = makeTwoWindowClient();
    const snap = snapshotSession("0", windows, activeWindowId, CREATED);
    const restored = restoreSession(snap);
    const oldIds = new Set(windows.flatMap((w) => allLeaves(w.root).map((l) => l.id)));
    for (const w of restored.windows) {
      for (const l of allLeaves(w.root)) expect(oldIds.has(l.id)).toBe(false);
    }
  });

  it("falls back to window 0 when the active window id is unknown", () => {
    const { windows } = makeTwoWindowClient();
    const snap = snapshotSession("0", windows, "win-nope", CREATED);
    expect(snap.activeWindowIndex).toBe(0);
  });

  it("clamps an out-of-range activeWindowIndex on restore", () => {
    const w = makeWindow(HOME, "/home/user");
    const snap = snapshotSession("0", [w], w.id, CREATED);
    const restored = restoreSession({ ...snap, activeWindowIndex: 7 });
    expect(restored.activeWindowId).toBe(restored.windows[0].id);
  });
});

describe("formatTmuxLs", () => {
  it("matches real tmux formatting, with space-padded day and attached marker", () => {
    expect(
      formatTmuxLs([
        { name: "0", windowCount: 2, createdAt: CREATED, attached: true },
        { name: "work", windowCount: 1, createdAt: CREATED, attached: false },
      ]),
    ).toBe(
      "0: 2 windows (created Sat Jul  4 09:12:00 2026) (attached)\n" +
        "work: 1 window (created Sat Jul  4 09:12:00 2026)",
    );
  });

  it("pads two-digit days without a leading space gap", () => {
    const dec25 = new Date(2026, 11, 25, 23, 5, 9).getTime();
    expect(formatTmuxLs([{ name: "0", windowCount: 3, createdAt: dec25, attached: false }])).toBe(
      "0: 3 windows (created Fri Dec 25 23:05:09 2026)",
    );
  });
});
