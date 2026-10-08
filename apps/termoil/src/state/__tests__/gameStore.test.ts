import { describe, it, expect, beforeEach, vi } from "vitest";
import { useGameStore, getActiveLeaf, getActivePaneId, getActiveWindow, MAX_WINDOWS } from "../gameStore";
import { allLeaves, findSplit, MAX_NUDGE_RATIO, PaneNode } from "@tt/core/terminal/paneTypes";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";
import { startObjectivePromotion } from "../objectivePromotion";
import { CHAPTERS } from "../../engine/narrative/chapters";

function createMinimalFS(username = "player"): VirtualFS {
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
          [username]: {
            type: "directory",
            name: username,
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {},
          },
        },
      },
    },
  };
  return new VirtualFS(root, `/home/${username}`, `/home/${username}`);
}

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  removeItem: vi.fn((key: string) => storage.delete(key)),
});

beforeEach(() => {
  storage.clear();
  useGameStore.getState().resetGame();
});

describe("tmux session lifecycle", () => {
  const store = () => useGameStore.getState();

  it("starts attached to session 0 with no detached sessions", () => {
    expect(store().tmuxAttachedSession?.name).toBe("0");
    expect(store().tmuxDetachedSessions).toEqual([]);
    expect(store().pendingMuxNotice).toBeNull();
  });

  it("detach snapshots the session and drops to a bare shell with a banner", () => {
    store().splitPane(getActivePaneId(store())!, "h");
    store().addWindow("home", "/tmp");
    const swapped = store().applyTmuxAction({ type: "detach" });
    expect(swapped).toBe(true);
    const s = store();
    expect(s.tmuxAttachedSession).toBeNull();
    expect(s.tmuxDetachedSessions).toHaveLength(1);
    expect(s.tmuxDetachedSessions[0].name).toBe("0");
    expect(s.tmuxDetachedSessions[0].windows).toHaveLength(2);
    expect(s.windows).toHaveLength(1);
    expect(allLeaves(s.windows[0].root)).toHaveLength(1);
    expect(s.pendingMuxNotice).toBe("[detached (from session 0)]");
    expect(s.consumePendingMuxNotice()).toBe("[detached (from session 0)]");
    expect(s.consumePendingMuxNotice()).toBeNull();
  });

  it("attach restores layout with fresh pane ids and removes the snapshot", () => {
    const originalPane = getActivePaneId(store())!;
    store().splitPane(originalPane, "h");
    store().applyTmuxAction({ type: "detach" });
    const swapped = store().applyTmuxAction({ type: "attach", name: "0" });
    expect(swapped).toBe(true);
    const s = store();
    expect(s.tmuxAttachedSession?.name).toBe("0");
    expect(s.tmuxDetachedSessions).toEqual([]);
    expect(s.windows).toHaveLength(1);
    const leaves = allLeaves(s.windows[0].root);
    expect(leaves).toHaveLength(2);
    expect(leaves.every((l) => l.id !== originalPane)).toBe(true);
  });

  it("attach prunes panes on machines with no computerState entry", () => {
    const fs = createMinimalFS();
    store().initComputer("nexacorp", fs);
    store().splitPane(getActivePaneId(store())!, "h");
    const paneId = getActivePaneId(store())!;
    store().setPaneComputer(paneId, "nexacorp", "/home/player");
    store().applyTmuxAction({ type: "detach" });
    store().removeComputer("nexacorp");
    store().applyTmuxAction({ type: "attach", name: "0" });
    const leaves = store().windows.flatMap((w) => allLeaves(w.root));
    expect(leaves).toHaveLength(1);
    expect(leaves[0].computerId).toBe("home");
  });

  it("new-session launches a fresh window inheriting the bare shell's computer/cwd", () => {
    store().applyTmuxAction({ type: "detach" });
    const swapped = store().applyTmuxAction({ type: "new-session", name: "1" });
    expect(swapped).toBe(true);
    const s = store();
    expect(s.tmuxAttachedSession?.name).toBe("1");
    expect(s.tmuxDetachedSessions.map((d) => d.name)).toEqual(["0"]);
    expect(s.windows).toHaveLength(1);
  });

  it("kill-session on the attached session drops to a bare shell with [exited]", () => {
    expect(store().applyTmuxAction({ type: "kill-session", name: "0" })).toBe(true);
    expect(store().tmuxAttachedSession).toBeNull();
    expect(store().pendingMuxNotice).toBe("[exited]");
  });

  it("kill-session on a detached session removes it without swapping", () => {
    store().applyTmuxAction({ type: "detach" });
    store().applyTmuxAction({ type: "new-session", name: "1" });
    expect(store().applyTmuxAction({ type: "kill-session", name: "0" })).toBe(false);
    expect(store().tmuxDetachedSessions).toEqual([]);
    expect(store().tmuxAttachedSession?.name).toBe("1");
  });

  it("kill-server clears everything, with [server exited] when attached", () => {
    store().applyTmuxAction({ type: "detach" });
    store().applyTmuxAction({ type: "new-session", name: "1" });
    expect(store().applyTmuxAction({ type: "kill-server" })).toBe(true);
    expect(store().tmuxAttachedSession).toBeNull();
    expect(store().tmuxDetachedSessions).toEqual([]);
    expect(store().pendingMuxNotice).toBe("[server exited]");
  });

  it("closePane on the last pane of the last window kills the session (real tmux)", () => {
    const paneId = getActivePaneId(store())!;
    store().closePane(paneId);
    const s = store();
    expect(s.tmuxAttachedSession).toBeNull();
    expect(s.pendingMuxNotice).toBe("[exited]");
    expect(s.windows).toHaveLength(1);
    expect(getActivePaneId(s)).not.toBe(paneId);
  });

  it("closePane on the bare shell's only pane stays a no-op", () => {
    store().applyTmuxAction({ type: "detach" });
    const paneId = getActivePaneId(store())!;
    store().closePane(paneId);
    expect(getActivePaneId(store())).toBe(paneId);
  });
});

