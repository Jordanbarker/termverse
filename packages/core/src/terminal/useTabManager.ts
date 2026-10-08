"use client";

/**
 * Store-agnostic tmux pane orchestration shared by both games' TabManagers.
 *
 * Owns everything that used to be duplicated: the per-pane xterm runtime map
 * (create/dispose/position/fit), the wrapper ResizeObserver, the prefix/repeat
 * input pipeline (via the pure tmuxInputRouter), per-pane copy mode, memoized
 * `~/.tmux.conf` parsing, the rename-window prompt, and the cell→ratio resize
 * conversion. Apps inject their store actions through a TabManagerAdapter and
 * their behavior differences through TabManagerExtensions, then render the
 * chrome (status bar, overlays, PaneDividers) from the returned state.
 *
 * Stale-closure contract: each pane's onData/keydown handlers are bound once at
 * pane creation and live for the pane's lifetime, so adapter/extensions/parsed
 * conf are all read through refs synced on every render — never captured.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { IDisposable } from "@xterm/xterm";
import { XTERM_OPTIONS, XTERM_THEME, handleScrollShortcut } from "./xtermDefaults";
import { parseTmuxPrefix, parseTmuxTheme, parseTmuxBindings, type TabPrefix, type TabBarTheme, type PaneBinding } from "./tmuxConfig";
import { CopyModeController, COPY_MODE_HINT, COPY_MODE_HINT_HIDDEN, COPY_MODE_SELECTION_BG, COPY_MODE_SELECTION_FG } from "./copyMode";
import { createTmuxInputRouter, keyEventMatchesPrefix, type ResizeBinding, type FocusDir, type TmuxInputRouter } from "./tmuxInputRouter";
import { useRenameWindowPrompt } from "./useRenameWindowPrompt";
import { allLeaves, paneRects, nearestResizableSplit, nodeBox, type WindowState, type SplitDirection } from "./paneTypes";
import { PANE_CHROME } from "./paneChrome";
import { copyToClipboard } from "../lib/clipboard";

/** Pixel height of the copy-mode hint strip (one row at the terminal's font size). */
const COPY_HINT_HEIGHT = Math.ceil(XTERM_OPTIONS.fontSize * 1.4);

export interface PaneRuntime {
  term: XTerm;
  fitAddon: FitAddon;
  /** The pane box: positioned, clipped and outlined; holds the xterm host + copy-mode chrome. */
  containerEl: HTMLDivElement;
  /**
   * What xterm is opened into, inset by `PANE_CHROME.padding`. FitAddon sizes rows
   * from its parent's computed height and ignores the parent's padding (border-box),
   * so the usable area must be this element's size: shrink it, never pad it.
   */
  termHostEl: HTMLDivElement;
  onDataDisposable: IDisposable;
  /** Kept so `disposeRuntime` can detach it; the container outlives React here. */
  onMouseDown: (e: MouseEvent) => void;
  copyMode: CopyModeController;
  /**
   * Copy-mode chrome: the `COPY offset/history` badge overlays the pane; the
   * key-hint strip fills a row permanently reserved below `termHostEl`, so copy
   * mode never resizes the pane.
   */
  copyBadgeEl: HTMLDivElement;
  copyHintEl: HTMLDivElement;
  copyPos: { offset: number; history: number };
  /** Set by disposeRuntime so the teardown exit skips app copy-mode side effects. */
  disposed: boolean;
  /** Pane's window is hidden (display:none). xterm drops its scroll position + selection while hidden. */
  hidden: boolean;
  /** Last applied pixel size — lets the layout effect skip redundant fit()/resize(). */
  lastW: number;
  lastH: number;
}

