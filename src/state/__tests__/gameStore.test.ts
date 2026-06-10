import { describe, it, expect, beforeEach, vi } from "vitest";
import { useGameStore } from "../gameStore";
import { VirtualFS } from "../../engine/filesystem/VirtualFS";
import { DirectoryNode } from "../../engine/filesystem/types";

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

describe("tab actions", () => {
  it("starts with one tab", () => {
    const state = useGameStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].computerId).toBe("home");
  });

  it("addTab creates a new tab and activates it", () => {
    const newId = useGameStore.getState().addTab("home", "/tmp");
    const state = useGameStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe(newId);
    expect(state.tabs.find((t) => t.id === newId)?.cwd).toBe("/tmp");
  });

  it("addTab respects MAX_TABS limit (5)", () => {
    const store = useGameStore.getState();
    store.addTab("home", "/a");
    store.addTab("home", "/b");
    store.addTab("home", "/c");
    store.addTab("home", "/d");
    // 5th tab should be the limit
    expect(useGameStore.getState().tabs).toHaveLength(5);
    // 6th should not be added
    const existingId = useGameStore.getState().activeTabId;
    const returnedId = useGameStore.getState().addTab("home", "/e");
    expect(useGameStore.getState().tabs).toHaveLength(5);
    expect(returnedId).toBe(existingId);
  });

  it("removeTab removes the tab", () => {
    const id2 = useGameStore.getState().addTab("home", "/tmp");
    useGameStore.getState().removeTab(id2);
    expect(useGameStore.getState().tabs).toHaveLength(1);
  });

  it("removeTab activates adjacent tab when active is removed", () => {
    const store = useGameStore.getState();
    const id2 = store.addTab("home", "/a");
    const id3 = store.addTab("home", "/b");
    // Active is id3. Remove it — should activate id2
    useGameStore.getState().removeTab(id3);
    expect(useGameStore.getState().activeTabId).toBe(id2);
  });

  it("removeTab does not remove last tab", () => {
    const state = useGameStore.getState();
    const onlyTabId = state.tabs[0].id;
    state.removeTab(onlyTabId);
    expect(useGameStore.getState().tabs).toHaveLength(1);
  });

  it("setActiveTab switches active tab", () => {
    const store = useGameStore.getState();
    const id1 = store.tabs[0].id;
    store.addTab("home", "/tmp");
    useGameStore.getState().setActiveTab(id1);
    expect(useGameStore.getState().activeTabId).toBe(id1);
  });

  it("setActiveTab ignores unknown tab ID", () => {
    const before = useGameStore.getState().activeTabId;
    useGameStore.getState().setActiveTab("nonexistent");
    expect(useGameStore.getState().activeTabId).toBe(before);
  });

  it("setTabCwd updates the tab's cwd", () => {
    const tabId = useGameStore.getState().tabs[0].id;
    useGameStore.getState().setTabCwd(tabId, "/new/path");
    expect(useGameStore.getState().tabs[0].cwd).toBe("/new/path");
  });

  it("setTabComputer updates tab's computer and cwd", () => {
    const fs = createMinimalFS();
    useGameStore.getState().initComputer("nexacorp", fs);
    const tabId = useGameStore.getState().tabs[0].id;
    useGameStore.getState().setTabComputer(tabId, "nexacorp", "/home/player");
    const tab = useGameStore.getState().tabs.find((t) => t.id === tabId);
    expect(tab?.computerId).toBe("nexacorp");
    expect(tab?.cwd).toBe("/home/player");
  });
});

describe("activeSnowSession", () => {
  it("defaults to null", () => {
    expect(useGameStore.getState().activeSnowSession).toBeNull();
  });

  it("setActiveSnowSession sets and clears", () => {
    useGameStore.getState().setActiveSnowSession("tab-1");
    expect(useGameStore.getState().activeSnowSession).toBe("tab-1");
    useGameStore.getState().setActiveSnowSession(null);
    expect(useGameStore.getState().activeSnowSession).toBeNull();
  });
});

describe("multi-tab integration", () => {
  it("cross-computer FS isolation", () => {
    const homeFs = useGameStore.getState().computerState.home?.fs;
    const nexaFs = createMinimalFS();
    useGameStore.getState().initComputer("nexacorp", nexaFs);
    const newNexaFs = createMinimalFS("ren");
    useGameStore.getState().setComputerFs("nexacorp", newNexaFs);
    expect(useGameStore.getState().computerState.home?.fs).toBe(homeFs);
    expect(useGameStore.getState().computerState.nexacorp?.fs).toBe(newNexaFs);
  });

  it("setTabComputer preserves other computers", () => {
    const nexaFs = createMinimalFS();
    useGameStore.getState().initComputer("nexacorp", nexaFs);
    const tabId = useGameStore.getState().tabs[0].id;
    useGameStore.getState().setTabComputer(tabId, "nexacorp", "/home/player");
    const cs = useGameStore.getState().computerState;
    expect(cs.home).toBeDefined();
    expect(cs.nexacorp).toBeDefined();
  });

  it("removeTab preserves computerState", () => {
    const nexaFs = createMinimalFS();
    useGameStore.getState().initComputer("nexacorp", nexaFs);
    const tabId = useGameStore.getState().addTab("nexacorp", "/home/player");
    useGameStore.getState().removeTab(tabId);
    expect(useGameStore.getState().computerState.nexacorp).toBeDefined();
  });

  it("removeTab middle tab activates correct neighbor", () => {
    const store = useGameStore.getState();
    const id2 = store.addTab("home", "/a");
    const id3 = store.addTab("home", "/b");
    // Activate middle tab
    useGameStore.getState().setActiveTab(id2);
    useGameStore.getState().removeTab(id2);
    // After removal, the tab at the same index (id3) should be active
    expect(useGameStore.getState().activeTabId).toBe(id3);
  });

  it("loadGame restores multi-tab state", () => {
    const store = useGameStore.getState();
    const nexaFs = createMinimalFS();
    store.initComputer("nexacorp", nexaFs);
    store.addTab("nexacorp", "/home/player");

    // Save
    store.saveGame("slot-1", "multi-tab");

    // Reset and verify it's clean
    useGameStore.getState().resetGame();
    expect(useGameStore.getState().tabs).toHaveLength(1);

    // Load
    const loaded = useGameStore.getState().loadGame("slot-1");
    expect(loaded).toBe(true);

    const state = useGameStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.computerState.home).toBeDefined();
    expect(state.computerState.nexacorp).toBeDefined();
  });
});