describe("computerState actions", () => {
  it("initComputer creates a new entry", () => {
    const fs = createMinimalFS();
    useGameStore.getState().initComputer("nexacorp", fs);
    expect(useGameStore.getState().computerState.nexacorp?.fs).toBe(fs);
  });

  it("setComputerFs updates an existing entry", () => {
    const fs1 = createMinimalFS();
    const fs2 = createMinimalFS();
    useGameStore.getState().initComputer("nexacorp", fs1);
    useGameStore.getState().setComputerFs("nexacorp", fs2);
    expect(useGameStore.getState().computerState.nexacorp?.fs).toBe(fs2);
  });

  it("setComputerFs does not affect other computers", () => {
    const homeFs = useGameStore.getState().computerState.home?.fs;
    const nexaFs = createMinimalFS();
    useGameStore.getState().initComputer("nexacorp", nexaFs);
    useGameStore.getState().setComputerFs("nexacorp", createMinimalFS());
    expect(useGameStore.getState().computerState.home?.fs).toBe(homeFs);
  });
});

describe("window actions", () => {
  it("starts with one window holding one home pane", () => {
    const state = useGameStore.getState();
    expect(state.windows).toHaveLength(1);
    expect(getActiveLeaf(state)?.computerId).toBe("home");
  });

  it("addWindow creates a new window and activates it", () => {
    const newId = useGameStore.getState().addWindow("home", "/tmp");
    const state = useGameStore.getState();
    expect(state.windows).toHaveLength(2);
    expect(state.activeWindowId).toBe(newId);
    expect(getActiveLeaf(state)?.cwd).toBe("/tmp");
  });

  it("addWindow respects the window cap (5)", () => {
    const store = useGameStore.getState();
    store.addWindow("home", "/a");
    store.addWindow("home", "/b");
    store.addWindow("home", "/c");
    store.addWindow("home", "/d");
    expect(useGameStore.getState().windows).toHaveLength(5);
    const existingId = useGameStore.getState().activeWindowId;
    const returnedId = useGameStore.getState().addWindow("home", "/e");
    expect(useGameStore.getState().windows).toHaveLength(5);
    expect(returnedId).toBe(existingId);
  });

  it("removeWindow removes the window", () => {
    const id2 = useGameStore.getState().addWindow("home", "/tmp");
    useGameStore.getState().removeWindow(id2);
    expect(useGameStore.getState().windows).toHaveLength(1);
  });

  it("removeWindow activates adjacent window when active is removed", () => {
    const store = useGameStore.getState();
    const id2 = store.addWindow("home", "/a");
    const id3 = store.addWindow("home", "/b");
    useGameStore.getState().removeWindow(id3);
    expect(useGameStore.getState().activeWindowId).toBe(id2);
  });

  it("renameWindow sets a custom name; empty/whitespace clears it", () => {
    const id = useGameStore.getState().windows[0].id;
    useGameStore.getState().renameWindow(id, "  deploy  ");
    expect(useGameStore.getState().windows[0].name).toBe("deploy"); // trimmed
    useGameStore.getState().renameWindow(id, "   ");
    expect(useGameStore.getState().windows[0].name).toBeUndefined();
  });

  it("removeWindow does not remove the last window", () => {
    const state = useGameStore.getState();
    state.removeWindow(state.windows[0].id);
    expect(useGameStore.getState().windows).toHaveLength(1);
  });

  it("setActiveWindow switches the active window", () => {
    const store = useGameStore.getState();
    const id1 = store.windows[0].id;
    store.addWindow("home", "/tmp");
    useGameStore.getState().setActiveWindow(id1);
    expect(useGameStore.getState().activeWindowId).toBe(id1);
  });

  it("setActiveWindow ignores unknown window ID", () => {
    const before = useGameStore.getState().activeWindowId;
    useGameStore.getState().setActiveWindow("nonexistent");
    expect(useGameStore.getState().activeWindowId).toBe(before);
  });
});

