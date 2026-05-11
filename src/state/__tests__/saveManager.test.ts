import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createSaveData,
  saveToSlot,
  loadFromSlot,
  deleteSlot,
  listSaveSlots,
  SaveableState,
} from "../saveManager";
import { SAVE_FORMAT_VERSION } from "../saveTypes";
import { VirtualFS } from "../../engine/filesystem/VirtualFS";
import { DirectoryNode } from "../../engine/filesystem/types";
import { deserializeFS } from "../../engine/filesystem/serialization";

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
                content: "test content",
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

function createBareFS(): VirtualFS {
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

function createState(): SaveableState {
  const fs = createMinimalFS();
  return {
    username: "player",
    gamePhase: "playing",
    currentChapter: "chapter-1",
    completedObjectives: ["obj-1"],
    deliveredEmailIds: ["email-1"],
    deliveredPiperIds: [],
    storyFlags: {},
    computerState: { nexacorp: { fs, commandHistory: ["ls", "cd docs", "cat readme.md"], envVars: { USER: "player", HOME: "/home/player" }, aliases: {}, mounts: {} }},
    tabs: [{ computerId: "nexacorp", cwd: "/home/player" }],
    activeTabIndex: 0,
  };
}

// Mock localStorage
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  removeItem: vi.fn((key: string) => storage.delete(key)),
};
vi.stubGlobal("localStorage", localStorageMock);

beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();
});

describe("createSaveData", () => {
  it("creates save data with correct fields", () => {
    const state = createState();
    const data = createSaveData(state, "Test Save");

    expect(data.version).toBe(SAVE_FORMAT_VERSION);
    expect(data.label).toBe("Test Save");
    expect(data.username).toBe("player");
    expect(data.gamePhase).toBe("playing");
    expect(data.currentChapter).toBe("chapter-1");
    expect(data.completedObjectives).toEqual(["obj-1"]);
    expect(data.deliveredEmailIds).toEqual(["email-1"]);
    expect(data.timestamp).toBeGreaterThan(0);
  });

  it("clones arrays (does not share references)", () => {
    const state = createState();
    const data = createSaveData(state, "Test");
    state.completedObjectives.push("obj-2");
    expect(data.completedObjectives).toEqual(["obj-1"]);
  });

  it("truncates command history to 500 entries per computer", () => {
    const state = createState();
    state.computerState.nexacorp!.commandHistory = Array.from({ length: 600 }, (_, i) => `cmd-${i}`);
    const data = createSaveData(state, "Test");
    expect(data.computerStates.nexacorp.commandHistory).toHaveLength(500);
    expect(data.computerStates.nexacorp.commandHistory[0]).toBe("cmd-100");
  });

  it("serializes computerStates", () => {
    const state = createState();
    const data = createSaveData(state, "Test");
    expect(data.computerStates).toBeDefined();
    expect(data.computerStates.nexacorp).toBeDefined();
    expect(data.computerStates.nexacorp.fs.root).toBeDefined();
  });

  it("serializes envVars in computerStates", () => {
    const state = createState();
    const data = createSaveData(state, "Test");
    expect(data.computerStates.nexacorp.envVars).toEqual({ USER: "player", HOME: "/home/player" });
  });

  it("serializes tabs and activeTabIndex", () => {
    const state = createState();
    const data = createSaveData(state, "Test");
    expect(data.tabs).toEqual([{ computerId: "nexacorp", cwd: "/home/player" }]);
    expect(data.activeTabIndex).toBe(0);
  });

  it("saves multi-tab layout", () => {
    const state = createState();
    state.tabs = [
      { computerId: "nexacorp", cwd: "/home/player" },
      { computerId: "devcontainer", cwd: "/home/player/project" },
    ];
    state.activeTabIndex = 1;
    const data = createSaveData(state, "Test");
    expect(data.tabs).toHaveLength(2);
    expect(data.activeTabIndex).toBe(1);
  });
});

describe("saveToSlot / loadFromSlot", () => {
  it("round-trips save data", () => {
    const state = createState();
    const data = createSaveData(state, "Round Trip");

    const saved = saveToSlot("slot-1", data);
    expect(saved).toBe(true);

    const loaded = loadFromSlot("slot-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.label).toBe("Round Trip");
    expect(loaded!.username).toBe("player");
    expect(loaded!.completedObjectives).toEqual(["obj-1"]);
  });

  it("returns null for empty slot", () => {
    expect(loadFromSlot("slot-2")).toBeNull();
  });

  it("returns false when localStorage throws", () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error("QuotaExceeded");
    });
    const data = createSaveData(createState(), "Test");
    expect(saveToSlot("slot-1", data)).toBe(false);
  });
});

describe("deleteSlot", () => {
  it("removes the slot from storage", () => {
    const data = createSaveData(createState(), "Test");
    saveToSlot("slot-1", data);
    deleteSlot("slot-1");
    expect(loadFromSlot("slot-1")).toBeNull();
  });
});

describe("listSaveSlots", () => {
  it("returns all 4 slots", () => {
    const slots = listSaveSlots();
    expect(slots).toHaveLength(4);
    expect(slots.map((s) => s.slotId)).toEqual([
      "auto",
      "slot-1",
      "slot-2",
      "slot-3",
    ]);
  });

  it("marks empty slots correctly", () => {
    const slots = listSaveSlots();
    expect(slots.every((s) => s.empty)).toBe(true);
  });

  it("shows metadata for populated slots", () => {
    const data = createSaveData(createState(), "My Save");
    saveToSlot("slot-1", data);

    const slots = listSaveSlots();
    const slot1 = slots.find((s) => s.slotId === "slot-1")!;
    expect(slot1.empty).toBe(false);
    expect(slot1.label).toBe("My Save");
    expect(slot1.username).toBe("player");
  });
});


