import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDebouncedStorage } from "./debouncedStorage";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { Mounts } from "../engine/filesystem/mounts";
import { createNexacorpFilesystem } from "../story/filesystem/nexacorp";
import { createHomeFilesystem } from "../story/filesystem/home";
import { createDevcontainerFilesystem } from "../story/filesystem/devcontainer";
import { createChipinfraFilesystem } from "../story/filesystem/chipinfra";
import { createErikpcFilesystem } from "../story/filesystem/erikpc";
import { getComputerUsername } from "../story/player";
import { serializeFS, deserializeFS, SerializedFS } from "../engine/filesystem/serialization";
import { createSaveData, saveToSlot, loadFromSlot } from "./saveManager";
import { SaveSlotId } from "./saveTypes";
import { GamePhase, ComputerId, StoryFlags, PLAYER } from "./types";
import { SnowflakeState } from "../engine/snowflake/state";
import { createInitialSnowflakeState } from "../engine/snowflake/seed/initial_data";
import { serializeSnowflake, deserializeSnowflake, SerializedSnowflake } from "../engine/snowflake/serialization";
import { syncToVirtualFS } from "../engine/snowflake/bridge/fs_bridge";
import { seedDeliveredEmails } from "../engine/mail/delivery";
import { getDefaultEnv, initEnvForComputer, initAliasesForComputer } from "../story/env";
import { findNewlyAvailableChipTopics } from "../engine/chip/notifications";
const MAX_HISTORY = 500;

export interface Toast {
  id: string;
  message: string;
}

export interface TabState {
  id: string;
  computerId: ComputerId;
  cwd: string;
}

interface GameStore {
  username: string;
  currentChapter: string;
  completedObjectives: string[];
  deliveredEmailIds: string[];
  deliveredPiperIds: string[];
  gamePhase: GamePhase;
  snowflakeState: SnowflakeState;
  storyFlags: StoryFlags;
  hasSeenIntro: boolean;
  toasts: Toast[];
  computerState: Partial<Record<ComputerId, { fs: VirtualFS; commandHistory: string[]; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }>>;
  tabs: TabState[];
  activeTabId: string;
  activeSnowSession: string | null;
  pendingPiperNotification: boolean;
  notifiedChipTopicIds: string[];

  // Actions
  setUsername: (username: string) => void;
  pushHistory: (computerId: ComputerId, command: string) => void;
  completeObjective: (id: string) => void;
  setGamePhase: (phase: GamePhase) => void;
  addDeliveredEmails: (ids: string[]) => void;
  addDeliveredPiperMessages: (ids: string[]) => void;
  setSnowflakeState: (state: SnowflakeState) => void;
  setCurrentChapter: (chapter: string) => void;
  setStoryFlag: (key: string, value: string | boolean) => void;
  setHasSeenIntro: () => void;
  addToast: (message: string) => void;
  removeToast: (id: string) => void;
  resetGame: () => void;
  saveGame: (slotId: SaveSlotId, label?: string) => boolean;
  loadGame: (slotId: SaveSlotId) => boolean;
  loadCheckpointData: (data: { chapter: string; activeComputer: ComputerId; storyFlags: StoryFlags; deliveredEmailIds: string[]; deliveredPiperIds: string[]; completedObjectives: string[]; computers: ComputerId[]; commandHistory?: Partial<Record<ComputerId, string[]>>; aliases?: Partial<Record<ComputerId, Record<string, string>>>; envVars?: Partial<Record<ComputerId, Record<string, string>>> }) => boolean;
  setComputerFs: (computer: ComputerId, fs: VirtualFS) => void;
  setComputerMounts: (computer: ComputerId, mounts: Mounts) => void;
  initComputer: (computer: ComputerId, fs: VirtualFS) => void;
  addTab: (computerId: ComputerId, cwd: string) => string;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setTabCwd: (tabId: string, cwd: string) => void;
  setActiveSnowSession: (tabId: string | null) => void;
  setTabComputer: (tabId: string, computerId: ComputerId, cwd: string) => void;
  setComputerEnv: (computer: ComputerId, envVars: Record<string, string>) => void;
  setComputerAliases: (computer: ComputerId, aliases: Record<string, string>) => void;
  removeComputer: (computer: ComputerId) => void;
  setPendingPiperNotification: (value: boolean) => void;
  markChipTopicsNotified: (ids: string[]) => void;
}

