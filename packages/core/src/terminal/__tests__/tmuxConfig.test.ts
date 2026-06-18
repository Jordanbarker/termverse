import { describe, it, expect } from "vitest";
import {
  parseTmuxPrefix,
  keyTokenToControlChar,
  DEFAULT_TAB_PREFIX,
  parseTmuxTheme,
  resolveTmuxColor,
  DEFAULT_TAB_BAR_THEME,
  parseTmuxBindings,
  DEFAULT_RESIZE_CELLS,
} from "../tmuxConfig";
import { ANSI_COLORS } from "../ansiPalette";

const DEFAULT_CONF = `# ~/.tmux.conf
# Prefix key for terminal tabs.
set -g prefix C-Space
`;

describe("keyTokenToControlChar", () => {
  it("maps C-Space to NUL", () => {
    expect(keyTokenToControlChar("C-Space")).toBe("\x00");
    expect(keyTokenToControlChar("c-space")).toBe("\x00");
  });

  it("maps C-<letter> to its control char", () => {
    expect(keyTokenToControlChar("C-a")).toBe("\x01");
    expect(keyTokenToControlChar("C-b")).toBe("\x02");
    expect(keyTokenToControlChar("C-B")).toBe("\x02");
  });

  it("returns null for unsupported tokens", () => {
    expect(keyTokenToControlChar("M-a")).toBeNull();
    expect(keyTokenToControlChar("F1")).toBeNull();
    expect(keyTokenToControlChar("C-1")).toBeNull();
  });
});

describe("parseTmuxPrefix", () => {
  it("parses the default config as Ctrl+Space", () => {
    expect(parseTmuxPrefix(DEFAULT_CONF)).toEqual({ char: "\x00", label: "Ctrl+Space" });
  });

  it("parses C-b", () => {
    expect(parseTmuxPrefix("set -g prefix C-b")).toEqual({ char: "\x02", label: "Ctrl+B" });
  });

  it("parses set-option without -g", () => {
    expect(parseTmuxPrefix("set-option prefix C-a")).toEqual({ char: "\x01", label: "Ctrl+A" });
  });

  it("ignores comments and blank lines", () => {
    const conf = `# set -g prefix C-z\n\n  # another comment\nset -g prefix C-a\n`;
    expect(parseTmuxPrefix(conf)).toEqual({ char: "\x01", label: "Ctrl+A" });
  });

  it("uses the last valid prefix line when several are present", () => {
    const conf = `set -g prefix C-a\nset -g prefix C-b\n`;
    expect(parseTmuxPrefix(conf)).toEqual({ char: "\x02", label: "Ctrl+B" });
  });

  it("falls back to default for missing/empty/unparseable input", () => {
    expect(parseTmuxPrefix(undefined)).toEqual(DEFAULT_TAB_PREFIX);
    expect(parseTmuxPrefix("")).toEqual(DEFAULT_TAB_PREFIX);
    expect(parseTmuxPrefix("set -g prefix C-1")).toEqual(DEFAULT_TAB_PREFIX);
    expect(parseTmuxPrefix("# nothing here")).toEqual(DEFAULT_TAB_PREFIX);
  });

  it("strips an inline comment after the key", () => {
    expect(parseTmuxPrefix("set -g prefix C-a  # screen-style")).toEqual({
      char: "\x01",
      label: "Ctrl+A",
    });
  });
});

describe("resolveTmuxColor", () => {
  it("resolves named ANSI colors (case-insensitive)", () => {
    expect(resolveTmuxColor("green")).toBe(ANSI_COLORS.green);
    expect(resolveTmuxColor("YELLOW")).toBe(ANSI_COLORS.yellow);
    expect(resolveTmuxColor("brightblue")).toBe(ANSI_COLORS.brightBlue);
  });

  it("passes through hex colors (lowercased)", () => {
    expect(resolveTmuxColor("#91b362")).toBe("#91b362");
    expect(resolveTmuxColor("#ABC")).toBe("#abc");
  });

  it("maps `default` to transparent", () => {
    expect(resolveTmuxColor("default")).toBe("transparent");
  });

  it("returns null for unresolvable tokens", () => {
    expect(resolveTmuxColor("notacolor")).toBeNull();
    expect(resolveTmuxColor("#xyz")).toBeNull();
    expect(resolveTmuxColor("")).toBeNull();
  });
});