/** Store actions, name-mapped by each app onto its own Zustand store. */
export interface TabManagerAdapter {
  splitPane(paneId: string, dir: SplitDirection): void;
  closePane(paneId: string): void;
  cyclePane(): void;
  focusDirection(dir: FocusDir): void;
  setActivePane(paneId: string): void;
  /** `<prefix> c` / status-bar "+" — the app decides which computer/cwd the window opens on. */
  newWindow(): void;
  /** `<prefix> 1-9` — jump to window at 0-based index (app bounds-checks). */
  selectWindowByIndex(index: number): void;
  cycleWindow(dir: "next" | "prev"): void;
  renameWindow(windowId: string, name: string): void;
  /** Relative divider nudge from `resize-pane` binds (already converted to a ratio delta). */
  nudgeSplitRatio(splitId: string, delta: number): void;
  /** Absolute divider ratio from a PaneDividers drag. */
  resizeSplit(splitId: string, ratio: number): void;
  /** `<prefix> d` — detach the client from its tmux session (drop to the bare shell). */
  detachClient(): void;
}

export interface PaneCreatedInfo {
  /** "restored" — pane id existed at mount (save restore); "new" — user-created split/window. */
  kind: "restored" | "new";
  /**
   * True until some onPaneCreated call accepts the one-time first-pane slot
   * (splash screens etc.). Return false to leave the slot unconsumed so the
   * next created pane is offered it again (e.g. created while still booting).
   */
  firstPane: boolean;
}

export interface TabManagerExtensions {
  /** Absolute-first input gate (termoil: gamePhase === "playing"). Default: always enabled. */
  isInputEnabled?(): boolean;
  /** Master gate: is a tmux client attached? When false the whole mux is inert — no prefix, no chords, no copy mode. Default: attached. */
  muxActive?(): boolean;
  /** Gate for tab/pane chords + conf binds (termoil: tabs_unlocked). Copy mode stays reachable. Default: enabled. */
  chordsEnabled?(): boolean;
  /** Runs before the rename prompt (close-confirm y/n, challenge continue gate). Return true to consume. */
  interceptEarly?(paneId: string, term: XTerm, data: string): boolean;
  /** Runs after the rename prompt, before the prefix pipeline (active editor/pager session dispatch). */
  interceptAfterRename?(paneId: string, term: XTerm, data: string): boolean;
  /** Runs before the built-in chord table (termoil reroutes `x` to its confirm modal). Return true to consume. */
  interceptPrefixKey?(paneId: string, key: string): boolean;
  /** Terminal input that reached the shell/line editor. */
  onShellData(paneId: string, term: XTerm, data: string): void;
  /** Fired once per pane right after xterm is opened and fitted (write splash/prompt, attach LineEditor). */
  onPaneCreated?(paneId: string, runtime: PaneRuntime, info: PaneCreatedInfo): boolean | void;
  /** Fired before a pane's xterm is disposed (session cleanup). */
  onPaneDisposed?(paneId: string): void;
  /** Fired after a pane's xterm was re-fitted to a new size (resize the pane's session). */
  onPaneResized?(paneId: string): void;
  /** Copy-mode enter/exit on a pane (termoil redraws alt-screen sessions on exit). */
  onCopyModeChange?(paneId: string, active: boolean): void;
  /** Yank side effect after the clipboard write settles (toast). Copy itself is handled here. */
  onYank?(text: string, ok: boolean): void;
  /** `?` in copy mode toggles the hint; the flag itself is app state (persisted or local). */
  toggleCopyModeHelp(): void;
  /** That flag: true hides the copy-mode key-hint strip (the badge then shows `? help`). */
  copyModeHelpHidden?: boolean;
  /** Extra raw-keydown handling after copy-mode/scroll/Ctrl+digit. Same contract as attachCustomKeyEventHandler. */
  customKeydown?(paneId: string, e: KeyboardEvent, term: XTerm): boolean | null;
  /** Highest window number reachable via `<prefix> <digit>` (termoil: MAX_WINDOWS=5). Default 9. */
  digitWindowMax?: number;
}

export interface UseTabManagerOptions {
  windows: WindowState[];
  activeWindowId: string;
  /** Contents of the governing `~/.tmux.conf` (prefix/theme/binds are parsed + memoized here). */
  tmuxConf: string | undefined;
  adapter: TabManagerAdapter;
  ext: TabManagerExtensions;
}

