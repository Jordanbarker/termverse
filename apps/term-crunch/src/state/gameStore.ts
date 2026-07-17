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
  nudgeSplitRatio,
  mapLeaf,
} from "@tt/core/terminal/paneTypes";
import { parseEnvAssignments, parseAliases } from "@tt/core/terminal/envParse";
import {
  type TmuxSessionSnapshot,
  snapshotSession,
  restoreSession,
} from "@tt/core/terminal/tmuxSessions";
import type { TmuxAction } from "@tt/core/commands/types";
import { CRUNCH_MACHINE, HOME_DIR, MAX_PANES_PER_WINDOW, MAX_WINDOWS } from "../lib/machine";
import { buildBaseFs, applyConfigs } from "../lib/seed";
import { DEFAULT_ZSHRC, DEFAULT_TMUX_CONF } from "../lib/defaultConfigs";
import { getCategory, registryIndex, DEFAULT_CATEGORY } from "../challenges/categories";
import type { ChallengeSnapshot } from "../challenges/types";
import { applyGrade, type Grade, type ReviewStat } from "../challenges/scheduler";

/** cwd of the focused pane (single window in v1, but written defensively). */
function activeCwd(windows: WindowState[], activeWindowId: string): string {
  const win = windows.find((w) => w.id === activeWindowId) ?? windows[0];
  if (!win) return HOME_DIR;
  return findLeaf(win.root, win.activePaneId)?.cwd ?? HOME_DIR;
}

function windowOfPane(windows: WindowState[], paneId: string): WindowState | undefined {
  return windows.find((w) => findLeaf(w.root, paneId));
}

/**
 * A completion gate is up: terminal input is frozen and a grade key (1-4 /
 * Enter) is expected. Covers the mid-track gate (awaitingContinue) and the
 * end-of-track banner's single pending grade.
 */
export function isGradeGateUp(
  s: Pick<GameState, "awaitingContinue" | "completed" | "pendingGradeId">
): boolean {
  return s.awaitingContinue || (s.completed && s.pendingGradeId !== null);
}

/**
 * Real-tmux session teardown: drop the client to a fresh bare shell (inheriting
 * the active pane's cwd) with a one-shot exit banner.
 */
function killToBareShell(
  state: { windows: WindowState[]; activeWindowId: string },
  notice: string,
) {
  const win = makeWindow(CRUNCH_MACHINE, activeCwd(state.windows, state.activeWindowId));
  return {
    windows: [win],
    activeWindowId: win.id,
    tmuxAttachedSession: null,
    pendingMuxNotice: notice,
  };
}

export interface GameState {
  // shell state (single machine, fs shared across panes; cwd lives per-pane on the leaf)
  fs: VirtualFS;
  envVars: Record<string, string>;
  aliases: Record<string, string>;

  // user-editable shell config (Settings modal). Persisted; seeded into the fs
  // on every loadChallenge and parsed into envVars/aliases (zshrc) + read live by
  // TabManager (tmux.conf: prefix/theme/keybindings).
  zshrc: string;
  tmuxConf: string;

  // terminal layout
  windows: WindowState[];
  activeWindowId: string;

  // tmux session lifecycle: windows[] renders the attached session (or a bare
  // single shell when detached). Transient — reseeded by loadChallenge, never
  // persisted. "Server running" is derived (attached or any detached snapshot).
  tmuxAttachedSession: { name: string; createdAt: number } | null;
  tmuxDetachedSessions: TmuxSessionSnapshot[];
  // One-shot real-tmux exit banner printed by the next bare-shell pane.
  pendingMuxNotice: string | null;

  // challenge progress
  activeCategory: string; // selected track id; challengeIndex is relative to its challenge list
  challengeIndex: number;
  stepIndex: number;
  completed: boolean;
  awaitingContinue: boolean;
  flash: string | null;

  // timing
  challengeStartTime: number; // Date.now() when the current challenge loaded
  bestTimes: Record<string, number>; // challengeId -> best completion time (ms); persisted
  lastElapsedMs: number | null; // finish time of the just-completed challenge (drives the gate display)
  lastWasBest: boolean; // whether lastElapsedMs set a new record

  // spaced-repetition review (challenges/scheduler.ts). reviewStats persists;
  // the rest is a transient in-flight review session, dropped on refresh.
  reviewStats: Record<string, ReviewStat>; // challengeId -> SM-2-lite stat
  pendingGradeId: string | null; // just-completed, not-yet-graded challenge id
  reviewQueue: string[]; // ids remaining AFTER the currently loaded review challenge
  reviewTotal: number; // queue length at session start (progress display)
  reviewReturn: { category: string; index: number } | null; // non-null == review mode; where to return

