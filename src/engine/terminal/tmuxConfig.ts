/**
 * Parse the terminal-tab prefix key and status-bar colors from a tmux-style
 * `~/.tmux.conf`.
 *
 * The in-game tab multiplexer reads `set -g prefix <key>` from the home PC's
 * `~/.tmux.conf`, mirroring how a real local tmux is configured. Supported keys
 * are `C-Space` and `C-<a-z>`; anything else falls back to the default.
 *
 * The status bar's colors are likewise read from `status-style`,
 * `window-status-current-style`, `window-status-style`, and `status-left-style`
 * (plus the legacy split `*-bg`/`*-fg` forms). Color values may be named
 * (resolved against the terminal's ANSI palette) or raw hex.
 */

import { ANSI_COLORS } from "./ansiPalette";

export interface TabPrefix {
  /** Control character emitted by the prefix chord (compared against xterm onData). */
  char: string;
  /** Human-readable label, e.g. "Ctrl+Space" or "Ctrl+B". */
  label: string;
}

/** Default prefix when `~/.tmux.conf` is missing or has no valid `prefix` directive. */
export const DEFAULT_TAB_PREFIX: TabPrefix = { char: "\x00", label: "Ctrl+Space" };

/**
 * Map a tmux key token (e.g. "C-b", "C-Space") to its control character.
 * Returns null for unsupported tokens.
 */
export function keyTokenToControlChar(token: string): string | null {
  const match = token.match(/^C-(Space|[A-Za-z])$/i);
  if (!match) return null;
  const key = match[1];
  if (/^space$/i.test(key)) return "\x00";
  return String.fromCharCode(key.toLowerCase().charCodeAt(0) - 96);
}

function labelForToken(token: string): string {
  if (/^space$/i.test(token)) return "Ctrl+Space";
  return `Ctrl+${token.toUpperCase()}`;
}

/**
 * Strip a trailing `# comment`, tmux-style: `#` begins a comment only at a token
 * boundary (line start or after whitespace) and outside quotes, so quoted/inline
 * hex like `"bg=#0a0e14"` or `bg=#0a0e14` is preserved.
 */
function stripInlineComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Parse the active tab prefix from `~/.tmux.conf` contents. The last valid
 * `set`/`set-option [-g] prefix <key>` line wins. Comment lines are ignored.
 */
export function parseTmuxPrefix(conf: string | undefined): TabPrefix {
  if (!conf) return DEFAULT_TAB_PREFIX;

  let result = DEFAULT_TAB_PREFIX;
  for (const rawLine of conf.split("\n")) {
    const line = stripInlineComment(rawLine).trim();
    if (!line || line.startsWith("#")) continue;

    // set | set-option, optional -g / -g flags, then `prefix <key>`
    const match = line.match(/^set(?:-option)?\s+(?:-\w+\s+)*prefix\s+(\S+)/i);
    if (!match) continue;

    const token = match[1];
    const char = keyTokenToControlChar(token);
    if (char === null) continue;

    // strip the "C-" so labelForToken sees just the key portion
    result = { char, label: labelForToken(token.replace(/^C-/i, "")) };
  }
  return result;
}

/** Colors for the tmux-style tab bar, resolved from `~/.tmux.conf`. */
export interface TabBarTheme {
  /** `status-style` background — the bar itself. */
  statusBg: string;
  /** `status-style` foreground — right-hint and `+` button text. */
  statusFg: string;
  /** `window-status-current-style` background — the active tab + prefix-pending highlight. */
  currentBg: string;
  /** `window-status-current-style` foreground. */
  currentFg: string;
  /** `window-status-style` background — inactive tabs ("transparent" inherits the bar). */
  windowBg: string;
  /** `window-status-style` foreground — inactive tabs. */
  windowFg: string;
  /** `status-left-style` background — the `[session]` block when idle. */
  leftBg: string;
  /** `status-left-style` foreground — the `[session]` block when idle. */
  leftFg: string;
}

/** Default bar colors when `~/.tmux.conf` sets none (matches the hardcoded look). */
export const DEFAULT_TAB_BAR_THEME: TabBarTheme = {
  statusBg: "#91b362",
  statusFg: "#0a0e14",
  currentBg: "#e6b450",
  currentFg: "#0a0e14",
  windowBg: "transparent",
  windowFg: "#0a0e14",
  leftBg: "#253340",
  leftFg: "#c9d1d9",
};

