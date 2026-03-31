"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import TabBar from "./TabBar";
import { useGameStore } from "../../state/gameStore";
import { useTerminal } from "../../hooks/useTerminal";
import { nexacorpLogo, homeWelcome, coderBanner, UNLOCK_BOX } from "../../lib/ascii";
import { seedImmediatePiper } from "../../engine/piper/delivery";
import { ComputerId } from "../../state/types";

const XTERM_THEME = {
  background: "#0a0e14",
  foreground: "#b3b1ad",
  cursor: "#e6b450",
  cursorAccent: "#0a0e14",
  selectionBackground: "#253340",
  black: "#01060e",
  red: "#ea6c73",
  green: "#91b362",
  yellow: "#f9af4f",
  blue: "#53bdfa",
  magenta: "#fae994",
  cyan: "#90e1c6",
  white: "#c7c7c7",
  brightBlack: "#686868",
  brightRed: "#f07178",
  brightGreen: "#c2d94c",
  brightYellow: "#ffb454",
  brightBlue: "#59c2ff",
  brightMagenta: "#ffee99",
  brightCyan: "#95e6cb",
  brightWhite: "#ffffff",
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
}

export default function TabManager() {
  const tabs = useGameStore((s) => s.tabs);
  const activeTabId = useGameStore((s) => s.activeTabId);
  const gamePhase = useGameStore((s) => s.gamePhase);
  const storyFlags = useGameStore((s) => s.storyFlags);

  const { handleInput, getPrompt, startSession, canCloseCurrentSession, cleanupTab, resizeActiveSession } = useTerminal();

  // Store callbacks in refs to avoid stale closures in xterm onData
  const handleInputRef = useRef(handleInput);
  const startSessionRef = useRef(startSession);
  const getPromptRef = useRef(getPrompt);
  const gamePhaseRef = useRef(gamePhase);
  const canCloseRef = useRef(canCloseCurrentSession);
  const cleanupTabRef = useRef(cleanupTab);
  const resizeActiveSessionRef = useRef(resizeActiveSession);
  handleInputRef.current = handleInput;
  startSessionRef.current = startSession;
  getPromptRef.current = getPrompt;
  gamePhaseRef.current = gamePhase;
  canCloseRef.current = canCloseCurrentSession;
  cleanupTabRef.current = cleanupTab;
  resizeActiveSessionRef.current = resizeActiveSession;

  const tabInstancesRef = useRef<Map<string, TabInstance>>(new Map());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const splashShownRef = useRef(false);
  const shownUnlockRef = useRef(false);
  const prevGamePhaseRef = useRef(gamePhase);

  // Ctrl+B prefix mode state
  const ctrlBPrefixRef = useRef(false);
  const ctrlBTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [prefixActive, setPrefixActive] = useState(false);

  // Force-close tracking: second Ctrl+B,X within 2s forces close
  const forceCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forceClosePendingRef = useRef(false);

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
      // Close current tab (with canClose check)
      if (store.tabs.length > 1) {
        const canClose = canCloseRef.current();
        if (!canClose) {
          if (forceClosePendingRef.current) {
            // Second attempt — force close
            forceClosePendingRef.current = false;
            if (forceCloseTimerRef.current) {
              clearTimeout(forceCloseTimerRef.current);
              forceCloseTimerRef.current = null;
            }
            cleanupTabRef.current(store.activeTabId);
            store.removeTab(store.activeTabId);
          } else {
            // First attempt — warn and arm force-close
            forceClosePendingRef.current = true;
            const instance = tabInstancesRef.current.get(store.activeTabId);
            if (instance) {
              instance.term.write("\r\n\x1b[33mUnsaved changes. Press Ctrl+B, X again to force close.\x1b[0m");
            }
            forceCloseTimerRef.current = setTimeout(() => {
              forceClosePendingRef.current = false;
              forceCloseTimerRef.current = null;
            }, 2000);
          }
          return;
        }
        cleanupTabRef.current(store.activeTabId);
        store.removeTab(store.activeTabId);
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

    // Intercept raw DOM key events for scroll shortcuts and Ctrl+B digit shortcuts (1-5)
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      const scrollResult = handleScrollShortcut(e, term);
      if (scrollResult !== null) return scrollResult;

      if (ctrlBPrefixRef.current && e.type === 'keydown' && e.key >= '1' && e.key <= '5') {
        if (e.ctrlKey) {
          // Ctrl held throughout — Ctrl+digit produces no ASCII, so onData won't fire.
          // Handle the action directly here.
          ctrlBPrefixRef.current = false;
          setPrefixActive(false);
          if (ctrlBTimerRef.current) {
            clearTimeout(ctrlBTimerRef.current);
            ctrlBTimerRef.current = null;
          }
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

      // Ctrl+B prefix handling
      if (ctrlBPrefixRef.current) {
        // In prefix mode — consume the next key as a tab action
        ctrlBPrefixRef.current = false;
        setPrefixActive(false);
        if (ctrlBTimerRef.current) {
          clearTimeout(ctrlBTimerRef.current);
          ctrlBTimerRef.current = null;
        }

        if (data === "\x02") {
          // Ctrl+B, Ctrl+B — send literal Ctrl+B to session
          handleInputRef.current(term, "\x02");
        } else {
          handleCtrlBAction(data[0]);
        }
        return;
      }

      // Check for Ctrl+B (\x02)
      if (data === "\x02" && useGameStore.getState().storyFlags.tabs_unlocked) {
        ctrlBPrefixRef.current = true;
        setPrefixActive(true);
        // Timeout: if no key pressed within 500ms, cancel prefix and send Ctrl+B
        ctrlBTimerRef.current = setTimeout(() => {
          if (ctrlBPrefixRef.current) {
            ctrlBPrefixRef.current = false;
            setPrefixActive(false);
            handleInputRef.current(term, "\x02");
          }
        }, 500);
        return;
      }

      handleInputRef.current(term, data);
    });

    return { term, fitAddon, containerEl, onDataDisposable };
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
      instance.containerEl.style.visibility = isActive ? "visible" : "hidden";
      instance.containerEl.style.pointerEvents = isActive ? "auto" : "none";
      if (isActive) {
        instance.fitAddon.fit();
        instance.term.focus();
        resizeActiveSessionRef.current();
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
        <div className="flex items-center">
          <TabBar
            onNewTab={handleNewTab}
            onCloseTab={handleCloseTab}
            onSelectTab={handleSelectTab}
          />
          {prefixActive && (
            <span className="px-2 text-xs font-mono text-[#e6b450] animate-pulse">
              ^B
            </span>
          )}
        </div>
      )}
      <div ref={wrapperRef} className="flex-1 relative min-h-0" />
    </div>
  );
}