export function buildFs(
  username: string,
  computer: ComputerId,
  storyFlags: StoryFlags = {},
  deliveredEmailIds: string[] = []
) {
  const root = computer === "home"
    ? createHomeFilesystem(username)
    : computer === "devcontainer"
      ? createDevcontainerFilesystem(username, storyFlags)
      : computer === "chipinfra"
        ? createChipinfraFilesystem(username, storyFlags)
        : computer === "erik-pc"
          ? createErikpcFilesystem(username)
          : createNexacorpFilesystem(username, storyFlags);
  const sessionUser = getComputerUsername(computer, username);
  const homeDir = `/home/${sessionUser}`;
  let fs = new VirtualFS(root, homeDir, homeDir);

  if (deliveredEmailIds.length > 0) {
    fs = seedDeliveredEmails(fs, deliveredEmailIds, computer, username, new Set(), storyFlags);
  }

  return fs;
}

const MAX_TABS = 5;
let tabCounter = 0;
function nextTabId(): string {
  return `tab-${++tabCounter}`;
}

function createInitialState(username = PLAYER.username) {
  const fs = buildFs(username, "home");
  const initialTabId = nextTabId();
  return {
    username,
    currentChapter: "chapter-1",
    completedObjectives: [] as string[],
    deliveredEmailIds: [] as string[],
    deliveredPiperIds: [] as string[],
    gamePhase: "playing" as GamePhase,
    snowflakeState: createInitialSnowflakeState(),
    // Terminal tabs + copy mode are available from the start of a new game.
    storyFlags: { tabs_unlocked: true } as StoryFlags,
    hasSeenIntro: false,
    toasts: [] as Toast[],
    computerState: { home: { fs, commandHistory: ["nano terminal_notes.txt"], envVars: initEnvForComputer("home", username, fs), aliases: initAliasesForComputer("home", username, fs), mounts: {} } } as Partial<Record<ComputerId, { fs: VirtualFS; commandHistory: string[]; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }>>,
    tabs: [{ id: initialTabId, computerId: "home" as ComputerId, cwd: fs.cwd }] as TabState[],
    activeTabId: initialTabId,
    activeSnowSession: null as string | null,
    pendingPiperNotification: false,
    notifiedChipTopicIds: [] as string[],
  };
}

