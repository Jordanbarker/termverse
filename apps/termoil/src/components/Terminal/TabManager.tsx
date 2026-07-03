"use client";

import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import TabBar from "./TabBar";
import PaneDividers from "@tt/core/components/PaneDividers";
import { useGameStore, getActiveLeaf, getActivePaneId, MAX_WINDOWS } from "../../state/gameStore";
import { allLeaves, paneRects, nearestResizableSplit, nodeBox } from "@tt/core/terminal/paneTypes";
import { PANE_CHROME } from "@tt/core/terminal/paneChrome";
import { useTerminal } from "../../hooks/useTerminal";
import { nexacorpLogo, homeWelcome, coderBanner, UNLOCK_BOX } from "@tt/core/lib/ascii";
import { seedImmediatePiper } from "../../engine/piper/delivery";
import { parseTmuxPrefix, parseTmuxTheme, parseTmuxBindings, PaneBinding } from "@tt/core/terminal/tmuxConfig";
import { ANSI_COLORS } from "@tt/core/terminal/ansiPalette";
import { CopyModeController, COPY_MODE_HINT, COPY_MODE_HINT_HIDDEN, COPY_MODE_SELECTION_BG, COPY_MODE_SELECTION_FG } from "@tt/core/terminal/copyMode";
import { useRenameWindowPrompt } from "@tt/core/terminal/useRenameWindowPrompt";
import { sessionUsesAltScreen } from "@tt/core/session/types";
import { copyToClipboard } from "@tt/core/lib/clipboard";
import { ComputerId } from "../../state/types";

