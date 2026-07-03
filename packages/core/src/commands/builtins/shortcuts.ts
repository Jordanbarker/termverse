import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { colorize, ansi } from "@tt/core/lib/ansi";

const shortcuts: CommandHandler = (_args, _flags, ctx) => {
  const PAD = 21;
  const prefixLabel = ctx.tabPrefixLabel ?? "Ctrl+Space";
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
    `    ${colorize(`${prefixLabel}, [`.padEnd(PAD), ansi.green)}Copy mode`,
  ];

  if (ctx.storyFlags?.tabs_unlocked) {
    lines.push(
      "",
      colorize("  Terminal tabs:", ansi.dim),
      `    ${colorize(`${prefixLabel}, C`.padEnd(PAD), ansi.green)}New tab`,
      `    ${colorize(`${prefixLabel}, X`.padEnd(PAD), ansi.green)}Close tab`,
      `    ${colorize(`${prefixLabel}, N/P`.padEnd(PAD), ansi.green)}Next/prev tab`,
      `    ${colorize(`${prefixLabel}, 1-5`.padEnd(PAD), ansi.green)}Jump to tab`,
      `    ${colorize("Change the prefix in ~/.tmux.conf on your home PC.", ansi.dim)}`,
    );
  }

  lines.push(
    "",
    `Some commands have their own shortcuts. Use ${colorize("man <command>", ansi.green)} for details.`,
  );

  return { output: lines.join("\n") };
};

register("shortcuts", shortcuts, "Show keyboard shortcuts");
