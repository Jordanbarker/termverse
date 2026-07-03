import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDebouncedStorage } from "./debouncedStorage";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { Mounts } from "@tt/core/filesystem/mounts";
import "../story/git/remotes"; // side effect: registers this story's clonable git remotes into @tt/core
import { buildFs, createSaveData, saveToSlot, loadFromSlot, serializeGameState, restoreGameState } from "./saveManager";
import { SaveSlotId, SavePayload, SAVE_FORMAT_VERSION } from "./saveTypes";
import { GamePhase, ComputerId, StoryFlags, PLAYER } from "./types";
import { SnowflakeState } from "@tt/core/snowflake/state";
import { createInitialSnowflakeState } from "@/story/data/snowflake/initial_data";
import { syncToVirtualFS } from "@tt/core/snowflake/bridge/fs_bridge";
import { getDefaultEnv, initEnvForComputer, initAliasesForComputer } from "../story/env";
import { findNewlyAvailableChipTopics } from "../engine/chip/notifications";
import {
  WindowState,
  PaneLeaf,
  SplitDirection,
  makeWindow,
  makeLeaf,
  allLeaves,
  firstLeaf,
  findLeaf,
  mapLeaf,
  splitNode,
  collapsePane,
  prunePanesByComputer,
  setSplitRatio,
  nudgeSplitRatio,
  focusDirectionTarget,
  nextLeafId,
  resetPaneIdCounters,
} from "@tt/core/terminal/paneTypes";

export { buildFs };

export interface Toast {
  id: string;
  message: string;
}

/** Max windows (tmux-style tabs) and panes per window. */
export const MAX_WINDOWS = 5;
const MAX_PANES_PER_WINDOW = 6;

/** State subset the active-pane selectors need. */
type WindowSlice = { windows: WindowState[]; activeWindowId: string };

export function getActiveWindow(state: WindowSlice): WindowState | undefined {
  return state.windows.find((w) => w.id === state.activeWindowId);
}
export function getActivePaneId(state: WindowSlice): string | undefined {
  return getActiveWindow(state)?.activePaneId;
}
export function getActiveLeaf(state: WindowSlice): PaneLeaf | undefined {
  const w = getActiveWindow(state);
  return w ? findLeaf(w.root, w.activePaneId) : undefined;
}
/** The window that contains a given pane id, or undefined. */
function windowOfPane(windows: WindowState[], paneId: string): WindowState | undefined {
  return windows.find((w) => findLeaf(w.root, paneId));
}
/** Ensure a window's activePaneId still points at a live leaf. */
function normalizeFocus(w: WindowState): WindowState {
  if (findLeaf(w.root, w.activePaneId)) return w;
  return { ...w, activePaneId: firstLeaf(w.root).id };
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
  computerState: Partial<Record<ComputerId, { fs: VirtualFS; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }>>;
  // Durable per-computer mirror of the `.zsh_history` file contents. Survives FS
  // rebuilds and removeComputer so shell history continues across day/computer
  // transitions; restored into the fresh fs by initComputer.
  zshHistory: Partial<Record<ComputerId, string>>;
  windows: WindowState[];
  activeWindowId: string;
  // Pane id of the snow REPL's pane (null when no session). Pane-scoped.
  activeSnowSession: string | null;
  pendingPiperNotification: boolean;
  notifiedChipTopicIds: string[];
  // UI preference: hide the copy-mode key-hint overlay (toggled with `?` in copy mode).
  copyModeHelpHidden: boolean;

  // Actions
  setUsername: (username: string) => void;
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
  loadCheckpointData: (data: { chapter: string; activeComputer: ComputerId; storyFlags: StoryFlags; deliveredEmailIds: string[]; deliveredPiperIds: string[]; completedObjectives: string[]; computers: ComputerId[]; aliases?: Partial<Record<ComputerId, Record<string, string>>>; envVars?: Partial<Record<ComputerId, Record<string, string>>> }) => boolean;
  setComputerFs: (computer: ComputerId, fs: VirtualFS) => void;
  setComputerMounts: (computer: ComputerId, mounts: Mounts) => void;
  initComputer: (computer: ComputerId, fs: VirtualFS) => void;
  // Window-level (tmux tabs)
  addWindow: (computerId: ComputerId, cwd: string) => string;
  removeWindow: (windowId: string) => void;
  setActiveWindow: (windowId: string) => void;
  renameWindow: (windowId: string, name: string) => void;
  // Pane-level
  splitPane: (paneId: string, direction: SplitDirection) => string | null;
  closePane: (paneId: string) => void;
  setActivePane: (paneId: string) => void;
  focusDirection: (dir: "L" | "R" | "U" | "D") => void;
  cyclePane: () => void;
  resizePane: (splitId: string, ratio: number) => void;
  nudgeSplitRatio: (splitId: string, delta: number) => void;
  setPaneCwd: (paneId: string, cwd: string) => void;
  setPaneComputer: (paneId: string, computerId: ComputerId, cwd: string) => void;
  // Convenience for transitions/command execution (operate on the active pane)
  setActivePaneCwd: (cwd: string) => void;
  setActivePaneComputer: (computerId: ComputerId, cwd: string) => void;
  // Teardown: prune panes on downed computers (active pane preserved); collapse to one pane.
  closePanesForComputers: (computerIds: ComputerId[]) => void;
  closeOtherPanes: () => void;
  setActiveSnowSession: (paneId: string | null) => void;
  setComputerEnv: (computer: ComputerId, envVars: Record<string, string>) => void;
  setComputerAliases: (computer: ComputerId, aliases: Record<string, string>) => void;
  removeComputer: (computer: ComputerId) => void;
  setPendingPiperNotification: (value: boolean) => void;
  markChipTopicsNotified: (ids: string[]) => void;
  setCopyModeHelpHidden: (hidden: boolean) => void;
}