const XTERM_THEME = {
  background: "#0a0e14",
  foreground: "#b3b1ad",
  cursor: "#e6b450",
  cursorAccent: "#0a0e14",
  selectionBackground: "#253340",
  // 16 named ANSI colors shared with the tmux color parser (ansiPalette.ts)
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


/** Handle macOS-style scroll shortcuts. Returns false to block xterm, true to pass through. */
function handleScrollShortcut(e: KeyboardEvent, term: XTerm): boolean | null {
  if (e.type !== 'keydown') return null;

  const { key, metaKey, altKey, shiftKey } = e;

  // Shift+PageUp/Down — scroll by page (universal terminal convention)
  if (shiftKey && !metaKey && !altKey) {
    if (key === 'PageUp') { e.preventDefault(); term.scrollPages(-1); return false; }
    if (key === 'PageDown') { e.preventDefault(); term.scrollPages(1); return false; }
  }

  // Cmd+Opt+PageUp/Down — scroll by line
  if (metaKey && altKey) {
    if (key === 'PageUp') { e.preventDefault(); term.scrollLines(-1); return false; }
    if (key === 'PageDown') { e.preventDefault(); term.scrollLines(1); return false; }
  }

  // Cmd+PageUp/Down — scroll by page
  if (metaKey && !altKey) {
    if (key === 'PageUp') { e.preventDefault(); term.scrollPages(-1); return false; }
    if (key === 'PageDown') { e.preventDefault(); term.scrollPages(1); return false; }
    if (key === 'Home') { e.preventDefault(); term.scrollToTop(); return false; }
    if (key === 'End') { e.preventDefault(); term.scrollToBottom(); return false; }
  }

  return null;
}

interface PaneInstance {
  term: XTerm;
  fitAddon: FitAddon;
  containerEl: HTMLDivElement;
  onDataDisposable: import("@xterm/xterm").IDisposable;
  copyMode: CopyModeController;
  /** Last applied pixel size — lets the layout effect skip redundant fit()/resize(). */
  lastW: number;
  lastH: number;
}

export default function TabManager() {
  const windows = useGameStore((s) => s.windows);
  const activeWindowId = useGameStore((s) => s.activeWindowId);
  const gamePhase = useGameStore((s) => s.gamePhase);
  const storyFlags = useGameStore((s) => s.storyFlags);
  const copyModeHelpHidden = useGameStore((s) => s.copyModeHelpHidden);
  // Tab/pane prefix is read from the home PC's ~/.tmux.conf (your local terminal's
  // tmux config governs the multiplexer, regardless of which box a pane connects to).
  const homeTmuxConf = useGameStore((s) => {
    const fs = s.computerState.home?.fs;
    return fs ? fs.readFile(`${fs.homeDir}/.tmux.conf`).content : undefined;
  });
  const tabPrefix = useMemo(() => parseTmuxPrefix(homeTmuxConf), [homeTmuxConf]);
  const tabTheme = useMemo(() => parseTmuxTheme(homeTmuxConf), [homeTmuxConf]);
  // Vim-style pane nav/resize binds (`bind h select-pane -L`, `bind -r H resize-pane -L 5`).
  const tabBindings = useMemo(() => parseTmuxBindings(homeTmuxConf), [homeTmuxConf]);

  const activeWindow = windows.find((w) => w.id === activeWindowId);

  const { handleInput, getPrompt, startSession, canCloseCurrentSession, getActiveSessionType, cleanupPane, resizeActiveSession, resizePaneSession } = useTerminal();

  // Store callbacks in refs to avoid stale closures in xterm onData
  const handleInputRef = useRef(handleInput);
  const startSessionRef = useRef(startSession);
  const getPromptRef = useRef(getPrompt);
  const gamePhaseRef = useRef(gamePhase);
  const canCloseRef = useRef(canCloseCurrentSession);
  const getActiveSessionTypeRef = useRef(getActiveSessionType);
  const cleanupPaneRef = useRef(cleanupPane);
  const resizeActiveSessionRef = useRef(resizeActiveSession);
  const resizePaneSessionRef = useRef(resizePaneSession);
  handleInputRef.current = handleInput;
  startSessionRef.current = startSession;
  getPromptRef.current = getPrompt;
  gamePhaseRef.current = gamePhase;
  canCloseRef.current = canCloseCurrentSession;
  getActiveSessionTypeRef.current = getActiveSessionType;
  cleanupPaneRef.current = cleanupPane;
  resizeActiveSessionRef.current = resizeActiveSession;
  resizePaneSessionRef.current = resizePaneSession;

  const paneInstancesRef = useRef<Map<string, PaneInstance>>(new Map());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const splashShownRef = useRef(false);
  const shownUnlockRef = useRef(false);
  const prevGamePhaseRef = useRef(gamePhase);

  // Wrapper pixel size, tracked via ResizeObserver, drives pane geometry.
  const [wrapperSize, setWrapperSize] = useState({ w: 0, h: 0 });

  // Tab prefix mode state (prefix key configured via ~/.tmux.conf)
  const ctrlBPrefixRef = useRef(false);
  const [prefixActive, setPrefixActive] = useState(false);

  // Copy mode (tmux/vi `<prefix> [`) — indicator state for the overlay
  const [copyModeActive, setCopyModeActive] = useState(false);

  // Keep the live prefix char available inside the xterm onData closures.
  const prefixCharRef = useRef(tabPrefix.char);
  prefixCharRef.current = tabPrefix.char;

  // Live pane bindings (parsed from ~/.tmux.conf) for the onData closures.
  const bindingsRef = useRef(tabBindings);
  bindingsRef.current = tabBindings;

  // tmux `-r` repeat: after a repeatable resize bind, keep accepting the same
  // keys without re-pressing the prefix until this window (repeat-time) lapses.
  const repeatModeRef = useRef(false);
  const repeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const REPEAT_MS = 500;

  // tmux confirm-before-kill: the close prompt shown in the status bar.
  const [closeConfirm, setCloseConfirm] = useState<string | null>(null);
  const closeConfirmRef = useRef(false); // synchronous flag read inside onData
  const paneToCloseRef = useRef<string | null>(null); // which pane the confirm targets

  // tmux rename-window: inline text prompt shown in the status bar (shared @tt/core hook).
  // begin/handleData are referentially stable; renamePrompt drives the status bar.
  const {
    begin: beginRename,
    handleData: handleRenameData,
    prompt: renamePrompt,
  } = useRenameWindowPrompt((id, name) => useGameStore.getState().renameWindow(id, name));

  // Track pane IDs we've seen to tell restored panes (show prompt) from brand-new ones
  const knownPaneIdsRef = useRef<Set<string>>(new Set());

  // Initialize known panes
  useEffect(() => {
    for (const win of windows) for (const leaf of allLeaves(win.root)) knownPaneIdsRef.current.add(leaf.id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCtrlBAction = useCallback((key: string) => {
    const store = useGameStore.getState();
    if (!store.storyFlags.tabs_unlocked) return;

    // Normalize: Ctrl held throughout sequence emits control chars
    // e.g. Ctrl+C → \x03, Ctrl+X → \x18. Map ASCII 1-26 → lowercase a-z.
    const code = key.charCodeAt(0);
    const normalized = code > 0 && code < 27
      ? String.fromCharCode(code + 96)
      : key.toLowerCase();

    const activePaneId = getActivePaneId(store);

    if (key === "|") {
      // Split side-by-side (tmux split-window -h, vertical divider).
      if (activePaneId) store.splitPane(activePaneId, "h");
    } else if (key === "-") {
      // Split stacked (tmux split-window -v, horizontal divider).
      if (activePaneId) store.splitPane(activePaneId, "v");
    } else if (normalized === "o") {
      // Cycle focus to the next pane in this window.
      store.cyclePane();
    } else if (normalized === "c") {
      // Create a new window on the active pane's computer.
      const leaf = getActiveLeaf(store);
      if (leaf) store.addWindow(leaf.computerId as ComputerId, leaf.cwd);
    } else if (normalized === "x") {
      // Kill the focused pane — tmux confirm-before-kill (rendered in the bar).
      // Allowed unless it's the only pane of the only window.
      const totalPanes = store.windows.reduce((n, w) => n + allLeaves(w.root).length, 0);
      if (totalPanes > 1 && activePaneId) {
        paneToCloseRef.current = activePaneId;
        const note = canCloseRef.current() ? "" : " Unsaved changes will be lost.";
        setCloseConfirm(`kill-pane?${note} (y/n)`);
        closeConfirmRef.current = true;
      }
    } else if (normalized === "r") {
      // Rename the active window — tmux rename-window (inline text prompt).
      const win = store.windows.find((w) => w.id === store.activeWindowId);
      beginRename(store.activeWindowId, win?.name ?? "");
    } else if (normalized === "n" || key === ".") {
      // Next window (n or .)
      const idx = store.windows.findIndex((w) => w.id === store.activeWindowId);
      const nextIdx = (idx + 1) % store.windows.length;
      store.setActiveWindow(store.windows[nextIdx].id);
    } else if (normalized === "p" || key === ",") {
      // Previous window (p or ,)
      const idx = store.windows.findIndex((w) => w.id === store.activeWindowId);
      const prevIdx = (idx - 1 + store.windows.length) % store.windows.length;
      store.setActiveWindow(store.windows[prevIdx].id);
    } else if (key >= "1" && key <= String(MAX_WINDOWS)) {
      // Jump to window N (windows stay 1-indexed; panes don't affect this)
      const winIdx = parseInt(key) - 1;
      if (winIdx < store.windows.length) {
        store.setActiveWindow(store.windows[winIdx].id);
      }
    }
  }, [beginRename]);

  // Resize the divider nearest the focused pane by a cell-sized step. tmux moves
  // borders in grid cells; our model is ratio-based, so convert cells -> ratio
  // delta at the layout layer using the pane's live cell size and the split's box.
  const applyResize = useCallback((b: Extract<PaneBinding, { kind: "resize" }>) => {
    const store = useGameStore.getState();
    if (!store.storyFlags.tabs_unlocked) return;
    const win = store.windows.find((w) => w.id === store.activeWindowId);
    if (!win) return;
    const orientation = b.dir === "L" || b.dir === "R" ? "h" : "v";
    const splitId = nearestResizableSplit(win.root, win.activePaneId, orientation);
    if (!splitId) return; // no divider in this direction (e.g. -L in a stacked layout)
    const inst = paneInstancesRef.current.get(win.activePaneId);
    const wrapper = wrapperRef.current;
    const box = nodeBox(win.root, splitId);
    if (!inst || !wrapper || !box) return;
    const horizontal = orientation === "h";
    const cellPx = horizontal
      ? inst.containerEl.clientWidth / inst.term.cols
      : inst.containerEl.clientHeight / inst.term.rows;
    const splitBoxPx = horizontal ? box.w * wrapper.clientWidth : box.h * wrapper.clientHeight;
    if (!(cellPx > 0) || !(splitBoxPx > 0)) return;
    const deltaRatio = (b.cells * cellPx) / splitBoxPx;
    // Move the divider toward the arrow: R/D grow child `a` (ratio up), L/U shrink it.
    store.nudgeSplitRatio(splitId, b.dir === "R" || b.dir === "D" ? deltaRatio : -deltaRatio);
  }, []);

  const clearRepeat = useCallback(() => {
    repeatModeRef.current = false;
    if (repeatTimerRef.current != null) {
      clearTimeout(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
    setPrefixActive(false);
  }, []);

  const armRepeat = useCallback(() => {
    repeatModeRef.current = true;
    setPrefixActive(true); // keep the bar "hot" so the repeat window is visible
    if (repeatTimerRef.current != null) clearTimeout(repeatTimerRef.current);
    repeatTimerRef.current = setTimeout(() => {
      repeatModeRef.current = false;
      repeatTimerRef.current = null;
      setPrefixActive(false);
    }, REPEAT_MS);
  }, []);

  // Clear any pending repeat timer on unmount.
  useEffect(() => () => {
    if (repeatTimerRef.current != null) clearTimeout(repeatTimerRef.current);
  }, []);

  const createPaneInstance = useCallback((paneId: string, containerEl: HTMLDivElement): PaneInstance => {
    const term = new XTerm(XTERM_OPTIONS);
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerEl);
    fitAddon.fit();

    // Clicking a pane focuses it (and makes it the active pane), so input routes
    // to the right session. Without this the single-focused-pane invariant breaks.
    containerEl.addEventListener("mousedown", () => {
      const store = useGameStore.getState();
      if (getActivePaneId(store) !== paneId) store.setActivePane(paneId);
      term.focus();
    });

    // tmux/vi copy mode (entered via `<prefix> [`) — per pane, since each pane
    // owns its own controller. The engine controller owns cursor/selection;
    // clipboard + toast live here as the yank side effect.
    const copyMode = new CopyModeController(term, {
      onChange: (active) => {
        setCopyModeActive(active);
        // Brighten the selection to the gold copy-mode accent so the 1-cell
        // cursor (a native selection) is easy to see; restore the base theme on exit.
        term.options.theme = active
          ? { ...XTERM_THEME, selectionBackground: COPY_MODE_SELECTION_BG, selectionForeground: COPY_MODE_SELECTION_FG }
          : XTERM_THEME;
        // Leaving copy mode over a full-screen session: have the session re-render so it
        // re-asserts its own screen + cursor visibility (nano shows its cursor; less/piper
        // keep it hidden). exit() writes SHOW_CURSOR/scrollToBottom before firing this, so
        // the redraw cleanly overrides them.
        if (!active && sessionUsesAltScreen(getActiveSessionTypeRef.current())) {
          resizeActiveSessionRef.current();
        }
      },
      onToggleHelp: () => {
        const store = useGameStore.getState();
        store.setCopyModeHelpHidden(!store.copyModeHelpHidden);
      },
      onYank: (text) => {
        void copyToClipboard(text).then((ok) => {
          useGameStore.getState().addToast(
            ok
              ? `Copied ${text.length} character${text.length === 1 ? "" : "s"} to clipboard`
              : "Copy failed",
          );
        });
      },
    });

    // Intercept raw DOM key events for scroll shortcuts and Ctrl+B digit shortcuts (1-5)
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      // While in copy mode, swallow every key (before scroll shortcuts) so nothing
      // reaches the shell; preventDefault keeps junk out of xterm's hidden textarea.
      if (copyMode.isActive()) {
        if (e.type === 'keydown') {
          e.preventDefault();
          copyMode.handleKeydown(e);
        }
        return false;
      }

      const scrollResult = handleScrollShortcut(e, term);
      if (scrollResult !== null) return scrollResult;

      if (ctrlBPrefixRef.current && e.type === 'keydown' && e.key >= '1' && e.key <= '5') {
        if (e.ctrlKey) {
          // Ctrl held throughout — Ctrl+digit produces no ASCII, so onData won't fire.
          ctrlBPrefixRef.current = false;
          setPrefixActive(false);
          handleCtrlBAction(e.key);
        }
        // When Ctrl is NOT held, onData will still fire via textarea input.
        return false; // always block xterm's keydown processing for the digit
      }
      return true;
    });

    const onDataDisposable = term.onData((data) => {
      if (gamePhaseRef.current !== "playing") return;

      // tmux rename-window: the inline prompt consumes keys until Enter/Esc.
      if (handleRenameData(data)) return;

      // tmux confirm-before-kill: the next key answers the close prompt.
      if (closeConfirmRef.current) {
        if (data === "\r" || data === "\n") return; // ignore Enter; wait for y/n
        const confirmed = data[0]?.toLowerCase() === "y";
        closeConfirmRef.current = false;
        setCloseConfirm(null);
        const pid = paneToCloseRef.current;
        paneToCloseRef.current = null;
        if (confirmed && pid) {
          cleanupPaneRef.current(pid);
          useGameStore.getState().closePane(pid);
        }
        return;
      }

      // tmux `-r` repeat: while the repeat window is open, a repeatable resize key
      // re-fires (and re-arms) without the prefix. Any other key ends repeat mode
      // and is processed normally below.
      if (repeatModeRef.current) {
        const b = bindingsRef.current[data];
        if (b && b.kind === "resize" && b.repeat) {
          applyResize(b);
          armRepeat();
          return;
        }
        clearRepeat();
      }

      // Prefix mode — consume the next key as a tab/pane action
      if (ctrlBPrefixRef.current) {
        ctrlBPrefixRef.current = false;
        setPrefixActive(false);

        if (data === prefixCharRef.current) {
          // prefix, prefix — send the literal prefix char to the session
          handleInputRef.current(term, prefixCharRef.current);
          return;
        }
        if (data === '[') {
          // <prefix> [ — enter copy mode on THIS (focused) pane. Always allowed,
          // matching real tmux, so it's reachable even before tabs unlock.
          copyMode.enter();
          return;
        }
        if (!useGameStore.getState().storyFlags.tabs_unlocked) {
          // Locked and not a copy-mode entry — pass the key through to the shell.
          handleInputRef.current(term, data);
          return;
        }
        // Vim-style binds from ~/.tmux.conf (case-sensitive: `h` nav vs `H` resize).
        const binding = bindingsRef.current[data];
        if (binding) {
          if (binding.kind === "focus") {
            useGameStore.getState().focusDirection(binding.dir);
          } else {
            applyResize(binding);
            if (binding.repeat) armRepeat();
          }
          return;
        }
        // Directional pane focus (prefix + arrow). Arrows arrive as CSI sequences.
        const arrowDir =
          data === "\x1b[A" ? "U" : data === "\x1b[B" ? "D" : data === "\x1b[C" ? "R" : data === "\x1b[D" ? "L" : null;
        if (arrowDir) {
          useGameStore.getState().focusDirection(arrowDir);
          return;
        }
        // An unbound prefix key is a no-op (matches real tmux).
        handleCtrlBAction(data[0]);
        return;
      }

      // Check for the configured prefix key. Armed from the start so copy mode is
      // reachable in Chapter 1; tab/pane actions stay gated inside handleCtrlBAction.
      if (data === prefixCharRef.current) {
        ctrlBPrefixRef.current = true;
        setPrefixActive(true);
        return;
      }

      handleInputRef.current(term, data);
    });

    return { term, fitAddon, containerEl, onDataDisposable, copyMode, lastW: 0, lastH: 0 };
  }, [handleCtrlBAction, applyResize, armRepeat, clearRepeat, handleRenameData]);

  // Mount/unmount pane instances when the set of panes changes (split/close/window add)
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const currentPaneIds = new Set(windows.flatMap((w) => allLeaves(w.root).map((l) => l.id)));
    const instances = paneInstancesRef.current;

    // Dispose instances for removed panes
    for (const [id, instance] of instances) {
      if (!currentPaneIds.has(id)) {
        cleanupPaneRef.current(id);
        instance.onDataDisposable.dispose();
        instance.term.dispose();
        if (instance.containerEl.parentNode) {
          instance.containerEl.parentNode.removeChild(instance.containerEl);
        }
        instances.delete(id);
      }
    }

    // Create instances for new panes
    for (const win of windows) {
      for (const leaf of allLeaves(win.root)) {
        if (instances.has(leaf.id)) continue;
        const containerEl = document.createElement("div");
        containerEl.className = "absolute";
        containerEl.style.padding = PANE_CHROME.padding;
        containerEl.style.left = "0";
        containerEl.style.top = "0";
        containerEl.style.width = "100%";
        containerEl.style.height = "100%";
        wrapper.appendChild(containerEl);

        const instance = createPaneInstance(leaf.id, containerEl);
        instances.set(leaf.id, instance);

        // Only show splash on the very first pane during initial game load
        const isFirstPane = !splashShownRef.current;
        if (isFirstPane && gamePhaseRef.current === "playing") {
          splashShownRef.current = true;
          const store = useGameStore.getState();

          const splash =
            leaf.computerId === "home"
              ? homeWelcome
              : leaf.computerId === "devcontainer"
                ? coderBanner
                : nexacorpLogo;
          splash.forEach((line) => instance.term.writeln(line));

          // Seed immediate piper messages for home
          if (leaf.computerId === "home") {
            const homePiperIds = seedImmediatePiper(store.username, "home");
            const newHomeIds = homePiperIds.filter((id) => !store.deliveredPiperIds.includes(id));
            if (newHomeIds.length > 0) {
              store.addDeliveredPiperMessages(newHomeIds);
            }
          }

          // Auto-open nano on first game start (home PC only)
          if (!store.hasSeenIntro && leaf.computerId === "home") {
            const homeFs = store.computerState.home?.fs;
            const filePath = `${homeFs?.homeDir ?? `/home/${store.username}`}/terminal_notes.txt`;
            const readResult = homeFs?.readFile(filePath) ?? { content: undefined };
            const content = readResult.content ?? "";
            startSessionRef.current(instance.term, {
              type: "editor",
              info: { filePath, content, readOnly: false, isNewFile: false },
            }, leaf.id);
          } else {
            instance.term.write(getPromptRef.current());
          }
        } else if (knownPaneIdsRef.current.has(leaf.id)) {
          // Pane from initial state (e.g. restore from save) — show prompt
          if (gamePhaseRef.current === "playing") {
            instance.term.write(getPromptRef.current());
          }
        } else {
          // New pane created by user (split / new window) — straight to prompt
          instance.term.write(getPromptRef.current());
        }

        knownPaneIdsRef.current.add(leaf.id);
      }
    }
  }, [windows, createPaneInstance]);

  // Position/show/hide/focus panes whenever the layout or wrapper size changes.
  // Read the wrapper's live size (effects run post-layout, so it's accurate even
  // on first mount); wrapperSize is only a dependency that re-runs this on resize.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const W = wrapper?.clientWidth ?? 0;
    const H = wrapper?.clientHeight ?? 0;
    const rects = activeWindow && W > 0 && H > 0 ? paneRects(activeWindow.root, 0, 0, W, H) : [];
    const rectById = new Map(rects.map((r) => [r.id, r]));
    const activePaneId = activeWindow?.activePaneId;
    const multi = rects.length > 1;

    for (const [id, inst] of paneInstancesRef.current) {
      const r = rectById.get(id);
      if (!r) {
        // Pane belongs to a non-active window — hide it.
        // eslint-disable-next-line react-hooks/immutability
        inst.containerEl.style.display = "none";
        if (inst.copyMode.isActive()) inst.copyMode.exit({ refocus: false });
        continue;
      }
      const el = inst.containerEl;
      el.style.display = "block";
      el.style.left = `${r.x}px`;
      el.style.top = `${r.y}px`;
      el.style.width = `${r.w}px`;
      el.style.height = `${r.h}px`;
      const isActivePane = id === activePaneId;
      el.style.outline = isActivePane && multi ? PANE_CHROME.activeOutline : "none";
      el.style.outlineOffset = PANE_CHROME.outlineOffset;
      // Lift the active pane above its sibling panes so the later-painted neighbor
      // below/right can't repaint over the abutting (inset) edge of its outline —
      // otherwise the bottom/right side of the gold box goes missing. Stays below the
      // PaneDividers layer (z-10, outside the wrapper's stacking context) so seams remain
      // visible and draggable.
      el.style.zIndex = isActivePane && multi ? "1" : "";

      if (inst.lastW !== r.w || inst.lastH !== r.h) {
        inst.lastW = r.w;
        inst.lastH = r.h;
        inst.fitAddon.fit();
        resizePaneSessionRef.current(id);
      }

      if (isActivePane && !inst.copyMode.isActive()) {
        inst.term.focus();
      } else if (!isActivePane && inst.copyMode.isActive()) {
        inst.copyMode.exit({ refocus: false });
      }
    }
  }, [windows, activeWindowId, wrapperSize, activeWindow]);

  // Handle phase transitions (e.g. booting→playing shows unlock box + prompt)
  useEffect(() => {
    const activePaneId = activeWindow?.activePaneId;
    const instance = activePaneId ? paneInstancesRef.current.get(activePaneId) : undefined;
    if (!instance) return;

    const prevPhase = prevGamePhaseRef.current;
    prevGamePhaseRef.current = gamePhase;

    if (gamePhase === "playing" && prevPhase === "booting" && splashShownRef.current) {
      const store = useGameStore.getState();
      const activeLeaf = getActiveLeaf(store);
      if (activeLeaf?.computerId === "nexacorp" && !shownUnlockRef.current) {
        shownUnlockRef.current = true;
        UNLOCK_BOX.forEach((line) => instance.term.writeln(line));
        store.addToast("New commands unlocked! Type 'help' to see all.");
      }
      instance.term.write(getPromptRef.current());
    }
  }, [gamePhase, activeWindow]);

  // Track wrapper size (drives pane geometry); a single observer covers browser
  // resize, layout shifts, and the tab bar appearing/disappearing.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const update = () => setWrapperSize({ w: wrapper.clientWidth, h: wrapper.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  // Tab bar callbacks (window-level)
  const handleNewWindow = useCallback((computerId?: ComputerId) => {
    const store = useGameStore.getState();
    if (computerId) {
      const targetFs = store.computerState[computerId]?.fs;
      const cwd = targetFs?.homeDir ?? `/home/${store.username}`;
      store.addWindow(computerId, cwd);
    } else {
      const leaf = getActiveLeaf(store);
      if (!leaf) return;
      store.addWindow(leaf.computerId as ComputerId, leaf.cwd);
    }
  }, []);

  const handleCloseWindow = useCallback((windowId: string) => {
    const store = useGameStore.getState();
    const win = store.windows.find((w) => w.id === windowId);
    if (win) for (const leaf of allLeaves(win.root)) cleanupPaneRef.current(leaf.id);
    store.removeWindow(windowId);
  }, []);

  const handleSelectWindow = useCallback((windowId: string) => {
    useGameStore.getState().setActiveWindow(windowId);
  }, []);

  const tabsUnlocked = !!storyFlags.tabs_unlocked;
  const showTabBar = tabsUnlocked && gamePhase === "playing";

  return (
    <div className="w-full h-full flex flex-col">
      {showTabBar && (
        <TabBar
          onNewWindow={handleNewWindow}
          onCloseWindow={handleCloseWindow}
          onSelectWindow={handleSelectWindow}
          prefixActive={prefixActive}
          closeConfirm={closeConfirm}
          renamePrompt={renamePrompt}
          theme={tabTheme}
        />
      )}
      <div className="flex-1 relative min-h-0">
        {/* xterm pane containers are appended here imperatively and positioned
            absolutely from the active window's pane tree. `isolate` gives this a
            stacking context so xterm's internal z-indexes can't paint over the
            overlays below it. Kept React-childless so reconciliation never
            touches the imperatively-appended pane nodes. */}
        <div ref={wrapperRef} className="absolute inset-0 isolate" />
        {/* Resizable seams between split panes, overlaid on top of the panes. */}
        {showTabBar && activeWindow && (
          <PaneDividers
            root={activeWindow.root}
            width={wrapperSize.w}
            height={wrapperSize.h}
            activePaneRect={paneRects(activeWindow.root, 0, 0, wrapperSize.w, wrapperSize.h).find(
              (r) => r.id === activeWindow.activePaneId,
            )}
            onResize={(splitId, ratio) => useGameStore.getState().resizePane(splitId, ratio)}
          />
        )}
        {copyModeActive && (
          <div className="absolute bottom-4 left-2 z-20 pointer-events-none rounded-md border border-[#2a2f3a] bg-[#1a1f29]/90 px-3 py-1 font-mono text-xs text-[#b3b1ad] backdrop-blur-sm">
            <span className="font-bold text-[#e6b450]">COPY MODE</span>
            <span className="text-[#6c7380]">
              {copyModeHelpHidden ? COPY_MODE_HINT_HIDDEN : COPY_MODE_HINT}
            </span>
          </div>
        )}
        {/* Pre-unlock there's no tab bar, so float the prefix indicator here instead. */}
        {prefixActive && !showTabBar && (
          <span
            className="absolute bottom-2 right-2 z-20 pointer-events-none rounded bg-[#1a1f29]/90 px-2 py-1 font-mono text-xs animate-pulse backdrop-blur-sm"
            style={{ color: tabTheme.currentBg }}
          >
            ^{tabPrefix.label.replace(/^Ctrl\+/, "")}
          </span>
        )}
      </div>
    </div>
  );
}