  // lifecycle
  selectCategory: (id: string) => void;
  loadChallenge: (index: number) => void;
  restartChallenge: () => void;
  checkCompletion: () => void;
  continueToNext: (grade?: Grade) => void;
  recordGrade: (grade: Grade) => void;
  startReviewSession: (queue: string[]) => void;
  jumpToChallenge: (index: number) => void;
  cancelReview: () => void;
  clearFlash: () => void;

  // shell config mutations (Settings modal)
  setConfigs: (zshrc: string, tmuxConf: string) => void;
  resetConfigs: () => void;

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
  nudgePaneRatio: (splitId: string, delta: number) => void;

  // window mutations (driven by tmux-style prefix keys + status-line tabs)
  newWindow: () => void;
  selectWindow: (windowId: string) => void;
  cycleWindow: (dir: "next" | "prev") => void;
  closeWindow: (windowId: string) => void;
  renameWindow: (windowId: string, name: string) => void;

  // tmux lifecycle: apply a resolved TmuxAction. Returns whether the client
  // view swapped (caller suppresses the prompt when it did).
  applyTmuxAction: (action: TmuxAction) => boolean;
  consumePendingMuxNotice: () => string | null;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
  fs: buildBaseFs(),
  envVars: {},
  aliases: {},
  zshrc: DEFAULT_ZSHRC,
  tmuxConf: DEFAULT_TMUX_CONF,
  windows: [],
  activeWindowId: "",
  tmuxAttachedSession: null,
  tmuxDetachedSessions: [],
  pendingMuxNotice: null,
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
  reviewStats: {},
  pendingGradeId: null,
  reviewQueue: [],
  reviewTotal: 0,
  reviewReturn: null,

  selectCategory: (id) => {
    get().cancelReview(); // switching tracks abandons any in-flight review session
    set({ activeCategory: id });
    get().loadChallenge(0); // start the newly selected track from its first challenge
  },

