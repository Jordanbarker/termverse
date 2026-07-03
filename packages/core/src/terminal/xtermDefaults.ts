/**
 * Shared xterm construction defaults for the tmux pane renderers. Both games'
 * TabManagers build their panes from the same theme/options so copy mode's
 * theme swap (which restores XTERM_THEME by identity) stays consistent.
 */

import type { Terminal as XTerm } from "@xterm/xterm";
import { ANSI_COLORS } from "./ansiPalette";

export const XTERM_THEME = {
  background: "#0a0e14",
  foreground: "#b3b1ad",
  cursor: "#e6b450",
  cursorAccent: "#0a0e14",
  selectionBackground: "#253340",
  // 16 named ANSI colors shared with the tmux color parser (ansiPalette.ts)
  ...ANSI_COLORS,
};

export const XTERM_OPTIONS = {
  theme: XTERM_THEME,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontSize: 14,
  lineHeight: 1.2,
  cursorBlink: false,
  cursorStyle: "block" as const,
  allowProposedApi: true,
};

/** Handle macOS-style scroll shortcuts. Returns false to block xterm, true to pass through, null when unhandled. */
export function handleScrollShortcut(e: KeyboardEvent, term: XTerm): boolean | null {
  if (e.type !== "keydown") return null;

  const { key, metaKey, altKey, shiftKey } = e;

  // Shift+PageUp/Down — scroll by page (universal terminal convention)
  if (shiftKey && !metaKey && !altKey) {
    if (key === "PageUp") { e.preventDefault(); term.scrollPages(-1); return false; }
    if (key === "PageDown") { e.preventDefault(); term.scrollPages(1); return false; }
  }

  // Cmd+Opt+PageUp/Down — scroll by line
  if (metaKey && altKey) {
    if (key === "PageUp") { e.preventDefault(); term.scrollLines(-1); return false; }
    if (key === "PageDown") { e.preventDefault(); term.scrollLines(1); return false; }
  }

  // Cmd+PageUp/Down — scroll by page
  if (metaKey && !altKey) {
    if (key === "PageUp") { e.preventDefault(); term.scrollPages(-1); return false; }
    if (key === "PageDown") { e.preventDefault(); term.scrollPages(1); return false; }
    if (key === "Home") { e.preventDefault(); term.scrollToTop(); return false; }
    if (key === "End") { e.preventDefault(); term.scrollToBottom(); return false; }
  }

  return null;
}
