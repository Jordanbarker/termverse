import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { colorize, ansi } from "@tt/core/lib/ansi";
import { HELP_TEXTS } from "./helpTexts";

const shortcuts: CommandHandler = (_args, _flags, ctx) => {
  const PAD = 21;
  const prefixLabel = ctx.tabPrefixLabel ?? "Ctrl+Space";
  // The mux (chords, copy mode, status bar) only exists while a tmux client is
  // attached; apps without a session lifecycle (no ctx.tmux) count as attached.
  const attached = ctx.tmux ? ctx.tmux.attachedSession !== null : true;
  // Apps without story flags (term-crunch) always count as unlocked.
  const tabsUnlocked = ctx.storyFlags ? !!ctx.storyFlags.tabs_unlocked : true;
  const lines = [
    colorize("Keyboard shortcuts:", ansi.bold, ansi.yellow),
    "",
    colorize("  Command line:", ansi.dim),
    `    ${colorize("Tab".padEnd(PAD), ansi.green)}Autocomplete`,
    `    ${colorize("Up/Down".padEnd(PAD), ansi.green)}Command history`,
    `    ${colorize("Left/Right".padEnd(PAD), ansi.green)}Move cursor`,
    `    ${colorize("Ctrl+Left/Right".padEnd(PAD), ansi.green)}Jump word`,
    `    ${colorize("Home/End".padEnd(PAD), ansi.green)}Start/end of line`,
    `    ${colorize("Ctrl+A / Ctrl+E".padEnd(PAD), ansi.green)}Start/end of line`,
    `    ${colorize("Ctrl+C".padEnd(PAD), ansi.green)}Cancel input`,
    `    ${colorize("Ctrl+Backspace".padEnd(PAD), ansi.green)}Delete word`,
    `    ${colorize("(Ctrl+W on Mac)", ansi.dim)}`,
    `    ${colorize("Ctrl+U / Ctrl+K".padEnd(PAD), ansi.green)}Kill line / kill to end`,
    `    ${colorize("Ctrl+L".padEnd(PAD), ansi.green)}Clear screen`,
    `    ${colorize("Ctrl+D".padEnd(PAD), ansi.green)}Delete char (exit on empty line)`,
    "",
    colorize("  Scrollback:", ansi.dim),
    `    ${colorize("Shift+PgUp/Down".padEnd(PAD), ansi.green)}Scroll by page`,
    `    ${colorize("(Fn+Shift+Up/Down)", ansi.dim)}`,
    `    ${colorize("Cmd+Home/End".padEnd(PAD), ansi.green)}Scroll to top/bottom`,
    `    ${colorize("(Fn+Cmd+Left/Right)", ansi.dim)}`,
  ];

  // Copy mode is part of the mux (needs a client) but is reachable even while
  // the tab chords are still story-locked.
  if (attached) {
    lines.push(`    ${colorize(`${prefixLabel}, [`.padEnd(PAD), ansi.green)}Copy mode`);
  }

  if (attached && tabsUnlocked) {
    lines.push(
      "",
      colorize("  Terminal tabs (tmux):", ansi.dim),
      `    ${colorize(`${prefixLabel}, C`.padEnd(PAD), ansi.green)}New tab`,
      `    ${colorize(`${prefixLabel}, X`.padEnd(PAD), ansi.green)}Close tab`,
      `    ${colorize(`${prefixLabel}, N/P`.padEnd(PAD), ansi.green)}Next/prev tab`,
      `    ${colorize(`${prefixLabel}, 1-5`.padEnd(PAD), ansi.green)}Jump to tab`,
      `    ${colorize(`${prefixLabel}, D`.padEnd(PAD), ansi.green)}Detach session`,
      `    ${colorize("Change the prefix in ~/.tmux.conf on your home PC.", ansi.dim)}`,
      `    ${colorize("Manage sessions with tmux ls / attach / kill-session.", ansi.dim)}`,
    );
  } else if (ctx.tmux && !attached) {
    lines.push(
      "",
      colorize("  tmux:", ansi.dim),
      `    ${colorize("tmux".padEnd(PAD), ansi.green)}Start a new session`,
    );
    if (ctx.tmux.sessions.length > 0) {
      lines.push(
        `    ${colorize("tmux attach".padEnd(PAD), ansi.green)}Reattach to your detached session`,
        `    ${colorize("tmux ls".padEnd(PAD), ansi.green)}List sessions`,
      );
    }
  }

  lines.push(
    "",
    `Some commands have their own shortcuts. Use ${colorize("man <command>", ansi.green)} for details.`,
  );

  return { output: lines.join("\n") };
};

register("shortcuts", shortcuts, "Show keyboard shortcuts", HELP_TEXTS.shortcuts);
