import { CommandHandler } from "@tt/core/commands/types";
import { register, getAvailableCommands } from "../registry";
import { colorize, ansi } from "@tt/core/lib/ansi";

const META_COMMANDS = new Set(["save", "load", "newgame", "cheat", "shortcuts"]);

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
    "",
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
    "",
  ];

  return { output: lines.join("\n") };
};

register("help", help, "Show available commands");