export interface UseTabManagerResult {
  /** Attach to the pane wrapper div (React-childless; pane containers are appended imperatively). */
  wrapperRef: RefObject<HTMLDivElement | null>;
  wrapperSize: { w: number; h: number };
  prefixActive: boolean;
  /** Non-null while the rename-window prompt is open — render in the status-bar modal slot. */
  renamePrompt: string | null;
  tabPrefix: TabPrefix;
  tabTheme: TabBarTheme;
  tabBindings: Record<string, PaneBinding>;
  getRuntime(paneId: string): PaneRuntime | undefined;
}

export function useTabManager({ windows, activeWindowId, tmuxConf, adapter, ext }: UseTabManagerOptions): UseTabManagerResult {
  const tabPrefix = useMemo(() => parseTmuxPrefix(tmuxConf), [tmuxConf]);
  const tabTheme = useMemo(() => parseTmuxTheme(tmuxConf), [tmuxConf]);
  // Vim-style pane nav/resize binds (`bind h select-pane -L`, `bind -r H resize-pane -L 5`).
  const tabBindings = useMemo(() => parseTmuxBindings(tmuxConf), [tmuxConf]);

  // Everything read inside pane-lifetime closures goes through refs (see header).
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const extRef = useRef(ext);
  extRef.current = ext;
  const prefixCharRef = useRef(tabPrefix.char);
  prefixCharRef.current = tabPrefix.char;
  const themeRef = useRef(tabTheme);
  themeRef.current = tabTheme;
  const bindingsRef = useRef(tabBindings);
  bindingsRef.current = tabBindings;
  const windowsRef = useRef(windows);
  windowsRef.current = windows;
  const activeWindowIdRef = useRef(activeWindowId);
  activeWindowIdRef.current = activeWindowId;

  const runtimesRef = useRef<Map<string, PaneRuntime>>(new Map());
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Wrapper pixel size, tracked via ResizeObserver, drives pane geometry.
  const [wrapperSize, setWrapperSize] = useState({ w: 0, h: 0 });
  const [prefixActive, setPrefixActive] = useState(false);

  // Track pane IDs seen at mount to tell restored panes from brand-new ones,
  // and whether the one-time first-pane slot (splash) has been consumed.
  const knownPaneIdsRef = useRef<Set<string>>(new Set());
  const firstPaneConsumedRef = useRef(false);
  useEffect(() => {
    for (const win of windowsRef.current) for (const leaf of allLeaves(win.root)) knownPaneIdsRef.current.add(leaf.id);
  }, []);

  const {
    begin: beginRename,
    handleData: handleRenameData,
    prompt: renamePrompt,
  } = useRenameWindowPrompt((id, name) => adapterRef.current.renameWindow(id, name));

  // The prefix/repeat state machine. Created once; reads live config via refs.
  const routerRef = useRef<TmuxInputRouter | null>(null);
  if (routerRef.current === null) {
    routerRef.current = createTmuxInputRouter({
      getPrefixChar: () => prefixCharRef.current,
      getBindings: () => bindingsRef.current,
      muxEnabled: () => extRef.current.muxActive?.() ?? true,
      chordsEnabled: () => extRef.current.chordsEnabled?.() ?? true,
      onPrefixStateChange: setPrefixActive,
    });
  }
  const router = routerRef.current;
  useEffect(() => () => router.reset(), [router]);

  const activeWindow = () => {
    const wins = windowsRef.current;
    return wins.find((w) => w.id === activeWindowIdRef.current) ?? wins[0];
  };

  // Resize the divider nearest the focused pane by a cell-sized step. tmux moves
  // borders in grid cells; our model is ratio-based, so convert cells -> ratio
  // delta at the layout layer using the pane's live cell size and the split's box.
  function applyResize(b: ResizeBinding) {
    const win = activeWindow();
    if (!win) return;
    const orientation = b.dir === "L" || b.dir === "R" ? "h" : "v";
    const splitId = nearestResizableSplit(win.root, win.activePaneId, orientation);
    if (!splitId) return; // no divider in this direction (e.g. -L in a stacked layout)
    const rt = runtimesRef.current.get(win.activePaneId);
    const wrapper = wrapperRef.current;
    const box = nodeBox(win.root, splitId);
    if (!rt || !wrapper || !box) return;
    const horizontal = orientation === "h";
    const cellPx = horizontal
      ? rt.containerEl.clientWidth / rt.term.cols
      : rt.containerEl.clientHeight / rt.term.rows;
    const splitBoxPx = horizontal ? box.w * wrapper.clientWidth : box.h * wrapper.clientHeight;
    if (!(cellPx > 0) || !(splitBoxPx > 0)) return;
    const deltaRatio = (b.cells * cellPx) / splitBoxPx;
    // Move the divider toward the arrow: R/D grow child `a` (ratio up), L/U shrink it.
    adapterRef.current.nudgeSplitRatio(splitId, b.dir === "R" || b.dir === "D" ? deltaRatio : -deltaRatio);
  }

  /** Built-in tmux chord table for unbound prefix keys (key pre-normalized by the router). */
  function handleChord(paneId: string, key: string) {
    if (extRef.current.interceptPrefixKey?.(paneId, key)) return;
    const a = adapterRef.current;
    switch (key) {
      // Split side-by-side / stacked (tmux split-window -h / -v).
      case "|": a.splitPane(paneId, "h"); break;
      case "-": a.splitPane(paneId, "v"); break;
      case "o": a.cyclePane(); break;
      case "x": a.closePane(paneId); break;
      case "c": a.newWindow(); break;
      case "d": a.detachClient(); break;
      case "n": case ".": a.cycleWindow("next"); break;
      case "p": case ",": a.cycleWindow("prev"); break;
      case "r": {
        const win = activeWindow();
        if (win) beginRename(win.id, win.name ?? "");
        break;
      }
      default:
        // Jump to window N (windows stay 1-indexed; panes don't affect this).
        if (key >= "1" && key <= "9" && Number(key) <= (extRef.current.digitWindowMax ?? 9)) {
          a.selectWindowByIndex(Number(key) - 1);
        }
        // Any other unbound prefix key is a no-op (matches real tmux).
        break;
    }
  }

  function handleData(paneId: string, rt: PaneRuntime, data: string) {
    const e = extRef.current;
    if (e.isInputEnabled && !e.isInputEnabled()) return;
    if (e.interceptEarly?.(paneId, rt.term, data)) return;
    // tmux rename-window: the inline prompt consumes keys until Enter/Esc.
    if (handleRenameData(data)) return;
    if (e.interceptAfterRename?.(paneId, rt.term, data)) return;

    const result = router.route(data);
    // In copy mode only the prefix and its chord reach here (see the keydown
    // handler). Nothing may leak to the session; `<prefix> [` is already satisfied.
    if (rt.copyMode.isActive()) {
      if (result.type === "shell" || result.type === "copy-mode") return;
      // These open a status-line prompt that reads keys copy mode would swallow.
      if (result.type === "chord" && (result.key === "r" || result.key === "x")) rt.copyMode.exit();
    }
    switch (result.type) {
      case "consumed":
        return;
      case "shell":
        e.onShellData(paneId, rt.term, result.data);
        return;
      case "copy-mode":
        rt.copyMode.enter();
        return;
      case "focus":
        adapterRef.current.focusDirection(result.dir);
        return;
      case "resize":
        applyResize(result.binding);
        return;
      case "chord":
        handleChord(paneId, result.key);
        return;
    }
  }

  function createPaneRuntime(paneId: string, containerEl: HTMLDivElement): PaneRuntime {
    const termHostEl = document.createElement("div");
    termHostEl.style.position = "absolute";
    termHostEl.style.left = PANE_CHROME.padding;
    termHostEl.style.top = PANE_CHROME.padding;
    termHostEl.style.right = PANE_CHROME.padding;
    // Always leave room for the copy-mode hint strip, so entering copy mode
    // never shrinks the terminal and shifts its contents.
    termHostEl.style.bottom = `calc(${PANE_CHROME.padding} + ${COPY_HINT_HEIGHT}px)`;
    containerEl.appendChild(termHostEl);

    const term = new XTerm(XTERM_OPTIONS);
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termHostEl);

    // Clicking a pane focuses it (and makes it the active pane), so input routes
    // to the right session. Without this the single-focused-pane invariant breaks.
    const onMouseDown = () => {
      if (activeWindow()?.activePaneId !== paneId) adapterRef.current.setActivePane(paneId);
      term.focus();
    };
    containerEl.addEventListener("mousedown", onMouseDown);

    // tmux/vi copy mode (entered via `<prefix> [`) — per pane, since each pane
    // owns its own controller. The engine controller owns cursor/selection;
    // clipboard + app side effects live in the callbacks.
    const copyBadgeEl = document.createElement("div");
    const copyHintEl = document.createElement("div");
    for (const el of [copyBadgeEl, copyHintEl]) {
      el.style.position = "absolute";
      el.style.zIndex = "5";
      el.style.pointerEvents = "none";
      el.style.whiteSpace = "nowrap";
      el.style.fontFamily = XTERM_OPTIONS.fontFamily;
      el.style.fontSize = `${XTERM_OPTIONS.fontSize}px`;
      el.style.lineHeight = `${COPY_HINT_HEIGHT}px`;
      el.style.padding = "0 6px";
      el.style.display = "none";
      containerEl.appendChild(el);
    }
    // tmux's per-pane copy-mode position marker sits top-right.
    copyBadgeEl.style.top = "0";
    copyBadgeEl.style.right = "0";
    copyBadgeEl.style.fontWeight = "bold";
    copyBadgeEl.style.backgroundColor = COPY_MODE_SELECTION_BG;
    copyBadgeEl.style.color = COPY_MODE_SELECTION_FG;
    copyHintEl.style.left = "0";
    copyHintEl.style.right = "0";
    copyHintEl.style.bottom = "0";
    copyHintEl.style.overflow = "hidden";
    copyHintEl.style.textOverflow = "ellipsis";
    copyHintEl.textContent = COPY_MODE_HINT;

    const copyMode = new CopyModeController(term, {
      onChange: (active) => {
        syncCopyOverlay(runtime);
        // Brighten the selection to the gold copy-mode accent so the 1-cell
        // cursor (a native selection) is easy to see; restore the base theme on exit.
        term.options.theme = active
          ? { ...XTERM_THEME, selectionBackground: COPY_MODE_SELECTION_BG, selectionForeground: COPY_MODE_SELECTION_FG }
          : XTERM_THEME;
        if (!runtime.disposed) extRef.current.onCopyModeChange?.(paneId, active);
      },
      onPosition: (pos) => {
        runtime.copyPos = pos;
        syncCopyOverlay(runtime);
      },
      onToggleHelp: () => extRef.current.toggleCopyModeHelp(),
      onYank: (text) => {
        void copyToClipboard(text).then((ok) => extRef.current.onYank?.(text, ok));
      },
    });

    // Intercept raw DOM key events for copy mode, scroll shortcuts, and Ctrl+digit chords.
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      const digitMax = Math.min(extRef.current.digitWindowMax ?? 9, 9);
      if (router.isPrefixArmed() && e.type === "keydown" && e.key >= "1" && e.key <= String(digitMax)) {
        if (e.ctrlKey) {
          // Ctrl held throughout — Ctrl+digit produces no ASCII, so onData won't fire.
          router.disarm();
          handleChord(paneId, e.key);
        }
        // When Ctrl is NOT held, onData will still fire via textarea input.
        return false; // always block xterm's keydown processing for the digit
      }

      // While in copy mode, swallow every key (before scroll shortcuts) so nothing
      // reaches the shell; preventDefault keeps junk out of xterm's hidden textarea.
      // The prefix and the key after it pass through to onData → the router, so
      // window/pane chords work in copy mode (as in real tmux).
      if (copyMode.isActive()) {
        if (router.isPrefixArmed() || keyEventMatchesPrefix(e, prefixCharRef.current)) return true;
        if (e.type === "keydown") {
          e.preventDefault();
          copyMode.handleKeydown(e);
        }
        return false;
      }

      const scrollResult = handleScrollShortcut(e, term);
      if (scrollResult !== null) return scrollResult;

      return extRef.current.customKeydown?.(paneId, e, term) ?? true;
    });

    const runtime: PaneRuntime = {
      term,
      fitAddon,
      containerEl,
      termHostEl,
      copyMode,
      copyBadgeEl,
      copyHintEl,
      copyPos: { offset: 0, history: 0 },
      disposed: false,
      hidden: false,
      onDataDisposable: null as unknown as IDisposable,
      onMouseDown,
      lastW: 0,
      lastH: 0,
    };
    runtime.onDataDisposable = term.onData((data) => handleData(paneId, runtime, data));
    return runtime;
  }

  /** Show/hide + fill a pane's copy-mode badge and hint strip from its live state. */
  function syncCopyOverlay(rt: PaneRuntime) {
    const active = rt.copyMode.isActive();
    const helpHidden = extRef.current.copyModeHelpHidden ?? false;
    const { offset, history } = rt.copyPos;
    rt.copyBadgeEl.textContent = `COPY ${offset}/${history}${helpHidden ? ` · ${COPY_MODE_HINT_HIDDEN}` : ""}`;
    rt.copyBadgeEl.style.display = active ? "block" : "none";
    rt.copyHintEl.style.backgroundColor = themeRef.current.statusBg;
    rt.copyHintEl.style.color = themeRef.current.statusFg;
    rt.copyHintEl.style.display = active && !helpHidden ? "block" : "none";
  }

  function disposeRuntime(paneId: string, rt: PaneRuntime) {
    rt.disposed = true;
    extRef.current.onPaneDisposed?.(paneId);
    if (rt.copyMode.isActive()) rt.copyMode.exit({ refocus: false });
    rt.onDataDisposable.dispose();
    rt.containerEl.removeEventListener("mousedown", rt.onMouseDown);
    rt.term.dispose();
    rt.containerEl.remove();
  }


  // Tear every pane runtime down when the hook itself unmounts. The pane-set
  // effect below only disposes panes that LEFT the tree, so without this the
  // xterm instances, their imperatively-appended DOM nodes and the per-pane
  // mousedown listeners all outlive the component.
  //
  // The teardown must be SYMMETRIC with mount, because React StrictMode (on by
  // default in Next dev) runs mount → cleanup → mount. If it disposed the
  // runtimes but left the "have we booted yet" bookkeeping set, the second
  // mount would recreate every pane as `kind: "restored"` with `firstPane:
  // false` and the app would skip its splash/intro. Clearing both refs makes
  // pass 2 a genuine first mount; the effect above re-runs first and re-seeds
  // knownPaneIds with the same mount-time snapshot it had on pass 1.
  useEffect(() => {
    // Both are useRef containers created once, so capturing them here is the
    // same object the cleanup would read later.
    const runtimes = runtimesRef.current;
    const knownPaneIds = knownPaneIdsRef.current;
    const firstPaneConsumed = firstPaneConsumedRef;
    return () => {
      for (const [id, rt] of runtimes) disposeRuntime(id, rt);
      runtimes.clear();
      knownPaneIds.clear();
      firstPaneConsumed.current = false;
    };
    // disposeRuntime closes over refs only, so the mount-time copy stays valid.
  }, []);

  // Mount/unmount pane instances when the set of panes changes (split/close/window add).
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const currentPaneIds = new Set(windows.flatMap((w) => allLeaves(w.root).map((l) => l.id)));
    const runtimes = runtimesRef.current;

    // Dispose runtimes for removed panes.
    for (const [id, rt] of runtimes) {
      if (!currentPaneIds.has(id)) {
        disposeRuntime(id, rt);
        runtimes.delete(id);
      }
    }

    // Create runtimes for new panes.
    for (const win of windows) {
      for (const leaf of allLeaves(win.root)) {
        if (runtimes.has(leaf.id)) continue;
        const containerEl = document.createElement("div");
        containerEl.style.position = "absolute";
        containerEl.style.overflow = "hidden";
        containerEl.style.left = "0";
        containerEl.style.top = "0";
        containerEl.style.width = "100%";
        containerEl.style.height = "100%";
        wrapper.appendChild(containerEl);

        const runtime = createPaneRuntime(leaf.id, containerEl);
        runtimes.set(leaf.id, runtime);
        try { runtime.fitAddon.fit(); } catch { /* size not ready yet */ }

        const info: PaneCreatedInfo = {
          kind: knownPaneIdsRef.current.has(leaf.id) ? "restored" : "new",
          firstPane: !firstPaneConsumedRef.current,
        };
        const consumed = extRef.current.onPaneCreated?.(leaf.id, runtime, info);
        if (info.firstPane && consumed !== false) firstPaneConsumedRef.current = true;

        knownPaneIdsRef.current.add(leaf.id);
      }
    }
    // createPaneRuntime/disposeRuntime close over refs only, so `windows` is the
    // one reactive input this effect actually depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windows]);

  // Position/show/hide/focus panes whenever the layout or wrapper size changes.
  // Read the wrapper's live size (effects run post-layout, so it's accurate even
  // on first mount); wrapperSize is only a dependency that re-runs this on resize.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const W = wrapper?.clientWidth ?? 0;
    const H = wrapper?.clientHeight ?? 0;
    const win = windows.find((w) => w.id === activeWindowId) ?? windows[0];
    const rects = win && W > 0 && H > 0 ? paneRects(win.root, 0, 0, W, H) : [];
    const rectById = new Map(rects.map((r) => [r.id, r]));
    const activePaneId = win?.activePaneId;
    const multi = rects.length > 1;

    for (const [id, rt] of runtimesRef.current) {
      const r = rectById.get(id);
      if (!r) {
        // Pane belongs to a non-active window — hide it. Never fit a hidden
        // (0x0) container — xterm would mis-size.
        // Copy mode survives (per pane, as in real tmux) until the user leaves it.
        rt.containerEl.style.display = "none";
        rt.hidden = true;
        continue;
      }
      const el = rt.containerEl;
      el.style.display = "block";
      if (rt.hidden) {
        rt.hidden = false;
        // Coming back from display:none, xterm re-syncs its viewport on the next
        // frame and drops the selection, so restore copy mode's scroll + cursor after it.
        if (rt.copyMode.isActive()) requestAnimationFrame(() => rt.copyMode.refresh());
      }
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

      if (rt.lastW !== r.w || rt.lastH !== r.h) {
        rt.lastW = r.w;
        rt.lastH = r.h;
        try { rt.fitAddon.fit(); } catch { /* size not ready yet */ }
        extRef.current.onPaneResized?.(id);
        rt.copyMode.refresh();
      }

      // A copy-mode pane keeps focus too: its keydowns must still reach the controller.
      if (isActivePane) rt.term.focus();
    }
  }, [windows, activeWindowId, wrapperSize]);

  // Re-skin open copy-mode overlays when the help toggle or the status theme changes.
  useEffect(() => {
    for (const rt of runtimesRef.current.values()) syncCopyOverlay(rt);
    // syncCopyOverlay reads refs only; these are the inputs it renders.
  }, [ext.copyModeHelpHidden, tabTheme]);

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

  return {
    wrapperRef,
    wrapperSize,
    prefixActive,
    renamePrompt,
    tabPrefix,
    tabTheme,
    tabBindings,
    getRuntime: (paneId) => runtimesRef.current.get(paneId),
  };
}
