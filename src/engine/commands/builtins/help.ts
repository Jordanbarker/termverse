import { CommandHandler } from "../types";
import { register, getAvailableCommands } from "../registry";
import { colorize, ansi } from "../../../lib/ansi";

const META_COMMANDS = new Set(["save", "load", "newgame"]);
const HIDDEN_COMMANDS = new Set(["help"]);

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
    `    ${colorize("Ctrl+C".padEnd(PAD), ansi.green)}Cancel input`,
    `    ${colorize("Ctrl+W".padEnd(PAD), ansi.green)}Delete word`,
    "",
    colorize("  Scrollback:", ansi.dim),
    `    ${colorize("Shift+PgUp/Down".padEnd(PAD), ansi.green)}Scroll by page`,
    `    ${colorize("(Fn+Shift+Up/Down)", ansi.dim)}`,
    `    ${colorize("Cmd+Home/End".padEnd(PAD), ansi.green)}Scroll to top/bottom`,
    `    ${colorize("(Fn+Cmd+Left/Right)", ansi.dim)}`,
  );

  if (ctx.storyFlags?.tabs_unlocked) {
    lines.push(
      "",
      colorize("  Terminal tabs:", ansi.dim),
      `    ${colorize("Ctrl+B, C".padEnd(PAD), ansi.green)}New tab`,
      `    ${colorize("Ctrl+B, X".padEnd(PAD), ansi.green)}Close tab`,
      `    ${colorize("Ctrl+B, N/P".padEnd(PAD), ansi.green)}Next/prev tab`,
      `    ${colorize("Ctrl+B, 1-5".padEnd(PAD), ansi.green)}Jump to tab`,
    );
  }

  lines.push(
    "",
    `Some commands have their own shortcuts. Use ${colorize("man <command>", ansi.green)} for details.`,
  );

  return { output: lines.join("\n") };
};

register("help", help, "Show available commands");
