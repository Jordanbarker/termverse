import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createSaveData,
  serializeGameState,
  restoreGameState,
  saveToSlot,
  loadFromSlot,
  deleteSlot,
  listSaveSlots,
  SaveableState,
} from "../saveManager";
import { SAVE_FORMAT_VERSION } from "../saveTypes";
import { makeWindow, SavedPaneNode } from "@tt/core/terminal/paneTypes";
import { ComputerId } from "../types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";
import { deserializeFS } from "@tt/core/filesystem/serialization";
import { SnowflakeState } from "@tt/core/snowflake/state";

const emptySnowflake = () => new SnowflakeState({ databases: {}, warehouses: {} });

/** A single-pane window for a given computer/cwd. */
const win = (computerId: ComputerId, cwd: string) => makeWindow(computerId, cwd);
/** The leaf computer of a saved single-pane window's root. */
const savedLeafComputer = (root: SavedPaneNode): string =>
  root.kind === "leaf" ? root.computerId : "(split)";

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
  const windows = [win("nexacorp", "/home/player")];
  return {
    username: "player",
    gamePhase: "playing",
    currentChapter: "chapter-1",
    completedObjectives: ["obj-1"],
    deliveredEmailIds: ["email-1"],
    deliveredPiperIds: [],
    storyFlags: {},
    hasSeenIntro: true,
    computerState: { nexacorp: { fs, envVars: { USER: "player", HOME: "/home/player" }, aliases: {}, mounts: {} }},
    zshHistory: { nexacorp: "ls\ncd docs\ncat readme.md\n" },
    windows,
    activeWindowId: windows[0].id,
    notifiedChipTopicIds: [],
    snowflakeState: emptySnowflake(),
    copyModeHelpHidden: true,
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

  it("persists the durable .zsh_history mirror", () => {
    const state = createState();
    const data = createSaveData(state, "Test");
    expect(data.zshHistory).toEqual({ nexacorp: "ls\ncd docs\ncat readme.md\n" });
  });

  it("clones the zshHistory mirror (does not share references)", () => {
    const state = createState();
    const data = createSaveData(state, "Test");
    state.zshHistory.nexacorp = "mutated";
    expect(data.zshHistory.nexacorp).toBe("ls\ncd docs\ncat readme.md\n");
  });

  it("serializes the snowflake state", () => {
    const state = createState();
    const data = createSaveData(state, "Test");
    expect(data.serializedSnowflake).toBeDefined();
    expect(data.serializedSnowflake.databases).toBeDefined();
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

  it("serializes windows and activeWindowIndex", () => {
    const state = createState();
    const data = createSaveData(state, "Test");
    expect(data.windows).toHaveLength(1);
    expect(data.windows[0].root).toEqual({ kind: "leaf", computerId: "nexacorp", cwd: "/home/player" });
    expect(data.windows[0].activePaneIndex).toBe(0);
    expect(data.activeWindowIndex).toBe(0);
  });

  it("saves multi-window layout", () => {
    const state = createState();
    state.windows = [
      win("nexacorp", "/home/player"),
      win("devcontainer", "/home/player/project"),
    ];
    state.activeWindowId = state.windows[1].id;
    const data = createSaveData(state, "Test");
    expect(data.windows).toHaveLength(2);
    expect(data.activeWindowIndex).toBe(1);
  });
});

describe("serializeGameState / restoreGameState round-trip", () => {
  it("restores the snapshot fields, including intro/copy-mode preferences", () => {
    const state = createState();
    const restored = restoreGameState(serializeGameState(state));

    expect(restored.username).toBe("player");
    expect(restored.gamePhase).toBe("playing");
    expect(restored.currentChapter).toBe("chapter-1");
    expect(restored.completedObjectives).toEqual(["obj-1"]);
    expect(restored.hasSeenIntro).toBe(true);
    expect(restored.copyModeHelpHidden).toBe(true);
    expect(restored.zshHistory).toEqual(state.zshHistory);
    expect(restored.windows).toHaveLength(1);
    expect(restored.activeWindowId).toBe(restored.windows[0].id);
    expect(restored.activeSnowSession).toBeNull();
    expect(
      restored.computerState.nexacorp!.fs.readFile("/home/player/test.txt").content
    ).toBe("test content");
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
  it("returns all 3 slots", () => {
    const slots = listSaveSlots();
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.slotId)).toEqual([
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
    const windows = [
      win("nexacorp", "/home/player"),
      win("devcontainer", "/home/player"),
      win("nexacorp", "/home/player"),
    ];
    const state: SaveableState = {
      username: "player",
      gamePhase: "playing",
      currentChapter: "chapter-2",
      completedObjectives: [],
      deliveredEmailIds: [],
      deliveredPiperIds: [],
      storyFlags: {},
      hasSeenIntro: false,
      zshHistory: {},
      computerState: {
        nexacorp: { fs: createMinimalFS(), envVars: {}, aliases: {}, mounts: {} },
        devcontainer: { fs: createMinimalFS(), envVars: {}, aliases: {}, mounts: {} },
      },
      windows,
      activeWindowId: windows[1].id,
      notifiedChipTopicIds: [],
      snowflakeState: emptySnowflake(),
      copyModeHelpHidden: false,
    };

    const data = createSaveData(state, "3-tab save");
    saveToSlot("slot-1", data);
    const loaded = loadFromSlot("slot-1");

    expect(loaded).not.toBeNull();
    expect(loaded!.computerStates).toBeDefined();
    expect(loaded!.computerStates.nexacorp).toBeDefined();
    expect(loaded!.computerStates.devcontainer).toBeDefined();
    expect(loaded!.windows).toHaveLength(3);
    expect(savedLeafComputer(loaded!.windows[0].root)).toBe("nexacorp");
    expect(savedLeafComputer(loaded!.windows[1].root)).toBe("devcontainer");
    expect(savedLeafComputer(loaded!.windows[2].root)).toBe("nexacorp");
    expect(loaded!.activeWindowIndex).toBe(1);
  });

  it("FS isolation preserved across save/load", () => {
    const windows = [
      win("nexacorp", "/home/player"),
      win("devcontainer", "/home/player"),
    ];
    const state: SaveableState = {
      username: "player",
      gamePhase: "playing",
      currentChapter: "chapter-2",
      completedObjectives: [],
      deliveredEmailIds: [],
      deliveredPiperIds: [],
      storyFlags: {},
      hasSeenIntro: false,
      zshHistory: {},
      computerState: {
        nexacorp: { fs: createMinimalFS(), envVars: {}, aliases: {}, mounts: {} },
        devcontainer: { fs: createBareFS(), envVars: {}, aliases: {}, mounts: {} },
      },
      windows,
      activeWindowId: windows[0].id,
      notifiedChipTopicIds: [],
      snowflakeState: emptySnowflake(),
      copyModeHelpHidden: false,
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
    const windows = [win("nexacorp", "/home/player")];
    const state: SaveableState = {
      username: "player",
      gamePhase: "playing",
      currentChapter: "chapter-1",
      completedObjectives: [],
      deliveredEmailIds: [],
      deliveredPiperIds: [],
      storyFlags: {},
      hasSeenIntro: false,
      zshHistory: {},
      computerState: { nexacorp: { fs: createMinimalFS(), envVars: {}, aliases: {}, mounts: {} }},
      windows,
      activeWindowId: windows[0].id,
      notifiedChipTopicIds: [],
      snowflakeState: emptySnowflake(),
      copyModeHelpHidden: false,
    };

    const data = createSaveData(state, "single window");
    saveToSlot("slot-1", data);
    const loaded = loadFromSlot("slot-1");

    expect(loaded).not.toBeNull();
    expect(loaded!.windows).toHaveLength(1);
    expect(loaded!.activeWindowIndex).toBe(0);
  });

  it("max tabs (5) round-trip", () => {
    const windows = [
      win("home", "/home/player"),
      win("nexacorp", "/home/player"),
      win("devcontainer", "/home/player"),
      win("nexacorp", "/home/player"),
      win("home", "/home/player"),
    ];
    const state: SaveableState = {
      username: "player",
      gamePhase: "playing",
      currentChapter: "chapter-3",
      completedObjectives: [],
      deliveredEmailIds: [],
      deliveredPiperIds: [],
      storyFlags: {},
      hasSeenIntro: false,
      zshHistory: {},
      computerState: {
        home: { fs: createMinimalFS(), envVars: {}, aliases: {}, mounts: {} },
        nexacorp: { fs: createMinimalFS(), envVars: {}, aliases: {}, mounts: {} },
        devcontainer: { fs: createBareFS(), envVars: {}, aliases: {}, mounts: {} },
      },
      windows,
      activeWindowId: windows[2].id,
      notifiedChipTopicIds: [],
      snowflakeState: emptySnowflake(),
      copyModeHelpHidden: false,
    };

    const data = createSaveData(state, "max tabs");
    saveToSlot("slot-1", data);
    const loaded = loadFromSlot("slot-1");

    expect(loaded).not.toBeNull();
    expect(loaded!.windows).toHaveLength(5);
    expect(loaded!.activeWindowIndex).toBe(2);
  });
});