describe("parseTmuxTheme", () => {
  it("returns the default theme for missing/empty/color-less input", () => {
    expect(parseTmuxTheme(undefined)).toEqual(DEFAULT_TAB_BAR_THEME);
    expect(parseTmuxTheme("")).toEqual(DEFAULT_TAB_BAR_THEME);
    expect(parseTmuxTheme("set -g prefix C-b")).toEqual(DEFAULT_TAB_BAR_THEME);
  });

  it("parses the modern combined `*-style` form", () => {
    const theme = parseTmuxTheme(`set -g status-style "bg=green,fg=black"`);
    expect(theme.statusBg).toBe(ANSI_COLORS.green);
    expect(theme.statusFg).toBe(ANSI_COLORS.black);
    // untouched fields keep their defaults
    expect(theme.currentBg).toBe(DEFAULT_TAB_BAR_THEME.currentBg);
  });

  it("maps each style option to its element", () => {
    const conf = [
      `set -g status-style "bg=#111111,fg=#222222"`,
      `set -g window-status-current-style "bg=yellow,fg=black"`,
      `set -g window-status-style "fg=white"`,
      `set -g status-left-style "bg=blue,fg=#fefefe"`,
    ].join("\n");
    const theme = parseTmuxTheme(conf);
    expect(theme).toEqual({
      statusBg: "#111111",
      statusFg: "#222222",
      currentBg: ANSI_COLORS.yellow,
      currentFg: ANSI_COLORS.black,
      windowBg: DEFAULT_TAB_BAR_THEME.windowBg, // not set -> default (transparent)
      windowFg: ANSI_COLORS.white,
      leftBg: ANSI_COLORS.blue,
      leftFg: "#fefefe",
    });
  });

  it("supports the legacy split bg/fg options", () => {
    const conf = `set -g status-bg green\nset -g status-fg black`;
    const theme = parseTmuxTheme(conf);
    expect(theme.statusBg).toBe(ANSI_COLORS.green);
    expect(theme.statusFg).toBe(ANSI_COLORS.black);
  });

  it("ignores attrs like bold/dim and strips quotes", () => {
    const theme = parseTmuxTheme(`set -g status-style 'bg=cyan,bold,fg=black'`);
    expect(theme.statusBg).toBe(ANSI_COLORS.cyan);
    expect(theme.statusFg).toBe(ANSI_COLORS.black);
  });

  it("keeps the per-field default when a color is unresolvable", () => {
    const theme = parseTmuxTheme(`set -g status-style "bg=notacolor,fg=green"`);
    expect(theme.statusBg).toBe(DEFAULT_TAB_BAR_THEME.statusBg);
    expect(theme.statusFg).toBe(ANSI_COLORS.green);
  });

  it("uses the last valid value when several are present", () => {
    const theme = parseTmuxTheme(`set -g status-style "bg=red"\nset -g status-style "bg=blue"`);
    expect(theme.statusBg).toBe(ANSI_COLORS.blue);
  });

  it("ignores commented-out color directives", () => {
    expect(parseTmuxTheme(`# set -g status-style "bg=red"`)).toEqual(DEFAULT_TAB_BAR_THEME);
  });

  it("strips inline comments after the value", () => {
    const theme = parseTmuxTheme(`set -g status-style "bg=black,fg=green"  # the bar`);
    expect(theme.statusBg).toBe(ANSI_COLORS.black);
    expect(theme.statusFg).toBe(ANSI_COLORS.green);
  });

  it("applies a single-color value followed by an inline comment", () => {
    const theme = parseTmuxTheme(`set -g window-status-style "fg=green"  # other tabs`);
    expect(theme.windowFg).toBe(ANSI_COLORS.green);
  });

  it("preserves quoted hex when an inline comment follows", () => {
    const theme = parseTmuxTheme(`set -g status-style "bg=#0a0e14,fg=green" # bar`);
    expect(theme.statusBg).toBe("#0a0e14");
    expect(theme.statusFg).toBe(ANSI_COLORS.green);
  });
});

describe("parseTmuxBindings", () => {
  it("returns empty for missing/binding-less config", () => {
    expect(parseTmuxBindings(undefined)).toEqual({});
    expect(parseTmuxBindings(DEFAULT_CONF)).toEqual({});
  });

  it("parses vim-style select-pane focus binds", () => {
    const b = parseTmuxBindings(`bind h select-pane -L
bind j select-pane -D
bind k select-pane -U
bind l select-pane -R`);
    expect(b.h).toEqual({ kind: "focus", dir: "L" });
    expect(b.j).toEqual({ kind: "focus", dir: "D" });
    expect(b.k).toEqual({ kind: "focus", dir: "U" });
    expect(b.l).toEqual({ kind: "focus", dir: "R" });
  });

  it("parses resize-pane with an explicit cell amount", () => {
    expect(parseTmuxBindings(`bind H resize-pane -L 5`).H).toEqual({
      kind: "resize",
      dir: "L",
      cells: 5,
      repeat: false,
    });
  });

  it("marks -r binds as repeatable", () => {
    const b = parseTmuxBindings(`bind -r H resize-pane -L 5`);
    expect(b.H).toEqual({ kind: "resize", dir: "L", cells: 5, repeat: true });
  });

  it("falls back to the default cell amount when omitted", () => {
    expect(parseTmuxBindings(`bind -r J resize-pane -D`).J).toEqual({
      kind: "resize",
      dir: "D",
      cells: DEFAULT_RESIZE_CELLS,
      repeat: true,
    });
  });

  it("accepts the bind-key alias and strips inline comments", () => {
    const b = parseTmuxBindings(`bind-key l select-pane -R  # move right`);
    expect(b.l).toEqual({ kind: "focus", dir: "R" });
  });

  it("ignores unknown commands, multi-char keys, and comments", () => {
    const b = parseTmuxBindings(`# a comment
bind C new-window
bind Left select-pane -L
bind r source-file ~/.tmux.conf
bind x kill-pane`);
    expect(b).toEqual({});
  });

  it("lets a later bind override an earlier one for the same key", () => {
    const b = parseTmuxBindings(`bind h select-pane -L
bind h select-pane -R`);
    expect(b.h).toEqual({ kind: "focus", dir: "R" });
  });
});
