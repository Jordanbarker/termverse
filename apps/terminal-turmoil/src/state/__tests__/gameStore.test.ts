import { describe, it, expect, beforeEach, vi } from "vitest";
import { useGameStore, getActiveLeaf, getActivePaneId, getActiveWindow } from "../gameStore";
import { allLeaves, findSplit, PaneNode } from "@tt/core/terminal/paneTypes";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";

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

  it("closePane never removes the only pane of the only window", () => {
    const only = getActivePaneId(useGameStore.getState())!;
    useGameStore.getState().closePane(only);
    expect(useGameStore.getState().windows).toHaveLength(1);
    expect(getActivePaneId(useGameStore.getState())).toBe(only);
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

  it("nudgeSplitRatio adjusts the split ratio and clamps it", () => {
    const left = getActivePaneId(useGameStore.getState())!;
    useGameStore.getState().splitPane(left, "h");
    const splitId = (getActiveWindow(useGameStore.getState())!.root as Extract<PaneNode, { kind: "split" }>).id;
    useGameStore.getState().nudgeSplitRatio(splitId, -0.2);
    expect(findSplit(getActiveWindow(useGameStore.getState())!.root, splitId)!.ratio).toBeCloseTo(0.3);
    useGameStore.getState().nudgeSplitRatio(splitId, -1);
    expect(findSplit(getActiveWindow(useGameStore.getState())!.root, splitId)!.ratio).toBeCloseTo(0.1);
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