describe("pane actions", () => {
  it("splitPane adds a pane, inherits computer+cwd, and focuses it", () => {
    const store = useGameStore.getState();
    store.setActivePaneCwd("/srv");
    const paneId = getActivePaneId(useGameStore.getState())!;
    const newId = useGameStore.getState().splitPane(paneId, "h");
    const state = useGameStore.getState();
    expect(allLeaves(getActiveWindow(state)!.root)).toHaveLength(2);
    expect(getActivePaneId(state)).toBe(newId);
    expect(getActiveLeaf(state)?.cwd).toBe("/srv");
    expect(getActiveLeaf(state)?.computerId).toBe("home");
  });

  it("closePane collapses the split and promotes the sibling", () => {
    const first = getActivePaneId(useGameStore.getState())!;
    const second = useGameStore.getState().splitPane(first, "v")!;
    useGameStore.getState().closePane(second);
    const state = useGameStore.getState();
    expect(allLeaves(getActiveWindow(state)!.root)).toHaveLength(1);
    expect(getActivePaneId(state)).toBe(first);
  });

  it("closePane on the last pane of a window drops the window", () => {
    const store = useGameStore.getState();
    store.addWindow("home", "/a");
    const win2Pane = getActivePaneId(useGameStore.getState())!;
    useGameStore.getState().closePane(win2Pane);
    expect(useGameStore.getState().windows).toHaveLength(1);
  });

  it("closePane on the only pane of the only window kills the session to a bare shell", () => {
    const only = getActivePaneId(useGameStore.getState())!;
    useGameStore.getState().closePane(only);
    const state = useGameStore.getState();
    expect(state.windows).toHaveLength(1);
    expect(getActivePaneId(state)).not.toBe(only);
    expect(state.tmuxAttachedSession).toBeNull();
  });

  it("focusDirection moves focus to the adjacent pane", () => {
    const left = getActivePaneId(useGameStore.getState())!;
    const right = useGameStore.getState().splitPane(left, "h")!;
    expect(getActivePaneId(useGameStore.getState())).toBe(right);
    useGameStore.getState().focusDirection("L");
    expect(getActivePaneId(useGameStore.getState())).toBe(left);
  });

  it("cyclePane rotates focus through panes", () => {
    const first = getActivePaneId(useGameStore.getState())!;
    const second = useGameStore.getState().splitPane(first, "h")!;
    useGameStore.getState().cyclePane();
    expect(getActivePaneId(useGameStore.getState())).toBe(first);
    useGameStore.getState().cyclePane();
    expect(getActivePaneId(useGameStore.getState())).toBe(second);
  });

  it("nudgeSplitRatio adjusts the split ratio, capping each nudge at MAX_NUDGE_RATIO", () => {
    const left = getActivePaneId(useGameStore.getState())!;
    useGameStore.getState().splitPane(left, "h");
    const splitId = (getActiveWindow(useGameStore.getState())!.root as Extract<PaneNode, { kind: "split" }>).id;
    useGameStore.getState().nudgeSplitRatio(splitId, -0.03);
    expect(findSplit(getActiveWindow(useGameStore.getState())!.root, splitId)!.ratio).toBeCloseTo(0.47);
    useGameStore.getState().nudgeSplitRatio(splitId, -1); // huge delta → one capped step
    expect(findSplit(getActiveWindow(useGameStore.getState())!.root, splitId)!.ratio).toBeCloseTo(0.47 - MAX_NUDGE_RATIO);
  });
});

