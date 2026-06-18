"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { ANSI_COLORS } from "@tt/core/terminal/ansiPalette";
import { parseZshHistory } from "@tt/core/terminal/zshHistory";
import { allLeaves, paneRects, nodeBox } from "@tt/core/terminal/paneTypes";
import PaneDividers from "@tt/core/components/PaneDividers";
import { EditorSession } from "@tt/core/editor/EditorSession";
import { LessSession } from "@tt/core/pager/LessSession";
import type { ISession, SessionResult } from "@tt/core/session/types";
import type { SessionToStart } from "@tt/core/commands/applyResult";

import { usePuzzleStore } from "../state/puzzleStore";
import { runLine, getPrompt, buildSuggestionContext } from "../hooks/usePuzzleTerminal";
import { HOME_DIR } from "../lib/machine";
import {
  type LineSuggestState,
  makeLineSuggestState,
  clearGhost,
  renderGhost,
  acceptGhost,
  clearCompletion,
  handleTab,
} from "../lib/lineSuggest";
import PuzzleTabBar from "./PuzzleTabBar";

const PREFIX = "\x00"; // Ctrl+Space

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
  cursorBlink: true,
  cursorStyle: "block" as const,
  allowProposedApi: true,
};

interface PaneRuntime {
  term: XTerm;
  fit: FitAddon;
  container: HTMLDivElement;
  buffer: string;
  prefix: boolean;
  histIndex: number;
  suggest: LineSuggestState;
}

