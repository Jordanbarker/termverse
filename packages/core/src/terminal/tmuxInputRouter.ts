/**
 * Pure tmux input state machine: prefix arming/consumption, the `-r` repeat
 * window, and dispatch of `~/.tmux.conf` binds. Framework-free so the whole key
 * pipeline is unit-testable; the React side (useTabManager) maps RouteResults
 * onto store actions. Same pure-core + hook split as renameWindowPrompt.ts /
 * useRenameWindowPrompt.ts.
 */

import type { PaneBinding } from "./tmuxConfig";

export type ResizeBinding = Extract<PaneBinding, { kind: "resize" }>;
export type FocusDir = "L" | "R" | "U" | "D";

export type RouteResult =
  /** Key was absorbed by the state machine (prefix armed). */
  | { type: "consumed" }
  /** Pass to the shell/session (includes the double-prefix literal). */
  | { type: "shell"; data: string }
  /** `<prefix> [` — enter copy mode on the focused pane. Always allowed, matching real tmux. */
  | { type: "copy-mode" }
  | { type: "focus"; dir: FocusDir }
  /** Conf resize bind; when `repeat` the router has already opened the repeat window. */
  | { type: "resize"; binding: ResizeBinding; repeat: boolean }
  /** Unbound prefix key — dispatch to the built-in chord table (normalized: control chars → a-z, lowercased). */
  | { type: "chord"; key: string };

export interface TmuxInputRouterOptions {
  getPrefixChar(): string;
  getBindings(): Record<string, PaneBinding>;
  /**
   * Master gate: is a tmux client attached at all? When false the router is
   * fully inert — the prefix char never arms (it passes through to the shell),
   * copy mode is unreachable, and any armed/repeat state is dropped.
   */
  muxEnabled?(): boolean;
  /** Gate for chords + conf binds. When false, armed-prefix keys (except `[` and the literal) fall through to the shell. */
  chordsEnabled(): boolean;
  /** Fired when the prefix/repeat "armed" indicator should light up or clear. */
  onPrefixStateChange(active: boolean): void;
  /** tmux repeat-time for `-r` binds. */
  repeatMs?: number;
}

export interface TmuxInputRouter {
  route(data: string): RouteResult;
  isPrefixArmed(): boolean;
  /** Drop an armed prefix without consuming a key (Ctrl+digit keydown path). */
  disarm(): void;
  /** Clear prefix + repeat state and cancel the repeat timer (unmount). */
  reset(): void;
}

export const DEFAULT_REPEAT_MS = 500;

const ARROW_DIRS: Record<string, FocusDir> = {
  "\x1b[A": "U",
  "\x1b[B": "D",
  "\x1b[C": "R",
  "\x1b[D": "L",
};

/** Ctrl held throughout a chord emits control chars (Ctrl+X → \x18); map ASCII 1-26 → a-z. */
function normalizeChordKey(key: string): string {
  const code = key.charCodeAt(0);
  return code > 0 && code < 27 ? String.fromCharCode(code + 96) : key.toLowerCase();
}

export function createTmuxInputRouter(opts: TmuxInputRouterOptions): TmuxInputRouter {
  const repeatMs = opts.repeatMs ?? DEFAULT_REPEAT_MS;
  let prefixArmed = false;
  let repeatArmed = false;
  let repeatTimer: ReturnType<typeof setTimeout> | null = null;

  const clearRepeat = () => {
    repeatArmed = false;
    if (repeatTimer != null) {
      clearTimeout(repeatTimer);
      repeatTimer = null;
    }
    opts.onPrefixStateChange(false);
  };

  // Keep the indicator "hot" so the repeat window is visible.
  const armRepeat = () => {
    repeatArmed = true;
    opts.onPrefixStateChange(true);
    if (repeatTimer != null) clearTimeout(repeatTimer);
    repeatTimer = setTimeout(() => {
      repeatArmed = false;
      repeatTimer = null;
      opts.onPrefixStateChange(false);
    }, repeatMs);
  };

  const disarm = () => {
    prefixArmed = false;
    opts.onPrefixStateChange(false);
  };

  const route = (data: string): RouteResult => {
    // Detached (bare shell): the multiplexer does not exist. Drop any armed
    // or repeat state and pass every key — including the prefix char — through.
    if (opts.muxEnabled && !opts.muxEnabled()) {
      if (prefixArmed) disarm();
      if (repeatArmed || repeatTimer != null) clearRepeat();
      return { type: "shell", data };
    }

    // tmux `-r` repeat: while the window is open, a repeatable resize key
    // re-fires (and re-arms) without the prefix. Any other key ends repeat
    // mode and is processed normally below.
    if (repeatArmed) {
      const b = opts.getBindings()[data];
      if (b && b.kind === "resize" && b.repeat) {
        armRepeat();
        return { type: "resize", binding: b, repeat: true };
      }
      clearRepeat();
    }

    // Prefix mode — consume the next key as a tab/pane action.
    if (prefixArmed) {
      disarm();

      // prefix, prefix — send the literal prefix char to the session.
      if (data === opts.getPrefixChar()) return { type: "shell", data };
      if (data === "[") return { type: "copy-mode" };
      // Locked (e.g. pre-unlock story gate) and not a copy-mode entry — pass through.
      if (!opts.chordsEnabled()) return { type: "shell", data };

      // Vim-style binds from ~/.tmux.conf (case-sensitive: `h` nav vs `H` resize).
      const binding = opts.getBindings()[data];
      if (binding) {
        if (binding.kind === "focus") return { type: "focus", dir: binding.dir };
        if (binding.repeat) armRepeat();
        return { type: "resize", binding, repeat: binding.repeat };
      }

      // Directional pane focus (prefix + arrow). Arrows arrive as CSI sequences.
      const arrowDir = ARROW_DIRS[data];
      if (arrowDir) return { type: "focus", dir: arrowDir };

      return { type: "chord", key: normalizeChordKey(data[0] ?? "") };
    }

    if (data === opts.getPrefixChar()) {
      prefixArmed = true;
      opts.onPrefixStateChange(true);
      return { type: "consumed" };
    }

    return { type: "shell", data };
  };

  return {
    route,
    isPrefixArmed: () => prefixArmed,
    disarm,
    reset: () => {
      prefixArmed = false;
      clearRepeat();
    },
  };
}
