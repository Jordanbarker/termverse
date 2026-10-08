import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDebouncedStorage } from "./debouncedStorage";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { Mounts } from "@tt/core/filesystem/mounts";
import "../story/git/remotes"; // side effect: registers this story's clonable git remotes into @tt/core
import { buildFs, createSaveData, saveToSlot, loadFromSlot, pickSaveableState, serializeGameState, restoreGameState, SaveableState } from "./saveManager";
import { SaveSlotId, SavePayload, SAVE_FORMAT_VERSION } from "./saveTypes";
import { GamePhase, ComputerId, StoryFlags, PLAYER } from "./types";
import type { StoryFlagName } from "../story/storyFlags";
import { SnowflakeState } from "@tt/core/snowflake/state";
import { createInitialSnowflakeState } from "@/story/data/snowflake/initial_data";
import { getDefaultEnv, initEnvForComputer, initAliasesForComputer } from "../story/env";
import { INITIAL_STORY_FLAGS } from "./initialFlags";
import { buildCheckpointState } from "./checkpointLoad";
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
  windowOfPane,
  mapLeaf,
  splitNode,
  collapsePane,
  prunePanesByComputer,
  setSplitRatio,
  nudgeSplitRatio,
  focusDirectionTarget,
  nextLeafId,
  nearestResizableSplit,
  cliResizeDelta,
  resetPaneIdCounters,
} from "@tt/core/terminal/paneTypes";
import { TmuxSessionSnapshot, snapshotSession, restoreSession } from "@tt/core/terminal/tmuxSessions";
import { TmuxAction } from "@tt/core/commands/types";
import { createGameClock } from "../story/clock";

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
/** Ensure a window's activePaneId still points at a live leaf. */
function normalizeFocus(w: WindowState): WindowState {
  if (findLeaf(w.root, w.activePaneId)) return w;
  return { ...w, activePaneId: firstLeaf(w.root).id };
}

/**
 * Real-tmux session teardown: drop the client to a fresh bare shell (inheriting
 * the active pane's computer/cwd) with a one-shot exit banner.
 */
function killToBareShell(
  state: WindowSlice & { computerState: Partial<Record<ComputerId, { fs: VirtualFS }>> },
  notice: string,
) {
  const leaf = getActiveLeaf(state);
  const computerId = (leaf?.computerId ?? "home") as ComputerId;
  const cwd = leaf?.cwd ?? state.computerState.home?.fs.homeDir ?? "/";
  const win = makeWindow(computerId, cwd);
  return {
    windows: [win],
    activeWindowId: win.id,
    tmuxAttachedSession: null,
    pendingMuxNotice: notice,
    activeSnowSession: null,
  };
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
  // tmux session lifecycle: windows[] renders the attached session's live
  // windows, or a single bare-shell window when detached. "Server running" is
  // derived (attached or any detached snapshot) — never stored.
  tmuxAttachedSession: { name: string; createdAt: number } | null;
  tmuxDetachedSessions: TmuxSessionSnapshot[];
  // One-shot real-tmux exit banner ([detached ...]/[exited]/[server exited])
  // printed by the next bare-shell pane before its prompt. Transient (unsaved).
  pendingMuxNotice: string | null;
  // Pane id of the snow REPL's pane (null when no session). Pane-scoped.
  activeSnowSession: string | null;
  pendingPiperNotification: boolean;
  notifiedChipTopicIds: string[];
  // UI preference: hide the copy-mode key-hint overlay (toggled with `?` in copy mode).
  copyModeHelpHidden: boolean;
  // Pane ids currently in tmux copy mode (the ObjectiveTracker hides while the
  // active window has one, since it would cover the COPY badge). Transient (unsaved).
  copyModePaneIds: string[];

  // Actions
  completeObjective: (id: string) => void;
  setGamePhase: (phase: GamePhase) => void;
  addDeliveredEmails: (ids: string[]) => void;
  addDeliveredPiperMessages: (ids: string[]) => void;
  setSnowflakeState: (state: SnowflakeState) => void;
  setCurrentChapter: (chapter: string) => void;
  setStoryFlag: (key: StoryFlagName, value: string | boolean) => void;
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
  // tmux lifecycle: apply a resolved TmuxAction. Returns whether the client
  // view swapped (caller suppresses the prompt when it did).
  applyTmuxAction: (action: TmuxAction) => boolean;
  consumePendingMuxNotice: () => string | null;
  setActiveSnowSession: (paneId: string | null) => void;
  setComputerEnv: (computer: ComputerId, envVars: Record<string, string>) => void;
  setComputerAliases: (computer: ComputerId, aliases: Record<string, string>) => void;
  removeComputer: (computer: ComputerId) => void;
  setPendingPiperNotification: (value: boolean) => void;
  setCopyModeHelpHidden: (hidden: boolean) => void;
  setPaneCopyMode: (paneId: string, active: boolean) => void;
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
    storyFlags: { ...INITIAL_STORY_FLAGS },
    hasSeenIntro: false,
    toasts: [] as Toast[],
    computerState: { home: { fs, envVars: initEnvForComputer("home", username, fs), aliases: initAliasesForComputer("home", username, fs), mounts: {} } } as Partial<Record<ComputerId, { fs: VirtualFS; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }>>,
    zshHistory: {} as Partial<Record<ComputerId, string>>,
    windows: [initialWindow] as WindowState[],
    activeWindowId: initialWindow.id,
    // A new game starts attached to tmux session "0" (onboarding unchanged).
    tmuxAttachedSession: {
      name: "0",
      createdAt: createGameClock([], username, "home").now().getTime(),
    } as { name: string; createdAt: number } | null,
    tmuxDetachedSessions: [] as TmuxSessionSnapshot[],
    pendingMuxNotice: null as string | null,
    activeSnowSession: null as string | null,
    pendingPiperNotification: false,
    notifiedChipTopicIds: [] as string[],
    copyModeHelpHidden: false,
    copyModePaneIds: [] as string[],
  };
}