function createInitialState(username = PLAYER.username) {
  resetPaneIdCounters();
  const fs = buildFs(username, "home");
  const initialWindow = makeWindow("home", fs.cwd);
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
    computerState: { home: { fs, envVars: initEnvForComputer("home", username, fs), aliases: initAliasesForComputer("home", username, fs), mounts: {} } } as Partial<Record<ComputerId, { fs: VirtualFS; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }>>,
    zshHistory: {} as Partial<Record<ComputerId, string>>,
    windows: [initialWindow] as WindowState[],
    activeWindowId: initialWindow.id,
    activeSnowSession: null as string | null,
    pendingPiperNotification: false,
    notifiedChipTopicIds: [] as string[],
    copyModeHelpHidden: false,
  };
}

let toastId = 0;

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...createInitialState(),

      setUsername: (username) => {
        const state = get();
        const computerId = (getActiveLeaf(state)?.computerId ?? "home") as ComputerId;
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
          const activeLeaf = getActiveLeaf(state);
          if (!activeLeaf) return { storyFlags: newFlags };
          const newIds = findNewlyAvailableChipTopics(newFlags, activeLeaf.computerId as ComputerId, state.notifiedChipTopicIds);
          if (newIds.length === 0) return { storyFlags: newFlags };
          return {
            storyFlags: newFlags,
            notifiedChipTopicIds: [...state.notifiedChipTopicIds, ...newIds],
            toasts: [...state.toasts, { id: String(++toastId), message: "New Chip topic available" }],
          };
        }),
      setHasSeenIntro: () => set({ hasSeenIntro: true }),
      setCopyModeHelpHidden: (hidden) => set({ copyModeHelpHidden: hidden }),
      addToast: (message) =>
        set((state) => ({
          toasts: [...state.toasts, { id: String(++toastId), message }],
        })),
      removeToast: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        })),
      setComputerFs: (computer, fs) =>
        set((state) => {
          // Refresh the durable .zsh_history mirror from the written-back fs so it
          // survives a later removeComputer / FS rebuild. `!= null` (not truthy)
          // so a truncated/empty history is mirrored faithfully.
          const historyContent = fs.readFile(`${fs.homeDir}/.zsh_history`).content;
          return {
            computerState: { ...state.computerState, [computer]: { ...state.computerState[computer], fs, envVars: state.computerState[computer]?.envVars ?? getDefaultEnv(computer, state.username), aliases: state.computerState[computer]?.aliases ?? {}, mounts: state.computerState[computer]?.mounts ?? {} } },
            zshHistory: historyContent != null ? { ...state.zshHistory, [computer]: historyContent } : state.zshHistory,
          };
        }),
      setComputerMounts: (computer, mounts) =>
        set((state) => ({
          computerState: { ...state.computerState, [computer]: { ...state.computerState[computer]!, mounts } },
        })),
      initComputer: (computer, fs) =>
        set((state) => {
          // Every FS (re)build funnels through here, so this is the single place
          // that restores the durable .zsh_history mirror into the freshly-built
          // fs — covering shutdown rebuilds and post-removeComputer revisits.
          // When the mirror is absent (brand-new computer / fresh game) the
          // builder's seed stands.
          let finalFs = fs;
          const savedHistory = state.zshHistory?.[computer];
          if (savedHistory != null) {
            const written = fs.writeFile(`${fs.homeDir}/.zsh_history`, savedHistory);
            if (written.fs) finalFs = written.fs;
          }
          return {
            computerState: { ...state.computerState, [computer]: { fs: finalFs, envVars: initEnvForComputer(computer, state.username, finalFs), aliases: initAliasesForComputer(computer, state.username, finalFs), mounts: state.computerState[computer]?.mounts ?? {} } },
          };
        }),
      addWindow: (computerId, cwd) => {
        const state = get();
        if (state.windows.length >= MAX_WINDOWS) return state.activeWindowId;
        const win = makeWindow(computerId, cwd);
        set({ windows: [...state.windows, win], activeWindowId: win.id });
        return win.id;
      },
      removeWindow: (windowId) =>
        set((state) => {
          const newWindows = state.windows.filter((w) => w.id !== windowId);
          if (newWindows.length === 0) return {}; // Can't remove the last window
          const updates: Partial<typeof state> = { windows: newWindows };
          // Clear a snow session whose pane lived in the closed window.
          const closed = state.windows.find((w) => w.id === windowId);
          if (closed && state.activeSnowSession && findLeaf(closed.root, state.activeSnowSession)) {
            updates.activeSnowSession = null;
          }
          if (state.activeWindowId === windowId) {
            const idx = state.windows.findIndex((w) => w.id === windowId);
            updates.activeWindowId = newWindows[Math.min(idx, newWindows.length - 1)].id;
          }
          return updates;
        }),
      setActiveWindow: (windowId) =>
        set((state) => (state.windows.some((w) => w.id === windowId) ? { activeWindowId: windowId } : {})),
      renameWindow: (windowId, name) =>
        set((state) => {
          // Empty/whitespace-only clears the name => label reverts to the derived form.
          const trimmed = name.trim();
          return {
            windows: state.windows.map((w) =>
              w.id === windowId ? { ...w, name: trimmed ? trimmed : undefined } : w
            ),
          };
        }),
      splitPane: (paneId, direction) => {
        const state = get();
        const win = windowOfPane(state.windows, paneId);
        if (!win) return null;
        const leaf = findLeaf(win.root, paneId)!;
        if (allLeaves(win.root).length >= MAX_PANES_PER_WINDOW) return null;
        const res = splitNode(win.root, paneId, direction, () => makeLeaf(leaf.computerId, leaf.cwd));
        if (!res) return null;
        set({
          windows: state.windows.map((w) =>
            w.id === win.id ? { ...w, root: res.root, activePaneId: res.newPaneId } : w
          ),
          activeWindowId: win.id,
        });
        return res.newPaneId;
      },
      closePane: (paneId) =>
        set((state) => {
          const win = windowOfPane(state.windows, paneId);
          if (!win) return {};
          const collapsed = collapsePane(win.root, paneId);
          const updates: Partial<typeof state> = {};
          if (state.activeSnowSession === paneId) updates.activeSnowSession = null;
          if (collapsed === null) {
            // Last pane in the window — drop the window unless it's the only one.
            if (state.windows.length === 1) return updates;
            const newWindows = state.windows.filter((w) => w.id !== win.id);
            updates.windows = newWindows;
            if (state.activeWindowId === win.id) {
              const idx = state.windows.findIndex((w) => w.id === win.id);
              updates.activeWindowId = newWindows[Math.min(idx, newWindows.length - 1)].id;
            }
            return updates;
          }
          const newActivePane = win.activePaneId === paneId ? firstLeaf(collapsed).id : win.activePaneId;
          updates.windows = state.windows.map((w) =>
            w.id === win.id ? { ...w, root: collapsed, activePaneId: newActivePane } : w
          );
          return updates;
        }),
      setActivePane: (paneId) =>
        set((state) => {
          const win = windowOfPane(state.windows, paneId);
          if (!win) return {};
          return {
            activeWindowId: win.id,
            windows: state.windows.map((w) => (w.id === win.id ? { ...w, activePaneId: paneId } : w)),
          };
        }),
      focusDirection: (dir) =>
        set((state) => {
          const win = getActiveWindow(state);
          if (!win) return {};
          const target = focusDirectionTarget(win.root, win.activePaneId, dir);
          if (!target) return {};
          return { windows: state.windows.map((w) => (w.id === win.id ? { ...w, activePaneId: target } : w)) };
        }),
      cyclePane: () =>
        set((state) => {
          const win = getActiveWindow(state);
          if (!win) return {};
          const target = nextLeafId(win.root, win.activePaneId);
          return { windows: state.windows.map((w) => (w.id === win.id ? { ...w, activePaneId: target } : w)) };
        }),
      resizePane: (splitId, ratio) =>
        set((state) => ({
          windows: state.windows.map((w) => ({ ...w, root: setSplitRatio(w.root, splitId, ratio) })),
        })),
      nudgeSplitRatio: (splitId, delta) =>
        set((state) => ({
          windows: state.windows.map((w) => ({ ...w, root: nudgeSplitRatio(w.root, splitId, delta) })),
        })),
      setPaneCwd: (paneId, cwd) =>
        set((state) => ({
          windows: state.windows.map((w) => ({ ...w, root: mapLeaf(w.root, paneId, (l) => ({ ...l, cwd })) })),
        })),
      setPaneComputer: (paneId, computerId, cwd) =>
        set((state) => ({
          windows: state.windows.map((w) => ({
            ...w,
            root: mapLeaf(w.root, paneId, (l) => ({ ...l, computerId, cwd })),
          })),
        })),
      setActivePaneCwd: (cwd) => {
        const paneId = getActivePaneId(get());
        if (paneId) get().setPaneCwd(paneId, cwd);
      },
      setActivePaneComputer: (computerId, cwd) => {
        const paneId = getActivePaneId(get());
        if (paneId) get().setPaneComputer(paneId, computerId, cwd);
      },
      closePanesForComputers: (computerIds) =>
        set((state) => {
          const downed = new Set(computerIds);
          const protectedId = getActivePaneId(state);
          const newWindows: WindowState[] = [];
          for (const w of state.windows) {
            const pruned = prunePanesByComputer(w.root, downed, protectedId);
            if (pruned) newWindows.push(normalizeFocus({ ...w, root: pruned }));
          }
          if (newWindows.length === 0) return {};
          const activeStillThere = newWindows.some((w) => w.id === state.activeWindowId);
          const updates: Partial<typeof state> = {
            windows: newWindows,
            activeWindowId: activeStillThere ? state.activeWindowId : newWindows[0].id,
          };
          if (state.activeSnowSession && !newWindows.some((w) => findLeaf(w.root, state.activeSnowSession!))) {
            updates.activeSnowSession = null;
          }
          return updates;
        }),
      closeOtherPanes: () =>
        set((state) => {
          const win = getActiveWindow(state);
          const leaf = win ? findLeaf(win.root, win.activePaneId) : undefined;
          if (!win || !leaf) return {};
          const collapsedWindow: WindowState = { ...win, root: leaf, activePaneId: leaf.id };
          const updates: Partial<typeof state> = {
            windows: [collapsedWindow],
            activeWindowId: collapsedWindow.id,
          };
          if (state.activeSnowSession && state.activeSnowSession !== leaf.id) {
            updates.activeSnowSession = null;
          }
          return updates;
        }),
      setActiveSnowSession: (paneId) => set({ activeSnowSession: paneId }),
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
        set(createInitialState());
      },

      saveGame: (slotId, label) => {
        const data = createSaveData(get(), label ?? `Save ${slotId}`);
        return saveToSlot(slotId, data);
      },

      loadGame: (slotId) => {
        const data = loadFromSlot(slotId);
        if (!data || data.version !== SAVE_FORMAT_VERSION) return false;
        set(restoreGameState(data));
        return true;
      },

      loadCheckpointData: (data) => {
        const username = PLAYER.username;
        const homeDir = `/home/${username}`;
        const sfState = createInitialSnowflakeState({ includeDay2: !!data.storyFlags.day1_shutdown });

        const loadedComputerState: Partial<Record<ComputerId, { fs: VirtualFS; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }>> = {};
        for (const computerId of data.computers) {
          let fs = buildFs(username, computerId, data.storyFlags, data.deliveredEmailIds);
          if (computerId === "nexacorp") {
            fs = syncToVirtualFS(sfState, fs);
          }
          const baseAliases = initAliasesForComputer(computerId, username, fs);
          const checkpointAliases = data.aliases?.[computerId] ?? {};
          loadedComputerState[computerId] = {
            fs,
            envVars: { ...initEnvForComputer(computerId, username, fs), ...(data.envVars?.[computerId] ?? {}) },
            aliases: { ...baseAliases, ...checkpointAliases },
            mounts: {},
          };
        }

        resetPaneIdCounters();
        const win = makeWindow(data.activeComputer, homeDir);

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
          // Fresh cheat-load: clear the history mirror so each computer's seeded
          // .zsh_history file stands.
          zshHistory: {},
          windows: [win],
          activeWindowId: win.id,
          activeSnowSession: null,
          notifiedChipTopicIds: [],
        });
        return true;
      },
    }),
    {
      name: "termoil-save",
      storage: createDebouncedStorage(1000),
      partialize: (state) => serializeGameState(state),
      merge: (persisted, currentState) => {
        const p = persisted as SavePayload | null;
        // Version mismatch (or pre-versioned blob) => discard and start fresh.
        // Pre-release: no migrations.
        if (!p || p.version !== SAVE_FORMAT_VERSION) return currentState;
        return { ...currentState, ...restoreGameState(p) };
      },
    }
  )
);