describe("tmux window/pane verbs (applyTmuxAction)", () => {
  const store = () => useGameStore.getState();
  const win = () => getActiveWindow(store())!;

  it("new-window appends a window on the active pane's computer/cwd", () => {
    store().setActivePaneCwd("/tmp");
    expect(store().applyTmuxAction({ type: "new-window" })).toBe(false);
    const s = store();
    expect(s.windows).toHaveLength(2);
    expect(s.activeWindowId).toBe(s.windows[1].id);
    expect(getActiveLeaf(s)!.cwd).toBe("/tmp");
    expect(getActiveLeaf(s)!.computerId).toBe("home");
  });

  it("new-window is a silent no-op at MAX_WINDOWS", () => {
    for (let i = 1; i < MAX_WINDOWS; i++) store().addWindow("home", "/tmp");
    expect(store().windows).toHaveLength(MAX_WINDOWS);
    expect(store().applyTmuxAction({ type: "new-window" })).toBe(false);
    expect(store().windows).toHaveLength(MAX_WINDOWS);
  });

  it("rename-window renames the targeted window", () => {
    const id = store().addWindow("home", "/tmp");
    expect(store().applyTmuxAction({ type: "rename-window", windowId: id, name: "logs" })).toBe(false);
    expect(store().windows.find((w) => w.id === id)!.name).toBe("logs");
  });

  it("kill-window returns true only for the window holding the active pane", () => {
    const first = store().activeWindowId;
    const second = store().addWindow("home", "/tmp"); // becomes active
    expect(store().applyTmuxAction({ type: "kill-window", windowId: first })).toBe(false);
    expect(store().windows).toHaveLength(1);
    expect(store().applyTmuxAction({ type: "kill-window", windowId: second })).toBe(true);
  });

  it("kill-window on the last window kills the session (real tmux)", () => {
    expect(store().applyTmuxAction({ type: "kill-window", windowId: store().activeWindowId })).toBe(true);
    expect(store().tmuxAttachedSession).toBeNull();
    expect(store().pendingMuxNotice).toBe("[exited]");
  });

  it("select-window switches windows without swapping the client view", () => {
    const first = store().activeWindowId;
    store().addWindow("home", "/tmp");
    expect(store().applyTmuxAction({ type: "select-window", windowId: first })).toBe(false);
    expect(store().activeWindowId).toBe(first);
  });

  it("split-window splits the active pane and focuses the new one", () => {
    const original = getActivePaneId(store())!;
    expect(store().applyTmuxAction({ type: "split-window", direction: "h" })).toBe(false);
    expect(allLeaves(win().root)).toHaveLength(2);
    expect((win().root as Extract<PaneNode, { kind: "split" }>).direction).toBe("h");
    expect(getActivePaneId(store())).not.toBe(original);
  });

  it("split-window is a silent no-op at the pane cap", () => {
    for (let i = 0; i < 5; i++) store().splitPane(getActivePaneId(store())!, "v");
    expect(allLeaves(win().root)).toHaveLength(6); // MAX_PANES_PER_WINDOW
    expect(store().applyTmuxAction({ type: "split-window", direction: "v" })).toBe(false);
    expect(allLeaves(win().root)).toHaveLength(6);
  });

  it("kill-pane closes the active pane and suppresses the prompt", () => {
    const first = getActivePaneId(store())!;
    store().splitPane(first, "h");
    expect(store().applyTmuxAction({ type: "kill-pane" })).toBe(true);
    expect(allLeaves(win().root)).toHaveLength(1);
    expect(getActivePaneId(store())).toBe(first);
  });

  it("select-pane moves the focus in the given direction", () => {
    const left = getActivePaneId(store())!;
    const right = store().splitPane(left, "h")!;
    expect(store().applyTmuxAction({ type: "select-pane", dir: "L" })).toBe(false);
    expect(getActivePaneId(store())).toBe(left);
    store().applyTmuxAction({ type: "select-pane", dir: "R" });
    expect(getActivePaneId(store())).toBe(right);
  });

  it("resize-pane nudges the nearest split on the axis, capped at one chord press", () => {
    store().splitPane(getActivePaneId(store())!, "h");
    const splitId = (win().root as Extract<PaneNode, { kind: "split" }>).id;
    store().applyTmuxAction({ type: "resize-pane", dir: "R", cells: 2 });
    expect(findSplit(win().root, splitId)!.ratio).toBeCloseTo(0.52);
    store().applyTmuxAction({ type: "resize-pane", dir: "L", cells: 100 });
    expect(findSplit(win().root, splitId)!.ratio).toBeCloseTo(0.52 - MAX_NUDGE_RATIO);
  });

  it("resize-pane is a no-op when no split exists on that axis", () => {
    store().splitPane(getActivePaneId(store())!, "h");
    const before = win().root;
    store().applyTmuxAction({ type: "resize-pane", dir: "U", cells: 5 });
    expect(win().root).toBe(before);
  });
});