let toastId = 0;

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...createInitialState(),

      completeObjective: (id) => {
        // Set-like: an id appearing twice would re-fire anything gated on
        // `completedObjective`. De-dupe here so no call site can get it wrong.
        // Early-return (not `set({})`) so a duplicate is a true no-op: zustand
        // notifies all listeners and re-arms the persist debounce on any set().
        if (get().completedObjectives.includes(id)) return;
        set((state) => ({ completedObjectives: [...state.completedObjectives, id] }));
      },
      setGamePhase: (phase) => set({ gamePhase: phase }),
      addDeliveredEmails: (ids) =>
        set((state) => {
          // De-dupe here (like addDeliveredPiperMessages) so no call site can
          // deliver an email twice, e.g. the non-final chain segment applying
          // effects that executeEffects then re-applies.
          const known = new Set(state.deliveredEmailIds);
          const fresh = ids.filter((id) => {
            if (known.has(id)) return false;
            known.add(id);
            return true;
          });
          if (fresh.length === 0) return {};
          return { deliveredEmailIds: [...state.deliveredEmailIds, ...fresh] };
        }),
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
          // deliveredPiperIds is set-like: a delivery/reply id appearing twice
          // replays the message in the conversation. De-dupe here rather than at
          // each call site so no caller can get it wrong (the Day 2 nexacorp
          // transition used to re-seed ids the home call site had already added).
          const known = new Set(filtered);
          const additions = ids.filter((id) => {
            if (known.has(id)) return false;
            known.add(id);
            return true;
          });
          if (additions.length === 0 && filtered.length === state.deliveredPiperIds.length) {
            return {};
          }
          return { deliveredPiperIds: [...filtered, ...additions] };
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
      setPaneCopyMode: (paneId, active) => {
        const ids = get().copyModePaneIds;
        if (ids.includes(paneId) === active) return;
        set({ copyModePaneIds: active ? [...ids, paneId] : ids.filter((id) => id !== paneId) });
      },
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
          if (newWindows.length === 0) {
            // tmux: removing the last window kills the session (bare shell when
            // attached; no-op if we're somehow already on the bare shell).
            return state.tmuxAttachedSession ? killToBareShell(state, "[exited]") : {};
          }
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
            // Last pane in the window — drop the window. If it was the last
            // window too, this kills the session (real tmux) and drops the
            // client to a fresh bare shell.
            if (state.windows.length === 1) {
              return state.tmuxAttachedSession ? killToBareShell(state, "[exited]") : updates;
            }
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
      applyTmuxAction: (action) => {
        const state = get();
        switch (action.type) {
          case "new-session": {
            const leaf = getActiveLeaf(state);
            const computerId = (leaf?.computerId ?? "home") as ComputerId;
            const cwd = leaf?.cwd ?? state.computerState.home?.fs.homeDir ?? "/";
            const win = makeWindow(computerId, cwd);
            const createdAt = createGameClock(state.deliveredPiperIds, state.username, computerId)
              .now()
              .getTime();
            set({
              windows: [win],
              activeWindowId: win.id,
              tmuxAttachedSession: { name: action.name, createdAt },
              activeSnowSession: null,
            });
            return true;
          }
          case "attach": {
            const snap = state.tmuxDetachedSessions.find((s) => s.name === action.name);
            if (!snap || state.tmuxAttachedSession) return false;
            const restored = restoreSession(snap);
            // Attach sanitization: a machine can be shut down while a session
            // referencing it sits detached — prune those panes, drop emptied
            // windows, and fall back to a home window if the session emptied.
            const downed = new Set<ComputerId>();
            for (const w of restored.windows) {
              for (const l of allLeaves(w.root)) {
                const id = l.computerId as ComputerId;
                if (!state.computerState[id]) downed.add(id);
              }
            }
            let windows = restored.windows;
            if (downed.size > 0) {
              windows = [];
              for (const w of restored.windows) {
                const pruned = prunePanesByComputer(w.root, downed);
                if (pruned) windows.push(normalizeFocus({ ...w, root: pruned }));
              }
              if (windows.length === 0) {
                windows = [makeWindow("home", state.computerState.home?.fs.homeDir ?? "/")];
              }
            }
            const activeStillThere = windows.some((w) => w.id === restored.activeWindowId);
            set({
              windows,
              activeWindowId: activeStillThere ? restored.activeWindowId : windows[0].id,
              tmuxAttachedSession: { name: snap.name, createdAt: snap.createdAt },
              tmuxDetachedSessions: state.tmuxDetachedSessions.filter((s) => s !== snap),
              activeSnowSession: null,
            });
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
            return true;
          }
          case "rename-session": {
            // Pure name swap — the client view is untouched, so this returns false.
            const att = state.tmuxAttachedSession;
            if (att?.name === action.target) {
              set({ tmuxAttachedSession: { ...att, name: action.name } });
            } else {
              set({
                tmuxDetachedSessions: state.tmuxDetachedSessions.map((s) =>
                  s.name === action.target ? { ...s, name: action.name } : s,
                ),
              });
            }
            return false;
          }
          case "kill-session": {
            if (state.tmuxAttachedSession?.name === action.name) {
              set(killToBareShell(state, "[exited]"));
              return true;
            }
            set({ tmuxDetachedSessions: state.tmuxDetachedSessions.filter((s) => s.name !== action.name) });
            return false;
          }
          case "kill-server": {
            if (state.tmuxAttachedSession) {
              set({ ...killToBareShell(state, "[server exited]"), tmuxDetachedSessions: [] });
              return true;
            }
            set({ tmuxDetachedSessions: [] });
            return false;
          }
          // Window/pane verbs. These mirror the prefix chords exactly, so they
          // inherit the chord paths' caps and the last-window kill rule; only
          // an action that destroys or swaps the issuing pane's view returns
          // true (the prompt is then suppressed).
          case "new-window": {
            const leaf = getActiveLeaf(state);
            get().addWindow((leaf?.computerId ?? "home") as ComputerId, leaf?.cwd ?? state.computerState.home?.fs.homeDir ?? "/");
            return false;
          }
          case "rename-window": {
            get().renameWindow(action.windowId, action.name);
            return false;
          }
          case "kill-window": {
            const activePaneWindow = getActiveWindow(state)?.id;
            get().removeWindow(action.windowId);
            return action.windowId === activePaneWindow;
          }
          case "select-window": {
            get().setActiveWindow(action.windowId);
            return false;
          }
          case "split-window": {
            const paneId = getActivePaneId(state);
            if (paneId) get().splitPane(paneId, action.direction);
            return false;
          }
          case "kill-pane": {
            const paneId = getActivePaneId(state);
            if (!paneId) return false;
            get().closePane(paneId);
            return true;
          }
          case "select-pane": {
            get().focusDirection(action.dir);
            return false;
          }
          case "resize-pane": {
            const win = getActiveWindow(state);
            if (!win) return false;
            const orientation = action.dir === "L" || action.dir === "R" ? "h" : "v";
            const splitId = nearestResizableSplit(win.root, win.activePaneId, orientation);
            if (splitId) get().nudgeSplitRatio(splitId, cliResizeDelta(action.dir, action.cells));
            return false;
          }
        }
      },
      consumePendingMuxNotice: () => {
        const notice = get().pendingMuxNotice;
        if (notice !== null) set({ pendingMuxNotice: null });
        return notice;
      },
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
        // Flags (merged over the baseline), Snowflake and every computer's FS
        // come from the shared builder the headless runner also uses.
        const { storyFlags, snowflakeState, computerState } = buildCheckpointState(username, data);

        const win = makeWindow(data.activeComputer, homeDir);

        set({
          username,
          gamePhase: "playing",
          currentChapter: data.chapter,
          completedObjectives: [...data.completedObjectives],
          deliveredEmailIds: [...data.deliveredEmailIds],
          deliveredPiperIds: [...data.deliveredPiperIds],
          storyFlags,
          // A cheat skips the opening cinematic, so the nano tutorial must not
          // pop later as if the player had never seen it.
          hasSeenIntro: true,
          snowflakeState,
          computerState,
          // Fresh cheat-load: clear the history mirror so each computer's seeded
          // .zsh_history file stands.
          zshHistory: {},
          windows: [win],
          activeWindowId: win.id,
          tmuxAttachedSession: {
            name: "0",
            createdAt: createGameClock(data.deliveredPiperIds, username, data.activeComputer).now().getTime(),
          },
          tmuxDetachedSessions: [],
          pendingMuxNotice: null,
          activeSnowSession: null,
          notifiedChipTopicIds: [],
          // Transient notice from the pre-cheat session — must not leak in.
          pendingPiperNotification: false,
        });
        return true;
      },
    }),
    {
      name: "termoil-save",
      // partialize runs on every set(), so it is only a field pick; the full
      // multi-FS + Snowflake snapshot (serializeGameState) runs once per
      // debounce window inside the storage adapter's flush.
      storage: createDebouncedStorage<SaveableState, SavePayload>(1000, serializeGameState),
      partialize: (state): SaveableState => pickSaveableState(state),
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
