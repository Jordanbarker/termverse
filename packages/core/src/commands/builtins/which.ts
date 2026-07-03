import { CommandHandler, CommandContext } from "@tt/core/commands/types";
import { register, getAvailableCommands } from "../registry";
import { isCommandAvailable } from "../availability";
import { HELP_TEXTS } from "./helpTexts";

export const COMMAND_PATHS: Record<string, string> = {
  chip: "/opt/chip/bin/chip",
  python: "/usr/bin/python3",
  snow: "/usr/local/bin/snow",
  dbt: "/usr/local/bin/dbt",
  nano: "/usr/bin/nano",
  grep: "/usr/bin/grep",
  find: "/usr/bin/find",
  diff: "/usr/bin/diff",
  sort: "/usr/bin/sort",
  uniq: "/usr/bin/uniq",
  wc: "/usr/bin/wc",
  head: "/usr/bin/head",
  tail: "/usr/bin/tail",
  cat: "/usr/bin/cat",
  ls: "/usr/bin/ls",
  cp: "/usr/bin/cp",
  mv: "/usr/bin/mv",
  rm: "/usr/bin/rm",
  mkdir: "/usr/bin/mkdir",
  chmod: "/usr/bin/chmod",
  touch: "/usr/bin/touch",
  echo: "/usr/bin/echo",
  file: "/usr/bin/file",
  pdftotext: "/usr/bin/pdftotext",
  tree: "/usr/bin/tree",
  date: "/usr/bin/date",
  hostname: "/usr/bin/hostname",
  whoami: "/usr/bin/whoami",
  man: "/usr/bin/man",
  printenv: "/usr/bin/printenv",
  env: "/usr/bin/env",
};

/**
 * Resolve a command name to its filesystem path, returning null if unavailable.
 * Shared by `which`, `command -v`, and `type`.
 */
export function resolveCommandPath(name: string, ctx: CommandContext): string | null {
  if (!isCommandAvailable(name, ctx.activeComputer, ctx.storyFlags)) return null;
  if (COMMAND_PATHS[name]) return COMMAND_PATHS[name];
  const commandNames = getAvailableCommands(ctx.activeComputer).map((c) => c.name);
  if (commandNames.includes(name)) return `/usr/bin/${name}`;
  return null;
}

const which: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return { output: "which: missing command argument" };
  }

  const outputs: string[] = [];
  for (const arg of args) {
    const path = resolveCommandPath(arg, ctx);
    outputs.push(path ?? `${arg} not found`);
  }

  const notFound = outputs.some((o) => o.endsWith("not found"));
  return {
    output: outputs.join("\n"),
    exitCode: notFound ? 1 : 0,
  };
};

register("which", which, "Show command path", HELP_TEXTS.which);
