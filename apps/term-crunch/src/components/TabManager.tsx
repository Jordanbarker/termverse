"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { ANSI_COLORS } from "@tt/core/terminal/ansiPalette";
import { parseZshHistory } from "@tt/core/terminal/zshHistory";
import { allLeaves, paneRects, nodeBox, nearestResizableSplit } from "@tt/core/terminal/paneTypes";
import {
  parseTmuxPrefix,
  parseTmuxTheme,
  parseTmuxBindings,
  type PaneBinding,
} from "@tt/core/terminal/tmuxConfig";
import { PANE_CHROME } from "@tt/core/terminal/paneChrome";
import { CopyModeController, COPY_MODE_HINT, COPY_MODE_HINT_HIDDEN, COPY_MODE_SELECTION_BG, COPY_MODE_SELECTION_FG } from "@tt/core/terminal/copyMode";
import { copyToClipboard } from "@tt/core/lib/clipboard";
import PaneDividers from "@tt/core/components/PaneDividers";
import { EditorSession } from "@tt/core/editor/EditorSession";
import { LessSession } from "@tt/core/pager/LessSession";
import type { ISession, SessionResult } from "@tt/core/session/types";
import type { SessionToStart } from "@tt/core/commands/applyResult";

import { LineEditor } from "@tt/core/terminal/lineEditor";
import { useRenameWindowPrompt } from "@tt/core/terminal/useRenameWindowPrompt";

import { useGameStore } from "../state/gameStore";
import { runLine, getPrompt, buildSuggestionContext } from "../hooks/useTerminal";
import { HOME_DIR } from "../lib/machine";
import TabBar from "./TabBar";

const XTERM_THEME = {
  background: "#0a0e14",
  foreground: "#b3b1ad",
  cursor: "#e6b450",
  cursorAccent: "#0a0e14",
  selectionBackground: "#253340",
  ...ANSI_COLORS,
};

const XTERM_OPTIONS = {
  theme: XTERM_THEME,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontSize: 14,
  lineHeight: 1.2,
  cursorBlink: false,
  cursorStyle: "block" as const,
  allowProposedApi: true,
};

interface PaneRuntime {
  term: XTerm;
  fit: FitAddon;
  container: HTMLDivElement;
  prefix: boolean;
  editor: LineEditor;
  copyMode: CopyModeController;
}

