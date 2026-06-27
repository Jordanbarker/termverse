import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import {
  type WindowState,
  type SplitDirection,
  makeLeaf,
  makeWindow,
  splitNode,
  collapsePane,
  findLeaf,
  firstLeaf,
  allLeaves,
  focusDirectionTarget,
  nextLeafId,
  setSplitRatio,
  mapLeaf,
  resetPaneIdCounters,
} from "@tt/core/terminal/paneTypes";
import { CRUNCH_MACHINE, HOME_DIR, MAX_PANES_PER_WINDOW, MAX_WINDOWS } from "../lib/machine";
import { buildBaseFs } from "../lib/seed";
import { getCategory, DEFAULT_CATEGORY } from "../challenges/categories";
import type { ChallengeSnapshot } from "../challenges/types";

/** cwd of the focused pane (single window in v1, but written defensively). */
function activeCwd(windows: WindowState[], activeWindowId: string): string {
  const win = windows.find((w) => w.id === activeWindowId) ?? windows[0];
  if (!win) return HOME_DIR;
  return findLeaf(win.root, win.activePaneId)?.cwd ?? HOME_DIR;
}

function windowOfPane(windows: WindowState[], paneId: string): WindowState | undefined {
  return windows.find((w) => findLeaf(w.root, paneId));
}

export interface GameState {
  // shell state (single machine, fs shared across panes; cwd lives per-pane on the leaf)
  fs: VirtualFS;
  envVars: Record<string, string>;
  aliases: Record<string, string>;

  // terminal layout
  windows: WindowState[];
  activeWindowId: string;

  // challenge progress
  activeCategory: string; // selected track id; challengeIndex is relative to its challenge list
  challengeIndex: number;
  stepIndex: number;
  completed: boolean;
  awaitingContinue: boolean;
  flash: string | null;

  // timing
  challengeStartTime: number; // Date.now() when the current challenge loaded
  bestTimes: Record<string, number>; // challengeId -> best completion time (ms); the only persisted field
  lastElapsedMs: number | null; // finish time of the just-completed challenge (drives the gate display)
  lastWasBest: boolean; // whether lastElapsedMs set a new record

  // lifecycle
  selectCategory: (id: string) => void;
  loadChallenge: (index: number) => void;
  restartChallenge: () => void;
  checkCompletion: () => void;
  continueToNext: () => void;
  clearFlash: () => void;

  // shell mutations (called by the command pipeline)
  setFs: (fs: VirtualFS) => void;
  setEnvVars: (env: Record<string, string>) => void;
  setAliases: (a: Record<string, string>) => void;
  setPaneCwd: (paneId: string, cwd: string) => void;

  // pane mutations (driven by tmux-style prefix keys)
  splitPane: (paneId: string, dir: SplitDirection) => string | null;
  closePane: (paneId: string) => void;
  setActivePane: (paneId: string) => void;
  focusDirection: (dir: "L" | "R" | "U" | "D") => void;
  cyclePane: () => void;
  resizePane: (splitId: string, ratio: number) => void;

  // window mutations (driven by tmux-style prefix keys + status-line tabs)
  newWindow: () => void;
  selectWindow: (windowId: string) => void;
  cycleWindow: (dir: "next" | "prev") => void;
  closeWindow: (windowId: string) => void;
  renameWindow: (windowId: string, name: string) => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
  fs: buildBaseFs(),
  envVars: {},
  aliases: {},
  windows: [],
  activeWindowId: "",
  activeCategory: DEFAULT_CATEGORY,
  challengeIndex: 0,
  stepIndex: 0,
  completed: false,
  awaitingContinue: false,
  flash: null,
  challengeStartTime: 0,
  bestTimes: {},
  lastElapsedMs: null,
  lastWasBest: false,

  selectCategory: (id) => {
    set({ activeCategory: id });
    get().loadChallenge(0); // start the newly selected track from its first challenge
  },