let toastId = 0;

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...createInitialState(),

      setUsername: (username) => {
        const state = get();
        const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
        const computerId = activeTab?.computerId ?? "home";
        const fs = buildFs(username, computerId, state.storyFlags, state.deliveredEmailIds);
        let finalFs = fs;
        if (computerId === "nexacorp") {
          finalFs = syncToVirtualFS(state.snowflakeState, fs);
        }
        set({
          username,
          computerState: { ...state.computerState, [computerId]: { ...state.computerState[computerId], fs: finalFs, mounts: state.computerState[computerId]?.mounts ?? {} } },
        });
      },
      pushHistory: (computerId, command) =>
        set((state) => {
          const cs = state.computerState[computerId];
          if (!cs) return {};
          // HIST_IGNORE_DUPS: skip if identical to last entry
          if (cs.commandHistory.length > 0 && cs.commandHistory[cs.commandHistory.length - 1] === command) {
            return {};
          }
          return {
            computerState: {
              ...state.computerState,
              [computerId]: { ...cs, commandHistory: [...cs.commandHistory, command].slice(-MAX_HISTORY) },
            },
          };
        }),
      completeObjective: (id) =>
        set((state) => ({
          completedObjectives: [...state.completedObjectives, id],
        })),
      setGamePhase: (phase) => set({ gamePhase: phase }),
      addDeliveredEmails: (ids) =>
        set((state) => ({
          deliveredEmailIds: [...state.deliveredEmailIds, ...ids],
        })),
      addDeliveredPiperMessages: (ids) =>
        set((state) => {
          const seenPrefixes = ids
            .filter((id) => id.startsWith("seen:"))
            .map((id) => id.slice(0, id.lastIndexOf(":") + 1));
          const filtered =
            seenPrefixes.length > 0
              ? state.deliveredPiperIds.filter(
                  (id) => !seenPrefixes.some((prefix) => id.startsWith(prefix))
                )
              : state.deliveredPiperIds;
          return { deliveredPiperIds: [...filtered, ...ids] };
        }),
      setSnowflakeState: (sfState) => set({ snowflakeState: sfState }),
      setCurrentChapter: (chapter) => set({ currentChapter: chapter }),
      setStoryFlag: (key, value) =>
        set((state) => {
          const newFlags = { ...state.storyFlags, [key]: value };
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
          if (!activeTab) return { storyFlags: newFlags };
          const newIds = findNewlyAvailableChipTopics(newFlags, activeTab.computerId, state.notifiedChipTopicIds);
          if (newIds.length === 0) return { storyFlags: newFlags };
          return {
            storyFlags: newFlags,
            notifiedChipTopicIds: [...state.notifiedChipTopicIds, ...newIds],
            toasts: [...state.toasts, { id: String(++toastId), message: "New Chip topic available" }],
          };
        }),
      setHasSeenIntro: () => set({ hasSeenIntro: true }),
      addToast: (message) =>
        set((state) => ({
          toasts: [...state.toasts, { id: String(++toastId), message }],
        })),
      removeToast: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        })),
      setComputerFs: (computer, fs) =>
        set((state) => ({
          computerState: { ...state.computerState, [computer]: { ...state.computerState[computer], fs, commandHistory: state.computerState[computer]?.commandHistory ?? [], envVars: state.computerState[computer]?.envVars ?? getDefaultEnv(computer, state.username), aliases: state.computerState[computer]?.aliases ?? {}, mounts: state.computerState[computer]?.mounts ?? {} } },
        })),
      setComputerMounts: (computer, mounts) =>
        set((state) => ({
          computerState: { ...state.computerState, [computer]: { ...state.computerState[computer]!, mounts } },
        })),
      initComputer: (computer, fs) =>
        set((state) => ({
          computerState: { ...state.computerState, [computer]: { fs, commandHistory: state.computerState[computer]?.commandHistory ?? [], envVars: initEnvForComputer(computer, state.username, fs), aliases: initAliasesForComputer(computer, state.username, fs), mounts: state.computerState[computer]?.mounts ?? {} } },
        })),
      addTab: (computerId, cwd) => {
        const state = get();
        if (state.tabs.length >= MAX_TABS) return state.activeTabId;
        const id = nextTabId();
        set({
          tabs: [...state.tabs, { id, computerId, cwd }],
          activeTabId: id,
        });
        return id;
      },
      removeTab: (tabId) =>
        set((state) => {
          const newTabs = state.tabs.filter((t) => t.id !== tabId);
          if (newTabs.length === 0) return {}; // Can't remove last tab
          const updates: Partial<typeof state> = { tabs: newTabs };
          if (state.activeSnowSession === tabId) {
            updates.activeSnowSession = null;
          }
          if (state.activeTabId === tabId) {
            const idx = state.tabs.findIndex((t) => t.id === tabId);
            const newActive = newTabs[Math.min(idx, newTabs.length - 1)];
            updates.activeTabId = newActive.id;
          }
          return updates;
        }),
      setActiveTab: (tabId) =>
        set((state) => {
          const tab = state.tabs.find((t) => t.id === tabId);
          if (!tab) return {};
          return { activeTabId: tabId };
        }),
      setTabCwd: (tabId, cwd) =>
        set((state) => ({
          tabs: state.tabs.map((t) => t.id === tabId ? { ...t, cwd } : t),
        })),
      setActiveSnowSession: (tabId) => set({ activeSnowSession: tabId }),
      setTabComputer: (tabId, computerId, cwd) =>
        set((state) => ({
          tabs: state.tabs.map((t) => t.id === tabId ? { ...t, computerId, cwd } : t),
        })),
      setComputerEnv: (computer, envVars) =>
        set((state) => ({
          computerState: { ...state.computerState, [computer]: { ...state.computerState[computer]!, envVars } },
        })),
      setComputerAliases: (computer, aliases) =>
        set((state) => ({
          computerState: { ...state.computerState, [computer]: { ...state.computerState[computer]!, aliases } },
        })),
      removeComputer: (computer) =>
        set((state) => {
          const { [computer]: _, ...rest } = state.computerState;
          return { computerState: rest };
        }),
      setPendingPiperNotification: (value) => set({ pendingPiperNotification: value }),
      markChipTopicsNotified: (ids) =>
        set((state) => {
          const seen = new Set(state.notifiedChipTopicIds);
          const additions = ids.filter((id) => !seen.has(id));
          if (additions.length === 0) return {};
          return { notifiedChipTopicIds: [...state.notifiedChipTopicIds, ...additions] };
        }),
      resetGame: () => {
        tabCounter = 0;
        set(createInitialState());
      },

      saveGame: (slotId, label) => {
        const state = get();
        const activeTabIndex = state.tabs.findIndex((t) => t.id === state.activeTabId);
        const saveable = { ...state, activeTabIndex: activeTabIndex >= 0 ? activeTabIndex : 0, notifiedChipTopicIds: [...state.notifiedChipTopicIds] };
        const data = createSaveData(saveable, label ?? `Save ${slotId}`);
        return saveToSlot(slotId, data);
      },

      loadGame: (slotId) => {
        const data = loadFromSlot(slotId);
        if (!data) return false;

        const loadedComputerState: Partial<Record<ComputerId, { fs: VirtualFS; commandHistory: string[]; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }>> = {};
        for (const [id, cs] of Object.entries(data.computerStates)) {
          try {
            const loadedFs = deserializeFS(cs.fs);
            loadedComputerState[id as ComputerId] = {
              fs: loadedFs,
              commandHistory: cs.commandHistory,
              envVars: cs.envVars,
              aliases: cs.aliases,
              mounts: cs.mounts ?? {},
            };
          } catch { /* skip corrupted entries */ }
        }

        tabCounter = 0;
        const tabs = data.tabs.map((t) => ({
          id: nextTabId(),
          computerId: t.computerId,
          cwd: t.cwd,
        }));
        const activeIdx = Math.min(data.activeTabIndex, tabs.length - 1);

        set({
          username: data.username,
          gamePhase: data.gamePhase,
          currentChapter: data.currentChapter,
          completedObjectives: data.completedObjectives,
          deliveredEmailIds: data.deliveredEmailIds,
          deliveredPiperIds: data.deliveredPiperIds,
          storyFlags: data.storyFlags,
          computerState: loadedComputerState,
          tabs,
          activeTabId: tabs[activeIdx].id,
          activeSnowSession: null,
          notifiedChipTopicIds: data.notifiedChipTopicIds ?? [],
        });
        return true;
      },

      loadCheckpointData: (data) => {
        const username = PLAYER.username;
        const homeDir = `/home/${username}`;
        const sfState = createInitialSnowflakeState({ includeDay2: !!data.storyFlags.day1_shutdown });

        const loadedComputerState: Partial<Record<ComputerId, { fs: VirtualFS; commandHistory: string[]; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }>> = {};
        for (const computerId of data.computers) {
          let fs = buildFs(username, computerId, data.storyFlags, data.deliveredEmailIds);
          if (computerId === "nexacorp") {
            fs = syncToVirtualFS(sfState, fs);
          }
          const baseAliases = initAliasesForComputer(computerId, username, fs);
          const checkpointAliases = data.aliases?.[computerId] ?? {};
          loadedComputerState[computerId] = {
            fs,
            commandHistory: data.commandHistory?.[computerId] ?? [],
            envVars: { ...initEnvForComputer(computerId, username, fs), ...(data.envVars?.[computerId] ?? {}) },
            aliases: { ...baseAliases, ...checkpointAliases },
            mounts: {},
          };
        }

        tabCounter = 0;
        const tabId = nextTabId();

        set({
          username,
          gamePhase: "playing",
          currentChapter: data.chapter,
          completedObjectives: [...data.completedObjectives],
          deliveredEmailIds: [...data.deliveredEmailIds],
          deliveredPiperIds: [...data.deliveredPiperIds],
          storyFlags: { ...data.storyFlags },
          snowflakeState: sfState,
          computerState: loadedComputerState,
          tabs: [{ id: tabId, computerId: data.activeComputer, cwd: homeDir }],
          activeTabId: tabId,
          activeSnowSession: null,
          notifiedChipTopicIds: [],
        });
        return true;
      },
    }),
    {
      name: "terminal-turmoil-save",
      storage: createDebouncedStorage(1000),
      partialize: (state) => {
        // Serialize all computer FS entries (including per-computer history)
        const serializedComputerState: Record<string, { fs: SerializedFS; commandHistory: string[]; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }> = {};
        for (const [id, cs] of Object.entries(state.computerState)) {
          if (cs) serializedComputerState[id] = { fs: serializeFS(cs.fs), commandHistory: cs.commandHistory.slice(-MAX_HISTORY), envVars: cs.envVars, aliases: cs.aliases, mounts: cs.mounts ?? {} };
        }
        // Persist tab layout
        const activeTabIndex = state.tabs.findIndex((t) => t.id === state.activeTabId);
        return {
          username: state.username,
          currentChapter: state.currentChapter,
          completedObjectives: state.completedObjectives,
          deliveredEmailIds: state.deliveredEmailIds,
          deliveredPiperIds: state.deliveredPiperIds,
          gamePhase: state.gamePhase,
          storyFlags: state.storyFlags,
          hasSeenIntro: state.hasSeenIntro,
          serializedSnowflake: serializeSnowflake(state.snowflakeState),
          serializedComputerState,
          persistedTabs: state.tabs.map((t) => ({ computerId: t.computerId, cwd: t.cwd })),
          persistedActiveTabIndex: activeTabIndex >= 0 ? activeTabIndex : 0,
          notifiedChipTopicIds: state.notifiedChipTopicIds,
        };
      },
      merge: (persisted, currentState) => {
        const p = persisted as Record<string, unknown> | null;
        if (!p) return currentState;

        const username = (p.username as string) ?? currentState.username;
        const storyFlags = (p.storyFlags as StoryFlags) ?? currentState.storyFlags;

        // Reconstruct SnowflakeState
        let sfState: SnowflakeState;
        const serializedSf = p.serializedSnowflake as SerializedSnowflake | undefined;
        try {
          if (serializedSf?.databases) {
            sfState = deserializeSnowflake(serializedSf);
          } else {
            sfState = createInitialSnowflakeState({ includeDay2: !!storyFlags.day1_shutdown });
          }
        } catch {
          sfState = createInitialSnowflakeState({ includeDay2: !!storyFlags.day1_shutdown });
        }

        // Restore computerState from serialized data
        const computerState: Partial<Record<ComputerId, { fs: VirtualFS; commandHistory: string[]; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }>> = {};
        const serializedCS = p.serializedComputerState as Record<string, { fs: SerializedFS; commandHistory: string[]; envVars: Record<string, string>; aliases: Record<string, string>; mounts?: Mounts }> | undefined;
        if (serializedCS) {
          for (const [id, cs] of Object.entries(serializedCS)) {
            try {
              const restoredFs = deserializeFS(cs.fs);
              computerState[id as ComputerId] = {
                fs: restoredFs,
                commandHistory: cs.commandHistory,
                envVars: cs.envVars,
                aliases: cs.aliases,
                mounts: cs.mounts ?? {},
              };
            } catch { /* skip corrupted entries */ }
          }
          if (computerState.nexacorp) {
            computerState.nexacorp = { ...computerState.nexacorp, fs: syncToVirtualFS(sfState, computerState.nexacorp.fs) };
          }
        }

        // Restore tabs
        tabCounter = 0;
        const persistedTabs = p.persistedTabs as Array<{ computerId: ComputerId; cwd: string }> | undefined;
        const persistedActiveTabIndex = (p.persistedActiveTabIndex as number) ?? 0;
        let tabs: TabState[];
        if (persistedTabs && persistedTabs.length > 0) {
          tabs = persistedTabs.map((t) => ({
            id: nextTabId(),
            computerId: t.computerId,
            cwd: t.cwd,
          }));
        } else {
          tabs = [{ id: nextTabId(), computerId: "home", cwd: `/home/${username}` }];
        }
        const activeIdx = Math.min(persistedActiveTabIndex, tabs.length - 1);

        // Ensure every tab's computer has a corresponding computerState entry.
        // A persisted tab can outlive its computerState if the FS failed to
        // deserialize above, or if the save predates a new ComputerId. Without
        // this rebuild, useTerminal asserts on store.computerState[id]!.fs.
        for (const t of tabs) {
          if (!computerState[t.computerId]) {
            const fs = buildFs(username, t.computerId, storyFlags, (p.deliveredEmailIds as string[]) ?? []);
            const finalFs = t.computerId === "nexacorp" ? syncToVirtualFS(sfState, fs) : fs;
            computerState[t.computerId] = {
              fs: finalFs,
              commandHistory: [],
              envVars: initEnvForComputer(t.computerId, username, finalFs),
              aliases: initAliasesForComputer(t.computerId, username, finalFs),
              mounts: {},
            };
          }
        }

        return {
          ...currentState,
          username,
          currentChapter: (p.currentChapter as string) ?? currentState.currentChapter,
          completedObjectives: (p.completedObjectives as string[]) ?? currentState.completedObjectives,
          deliveredEmailIds: (p.deliveredEmailIds as string[]) ?? currentState.deliveredEmailIds,
          deliveredPiperIds: (p.deliveredPiperIds as string[]) ?? currentState.deliveredPiperIds,
          gamePhase: (p.gamePhase as GamePhase) ?? currentState.gamePhase,
          storyFlags,
          hasSeenIntro: (p.hasSeenIntro as boolean) ?? currentState.hasSeenIntro,
          snowflakeState: sfState,
          computerState,
          tabs,
          activeTabId: tabs[activeIdx].id,
          notifiedChipTopicIds: (p.notifiedChipTopicIds as string[]) ?? [],
        };
      },
    }
  )
);