const NAMED_COLORS: Record<string, string> = {};
for (const [name, hex] of Object.entries(ANSI_COLORS)) {
  // accept both "brightBlack" spelling and the lowercase "brightblack" form
  NAMED_COLORS[name.toLowerCase()] = hex;
}

/**
 * Resolve a tmux color token to a CSS hex (or "transparent"). Accepts `#rgb` /
 * `#rrggbb` hex, named ANSI colors, and `default`. Returns null otherwise so the
 * caller can keep the field's existing default.
 */
export function resolveTmuxColor(token: string): string | null {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  if (t === "default") return "transparent";
  if (/^#[0-9a-f]{3}$/.test(t) || /^#[0-9a-f]{6}$/.test(t)) return t;
  return NAMED_COLORS[t] ?? null;
}

/** Parse a style spec like `bg=green,fg=black,bold` into its bg/fg colors. */
function parseStyleSpec(spec: string): { bg?: string; fg?: string } {
  const cleaned = spec.trim().replace(/^["']|["']$/g, "");
  const out: { bg?: string; fg?: string } = {};
  for (const part of cleaned.split(",")) {
    const m = part.trim().match(/^(bg|fg)=(.+)$/i);
    if (!m) continue; // ignore attrs like `bold`, `dim`, `none`
    const color = resolveTmuxColor(m[2]);
    if (color === null) continue;
    if (m[1].toLowerCase() === "bg") out.bg = color;
    else out.fg = color;
  }
  return out;
}

// Each entry maps a tmux option to the theme fields it drives. `style` is the
// modern combined form (`*-style "bg=..,fg=.."`); `bg`/`fg` are the legacy split
// options. `bgField`/`fgField` are the TabBarTheme keys to write.
const STYLE_RULES: Array<{
  style: string;
  bg: string;
  fg: string;
  bgField: keyof TabBarTheme;
  fgField: keyof TabBarTheme;
}> = [
  { style: "status-style", bg: "status-bg", fg: "status-fg", bgField: "statusBg", fgField: "statusFg" },
  { style: "window-status-current-style", bg: "window-status-current-bg", fg: "window-status-current-fg", bgField: "currentBg", fgField: "currentFg" },
  { style: "window-status-style", bg: "window-status-bg", fg: "window-status-fg", bgField: "windowBg", fgField: "windowFg" },
  { style: "status-left-style", bg: "status-left-bg", fg: "status-left-fg", bgField: "leftBg", fgField: "leftFg" },
];

/**
 * Parse the tab-bar colors from `~/.tmux.conf` contents. Like {@link parseTmuxPrefix},
 * later lines win and comment/blank lines are ignored. Any field whose directive
 * is absent or unresolvable keeps its {@link DEFAULT_TAB_BAR_THEME} value.
 */
export function parseTmuxTheme(conf: string | undefined): TabBarTheme {
  const theme: TabBarTheme = { ...DEFAULT_TAB_BAR_THEME };
  if (!conf) return theme;

  for (const rawLine of conf.split("\n")) {
    const line = stripInlineComment(rawLine).trim();
    if (!line || line.startsWith("#")) continue;

    // set | set-option, optional flags, then `<option> <value...>`
    const match = line.match(/^set(?:-option)?\s+(?:-\w+\s+)*([\w-]+)\s+(.+)$/i);
    if (!match) continue;
    const option = match[1].toLowerCase();
    const value = match[2].trim();

    for (const rule of STYLE_RULES) {
      if (option === rule.style) {
        const { bg, fg } = parseStyleSpec(value);
        if (bg !== undefined) theme[rule.bgField] = bg;
        if (fg !== undefined) theme[rule.fgField] = fg;
      } else if (option === rule.bg) {
        const c = resolveTmuxColor(value.replace(/^["']|["']$/g, ""));
        if (c !== null) theme[rule.bgField] = c;
      } else if (option === rule.fg) {
        const c = resolveTmuxColor(value.replace(/^["']|["']$/g, ""));
        if (c !== null) theme[rule.fgField] = c;
      }
    }
  }
  return theme;
}