  loadChallenge: (index) => {
    const challenge = getCategory(get().activeCategory).challenges[index];
    if (!challenge) return;
    resetPaneIdCounters();
    const fs = challenge.setup(buildBaseFs());
    const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
    set({
      fs,
      envVars: {},
      aliases: {},
      windows: [win],
      activeWindowId: win.id,
      challengeIndex: index,
      stepIndex: 0,
      completed: false,
      awaitingContinue: false,
      challengeStartTime: Date.now(),
      lastElapsedMs: null,
      lastWasBest: false,
    });
  },

  checkCompletion: () => {
    const state = get();
    if (state.completed || state.awaitingContinue) return;
    const group = getCategory(state.activeCategory);
    const challenge = group.challenges[state.challengeIndex];
    if (!challenge) return;

    const activeWindow = state.windows.find((w) => w.id === state.activeWindowId) ?? state.windows[0];
    if (!activeWindow) return;

    const snap: ChallengeSnapshot = {
      activeWindow,
      windows: state.windows,
      fs: state.fs,
      cwd: activeCwd(state.windows, state.activeWindowId),
    };

    const step = challenge.steps[state.stepIndex];
    if (!step || !step.isComplete(snap)) return;

    // This step passed. Advance within the challenge, or to the next challenge.
    if (state.stepIndex + 1 < challenge.steps.length) {
      set({ stepIndex: state.stepIndex + 1, flash: "✓ Step complete" });
      return;
    }

    // Last step of this challenge passed — record the run time and personal best.
    const elapsed = Date.now() - state.challengeStartTime;
    const prevBest = state.bestTimes[challenge.id];
    const isBest = prevBest == null || elapsed < prevBest;
    const bestTimes = isBest ? { ...state.bestTimes, [challenge.id]: elapsed } : state.bestTimes;

    const nextIndex = state.challengeIndex + 1;
    if (nextIndex < group.challenges.length) {
      // Pause on a completion gate; the next challenge loads on continueToNext()
      // (Enter), so the player gets a beat to register the win before the fs +
      // panes reset for the next sandbox. Clear flash so it doesn't compete.
      set({ awaitingContinue: true, flash: null, lastElapsedMs: elapsed, lastWasBest: isBest, bestTimes });
    } else {
      set({
        completed: true,
        flash: "✓ All challenges complete",
        lastElapsedMs: elapsed,
        lastWasBest: isBest,
        bestTimes,
      });
    }
  },

  // Re-seed the current challenge (fs + panes + steps). Used to recover from a
  // destructive dead-end like `rm -rf` wiping a challenge's survivors.
  restartChallenge: () => get().loadChallenge(get().challengeIndex),

  continueToNext: () => {
    const state = get();
    if (!state.awaitingContinue) return;
    // loadChallenge resets awaitingContinue (and fs/panes) for the next sandbox.
    get().loadChallenge(state.challengeIndex + 1);
  },

  clearFlash: () => set({ flash: null }),

  setFs: (fs) => set({ fs }),
  setEnvVars: (envVars) => set({ envVars }),
  setAliases: (aliases) => set({ aliases }),

  setPaneCwd: (paneId, cwd) => {
    set((state) => ({
      windows: state.windows.map((w) => ({ ...w, root: mapLeaf(w.root, paneId, (l) => ({ ...l, cwd })) })),
    }));
  },

  splitPane: (paneId, dir) => {
    const state = get();
    const win = windowOfPane(state.windows, paneId);
    if (!win) return null;
    const leaf = findLeaf(win.root, paneId)!;
    if (allLeaves(win.root).length >= MAX_PANES_PER_WINDOW) return null;
    const res = splitNode(win.root, paneId, dir, () => makeLeaf(leaf.computerId, leaf.cwd));
    if (!res) return null;
    set({
      windows: state.windows.map((w) =>
        w.id === win.id ? { ...w, root: res.root, activePaneId: res.newPaneId } : w
      ),
      activeWindowId: win.id,
    });
    get().checkCompletion();
    return res.newPaneId;
  },