export default function PuzzleTerminal() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const runtimes = useRef<Map<string, PaneRuntime>>(new Map());
  const sessions = useRef<Map<string, ISession>>(new Map());
  const [size, setSize] = useState({ w: 0, h: 0 });

  // tmux prefix-state indicator (component-scoped: one prefix is armed at a time,
  // always in the focused pane). Per-pane consumption still uses PaneRuntime.prefix.
  const [prefixActive, setPrefixActive] = useState(false);

  // tmux rename-window modal: refs are read synchronously inside onData; the
  // prompt string drives the status-line takeover.
  const renameActiveRef = useRef(false);
  const renameBufferRef = useRef("");
  const renameTargetRef = useRef<string | null>(null);
  const [renamePrompt, setRenamePrompt] = useState<string | null>(null);

  const windows = usePuzzleStore((s) => s.windows);
  const activeWindowId = usePuzzleStore((s) => s.activeWindowId);

  // --- input handling (stable: only reads refs + fresh store via getState) ---

  function historyEntries(): string[] {
    const content = usePuzzleStore.getState().fs.readFile(`${HOME_DIR}/.zsh_history`).content ?? "";
    return parseZshHistory(content);
  }

  function setLine(rt: PaneRuntime, paneId: string, text: string) {
    rt.buffer = text;
    rt.term.write("\x1b[2K\r" + getPrompt(paneId) + text);
  }

  function startSessionFor(paneId: string, s: SessionToStart) {
    const rt = runtimes.current.get(paneId);
    if (!rt) return;
    let session: ISession;
    if (s.type === "editor") {
      session = new EditorSession(
        rt.term,
        usePuzzleStore.getState().fs,
        s.info.filePath,
        s.info.content,
        s.info.readOnly,
        (newFs) => usePuzzleStore.getState().setFs(newFs)
      );
    } else if (s.type === "less") {
      session = new LessSession(rt.term, s.info);
    } else {
      // No other session types are reachable in the puzzle slice.
      rt.term.write("\r\n" + getPrompt(paneId));
      return;
    }
    sessions.current.set(paneId, session);
    const r = session.enter();
    if (r && typeof r === "object" && "type" in r) applySessionResult(paneId, r as SessionResult);
  }

  function applySessionResult(paneId: string, res: SessionResult) {
    if (res.newFs) usePuzzleStore.getState().setFs(res.newFs);
    if (res.type === "exit") {
      sessions.current.delete(paneId);
      const rt = runtimes.current.get(paneId);
      if (rt) {
        rt.fit.fit();
        usePuzzleStore.getState().checkCompletion();
        rt.term.write("\r\n" + getPrompt(paneId));
      }
    }
  }

  function beginRename() {
    const store = usePuzzleStore.getState();
    const win = store.windows.find((w) => w.id === store.activeWindowId);
    renameTargetRef.current = store.activeWindowId;
    renameBufferRef.current = win?.name ?? "";
    renameActiveRef.current = true;
    setRenamePrompt(`(rename-window) ${renameBufferRef.current}`);
  }

  function handlePrefix(paneId: string, data: string) {
    const store = usePuzzleStore.getState();
    switch (data) {
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
      case "n": store.cycleWindow("next"); break;
      case "p": store.cycleWindow("prev"); break;
      case "r": beginRename(); break;
      default:
        // Jump to window N (1-indexed); ignore everything else.
        if (data >= "1" && data <= "9") {
          store.selectWindow(store.windows[Number(data) - 1]?.id ?? "");
        }
        break;
    }
  }

  async function handleLine(paneId: string, rt: PaneRuntime) {
    const line = rt.buffer;
    rt.buffer = "";
    rt.histIndex = -1;
    rt.term.write("\r\n");
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

    // tmux rename-window modal — route keys here before anything else. (Rename
    // can't begin mid-session since the prefix is gated behind no active session,
    // but gating first matches the live game and is harmless.)
    if (renameActiveRef.current) {
      if (data === "\r" || data === "\n") {
        const target = renameTargetRef.current;
        if (target) usePuzzleStore.getState().renameWindow(target, renameBufferRef.current);
      } else if (data === "\x1b" || data === "\x03") {
        // Esc / Ctrl+C — cancel without applying.
      } else if (data === "\x7f" || data === "\b") {
        renameBufferRef.current = renameBufferRef.current.slice(0, -1);
        setRenamePrompt(`(rename-window) ${renameBufferRef.current}`);
        return;
      } else if (data.length === 1 && data >= " ") {
        renameBufferRef.current += data;
        setRenamePrompt(`(rename-window) ${renameBufferRef.current}`);
        return;
      } else {
        return; // ignore other control/escape sequences
      }
      renameActiveRef.current = false;
      renameTargetRef.current = null;
      renameBufferRef.current = "";
      setRenamePrompt(null);
      return;
    }

    const session = sessions.current.get(paneId);
    if (session) {
      const res = session.handleInput(data);
      if (res) applySessionResult(paneId, res);
      return;
    }

    if (rt.prefix) {
      rt.prefix = false;
      setPrefixActive(false);
      handlePrefix(paneId, data);
      return;
    }
    if (data === PREFIX) {
      rt.prefix = true;
      setPrefixActive(true);
      return;
    }

    // An open completion menu/state intercepts TAB (cycle) and cancel keys; any
    // other key tears it down (keeping the completed text) and falls through.
    if (rt.suggest.completion) {
      if (data === "\t") {
        const promptWidth = rt.term.buffer.active.cursorX - rt.buffer.length;
        rt.buffer = handleTab(rt.term, rt.buffer, promptWidth, buildSuggestionContext(paneId), rt.suggest);
        return;
      }
      if (data === "\x1b" || data === "\x03") {
        rt.buffer = clearCompletion(rt.term, rt.buffer, rt.suggest, true);
        return;
      }
      rt.buffer = clearCompletion(rt.term, rt.buffer, rt.suggest, false);
    }

    if (data === "\t") {
      const promptWidth = rt.term.buffer.active.cursorX - rt.buffer.length;
      clearGhost(rt.term, rt.suggest);
      rt.buffer = handleTab(rt.term, rt.buffer, promptWidth, buildSuggestionContext(paneId), rt.suggest);
    } else if (data === "\r") {
      clearGhost(rt.term, rt.suggest);
      void handleLine(paneId, rt);
    } else if (data === "\x7f" || data === "\b") {
      if (rt.buffer.length > 0) {
        clearGhost(rt.term, rt.suggest);
        rt.buffer = rt.buffer.slice(0, -1);
        rt.term.write("\b \b");
        renderGhost(rt.term, rt.buffer, buildSuggestionContext(paneId), rt.suggest);
      }
    } else if (data === "\x03") {
      clearGhost(rt.term, rt.suggest);
      rt.buffer = "";
      rt.term.write("^C\r\n" + getPrompt(paneId));
    } else if (data === "\x1b[A") {
      const hist = historyEntries();
      if (hist.length === 0) return;
      clearGhost(rt.term, rt.suggest);
      rt.histIndex = rt.histIndex < 0 ? hist.length - 1 : Math.max(0, rt.histIndex - 1);
      setLine(rt, paneId, hist[rt.histIndex]);
      renderGhost(rt.term, rt.buffer, buildSuggestionContext(paneId), rt.suggest);
    } else if (data === "\x1b[B") {
      const hist = historyEntries();
      if (rt.histIndex < 0) return;
      clearGhost(rt.term, rt.suggest);
      if (rt.histIndex >= hist.length - 1) {
        rt.histIndex = -1;
        setLine(rt, paneId, "");
      } else {
        rt.histIndex += 1;
        setLine(rt, paneId, hist[rt.histIndex]);
      }
      renderGhost(rt.term, rt.buffer, buildSuggestionContext(paneId), rt.suggest);
    } else if (data === "\x1b[C") {
      // Right arrow — accept the ghost suggestion (zsh-style); no-op if none.
      rt.buffer = acceptGhost(rt.term, rt.buffer, buildSuggestionContext(paneId), rt.suggest);
    } else if (data.startsWith("\x1b")) {
      // other escape sequences (left arrow, fn keys) — ignored in v1
    } else if (data.charCodeAt(0) >= 0x20) {
      clearGhost(rt.term, rt.suggest);
      rt.buffer += data;
      rt.term.write(data);
      renderGhost(rt.term, rt.buffer, buildSuggestionContext(paneId), rt.suggest);
    }
  }

  function ensurePane(paneId: string) {
    if (runtimes.current.has(paneId)) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.overflow = "hidden";
    container.addEventListener("mousedown", () => {
      usePuzzleStore.getState().setActivePane(paneId);
      runtimes.current.get(paneId)?.term.focus();
    });
    wrapper.appendChild(container);

    const term = new XTerm(XTERM_OPTIONS);
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    const rt: PaneRuntime = {
      term,
      fit,
      container,
      buffer: "",
      prefix: false,
      histIndex: -1,
      suggest: makeLineSuggestState(),
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
        outline: leaf.id === activeWindow.activePaneId ? "1px solid #e6b450" : "none",
        outlineOffset: "-1px",
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
      <PuzzleTabBar
        prefixActive={prefixActive}
        renamePrompt={renamePrompt}
        onNewWindow={() => usePuzzleStore.getState().newWindow()}
        onSelectWindow={(id) => usePuzzleStore.getState().selectWindow(id)}
        onCloseWindow={(id) => usePuzzleStore.getState().closeWindow(id)}
      />
      {/* The ResizeObserver watches wrapperRef inside this flex-1 region, so the
          measured size already excludes the status bar. */}
      <div className="relative flex-1">
        <div ref={wrapperRef} className="absolute inset-0" />
        {activeWindow && size.w > 0 && (
          <PaneDividers
            root={activeWindow.root}
            width={size.w}
            height={size.h}
            onResize={(splitId, ratio) => usePuzzleStore.getState().resizePane(splitId, ratio)}
            activePaneRect={activeRect}
          />
        )}
      </div>
    </div>
  );
}