describe("addDeliveredPiperMessages", () => {
  const store = () => useGameStore.getState();

  // Regression: the Day 2 nexacorp transition re-seeded the same immediate
  // deliveries the home call site had already added (it lacked the manual
  // deliveredPiperIds filter), delivering those messages twice. De-duping in
  // the action means no call site can get it wrong.
  it("delivers an id once even when called twice with the same ids", () => {
    store().addDeliveredPiperMessages(["alex_intro", "olive_hello"]);
    store().addDeliveredPiperMessages(["alex_intro", "olive_hello"]);
    expect(store().deliveredPiperIds).toEqual(["alex_intro", "olive_hello"]);
  });

  it("de-dupes within a single batch and keeps genuinely new ids", () => {
    store().addDeliveredPiperMessages(["a", "a", "b"]);
    store().addDeliveredPiperMessages(["b", "c"]);
    expect(store().deliveredPiperIds).toEqual(["a", "b", "c"]);
  });

  it("de-dupes reply ids too", () => {
    store().addDeliveredPiperMessages(["auri_day2:0"]);
    store().addDeliveredPiperMessages(["reply:auri_day2:0"]);
    store().addDeliveredPiperMessages(["reply:auri_day2:0"]);
    expect(store().deliveredPiperIds).toEqual(["auri_day2:0", "reply:auri_day2:0"]);
  });

  it("still replaces a stale seen: marker for the same channel", () => {
    store().addDeliveredPiperMessages(["dm_auri", "seen:dm_auri:2"]);
    store().addDeliveredPiperMessages(["seen:dm_auri:5"]);
    expect(store().deliveredPiperIds).toEqual(["dm_auri", "seen:dm_auri:5"]);
  });

  it("leaves state untouched when every id is already delivered", () => {
    store().addDeliveredPiperMessages(["a", "b"]);
    const before = store().deliveredPiperIds;
    store().addDeliveredPiperMessages(["a", "b"]);
    expect(store().deliveredPiperIds).toBe(before);
  });
});

describe("activeSnowSession", () => {
  it("defaults to null", () => {
    expect(useGameStore.getState().activeSnowSession).toBeNull();
  });

  it("setActiveSnowSession sets and clears", () => {
    useGameStore.getState().setActiveSnowSession("pane-1");
    expect(useGameStore.getState().activeSnowSession).toBe("pane-1");
    useGameStore.getState().setActiveSnowSession(null);
    expect(useGameStore.getState().activeSnowSession).toBeNull();
  });

  it("closePane clears a snow session in the closed pane", () => {
    const first = getActivePaneId(useGameStore.getState())!;
    const second = useGameStore.getState().splitPane(first, "h")!;
    useGameStore.getState().setActiveSnowSession(second);
    useGameStore.getState().closePane(second);
    expect(useGameStore.getState().activeSnowSession).toBeNull();
  });
});

describe("setPaneCopyMode", () => {
  it("adds and removes pane ids, ignoring repeats", () => {
    const { setPaneCopyMode } = useGameStore.getState();
    setPaneCopyMode("pane-1", true);
    setPaneCopyMode("pane-1", true);
    setPaneCopyMode("pane-2", true);
    expect(useGameStore.getState().copyModePaneIds).toEqual(["pane-1", "pane-2"]);
    setPaneCopyMode("pane-1", false);
    setPaneCopyMode("pane-1", false);
    expect(useGameStore.getState().copyModePaneIds).toEqual(["pane-2"]);
  });
});