describe("multi-tab round-trip", () => {
  it("full round-trip with 3 tabs on 2 computers", () => {
    const state: SaveableState = {
      username: "player",
      gamePhase: "playing",
      currentChapter: "chapter-2",
      completedObjectives: [],
      deliveredEmailIds: [],
      deliveredPiperIds: [],
      storyFlags: {},
      computerState: {
        nexacorp: { fs: createMinimalFS(), commandHistory: [], envVars: {}, aliases: {}, mounts: {} },
        devcontainer: { fs: createMinimalFS(), commandHistory: [], envVars: {}, aliases: {}, mounts: {} },
      },
      tabs: [
        { computerId: "nexacorp", cwd: "/home/player" },
        { computerId: "devcontainer", cwd: "/home/player" },
        { computerId: "nexacorp", cwd: "/home/player" },
      ],
      activeTabIndex: 1,
    };

    const data = createSaveData(state, "3-tab save");
    saveToSlot("slot-1", data);
    const loaded = loadFromSlot("slot-1");

    expect(loaded).not.toBeNull();
    expect(loaded!.computerStates).toBeDefined();
    expect(loaded!.computerStates.nexacorp).toBeDefined();
    expect(loaded!.computerStates.devcontainer).toBeDefined();
    expect(loaded!.tabs).toHaveLength(3);
    expect(loaded!.tabs[0].computerId).toBe("nexacorp");
    expect(loaded!.tabs[1].computerId).toBe("devcontainer");
    expect(loaded!.tabs[2].computerId).toBe("nexacorp");
    expect(loaded!.activeTabIndex).toBe(1);
  });

  it("FS isolation preserved across save/load", () => {
    const state: SaveableState = {
      username: "player",
      gamePhase: "playing",
      currentChapter: "chapter-2",
      completedObjectives: [],
      deliveredEmailIds: [],
      deliveredPiperIds: [],
      storyFlags: {},
      computerState: {
        nexacorp: { fs: createMinimalFS(), commandHistory: [], envVars: {}, aliases: {}, mounts: {} },
        devcontainer: { fs: createBareFS(), commandHistory: [], envVars: {}, aliases: {}, mounts: {} },
      },
      tabs: [
        { computerId: "nexacorp", cwd: "/home/player" },
        { computerId: "devcontainer", cwd: "/home/player" },
      ],
      activeTabIndex: 0,
    };

    const data = createSaveData(state, "isolation test");
    saveToSlot("slot-1", data);
    const loaded = loadFromSlot("slot-1");

    expect(loaded).not.toBeNull();
    const nexaFs = deserializeFS(loaded!.computerStates.nexacorp.fs);
    const devFs = deserializeFS(loaded!.computerStates.devcontainer.fs);

    expect(nexaFs.readFile("/home/player/test.txt").content).toBe(
      "test content"
    );
    expect(devFs.readFile("/home/player/test.txt").error).toBeDefined();
  });

  it("single tab round-trip", () => {
    const state: SaveableState = {
      username: "player",
      gamePhase: "playing",
      currentChapter: "chapter-1",
      completedObjectives: [],
      deliveredEmailIds: [],
      deliveredPiperIds: [],
      storyFlags: {},
      computerState: { nexacorp: { fs: createMinimalFS(), commandHistory: [], envVars: {}, aliases: {}, mounts: {} }},
      tabs: [{ computerId: "nexacorp", cwd: "/home/player" }],
      activeTabIndex: 0,
    };

    const data = createSaveData(state, "single tab");
    saveToSlot("slot-1", data);
    const loaded = loadFromSlot("slot-1");

    expect(loaded).not.toBeNull();
    expect(loaded!.tabs).toHaveLength(1);
    expect(loaded!.activeTabIndex).toBe(0);
  });

  it("max tabs (5) round-trip", () => {
    const state: SaveableState = {
      username: "player",
      gamePhase: "playing",
      currentChapter: "chapter-3",
      completedObjectives: [],
      deliveredEmailIds: [],
      deliveredPiperIds: [],
      storyFlags: {},
      computerState: {
        home: { fs: createMinimalFS(), commandHistory: [], envVars: {}, aliases: {}, mounts: {} },
        nexacorp: { fs: createMinimalFS(), commandHistory: [], envVars: {}, aliases: {}, mounts: {} },
        devcontainer: { fs: createBareFS(), commandHistory: [], envVars: {}, aliases: {}, mounts: {} },
      },
      tabs: [
        { computerId: "home", cwd: "/home/player" },
        { computerId: "nexacorp", cwd: "/home/player" },
        { computerId: "devcontainer", cwd: "/home/player" },
        { computerId: "nexacorp", cwd: "/home/player" },
        { computerId: "home", cwd: "/home/player" },
      ],
      activeTabIndex: 2,
    };

    const data = createSaveData(state, "max tabs");
    saveToSlot("slot-1", data);
    const loaded = loadFromSlot("slot-1");

    expect(loaded).not.toBeNull();
    expect(loaded!.tabs).toHaveLength(5);
    expect(loaded!.activeTabIndex).toBe(2);
  });
});
