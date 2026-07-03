import { CommandHandler } from "@tt/core/commands/types";
import { register, getAvailableCommands } from "../registry";
import { colorize, ansi } from "@tt/core/lib/ansi";

const META_COMMANDS = new Set(["save", "load", "newgame", "cheat"]);

/**
 * Mark app-registered builtins as game-control "meta" commands: help lists them
 * after the in-world commands, in cyan. Core pre-seeds termoil's save-system set;
 * other apps add theirs at registration time (e.g. term-crunch's challenge nav).
 */
export function registerMetaCommands(...names: string[]): void {
  for (const n of names) META_COMMANDS.add(n);
}
const HIDDEN_COMMANDS = new Set(["help", "true", "false"]);

const help: CommandHandler = (_args, _flags, ctx) => {
  const commands = getAvailableCommands(ctx.activeComputer, ctx.storyFlags);
  const gameCommands = commands
    .filter(
      (c) =>
        !META_COMMANDS.has(c.name) &&
        !HIDDEN_COMMANDS.has(c.name) &&
        !(c.name === "shutdown" && ctx.storyFlags?.day1_shutdown)
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const metaCommands = commands.filter((c) => META_COMMANDS.has(c.name));
  const formatName = (cmd: { name: string; aliases?: string[] }) =>
    cmd.aliases?.length ? `${cmd.name} (${cmd.aliases.join(", ")})` : cmd.name;
  const maxLen = Math.max(...commands.map((c) => formatName(c).length));

  const lines = [
    colorize("Available commands:", ansi.bold, ansi.yellow),
    "",
    ...gameCommands.map(
      (cmd) =>
        `  ${colorize(formatName(cmd).padEnd(maxLen + 2), ansi.green)}${cmd.description}`
    ),
    ...metaCommands.map(
      (cmd) =>
        `  ${colorize(formatName(cmd).padEnd(maxLen + 2), ansi.cyan)}${cmd.description}`
    ),
  ];

  const PAD = 21;
  const prefixLabel = ctx.tabPrefixLabel ?? "Ctrl+Space";
  lines.push(
    "",
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
  );

  if (ctx.storyFlags?.tabs_unlocked) {
    const prefix = prefixLabel;
    lines.push(
      "",
      colorize("  Terminal tabs:", ansi.dim),
      `    ${colorize(`${prefix}, C`.padEnd(PAD), ansi.green)}New tab`,
      `    ${colorize(`${prefix}, X`.padEnd(PAD), ansi.green)}Close tab`,
      `    ${colorize(`${prefix}, N/P`.padEnd(PAD), ansi.green)}Next/prev tab`,
      `    ${colorize(`${prefix}, 1-5`.padEnd(PAD), ansi.green)}Jump to tab`,
      `    ${colorize("Change the prefix in ~/.tmux.conf on your home PC.", ansi.dim)}`,
    );
  }

  lines.push(
    "",
    `Some commands have their own shortcuts. Use ${colorize("man <command>", ansi.green)} for details.`,
  );

  return { output: lines.join("\n") };
};

register("help", help, "Show available commands");