  loadChallenge: (index) => {
    const challenge = getCategory(get().activeCategory).challenges[index];
    if (!challenge) return;
    const { zshrc, tmuxConf } = get();
    // Seed the player's dotfiles on top of the fresh challenge fs, then activate
    // the zshrc's aliases/exports for the session (mirrors a login shell sourcing
    // ~/.zshrc; explicit `source` still works for re-applying edits mid-session).
    const fs = applyConfigs(challenge.setup(buildBaseFs()), zshrc, tmuxConf);
    // Git challenges drop the player inside the seeded repo (gitRepoPath) so they
    // don't have to `cd` in before any git command works; everything else starts at ~.
    const win = challenge.initialWindow
      ? challenge.initialWindow()
      : makeWindow(CRUNCH_MACHINE, challenge.gitRepoPath ?? HOME_DIR);
    set({
      fs,
      envVars: parseEnvAssignments(zshrc),
      aliases: parseAliases(zshrc),
      windows: [win],
      activeWindowId: win.id,
      // Every challenge starts attached to a fresh session "0" so the pane/
      // window/copy-mode challenges work unchanged.
      tmuxAttachedSession: { name: "0", createdAt: Date.now() },
      tmuxDetachedSessions: [],
      pendingMuxNotice: null,
      challengeIndex: index,
      stepIndex: 0,
      completed: false,
      awaitingContinue: false,
      // An ungraded completion abandoned via goto/dropdowns must not linger.
      pendingGradeId: null,
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
    // While detached, windows[] is the bare single shell — a layout predicate
    // like "exactly N panes" could falsely advance. Challenges always start
    // attached, so skipping here can never strand progress. Lifecycle
    // challenges (checkWhileDetached) opt out: their predicates read snap.tmux,
    // not the pane tree.
    if (state.tmuxAttachedSession === null && !challenge.checkWhileDetached) return;

    const activeWindow = state.windows.find((w) => w.id === state.activeWindowId) ?? state.windows[0];
    if (!activeWindow) return;

    const snap: ChallengeSnapshot = {
      activeWindow,
      windows: state.windows,
      fs: state.fs,
      cwd: activeCwd(state.windows, state.activeWindowId),
      tmux: {
        attachedSession: state.tmuxAttachedSession?.name ?? null,
        detachedSessions: state.tmuxDetachedSessions.map((s) => ({
          name: s.name,
          windowCount: s.windows.length,
        })),
      },
      envVars: state.envVars,
      aliases: state.aliases,
    };

    // Cascade through every consecutive satisfied step: predicates are pure
    // state checks, so out-of-order play (e.g. renaming a window before
    // opening the last one) can pre-satisfy a later step — without the
    // cascade the player would park on an already-true step with no further
    // action to re-trigger the check.
    let stepIndex = state.stepIndex;
    while (stepIndex < challenge.steps.length && challenge.steps[stepIndex].isComplete(snap)) {
      stepIndex++;
    }
    if (stepIndex === state.stepIndex) return; // current step not satisfied

    if (stepIndex < challenge.steps.length) {
      set({ stepIndex, flash: "✓ Step complete" });
      return;
    }

    // Last step of this challenge passed — record the run time and personal best.
    const elapsed = Date.now() - state.challengeStartTime;
    const prevBest = state.bestTimes[challenge.id];
    const isBest = prevBest == null || elapsed < prevBest;
    const bestTimes = isBest ? { ...state.bestTimes, [challenge.id]: elapsed } : state.bestTimes;

    const nextIndex = state.challengeIndex + 1;
    // In review mode the gate always rises (even on the last registry
    // challenge) so grading can chain through the rest of the queue.
    if (state.reviewReturn !== null || nextIndex < group.challenges.length) {
      // Pause on a completion gate; the next challenge loads on continueToNext()
      // (a grade key), so the player gets a beat to register the win before the
      // fs + panes reset for the next sandbox. Clear flash so it doesn't compete.
      set({
        awaitingContinue: true,
        pendingGradeId: challenge.id,
        flash: null,
        lastElapsedMs: elapsed,
        lastWasBest: isBest,
        bestTimes,
      });
    } else {
      set({
        completed: true,
        pendingGradeId: challenge.id,
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

  continueToNext: (grade = "good") => {
    const state = get();
    if (!isGradeGateUp(state)) return;
    // Record before loadChallenge clears pendingGradeId. On the end-of-track
    // banner this is the whole action: grade once, stay on the banner (input
    // unfreezes once pendingGradeId clears; see TabManager's interceptEarly).
    get().recordGrade(grade);
    if (state.awaitingContinue) {
      if (state.reviewReturn !== null) {
        const [nextId, ...rest] = state.reviewQueue;
        if (nextId !== undefined) {
          set({ reviewQueue: rest });
          get().loadChallenge(registryIndex(nextId));
        } else {
          // Queue exhausted: back to the pre-review spot. Restore the category
          // BEFORE loadChallenge (it resolves the index via activeCategory);
          // flash can ride along since loadChallenge never touches it.
          set({
            activeCategory: state.reviewReturn.category,
            reviewReturn: null,
            reviewTotal: 0,
            flash: "✓ Review session complete",
          });
          get().loadChallenge(state.reviewReturn.index);
        }
      } else {
        // loadChallenge resets awaitingContinue (and fs/panes) for the next sandbox.
        get().loadChallenge(state.challengeIndex + 1);
      }
    }
  },

  // Feed the SM-2-lite scheduler. Every graded completion goes through here,
  // sequential play and review mode alike.
  recordGrade: (grade) => {
    const { pendingGradeId, reviewStats } = get();
    if (pendingGradeId === null) return;
    set({
      reviewStats: {
        ...reviewStats,
        [pendingGradeId]: applyGrade(reviewStats[pendingGradeId], grade, Date.now()),
      },
      pendingGradeId: null,
    });
  },

  startReviewSession: (queue) => {
    if (queue.length === 0) return;
    const state = get();
    // Queue ids are registry ids; the "all" category mirrors the registry, so
    // indices are only safe there (the category-relative-index trap). Set the
    // category BEFORE loadChallenge, which resolves via activeCategory.
    // Re-running `review` mid-session keeps the original return point.
    set({
      reviewReturn: state.reviewReturn ?? { category: state.activeCategory, index: state.challengeIndex },
      activeCategory: "all",
      reviewQueue: queue.slice(1),
      reviewTotal: queue.length,
    });
    get().loadChallenge(registryIndex(queue[0]));
  },

  // Player-initiated jump (goto/next/prev, challenge dropdown): abandons any
  // in-flight review session. Deliberately a separate action rather than a
  // cancelReview inside loadChallenge: review chaining and restartChallenge go
  // through loadChallenge, and neither must abort the session.
  jumpToChallenge: (index) => {
    get().cancelReview();
    get().loadChallenge(index);
  },

  // Abandon an in-flight review session (jumpToChallenge, selectCategory).
  cancelReview: () => {
    if (get().reviewReturn === null) return;
    set({ reviewReturn: null, reviewQueue: [], reviewTotal: 0 });
  },

  clearFlash: () => set({ flash: null }),

  // Save edited configs: persist the strings, re-seed them into the current fs,
  // and re-derive envVars/aliases from the new zshrc so the change takes effect
  // immediately (no challenge reset). tmux.conf is read reactively by TabManager.
  setConfigs: (zshrc, tmuxConf) => {
    set((state) => ({
      zshrc,
      tmuxConf,
      fs: applyConfigs(state.fs, zshrc, tmuxConf),
      envVars: parseEnvAssignments(zshrc),
      aliases: parseAliases(zshrc),
    }));
  },

  resetConfigs: () => get().setConfigs(DEFAULT_ZSHRC, DEFAULT_TMUX_CONF),

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
        if (state.windows.length === 1) {
          // tmux: killing the last pane of the last window kills the session
          // and drops to a bare shell. A no-op on the bare shell itself.
          return state.tmuxAttachedSession ? killToBareShell(state, "[exited]") : {};
        }
        const newWindows = state.windows.filter((w) => w.id !== win.id);
        const updates: Partial<GameState> = { windows: newWindows };
        if (state.activeWindowId === win.id) {
          const idx = state.windows.findIndex((w) => w.id === win.id);
          updates.activeWindowId = newWindows[Math.min(idx, newWindows.length - 1)].id;
        }
        return updates;
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

  // Relative divider nudge (drives the tmux `resize-pane` keybindings).
  nudgePaneRatio: (splitId, delta) => {
    set((state) => ({
      windows: state.windows.map((w) => ({ ...w, root: nudgeSplitRatio(w.root, splitId, delta) })),
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
      if (newWindows.length === 0) {
        // tmux: removing the last window kills the session.
        return state.tmuxAttachedSession ? killToBareShell(state, "[exited]") : {};
      }
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

  applyTmuxAction: (action) => {
    const state = get();
    switch (action.type) {
      case "new-session": {
        // Fresh window inheriting the bare shell's cwd. Do NOT reset pane-id
        // counters (only loadChallenge does).
        const win = makeWindow(CRUNCH_MACHINE, activeCwd(state.windows, state.activeWindowId));
        set({
          windows: [win],
          activeWindowId: win.id,
          tmuxAttachedSession: { name: action.name, createdAt: Date.now() },
        });
        get().checkCompletion();
        return true;
      }
      case "attach": {
        const snap = state.tmuxDetachedSessions.find((s) => s.name === action.name);
        if (!snap || state.tmuxAttachedSession) return false;
        const restored = restoreSession(snap);
        set({
          windows: restored.windows,
          activeWindowId: restored.activeWindowId,
          tmuxAttachedSession: { name: snap.name, createdAt: snap.createdAt },
          tmuxDetachedSessions: state.tmuxDetachedSessions.filter((s) => s !== snap),
        });
        get().checkCompletion();
        return true;
      }
      case "detach": {
        const att = state.tmuxAttachedSession;
        if (!att) return false;
        const snap = snapshotSession(att.name, state.windows, state.activeWindowId, att.createdAt);
        set({
          ...killToBareShell(state, `[detached (from session ${att.name})]`),
          tmuxDetachedSessions: [...state.tmuxDetachedSessions, snap],
        });
        get().checkCompletion();
        return true;
      }
      case "kill-session": {
        if (state.tmuxAttachedSession?.name === action.name) {
          set(killToBareShell(state, "[exited]"));
          get().checkCompletion();
          return true;
        }
        set({ tmuxDetachedSessions: state.tmuxDetachedSessions.filter((s) => s.name !== action.name) });
        get().checkCompletion();
        return false;
      }
      case "kill-server": {
        if (state.tmuxAttachedSession) {
          set({ ...killToBareShell(state, "[server exited]"), tmuxDetachedSessions: [] });
          get().checkCompletion();
          return true;
        }
        set({ tmuxDetachedSessions: [] });
        get().checkCompletion();
        return false;
      }
    }
  },

  consumePendingMuxNotice: () => {
    const notice = get().pendingMuxNotice;
    if (notice !== null) set({ pendingMuxNotice: null });
    return notice;
  },
    }),
    {
      name: "term-crunch-progress",
      // Personal bests + review scheduling survive a refresh; fs/windows/
      // challenge index reseed on mount (GameShell calls loadChallenge(0) when
      // windows.length === 0). Mid-review, activeCategory is temporarily "all",
      // so persist the pre-review track instead: a refresh drops the transient
      // review session and must not strand the player on "all".
      partialize: (s) => ({
        bestTimes: s.bestTimes,
        reviewStats: s.reviewStats,
        activeCategory: s.reviewReturn?.category ?? s.activeCategory,
        zshrc: s.zshrc,
        tmuxConf: s.tmuxConf,
      }),
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
