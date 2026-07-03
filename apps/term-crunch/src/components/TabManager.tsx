"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";

import { parseZshHistory } from "@tt/core/terminal/zshHistory";
import { nodeBox } from "@tt/core/terminal/paneTypes";
import { COPY_MODE_HINT, COPY_MODE_HINT_HIDDEN } from "@tt/core/terminal/copyMode";
import PaneDividers from "@tt/core/components/PaneDividers";
import { EditorSession } from "@tt/core/editor/EditorSession";
import { LessSession } from "@tt/core/pager/LessSession";
import type { ISession, SessionResult } from "@tt/core/session/types";
import type { SessionToStart } from "@tt/core/commands/applyResult";
import { LineEditor } from "@tt/core/terminal/lineEditor";
import { useTabManager, type PaneRuntime, type TabManagerAdapter, type TabManagerExtensions } from "@tt/core/terminal/useTabManager";

import { useGameStore } from "../state/gameStore";
import { runLine, getPrompt, buildSuggestionContext } from "../hooks/useTerminal";
import { HOME_DIR } from "../lib/machine";
import TabBar from "./TabBar";

export default function TabManager() {
  const windows = useGameStore((s) => s.windows);
  const activeWindowId = useGameStore((s) => s.activeWindowId);
  // tmux config is read from the player's ~/.tmux.conf (Settings modal): the
  // prefix key, status-bar theme, and vim pane focus/resize keybindings.
  const tmuxConf = useGameStore((s) => s.tmuxConf);

  // Per-pane line editors and active editor/pager sessions. Keyed by pane id
  // alongside the hook's runtime map; entries die with their pane.
  const editors = useRef<Map<string, LineEditor>>(new Map());
  const sessions = useRef<Map<string, ISession>>(new Map());

  // Copy-mode help-hidden state is local (not persisted) — term-crunch keeps
  // copy mode self-contained.
  const [copyModeHelpHidden, setCopyModeHelpHidden] = useState(false);

  function historyEntries(): string[] {
    const content = useGameStore.getState().fs.readFile(`${HOME_DIR}/.zsh_history`).content ?? "";
    return parseZshHistory(content);
  }

  function startSessionFor(paneId: string, rt: PaneRuntime, s: SessionToStart) {
    let session: ISession;
    if (s.type === "editor") {
      session = new EditorSession(
        rt.term,
        useGameStore.getState().fs,
        s.info.filePath,
        s.info.content,
        s.info.readOnly,
        (newFs) => useGameStore.getState().setFs(newFs)
      );
    } else if (s.type === "less") {
      session = new LessSession(rt.term, s.info);
    } else {
      // No other session types are reachable in the term-crunch slice.
      rt.term.write("\r\n" + getPrompt(paneId));
      return;
    }
    sessions.current.set(paneId, session);
    const r = session.enter();
    if (r && typeof r === "object" && "type" in r) applySessionResult(paneId, r as SessionResult);
  }

  function applySessionResult(paneId: string, res: SessionResult) {
    if (res.newFs) useGameStore.getState().setFs(res.newFs);
    if (res.type === "exit") {
      sessions.current.delete(paneId);
      const rt = tm.getRuntime(paneId);
      if (rt) {
        try { rt.fitAddon.fit(); } catch { /* ignore */ }
        useGameStore.getState().checkCompletion();
        rt.term.write("\r\n" + getPrompt(paneId));
      }
    }
  }

  async function handleLine(paneId: string, rt: PaneRuntime, line: string) {
    // The editor already cleared its line state and wrote the trailing newline.
    const { startSession } = await runLine(rt.term, paneId, line);
    if (startSession) {
      startSessionFor(paneId, rt, startSession);
      return;
    }
    // Pane may have been replaced by a challenge advance; only reprint if it survived.
    if (tm.getRuntime(paneId)) rt.term.write("\r\n" + getPrompt(paneId));
  }

  const adapter: TabManagerAdapter = {
    splitPane: (paneId, dir) => useGameStore.getState().splitPane(paneId, dir),
    closePane: (paneId) => useGameStore.getState().closePane(paneId),
    cyclePane: () => useGameStore.getState().cyclePane(),
    focusDirection: (dir) => useGameStore.getState().focusDirection(dir),
    setActivePane: (paneId) => useGameStore.getState().setActivePane(paneId),
    newWindow: () => useGameStore.getState().newWindow(),
    selectWindowByIndex: (i) => {
      const store = useGameStore.getState();
      store.selectWindow(store.windows[i]?.id ?? "");
    },
    cycleWindow: (dir) => useGameStore.getState().cycleWindow(dir),
    renameWindow: (id, name) => useGameStore.getState().renameWindow(id, name),
    nudgeSplitRatio: (splitId, delta) => useGameStore.getState().nudgePaneRatio(splitId, delta),
    resizeSplit: (splitId, ratio) => useGameStore.getState().resizePane(splitId, ratio),
  };

  const ext: TabManagerExtensions = {
    // Challenge-complete gate: freeze terminal input until the player presses
    // Enter to advance to the next challenge.
    interceptEarly: (_paneId, _term, data) => {
      if (!useGameStore.getState().awaitingContinue) return false;
      if (data === "\r" || data === "\n") useGameStore.getState().continueToNext();
      return true;
    },
    // Active editor/pager session owns the pane's input until it exits.
    interceptAfterRename: (paneId, _term, data) => {
      const session = sessions.current.get(paneId);
      if (!session) return false;
      const res = session.handleInput(data);
      if (res) applySessionResult(paneId, res);
      return true;
    },
    // Cursor-aware line editing (arrows, Home/End, word-skip, Ctrl+A/E/U/K/L/W/D,
    // ghost/TAB completion) is owned by the shared @tt/core LineEditor.
    onShellData: (paneId, term, data) => {
      const editor = editors.current.get(paneId);
      const rt = tm.getRuntime(paneId);
      if (!editor || !rt) return;
      const res = editor.handleData(term, data);
      if (res?.type === "submit") void handleLine(paneId, rt, res.input);
    },
    onPaneCreated: (paneId, rt) => {
      editors.current.set(paneId, new LineEditor({
        getContext: () => buildSuggestionContext(paneId),
        getHistory: historyEntries,
        getPrompt: () => getPrompt(paneId),
      }));
      rt.term.write(getPrompt(paneId));
    },
    onPaneDisposed: (paneId) => {
      editors.current.delete(paneId);
      sessions.current.delete(paneId);
    },
    toggleCopyModeHelp: () => setCopyModeHelpHidden((v) => !v),
  };

  const tm = useTabManager({ windows, activeWindowId, tmuxConf, adapter, ext });

  // Challenge (re)load: tear down every pane so the hook's layout pass rebuilds
  // them fresh (empty scrollback + a clean prompt). loadChallenge resets the
  // pane-id counters, so the next challenge's pane reuses the previous one's id —
  // without this the old terminal (and its scrollback) would be reused without a
  // fresh prompt. Keyed on challengeStartTime, which is re-stamped on advance,
  // restart, and track switch, but not on in-challenge pane/window mutations.
  const challengeStartTime = useGameStore((s) => s.challengeStartTime);
  const loadedChallengeRef = useRef(challengeStartTime);
  useEffect(() => {
    if (loadedChallengeRef.current === challengeStartTime) return;
    loadedChallengeRef.current = challengeStartTime;
    tm.disposeAllPanes();
    // tm.disposeAllPanes only reads the hook's runtime map; keying on it would
    // re-run the teardown every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeStartTime]);

  const activeWindow = windows.find((w) => w.id === activeWindowId) ?? windows[0];
  const activeRect = useMemo(
    () =>
      activeWindow && tm.wrapperSize.w > 0
        ? nodeBox(activeWindow.root, activeWindow.activePaneId, 0, 0, tm.wrapperSize.w, tm.wrapperSize.h)
        : undefined,
    [activeWindow, tm.wrapperSize],
  );

  return (
    <div className="flex h-full w-full flex-col bg-[#0a0e14]">
      <TabBar
        theme={tm.tabTheme}
        prefixActive={tm.prefixActive}
        renamePrompt={tm.renamePrompt}
        onNewWindow={() => useGameStore.getState().newWindow()}
        onSelectWindow={(id) => useGameStore.getState().selectWindow(id)}
        onCloseWindow={(id) => useGameStore.getState().closeWindow(id)}
      />
      {/* The ResizeObserver watches wrapperRef inside this flex-1 region, so the
          measured size already excludes the status bar. */}
      <div className="relative flex-1">
        <div ref={tm.wrapperRef} className="absolute inset-0 isolate" />
        {tm.copyModeActive && (
          <div className="absolute bottom-4 left-2 z-20 pointer-events-none rounded-md border border-[#2a2f3a] bg-[#1a1f29]/90 px-3 py-1 font-mono text-xs text-[#b3b1ad] backdrop-blur-sm">
            <span className="font-bold text-[#e6b450]">COPY MODE</span>
            <span className="text-[#6c7380]">
              {copyModeHelpHidden ? COPY_MODE_HINT_HIDDEN : COPY_MODE_HINT}
            </span>
          </div>
        )}
        {activeWindow && tm.wrapperSize.w > 0 && (
          <PaneDividers
            root={activeWindow.root}
            width={tm.wrapperSize.w}
            height={tm.wrapperSize.h}
            onResize={(splitId, ratio) => adapter.resizeSplit(splitId, ratio)}
            activePaneRect={activeRect}
          />
        )}
      </div>
    </div>
  );
}