  closePane: (paneId) => {
    set((state) => {
      const win = windowOfPane(state.windows, paneId);
      if (!win) return {};
      const collapsed = collapsePane(win.root, paneId);
      if (collapsed === null) {
        // Last pane of the only window — keep it (single-window challenge).
        return {};
      }
      const newActive = win.activePaneId === paneId ? firstLeaf(collapsed).id : win.activePaneId;
      return {
        windows: state.windows.map((w) =>
          w.id === win.id ? { ...w, root: collapsed, activePaneId: newActive } : w
        ),
      };
    });
    get().checkCompletion();
  },

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
      const win = state.windows.find((w) => w.id === state.activeWindowId);
      if (!win) return {};
      const target = focusDirectionTarget(win.root, win.activePaneId, dir);
      if (!target) return {};
      return { windows: state.windows.map((w) => (w.id === win.id ? { ...w, activePaneId: target } : w)) };
    }),

  cyclePane: () =>
    set((state) => {
      const win = state.windows.find((w) => w.id === state.activeWindowId);
      if (!win) return {};
      const target = nextLeafId(win.root, win.activePaneId);
      return { windows: state.windows.map((w) => (w.id === win.id ? { ...w, activePaneId: target } : w)) };
    }),

  resizePane: (splitId, ratio) => {
    set((state) => ({
      windows: state.windows.map((w) => ({ ...w, root: setSplitRatio(w.root, splitId, ratio) })),
    }));
    get().checkCompletion();
  },

  newWindow: () => {
    const state = get();
    if (state.windows.length >= MAX_WINDOWS) return;
    // Do NOT reset pane-id counters here (only loadChallenge does) — ids must
    // stay unique across all live windows.
    const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
    set({ windows: [...state.windows, win], activeWindowId: win.id });
    get().checkCompletion();
  },

  selectWindow: (windowId) =>
    set((state) => (state.windows.some((w) => w.id === windowId) ? { activeWindowId: windowId } : {})),

  cycleWindow: (dir) =>
    set((state) => {
      if (state.windows.length < 2) return {};
      const idx = state.windows.findIndex((w) => w.id === state.activeWindowId);
      const len = state.windows.length;
      const nextIdx = dir === "next" ? (idx + 1) % len : (idx - 1 + len) % len;
      return { activeWindowId: state.windows[nextIdx].id };
    }),

  closeWindow: (windowId) => {
    set((state) => {
      const newWindows = state.windows.filter((w) => w.id !== windowId);
      if (newWindows.length === 0) return {}; // keep the last window
      const updates: Partial<GameState> = { windows: newWindows };
      if (state.activeWindowId === windowId) {
        const idx = state.windows.findIndex((w) => w.id === windowId);
        updates.activeWindowId = newWindows[Math.min(idx, newWindows.length - 1)].id;
      }
      return updates;
    });
    get().checkCompletion();
  },

  renameWindow: (windowId, name) => {
    set((state) => {
      // Empty/whitespace-only clears the name => label reverts to the derived form.
      const trimmed = name.trim();
      return {
        windows: state.windows.map((w) =>
          w.id === windowId ? { ...w, name: trimmed ? trimmed : undefined } : w
        ),
      };
    });
    get().checkCompletion();
  },
    }),
    {
      name: "term-crunch-progress",
      // Only personal bests survive a refresh; fs/windows/challenge index reseed
      // on mount (GameShell calls loadChallenge(0) when windows.length === 0).
      partialize: (s) => ({ bestTimes: s.bestTimes, activeCategory: s.activeCategory }),
      // Vitest runs in a node env where localStorage is absent (or a partial
      // stub lacking setItem); fall back to an in-memory no-op so the store works
      // under tests without throwing.
      storage: createJSONStorage(() =>
        typeof localStorage !== "undefined" && typeof localStorage.setItem === "function"
          ? localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
      ),
    }
  )
);
