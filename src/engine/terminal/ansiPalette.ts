/**
 * The terminal's 16 named ANSI colors (Ayu-ish theme). Single source of truth
 * shared by xterm's theme (`XTERM_THEME` in TabManager) and the `~/.tmux.conf`
 * color parser (`resolveTmuxColor` in tmuxConfig), so named colors used in the
 * tmux status bar (`bg=green`, `fg=black`, ...) match the terminal palette and
 * the two never drift apart.
 */
export const ANSI_COLORS = {
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
} as const;
