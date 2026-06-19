import { create } from "zustand";
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
import { PUZZLE_MACHINE, HOME_DIR, MAX_PANES_PER_WINDOW, MAX_WINDOWS } from "../lib/machine";
import { buildPuzzleFs } from "../lib/seed";
import { CHALLENGES } from "../challenges/registry";
import type { PuzzleSnapshot } from "../challenges/types";

/** cwd of the focused pane (single window in v1, but written defensively). */
function activeCwd(windows: WindowState[], activeWindowId: string): string {
  const win = windows.find((w) => w.id === activeWindowId) ?? windows[0];
  if (!win) return HOME_DIR;
  return findLeaf(win.root, win.activePaneId)?.cwd ?? HOME_DIR;
}

function windowOfPane(windows: WindowState[], paneId: string): WindowState | undefined {
  return windows.find((w) => findLeaf(w.root, paneId));
}

export interface PuzzleState {
  // shell state (single machine, fs shared across panes; cwd lives per-pane on the leaf)
  fs: VirtualFS;
  envVars: Record<string, string>;
  aliases: Record<string, string>;

  // terminal layout
  windows: WindowState[];
  activeWindowId: string;

  // challenge progress
  challengeIndex: number;
  stepIndex: number;
  completed: boolean;
  awaitingContinue: boolean;
  flash: string | null;

  // lifecycle
  loadChallenge: (index: number) => void;
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

export const usePuzzleStore = create<PuzzleState>((set, get) => ({
  fs: buildPuzzleFs(),
  envVars: {},
  aliases: {},
  windows: [],
  activeWindowId: "",
  challengeIndex: 0,
  stepIndex: 0,
  completed: false,
  awaitingContinue: false,
  flash: null,

  loadChallenge: (index) => {
    const challenge = CHALLENGES[index];
    if (!challenge) return;
    resetPaneIdCounters();
    const fs = challenge.setup(buildPuzzleFs());
    const win = makeWindow(PUZZLE_MACHINE, HOME_DIR);
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
    });
  },

  checkCompletion: () => {
    const state = get();
    if (state.completed || state.awaitingContinue) return;
    const challenge = CHALLENGES[state.challengeIndex];
    if (!challenge) return;

    const activeWindow = state.windows.find((w) => w.id === state.activeWindowId) ?? state.windows[0];
    if (!activeWindow) return;

    const snap: PuzzleSnapshot = {
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

    // Last step of this challenge passed.
    const nextIndex = state.challengeIndex + 1;
    if (nextIndex < CHALLENGES.length) {
      // Pause on a completion gate; the next challenge loads on continueToNext()
      // (Enter), so the player gets a beat to register the win before the fs +
      // panes reset for the next sandbox. Clear flash so it doesn't compete.
      set({ awaitingContinue: true, flash: null });
    } else {
      set({ completed: true, flash: "✓ All challenges complete" });
    }
  },

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
        // Last pane of the only window — keep it (puzzle is single-window).
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
    const win = makeWindow(PUZZLE_MACHINE, HOME_DIR);
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
      const updates: Partial<PuzzleState> = { windows: newWindows };
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
}));