describe("multi-pane integration", () => {
  it("cross-computer FS isolation", () => {
    const homeFs = useGameStore.getState().computerState.home?.fs;
    const nexaFs = createMinimalFS();
    useGameStore.getState().initComputer("nexacorp", nexaFs);
    const newNexaFs = createMinimalFS("ren");
    useGameStore.getState().setComputerFs("nexacorp", newNexaFs);
    expect(useGameStore.getState().computerState.home?.fs).toBe(homeFs);
    expect(useGameStore.getState().computerState.nexacorp?.fs).toBe(newNexaFs);
  });

  it("setActivePaneComputer preserves other computers", () => {
    const nexaFs = createMinimalFS();
    useGameStore.getState().initComputer("nexacorp", nexaFs);
    useGameStore.getState().setActivePaneComputer("nexacorp", "/home/player");
    const cs = useGameStore.getState().computerState;
    expect(cs.home).toBeDefined();
    expect(cs.nexacorp).toBeDefined();
    expect(getActiveLeaf(useGameStore.getState())?.computerId).toBe("nexacorp");
  });

  it("closePanesForComputers prunes work panes but keeps the active one", () => {
    const homePane = getActivePaneId(useGameStore.getState())!;
    const nexaPane = useGameStore.getState().splitPane(homePane, "h")!;
    useGameStore.getState().setPaneComputer(nexaPane, "nexacorp", "/home/player");
    // Focus the home pane, then down nexacorp — only the nexacorp pane should go.
    useGameStore.getState().setActivePane(homePane);
    useGameStore.getState().closePanesForComputers(["nexacorp"]);
    const state = useGameStore.getState();
    expect(allLeaves(getActiveWindow(state)!.root)).toHaveLength(1);
    expect(getActivePaneId(state)).toBe(homePane);
  });

  it("removeWindow preserves computerState", () => {
    const nexaFs = createMinimalFS();
    useGameStore.getState().initComputer("nexacorp", nexaFs);
    const winId = useGameStore.getState().addWindow("nexacorp", "/home/player");
    useGameStore.getState().removeWindow(winId);
    expect(useGameStore.getState().computerState.nexacorp).toBeDefined();
  });

  it("loadGame restores multi-window state with panes", () => {
    const store = useGameStore.getState();
    const nexaFs = createMinimalFS();
    store.initComputer("nexacorp", nexaFs);
    store.addWindow("nexacorp", "/home/player");
    // Split the new window so the save round-trips a tree, not just a leaf.
    const paneId = getActivePaneId(useGameStore.getState())!;
    useGameStore.getState().splitPane(paneId, "v");

    store.saveGame("slot-1", "multi-window");

    useGameStore.getState().resetGame();
    expect(useGameStore.getState().windows).toHaveLength(1);

    const loaded = useGameStore.getState().loadGame("slot-1");
    expect(loaded).toBe(true);

    const state = useGameStore.getState();
    expect(state.windows).toHaveLength(2);
    const totalPanes = state.windows.reduce((n, w) => n + allLeaves(w.root).length, 0);
    expect(totalPanes).toBe(3);
    expect(state.computerState.home).toBeDefined();
    expect(state.computerState.nexacorp).toBeDefined();
  });
});

describe("completeObjective", () => {
  const store = () => useGameStore.getState();

  it("records an objective once, even when called repeatedly", () => {
    store().completeObjective("obj-a");
    store().completeObjective("obj-a");
    store().completeObjective("obj-b");
    expect(store().completedObjectives).toEqual(["obj-a", "obj-b"]);
  });

  it("leaves state untouched when the objective is already complete", () => {
    store().completeObjective("obj-a");
    const before = store().completedObjectives;
    store().completeObjective("obj-a");
    expect(store().completedObjectives).toBe(before);
  });
});

describe("objective promotion", () => {
  const store = () => useGameStore.getState();

  it("promotes flag-satisfied objectives without the HUD being mounted", () => {
    const unsubscribe = startObjectivePromotion();
    try {
      // Chapter 1's "read_the_resume" objective checks the read_resume flag.
      expect(store().completedObjectives).not.toContain("read_resume");
      store().setStoryFlag("read_resume", true);

      const chapter1 = CHAPTERS.find((c) => c.id === "chapter-1")!;
      const flagged = chapter1.objectives.filter(
        (o) => o.check.source === "storyFlag" && o.check.key === "read_resume"
      );
      expect(flagged.length).toBeGreaterThan(0);
      for (const obj of flagged) {
        expect(store().completedObjectives).toContain(obj.id);
      }
    } finally {
      unsubscribe();
    }
  });

  it("stops promoting once unsubscribed", () => {
    startObjectivePromotion()();
    const before = store().completedObjectives.length;
    store().setStoryFlag("read_resume", true);
    expect(store().completedObjectives).toHaveLength(before);
  });
});
