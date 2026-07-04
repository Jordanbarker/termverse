"use client";

import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import TabBar from "./TabBar";
import PaneDividers from "@tt/core/components/PaneDividers";
import { useGameStore, getActiveLeaf, MAX_WINDOWS } from "../../state/gameStore";
import { allLeaves, paneRects } from "@tt/core/terminal/paneTypes";
import { useTerminal } from "../../hooks/useTerminal";
import { nexacorpLogo, homeWelcome, coderBanner, UNLOCK_BOX } from "@tt/core/lib/ascii";
import { seedImmediatePiper } from "../../engine/piper/delivery";
import { COPY_MODE_HINT, COPY_MODE_HINT_HIDDEN } from "@tt/core/terminal/copyMode";
import { sessionUsesAltScreen } from "@tt/core/session/types";
import { useTabManager, type TabManagerAdapter, type TabManagerExtensions } from "@tt/core/terminal/useTabManager";
import { ComputerId } from "../../state/types";

export default function TabManager() {
  const windows = useGameStore((s) => s.windows);
  const activeWindowId = useGameStore((s) => s.activeWindowId);
  const gamePhase = useGameStore((s) => s.gamePhase);
  const storyFlags = useGameStore((s) => s.storyFlags);
  const attachedSession = useGameStore((s) => s.tmuxAttachedSession);
  const copyModeHelpHidden = useGameStore((s) => s.copyModeHelpHidden);
  // Tab/pane prefix is read from the home PC's ~/.tmux.conf (your local terminal's
  // tmux config governs the multiplexer, regardless of which box a pane connects to).
  const homeTmuxConf = useGameStore((s) => {
    const fs = s.computerState.home?.fs;
    return fs ? fs.readFile(`${fs.homeDir}/.tmux.conf`).content : undefined;
  });

  const activeWindow = windows.find((w) => w.id === activeWindowId);

  const { handleInput, getPrompt, startSession, canCloseCurrentSession, getActiveSessionType, cleanupPane, resizeActiveSession, resizePaneSession } = useTerminal();

  const shownUnlockRef = useRef(false);
  const prevGamePhaseRef = useRef(gamePhase);

  // tmux confirm-before-kill: the close prompt shown in the status bar.
  const [closeConfirm, setCloseConfirm] = useState<string | null>(null);
  const closeConfirmRef = useRef(false); // synchronous flag read inside onData
  const paneToCloseRef = useRef<string | null>(null); // which pane the confirm targets

  const adapter: TabManagerAdapter = {
    splitPane: (paneId, dir) => useGameStore.getState().splitPane(paneId, dir),
    closePane: (paneId) => useGameStore.getState().closePane(paneId),
    cyclePane: () => useGameStore.getState().cyclePane(),
    focusDirection: (dir) => useGameStore.getState().focusDirection(dir),
    setActivePane: (paneId) => useGameStore.getState().setActivePane(paneId),
    // New window opens on the active pane's computer, inheriting its cwd.
    newWindow: () => {
      const store = useGameStore.getState();
      const leaf = getActiveLeaf(store);
      if (leaf) store.addWindow(leaf.computerId as ComputerId, leaf.cwd);
    },
    selectWindowByIndex: (i) => {
      const store = useGameStore.getState();
      if (i < store.windows.length) store.setActiveWindow(store.windows[i].id);
    },
    cycleWindow: (dir) => {
      const store = useGameStore.getState();
      const idx = store.windows.findIndex((w) => w.id === store.activeWindowId);
      const step = dir === "next" ? 1 : -1;
      const nextIdx = (idx + step + store.windows.length) % store.windows.length;
      store.setActiveWindow(store.windows[nextIdx].id);
    },
    renameWindow: (id, name) => useGameStore.getState().renameWindow(id, name),
    nudgeSplitRatio: (splitId, delta) => useGameStore.getState().nudgeSplitRatio(splitId, delta),
    resizeSplit: (splitId, ratio) => useGameStore.getState().resizePane(splitId, ratio),
    // <prefix> d — same path as the `tmux detach` command.
    detachClient: () => useGameStore.getState().applyTmuxAction({ type: "detach" }),
  };

  const ext: TabManagerExtensions = {
    isInputEnabled: () => useGameStore.getState().gamePhase === "playing",
    muxActive: () => !!useGameStore.getState().tmuxAttachedSession,
    chordsEnabled: () => !!useGameStore.getState().storyFlags.tabs_unlocked,
    // tmux confirm-before-kill: the next key answers the close prompt.
    interceptEarly: (_paneId, _term, data) => {
      if (!closeConfirmRef.current) return false;
      if (data === "\r" || data === "\n") return true; // ignore Enter; wait for y/n
      const confirmed = data[0]?.toLowerCase() === "y";
      closeConfirmRef.current = false;
      setCloseConfirm(null);
      const pid = paneToCloseRef.current;
      paneToCloseRef.current = null;
      if (confirmed && pid) useGameStore.getState().closePane(pid);
      return true;
    },
    // Kill the focused pane — tmux confirm-before-kill (rendered in the bar)
    // instead of the hook's direct closePane. Killing the last pane of the last
    // window kills the session (closePane's kill rule drops to the bare shell).
    interceptPrefixKey: (paneId, key) => {
      if (key !== "x") return false;
      paneToCloseRef.current = paneId;
      const note = canCloseCurrentSession() ? "" : " Unsaved changes will be lost.";
      setCloseConfirm(`kill-pane?${note} (y/n)`);
      closeConfirmRef.current = true;
      return true;
    },
    onShellData: (_paneId, term, data) => handleInput(term, data),
    onPaneCreated: (paneId, rt, info) => {
      const store = useGameStore.getState();
      const leaf = windows.flatMap((w) => allLeaves(w.root)).find((l) => l.id === paneId);

      // Only show splash on the very first pane during initial game load.
      if (info.firstPane) {
        if (store.gamePhase !== "playing") {
          // Still booting — leave the first-pane slot unconsumed; restored panes
          // get their prompt from the phase-transition effect below.
          if (info.kind === "new") rt.term.write(getPrompt());
          return false;
        }

        const splash =
          leaf?.computerId === "home"
            ? homeWelcome
            : leaf?.computerId === "devcontainer"
              ? coderBanner
              : nexacorpLogo;
        splash.forEach((line) => rt.term.writeln(line));

        // Seed immediate piper messages for home
        if (leaf?.computerId === "home") {
          const homePiperIds = seedImmediatePiper(store.username, "home");
          const newHomeIds = homePiperIds.filter((id) => !store.deliveredPiperIds.includes(id));
          if (newHomeIds.length > 0) {
            store.addDeliveredPiperMessages(newHomeIds);
          }
        }

        // Auto-open nano on first game start (home PC only)
        if (!store.hasSeenIntro && leaf?.computerId === "home") {
          const homeFs = store.computerState.home?.fs;
          const filePath = `${homeFs?.homeDir ?? `/home/${store.username}`}/terminal_notes.txt`;
          const readResult = homeFs?.readFile(filePath) ?? { content: undefined };
          const content = readResult.content ?? "";
          startSession(rt.term, {
            type: "editor",
            info: { filePath, content, readOnly: false, isNewFile: false },
          }, paneId);
        } else {
          rt.term.write(getPrompt());
        }
        return;
      }

      if (info.kind === "restored") {
        // Pane from initial state (e.g. restore from save) — show prompt once playing.
        if (store.gamePhase === "playing") rt.term.write(getPrompt());
      } else {
        // New pane created by user (split / new window / tmux swap). A swap
        // leaves a one-shot exit banner ([detached ...]/[exited]/[server exited]).
        const notice = store.consumePendingMuxNotice();
        if (notice) rt.term.writeln(notice);
        rt.term.write(getPrompt());
      }
    },
    onPaneDisposed: (paneId) => cleanupPane(paneId),
    onPaneResized: (paneId) => resizePaneSession(paneId),
    // Leaving copy mode over a full-screen session: have the session re-render so it
    // re-asserts its own screen + cursor visibility (nano shows its cursor; less/piper
    // keep it hidden). exit() writes SHOW_CURSOR/scrollToBottom before firing this, so
    // the redraw cleanly overrides them.
    onCopyModeChange: (_paneId, active) => {
      if (!active && sessionUsesAltScreen(getActiveSessionType())) resizeActiveSession();
    },
    onYank: (text, ok) => {
      useGameStore.getState().addToast(
        ok
          ? `Copied ${text.length} character${text.length === 1 ? "" : "s"} to clipboard`
          : "Copy failed",
      );
    },
    toggleCopyModeHelp: () => {
      const store = useGameStore.getState();
      store.setCopyModeHelpHidden(!store.copyModeHelpHidden);
    },
    digitWindowMax: MAX_WINDOWS,
  };

  const tm = useTabManager({ windows, activeWindowId, tmuxConf: homeTmuxConf, adapter, ext });

  // Handle phase transitions (e.g. booting→playing shows unlock box + prompt)
  useEffect(() => {
    const activePaneId = activeWindow?.activePaneId;
    const runtime = activePaneId ? tm.getRuntime(activePaneId) : undefined;
    if (!runtime) return;

    const prevPhase = prevGamePhaseRef.current;
    prevGamePhaseRef.current = gamePhase;

    if (gamePhase === "playing" && prevPhase === "booting") {
      const store = useGameStore.getState();
      const activeLeaf = getActiveLeaf(store);
      if (activeLeaf?.computerId === "nexacorp" && !shownUnlockRef.current) {
        shownUnlockRef.current = true;
        UNLOCK_BOX.forEach((line) => runtime.term.writeln(line));
        store.addToast("New commands unlocked! Type 'help' to see all.");
      }
      runtime.term.write(getPrompt());
    }
    // tm.getRuntime/getPrompt read live state; only the phase/window change matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamePhase, activeWindow]);

  // Tab bar callbacks (window-level). Pane xterm cleanup happens in the hook's
  // dispose pass (onPaneDisposed → cleanupPane) once the store drops the window.
  const handleNewWindow = (computerId?: ComputerId) => {
    const store = useGameStore.getState();
    if (computerId) {
      const targetFs = store.computerState[computerId]?.fs;
      const cwd = targetFs?.homeDir ?? `/home/${store.username}`;
      store.addWindow(computerId, cwd);
    } else {
      adapter.newWindow();
    }
  };

  const tabsUnlocked = !!storyFlags.tabs_unlocked;
  const showTabBar = !!attachedSession && tabsUnlocked && gamePhase === "playing";

  return (
    <div className="w-full h-full flex flex-col">
      {showTabBar && (
        <TabBar
          onNewWindow={handleNewWindow}
          onCloseWindow={(windowId) => useGameStore.getState().removeWindow(windowId)}
          onSelectWindow={(windowId) => useGameStore.getState().setActiveWindow(windowId)}
          prefixActive={tm.prefixActive}
          closeConfirm={closeConfirm}
          renamePrompt={tm.renamePrompt}
          theme={tm.tabTheme}
          sessionName={attachedSession?.name}
        />
      )}
      <div className="flex-1 relative min-h-0">
        {/* xterm pane containers are appended here imperatively and positioned
            absolutely from the active window's pane tree. `isolate` gives this a
            stacking context so xterm's internal z-indexes can't paint over the
            overlays below it. Kept React-childless so reconciliation never
            touches the imperatively-appended pane nodes. */}
        <div ref={tm.wrapperRef} className="absolute inset-0 isolate" />
        {/* Resizable seams between split panes, overlaid on top of the panes. */}
        {showTabBar && activeWindow && (
          <PaneDividers
            root={activeWindow.root}
            width={tm.wrapperSize.w}
            height={tm.wrapperSize.h}
            activePaneRect={paneRects(activeWindow.root, 0, 0, tm.wrapperSize.w, tm.wrapperSize.h).find(
              (r) => r.id === activeWindow.activePaneId,
            )}
            onResize={(splitId, ratio) => adapter.resizeSplit(splitId, ratio)}
          />
        )}
        {tm.copyModeActive && (
          <div className="absolute bottom-4 left-2 z-20 pointer-events-none rounded-md border border-[#2a2f3a] bg-[#1a1f29]/90 px-3 py-1 font-mono text-xs text-[#b3b1ad] backdrop-blur-sm">
            <span className="font-bold text-[#e6b450]">COPY MODE</span>
            <span className="text-[#6c7380]">
              {copyModeHelpHidden ? COPY_MODE_HINT_HIDDEN : COPY_MODE_HINT}
            </span>
          </div>
        )}
        {/* Pre-unlock there's no tab bar, so float the prefix indicator here instead. */}
        {tm.prefixActive && !showTabBar && (
          <span
            className="absolute bottom-2 right-2 z-20 pointer-events-none rounded bg-[#1a1f29]/90 px-2 py-1 font-mono text-xs animate-pulse backdrop-blur-sm"
            style={{ color: tm.tabTheme.currentBg }}
          >
            ^{tm.tabPrefix.label.replace(/^Ctrl\+/, "")}
          </span>
        )}
      </div>
    </div>
  );
}
