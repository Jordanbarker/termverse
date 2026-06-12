"use client";

import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import TabBar from "./TabBar";
import { useGameStore } from "../../state/gameStore";
import { useTerminal } from "../../hooks/useTerminal";
import { nexacorpLogo, homeWelcome, coderBanner, UNLOCK_BOX } from "../../lib/ascii";
import { seedImmediatePiper } from "../../engine/piper/delivery";
import { parseTmuxPrefix, parseTmuxTheme } from "../../engine/terminal/tmuxConfig";
import { ANSI_COLORS } from "../../engine/terminal/ansiPalette";
import { CopyModeController } from "../../engine/terminal/copyMode";
import { sessionUsesAltScreen } from "../../engine/session/types";
import { copyToClipboard } from "../../lib/clipboard";
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

interface TabInstance {
  term: XTerm;
  fitAddon: FitAddon;
  containerEl: HTMLDivElement;
  onDataDisposable: import("@xterm/xterm").IDisposable;
  copyMode: CopyModeController;
}

export default function TabManager() {
  const tabs = useGameStore((s) => s.tabs);
  const activeTabId = useGameStore((s) => s.activeTabId);
  const gamePhase = useGameStore((s) => s.gamePhase);
  const storyFlags = useGameStore((s) => s.storyFlags);
  const copyModeHelpHidden = useGameStore((s) => s.copyModeHelpHidden);
  // Tab prefix is read from the home PC's ~/.tmux.conf (your local terminal's
  // tmux config governs the tabs, regardless of which box a tab is connected to).
  // Select the raw conf string (a primitive) so the selector stays referentially
  // stable; parse it with a memo.
  const homeTmuxConf = useGameStore((s) => {
    const fs = s.computerState.home?.fs;
    return fs ? fs.readFile(`${fs.homeDir}/.tmux.conf`).content : undefined;
  });
  const tabPrefix = useMemo(() => parseTmuxPrefix(homeTmuxConf), [homeTmuxConf]);
  const tabTheme = useMemo(() => parseTmuxTheme(homeTmuxConf), [homeTmuxConf]);

  const { handleInput, getPrompt, startSession, canCloseCurrentSession, getActiveSessionType, cleanupTab, resizeActiveSession } = useTerminal();

  // Store callbacks in refs to avoid stale closures in xterm onData
  const handleInputRef = useRef(handleInput);
  const startSessionRef = useRef(startSession);
  const getPromptRef = useRef(getPrompt);
  const gamePhaseRef = useRef(gamePhase);
  const canCloseRef = useRef(canCloseCurrentSession);
  const getActiveSessionTypeRef = useRef(getActiveSessionType);
  const cleanupTabRef = useRef(cleanupTab);
  const resizeActiveSessionRef = useRef(resizeActiveSession);
  handleInputRef.current = handleInput;
  startSessionRef.current = startSession;
  getPromptRef.current = getPrompt;
  gamePhaseRef.current = gamePhase;
  canCloseRef.current = canCloseCurrentSession;
  getActiveSessionTypeRef.current = getActiveSessionType;
  cleanupTabRef.current = cleanupTab;
  resizeActiveSessionRef.current = resizeActiveSession;

  const tabInstancesRef = useRef<Map<string, TabInstance>>(new Map());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const splashShownRef = useRef(false);
  const shownUnlockRef = useRef(false);
  const prevGamePhaseRef = useRef(gamePhase);

  // Tab prefix mode state (prefix key configured via ~/.tmux.conf)
  const ctrlBPrefixRef = useRef(false);
  const [prefixActive, setPrefixActive] = useState(false);

  // Copy mode (tmux/vi `<prefix> [`) — indicator state for the overlay
  const [copyModeActive, setCopyModeActive] = useState(false);

  // Keep the live prefix char available inside the xterm onData closures.
  const prefixCharRef = useRef(tabPrefix.char);
  prefixCharRef.current = tabPrefix.char;

  // tmux confirm-before-kill: the close prompt shown in the status bar.
  const [closeConfirm, setCloseConfirm] = useState<string | null>(null);
  const closeConfirmRef = useRef(false); // synchronous flag read inside onData

  // Keep track of tab IDs we've seen to know which are new
  const knownTabIdsRef = useRef<Set<string>>(new Set());

  // Initialize known tabs
  useEffect(() => {
    for (const tab of tabs) {
      knownTabIdsRef.current.add(tab.id);
    }
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

    if (normalized === "c") {
      // Create new tab on same computer
      const activeTab = store.tabs.find((t) => t.id === store.activeTabId);
      if (activeTab) store.addTab(activeTab.computerId, activeTab.cwd);
    } else if (normalized === "x") {
      // Close current tab — tmux-style confirm-before-kill (rendered in the bar).
      if (store.tabs.length > 1) {
        const idx = store.tabs.findIndex((t) => t.id === store.activeTabId);
        const note = canCloseRef.current() ? "" : " Unsaved changes will be lost.";
        setCloseConfirm(`kill-pane ${idx + 1}?${note} (y/n)`);
        closeConfirmRef.current = true;
      }
    } else if (normalized === "n") {
      // Next tab
      const idx = store.tabs.findIndex((t) => t.id === store.activeTabId);
      const nextIdx = (idx + 1) % store.tabs.length;
      store.setActiveTab(store.tabs[nextIdx].id);
    } else if (normalized === "p") {
      // Previous tab
      const idx = store.tabs.findIndex((t) => t.id === store.activeTabId);
      const prevIdx = (idx - 1 + store.tabs.length) % store.tabs.length;
      store.setActiveTab(store.tabs[prevIdx].id);
    } else if (key >= "1" && key <= "5") {
      // Jump to tab N
      const tabIdx = parseInt(key) - 1;
      if (tabIdx < store.tabs.length) {
        store.setActiveTab(store.tabs[tabIdx].id);
      }
    }
  }, []);

  const createTerminalInstance = useCallback((tabId: string, containerEl: HTMLDivElement): TabInstance => {
    const term = new XTerm(XTERM_OPTIONS);
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerEl);
    fitAddon.fit();

    // tmux/vi copy mode (entered via `<prefix> [`). The engine controller owns
    // the cursor/selection; clipboard + toast live here as the yank side effect.
    const copyMode = new CopyModeController(term, {
      onChange: (active) => {
        setCopyModeActive(active);
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
          // Handle the action directly here.
          ctrlBPrefixRef.current = false;
          setPrefixActive(false);
          handleCtrlBAction(e.key);
        }
        // When Ctrl is NOT held, onData will still fire via textarea input.
        // Leave prefix mode active so the onData handler catches it.
        return false; // always block xterm's keydown processing for the digit
      }
      return true;
    });

    const onDataDisposable = term.onData((data) => {
      if (gamePhaseRef.current !== "playing") return;

      // tmux confirm-before-kill: the next key answers the close prompt.
      if (closeConfirmRef.current) {
        if (data === "\r" || data === "\n") return; // ignore Enter; wait for y/n
        const confirmed = data[0]?.toLowerCase() === "y";
        closeConfirmRef.current = false;
        setCloseConfirm(null);
        if (confirmed) {
          const store = useGameStore.getState();
          cleanupTabRef.current(store.activeTabId);
          store.removeTab(store.activeTabId);
        }
        // Cancel needs no redraw: the prompt lived in the status bar, so the pane
        // buffer (and any half-typed shell line) was never touched.
        return;
      }

      // Ctrl+B prefix handling
      if (ctrlBPrefixRef.current) {
        // In prefix mode — consume the next key as a tab action
        ctrlBPrefixRef.current = false;
        setPrefixActive(false);

        if (data === prefixCharRef.current) {
          // prefix, prefix — send the literal prefix char to the session
          handleInputRef.current(term, prefixCharRef.current);
        } else if (data === '[') {
          // <prefix> [ — enter copy mode (always, matching real tmux). Works at the shell,
          // over any inline session (email reply prompt, Chip, the snow/python REPLs, ssh
          // auth), and over a full-screen alternate-screen session (nano/less/piper) where
          // it's confined to the visible screen. Exiting copy mode redraws the active
          // alt-screen session (see the onChange handler) to restore its cursor state.
          copyMode.enter();
        } else if (useGameStore.getState().storyFlags.tabs_unlocked) {
          // Tab actions; an unbound prefix key is a no-op (matches real tmux).
          handleCtrlBAction(data[0]);
        } else {
          // Locked and not a copy-mode entry — don't eat the key, pass it through.
          handleInputRef.current(term, data);
        }
        return;
      }

      // Check for the configured prefix key. Armed from the start so copy mode is
      // reachable in Chapter 1; tab actions stay gated inside handleCtrlBAction.
      if (data === prefixCharRef.current) {
        ctrlBPrefixRef.current = true;
        setPrefixActive(true);
        // Wait indefinitely for the next key (matches real tmux — no prefix timeout).
        // Press the prefix again to send the literal char; any other/unbound key exits.
        return;
      }

      handleInputRef.current(term, data);
    });

    return { term, fitAddon, containerEl, onDataDisposable, copyMode };
  }, [handleCtrlBAction]);

  // Mount/unmount terminal instances when tabs change
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const currentIds = new Set(tabs.map((t) => t.id));
    const instances = tabInstancesRef.current;

    // Remove instances for deleted tabs
    for (const [id, instance] of instances) {
      if (!currentIds.has(id)) {
        cleanupTabRef.current(id);
        instance.onDataDisposable.dispose();
        instance.term.dispose();
        if (instance.containerEl.parentNode) {
          instance.containerEl.parentNode.removeChild(instance.containerEl);
        }
        instances.delete(id);
      }
    }

    // Create instances for new tabs
    for (const tab of tabs) {
      if (!instances.has(tab.id)) {
        const containerEl = document.createElement("div");
        containerEl.className = "absolute inset-0";
        containerEl.style.padding = "8px";
        wrapper.appendChild(containerEl);

        const instance = createTerminalInstance(tab.id, containerEl);
        instances.set(tab.id, instance);

        // Only show splash on the very first tab during initial game load
        const isFirstTab = !splashShownRef.current;
        if (isFirstTab && gamePhaseRef.current === "playing") {
          splashShownRef.current = true;
          const store = useGameStore.getState();

          const splash =
            tab.computerId === "home"
              ? homeWelcome
              : tab.computerId === "devcontainer"
                ? coderBanner
                : nexacorpLogo;
          splash.forEach((line) => instance.term.writeln(line));

          // Seed immediate piper messages for home
          if (tab.computerId === "home") {
            const homePiperIds = seedImmediatePiper(store.username, "home");
            const newHomeIds = homePiperIds.filter((id) => !store.deliveredPiperIds.includes(id));
            if (newHomeIds.length > 0) {
              store.addDeliveredPiperMessages(newHomeIds);
            }
          }

          // Auto-open nano on first game start (home PC only)
          if (!store.hasSeenIntro && tab.computerId === "home") {
            const homeFs = store.computerState.home?.fs;
            const filePath = `${homeFs?.homeDir ?? `/home/${store.username}`}/terminal_notes.txt`;
            const readResult = homeFs?.readFile(filePath) ?? { content: undefined };
            const content = readResult.content ?? "";
            startSessionRef.current(instance.term, {
              type: "editor",
              info: { filePath, content, readOnly: false, isNewFile: false },
            });
          } else {
            instance.term.write(getPromptRef.current());
          }
        } else if (knownTabIdsRef.current.has(tab.id)) {
          // Tab from initial state (e.g., restore from save) — show prompt
          if (gamePhaseRef.current === "playing") {
            instance.term.write(getPromptRef.current());
          }
        } else {
          // New tab created by user — straight to prompt
          instance.term.write(getPromptRef.current());
        }

        knownTabIdsRef.current.add(tab.id);
      }
    }
  }, [tabs, createTerminalInstance]);

  // Toggle visibility and focus on active tab change
  useEffect(() => {
    const instances = tabInstancesRef.current;
    for (const [id, instance] of instances) {
      const isActive = id === activeTabId;
      // Intentional imperative DOM toggle inside an effect: each tab's xterm
      // container is shown/hidden by activeTabId. The react-hooks immutability
      // rule false-positives on mutating ref-held DOM nodes here.
      // eslint-disable-next-line react-hooks/immutability
      instance.containerEl.style.visibility = isActive ? "visible" : "hidden";
      instance.containerEl.style.pointerEvents = isActive ? "auto" : "none";
      if (isActive) {
        instance.fitAddon.fit();
        instance.term.focus();
        resizeActiveSessionRef.current();
      } else if (instance.copyMode.isActive()) {
        // Leaving a tab mid-copy-mode (e.g. clicked away): clean up without
        // refocusing, so this now-hidden terminal can't steal focus.
        instance.copyMode.exit({ refocus: false });
      }
    }
  }, [activeTabId]);

  // Handle phase transitions (e.g., booting→playing shows unlock box + prompt)
  useEffect(() => {
    const instance = tabInstancesRef.current.get(activeTabId);
    if (!instance) return;

    const prevPhase = prevGamePhaseRef.current;
    prevGamePhaseRef.current = gamePhase;

    if (gamePhase === "playing" && prevPhase === "booting" && splashShownRef.current) {
      // Only on actual transition to playing (e.g., after boot animation)
      const store = useGameStore.getState();
      const activeTab = store.tabs.find((t) => t.id === store.activeTabId);
      if (activeTab?.computerId === "nexacorp" && !shownUnlockRef.current) {
        shownUnlockRef.current = true;
        UNLOCK_BOX.forEach((line) => instance.term.writeln(line));
        store.addToast("New commands unlocked! Type 'help' to see all.");
      }
      instance.term.write(getPromptRef.current());
    }
  }, [gamePhase, activeTabId]);

  // Window resize
  useEffect(() => {
    const handleResize = () => {
      const instance = tabInstancesRef.current.get(activeTabId);
      if (instance) instance.fitAddon.fit();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeTabId]);

  // Tab bar callbacks
  const handleNewTab = useCallback((computerId?: ComputerId) => {
    const store = useGameStore.getState();
    if (computerId) {
      const targetFs = store.computerState[computerId]?.fs;
      const cwd = targetFs?.homeDir ?? `/home/${store.username}`;
      store.addTab(computerId, cwd);
    } else {
      const activeTab = store.tabs.find((t) => t.id === store.activeTabId);
      if (!activeTab) return;
      store.addTab(activeTab.computerId, activeTab.cwd);
    }
  }, []);

  const handleCloseTab = useCallback((tabId: string) => {
    cleanupTabRef.current(tabId);
    useGameStore.getState().removeTab(tabId);
  }, []);

  const handleSelectTab = useCallback((tabId: string) => {
    useGameStore.getState().setActiveTab(tabId);
  }, []);

  const tabsUnlocked = !!storyFlags.tabs_unlocked;
  const showTabBar = tabsUnlocked && gamePhase === "playing";

  return (
    <div className="w-full h-full flex flex-col">
      {showTabBar && (
        <TabBar
          onNewTab={handleNewTab}
          onCloseTab={handleCloseTab}
          onSelectTab={handleSelectTab}
          prefixActive={prefixActive}
          closeConfirm={closeConfirm}
          theme={tabTheme}
        />
      )}
      <div className="flex-1 relative min-h-0">
        {/* xterm containers are appended here imperatively. `isolate` gives this a
            stacking context so xterm's internal z-indexes (up to 11) can't paint
            over the overlays below it. */}
        <div ref={wrapperRef} className="absolute inset-0 isolate" />
        {copyModeActive && (
          <div className="absolute bottom-4 left-2 z-20 pointer-events-none rounded-md border border-[#2a2f3a] bg-[#1a1f29]/90 px-3 py-1 font-mono text-xs text-[#b3b1ad] backdrop-blur-sm">
            <span className="font-bold text-[#e6b450]">COPY MODE</span>
            <span className="text-[#6c7380]">
              {copyModeHelpHidden
                ? " · ? help"
                : " · hjkl/arrows move · 0/$ line · g/G top/bot · v select · y yank · esc exit · ? hide"}
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