export default function TabManager() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const runtimes = useRef<Map<string, PaneRuntime>>(new Map());
  const sessions = useRef<Map<string, ISession>>(new Map());
  const [size, setSize] = useState({ w: 0, h: 0 });

  // tmux prefix-state indicator (component-scoped: one prefix is armed at a time,
  // always in the focused pane). Per-pane consumption still uses PaneRuntime.prefix.
  const [prefixActive, setPrefixActive] = useState(false);

  // tmux/vi copy mode (entered via `<prefix> [`). Component-scoped UI flags; each
  // pane owns its own CopyModeController on its PaneRuntime. Help-hidden state is
  // local (not persisted) — term-crunch keeps copy mode self-contained.
  const [copyModeActive, setCopyModeActive] = useState(false);
  const [copyModeHelpHidden, setCopyModeHelpHidden] = useState(false);

  // tmux rename-window modal (shared @tt/core hook): drives the status-line takeover.
  const rename = useRenameWindowPrompt((id, name) =>
    useGameStore.getState().renameWindow(id, name),
  );

  const windows = useGameStore((s) => s.windows);
  const activeWindowId = useGameStore((s) => s.activeWindowId);

  // tmux config is read from the player's ~/.tmux.conf (Settings modal): the
  // prefix key, status-bar theme, and vim pane focus/resize keybindings.
  const tmuxConf = useGameStore((s) => s.tmuxConf);
  const tabPrefix = useMemo(() => parseTmuxPrefix(tmuxConf), [tmuxConf]);
  const tabTheme = useMemo(() => parseTmuxTheme(tmuxConf), [tmuxConf]);
  const tabBindings = useMemo(() => parseTmuxBindings(tmuxConf), [tmuxConf]);

  // The onData closure is captured once per pane (in ensurePane), so it must read
  // live config through refs rather than the memoized values above.
  const prefixCharRef = useRef(tabPrefix.char);
  prefixCharRef.current = tabPrefix.char;
  const bindingsRef = useRef(tabBindings);
  bindingsRef.current = tabBindings;

  // tmux `-r` repeat: after a repeatable resize bind, keep accepting the same
  // keys without re-pressing the prefix until this window lapses.
  const repeatModeRef = useRef(false);
  const repeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const REPEAT_MS = 500;

  // --- input handling (stable: only reads refs + fresh store via getState) ---

  function clearRepeat() {
    repeatModeRef.current = false;
    if (repeatTimerRef.current) clearTimeout(repeatTimerRef.current);
    repeatTimerRef.current = null;
  }

  function armRepeat() {
    repeatModeRef.current = true;
    if (repeatTimerRef.current) clearTimeout(repeatTimerRef.current);
    repeatTimerRef.current = setTimeout(() => { repeatModeRef.current = false; }, REPEAT_MS);
  }

  // Resize the divider nearest the focused pane by a cell-sized step (tmux moves
  // borders in grid cells; our model is ratio-based, so convert cells -> ratio
  // delta using the pane's live cell size and the split's box).
  function applyResize(b: Extract<PaneBinding, { kind: "resize" }>) {
    const store = useGameStore.getState();
    const win = store.windows.find((w) => w.id === store.activeWindowId);
    if (!win) return;
    const orientation = b.dir === "L" || b.dir === "R" ? "h" : "v";
    const splitId = nearestResizableSplit(win.root, win.activePaneId, orientation);
    if (!splitId) return; // no divider in this direction (e.g. -L in a stacked layout)
    const rt = runtimes.current.get(win.activePaneId);
    const wrapper = wrapperRef.current;
    const box = nodeBox(win.root, splitId);
    if (!rt || !wrapper || !box) return;
    const horizontal = orientation === "h";
    const cellPx = horizontal
      ? rt.container.clientWidth / rt.term.cols
      : rt.container.clientHeight / rt.term.rows;
    const splitBoxPx = horizontal ? box.w * wrapper.clientWidth : box.h * wrapper.clientHeight;
    if (!(cellPx > 0) || !(splitBoxPx > 0)) return;
    const deltaRatio = (b.cells * cellPx) / splitBoxPx;
    // Move the divider toward the arrow: R/D grow child `a` (ratio up), L/U shrink it.
    store.nudgePaneRatio(splitId, b.dir === "R" || b.dir === "D" ? deltaRatio : -deltaRatio);
  }

  function historyEntries(): string[] {
    const content = useGameStore.getState().fs.readFile(`${HOME_DIR}/.zsh_history`).content ?? "";
    return parseZshHistory(content);
  }

  function startSessionFor(paneId: string, s: SessionToStart) {
    const rt = runtimes.current.get(paneId);
    if (!rt) return;
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
      const rt = runtimes.current.get(paneId);
      if (rt) {
        rt.fit.fit();
        useGameStore.getState().checkCompletion();
        rt.term.write("\r\n" + getPrompt(paneId));
      }
    }
  }

  function beginRename() {
    const store = useGameStore.getState();
    const win = store.windows.find((w) => w.id === store.activeWindowId);
    rename.begin(store.activeWindowId, win?.name ?? "");
  }

  function handlePrefix(paneId: string, data: string) {
    const store = useGameStore.getState();

    // Vim-style binds from ~/.tmux.conf (case-sensitive: `h` focus vs `H` resize).
    const binding = bindingsRef.current[data];
    if (binding) {
      if (binding.kind === "focus") {
        store.focusDirection(binding.dir);
      } else {
        applyResize(binding);
        if (binding.repeat) armRepeat();
      }
      return;
    }

    switch (data) {
      // copy mode (keyboard-only entry; independent of the challenge allowlist)
      case "[": runtimes.current.get(paneId)?.copyMode.enter(); break;
      // pane chords
      case "|": store.splitPane(paneId, "h"); break;
      case "-": store.splitPane(paneId, "v"); break;
      case "o": store.cyclePane(); break;
      case "x": store.closePane(paneId); break;
      case "\x1b[D": store.focusDirection("L"); break;
      case "\x1b[C": store.focusDirection("R"); break;
      case "\x1b[A": store.focusDirection("U"); break;
      case "\x1b[B": store.focusDirection("D"); break;
      // window chords
      case "c": store.newWindow(); break;
      case "n": case ".": store.cycleWindow("next"); break;
      case "p": case ",": store.cycleWindow("prev"); break;
      case "r": beginRename(); break;
      default:
        // Jump to window N (1-indexed); ignore everything else.
        if (data >= "1" && data <= "9") {
          store.selectWindow(store.windows[Number(data) - 1]?.id ?? "");
        }
        break;
    }
  }

  async function handleLine(paneId: string, rt: PaneRuntime, line: string) {
    // The editor already cleared its line state and wrote the trailing newline.
    const { startSession } = await runLine(rt.term, paneId, line);
    if (startSession) {
      startSessionFor(paneId, startSession);
      return;
    }
    // Pane may have been replaced by a challenge advance; only reprint if it survived.
    if (runtimes.current.has(paneId)) rt.term.write("\r\n" + getPrompt(paneId));
  }

  function onData(paneId: string, data: string) {
    const rt = runtimes.current.get(paneId);
    if (!rt) return;

    // Challenge-complete gate: freeze terminal input until the player presses
    // Enter to advance to the next challenge.
    if (useGameStore.getState().awaitingContinue) {
      if (data === "\r" || data === "\n") useGameStore.getState().continueToNext();
      return;
    }

    // tmux rename-window modal — route keys here before anything else. (Rename
    // can't begin mid-session since the prefix is gated behind no active session,
    // but gating first matches the live game and is harmless.)
    if (rename.handleData(data)) return;

    const session = sessions.current.get(paneId);
    if (session) {
      const res = session.handleInput(data);
      if (res) applySessionResult(paneId, res);
      return;
    }

    // tmux `-r` repeat: while the window is open, a repeatable resize key re-fires
    // (and re-arms) without the prefix. Any other key ends repeat and falls through.
    if (repeatModeRef.current) {
      const b = bindingsRef.current[data];
      if (b && b.kind === "resize" && b.repeat) {
        applyResize(b);
        armRepeat();
        return;
      }
      clearRepeat();
    }

    if (rt.prefix) {
      rt.prefix = false;
      setPrefixActive(false);
      handlePrefix(paneId, data);
      return;
    }
    if (data === prefixCharRef.current) {
      rt.prefix = true;
      setPrefixActive(true);
      return;
    }

    // Cursor-aware line editing (arrows, Home/End, word-skip, Ctrl+A/E/U/K/L/W/D,
    // ghost/TAB completion) is owned by the shared @tt/core LineEditor.
    const res = rt.editor.handleData(rt.term, data);
    if (res?.type === "submit") void handleLine(paneId, rt, res.input);
  }

  function ensurePane(paneId: string) {
    if (runtimes.current.has(paneId)) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.overflow = "hidden";
    container.style.padding = PANE_CHROME.padding;
    container.addEventListener("mousedown", () => {
      useGameStore.getState().setActivePane(paneId);
      runtimes.current.get(paneId)?.term.focus();
    });
    wrapper.appendChild(container);

    const term = new XTerm(XTERM_OPTIONS);
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);

    // tmux/vi copy mode — the engine controller owns cursor/selection; the yank
    // side effect (clipboard) lives here.
    const copyMode = new CopyModeController(term, {
      onChange: (active) => {
        setCopyModeActive(active);
        // Brighten the selection to the gold copy-mode accent so the 1-cell
        // cursor (a native selection) is easy to see; restore the base theme on exit.
        term.options.theme = active
          ? { ...XTERM_THEME, selectionBackground: COPY_MODE_SELECTION_BG, selectionForeground: COPY_MODE_SELECTION_FG }
          : XTERM_THEME;
      },
      onToggleHelp: () => setCopyModeHelpHidden((v) => !v),
      onYank: (text) => { void copyToClipboard(text); },
    });

    // While copy mode is active, swallow every key so nothing reaches the shell;
    // preventDefault keeps junk out of xterm's hidden textarea.
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (copyMode.isActive()) {
        if (e.type === "keydown") { e.preventDefault(); copyMode.handleKeydown(e); }
        return false;
      }
      return true;
    });

    const rt: PaneRuntime = {
      term,
      fit,
      container,
      prefix: false,
      copyMode,
      editor: new LineEditor({
        getContext: () => buildSuggestionContext(paneId),
        getHistory: historyEntries,
        getPrompt: () => getPrompt(paneId),
      }),
    };
    runtimes.current.set(paneId, rt);
    term.onData((data) => onData(paneId, data));

    try { fit.fit(); } catch { /* size not ready yet */ }
    term.write(getPrompt(paneId));
  }

  // --- size tracking ---
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const apply = () => setSize({ w: wrapper.clientWidth, h: wrapper.clientHeight });
    const ro = new ResizeObserver(apply);
    ro.observe(wrapper);
    apply();
    return () => ro.disconnect();
  }, []);

  // --- challenge (re)load: tear down every pane so the layout effect below
  // rebuilds them fresh (empty scrollback + a clean prompt). loadChallenge resets
  // the pane-id counters, so the next challenge's pane reuses the previous one's
  // id — without this the old terminal (and its scrollback) would be reused and
  // ensurePane would early-return without printing a fresh prompt. Keyed on
  // challengeStartTime, which is re-stamped on advance, restart, and track switch,
  // but not on in-challenge pane/window mutations.
  const challengeStartTime = useGameStore((s) => s.challengeStartTime);
  const loadedChallengeRef = useRef(challengeStartTime);
  useEffect(() => {
    if (loadedChallengeRef.current === challengeStartTime) return;
    loadedChallengeRef.current = challengeStartTime;
    for (const [, rt] of runtimes.current) {
      rt.copyMode.exit({ refocus: false }); // clear copyModeActive across a reseed
      rt.term.dispose();
      rt.container.remove();
    }
    runtimes.current.clear();
    sessions.current.clear();
  }, [challengeStartTime]);

  // --- layout: create/position/dispose panes; keep non-active windows alive ---
  useEffect(() => {
    const activeWindow = windows.find((w) => w.id === activeWindowId) ?? windows[0];
    if (!activeWindow) return;

    // Keep panes from every window alive so their xterm buffers survive window
    // switches; dispose only panes whose id no longer exists in any window
    // (closed, or challenge advanced).
    const liveIds = new Set(windows.flatMap((w) => allLeaves(w.root)).map((l) => l.id));
    for (const [id, rt] of runtimes.current) {
      if (!liveIds.has(id)) {
        rt.copyMode.exit({ refocus: false });
        rt.term.dispose();
        rt.container.remove();
        runtimes.current.delete(id);
        sessions.current.delete(id);
      }
    }

    const { w: W, h: H } = size;
    if (W === 0 || H === 0) return;

    const leaves = allLeaves(activeWindow.root);
    const activeIds = new Set(leaves.map((l) => l.id));
    // Only outline the active pane when there's more than one — a lone pane needs no highlight.
    const multi = leaves.length > 1;

    // Hide panes that belong to other (non-active) windows. Never fit a hidden
    // (0x0) container — xterm would mis-size.
    for (const [id, rt] of runtimes.current) {
      if (!activeIds.has(id)) rt.container.style.display = "none";
    }

    // Position, show, and fit the active window's panes.
    const rects = paneRects(activeWindow.root, 0, 0, W, H);
    for (const leaf of leaves) {
      ensurePane(leaf.id);
      const rt = runtimes.current.get(leaf.id);
      const r = rects.find((rr) => rr.id === leaf.id);
      if (!rt || !r) continue;
      Object.assign(rt.container.style, {
        display: "block",
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.w}px`,
        height: `${r.h}px`,
        outline: multi && leaf.id === activeWindow.activePaneId ? PANE_CHROME.activeOutline : "none",
        outlineOffset: PANE_CHROME.outlineOffset,
      });
      try { rt.fit.fit(); } catch { /* ignore */ }
    }

    runtimes.current.get(activeWindow.activePaneId)?.term.focus();
    // ensurePane/onData close over refs + module functions only (no reactive
    // state), so they're intentionally omitted from the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windows, activeWindowId, size]);

  const activeWindow = windows.find((w) => w.id === activeWindowId) ?? windows[0];
  const activeRect =
    activeWindow && size.w > 0
      ? nodeBox(activeWindow.root, activeWindow.activePaneId, 0, 0, size.w, size.h)
      : undefined;

  return (
    <div className="flex h-full w-full flex-col bg-[#0a0e14]">
      <TabBar
        theme={tabTheme}
        prefixActive={prefixActive}
        renamePrompt={rename.prompt}
        onNewWindow={() => useGameStore.getState().newWindow()}
        onSelectWindow={(id) => useGameStore.getState().selectWindow(id)}
        onCloseWindow={(id) => useGameStore.getState().closeWindow(id)}
      />
      {/* The ResizeObserver watches wrapperRef inside this flex-1 region, so the
          measured size already excludes the status bar. */}
      <div className="relative flex-1">
        <div ref={wrapperRef} className="absolute inset-0" />
        {copyModeActive && (
          <div className="absolute bottom-4 left-2 z-20 pointer-events-none rounded-md border border-[#2a2f3a] bg-[#1a1f29]/90 px-3 py-1 font-mono text-xs text-[#b3b1ad] backdrop-blur-sm">
            <span className="font-bold text-[#e6b450]">COPY MODE</span>
            <span className="text-[#6c7380]">
              {copyModeHelpHidden ? COPY_MODE_HINT_HIDDEN : COPY_MODE_HINT}
            </span>
          </div>
        )}
        {activeWindow && size.w > 0 && (
          <PaneDividers
            root={activeWindow.root}
            width={size.w}
            height={size.h}
            onResize={(splitId, ratio) => useGameStore.getState().resizePane(splitId, ratio)}
            activePaneRect={activeRect}
          />
        )}
      </div>
    </div>
  );
}
