import { CommandHandler, AsyncCommandHandler, CommandResult, CommandContext } from "./types";
import { isCommandAvailable, DEVCONTAINER_ONLY } from "./availability";
import { ComputerId, StoryFlags } from "../../state/types";
import { resolvePath } from "../../lib/pathUtils";
import { colorize, ansi } from "../../lib/ansi";
import { getKnownFlags, shouldValidateFlags, rejectUnknownFlags } from "./flagValidation";

/** Check if a command string looks like a path (starts with ./ or /). */
function isPathCommand(name: string): boolean {
  return name.startsWith("./") || name.startsWith("/");
}

const NEXACORP_GATE_HINTS: Record<string, string> = {
  coder: "Read your email and check with Auri/Oscar to get set up.",
  piper: "Read your welcome email; it has instructions for getting started.",
};

const commands = new Map<string, { handler: CommandHandler; description: string; helpText?: string; readsFiles?: boolean }>();
const asyncCommands = new Map<string, { handler: AsyncCommandHandler; description: string; helpText?: string; readsFiles?: boolean }>();

/** Maps alias → primary command name (e.g., "." → "source", "python3" → "python"). */
const aliases = new Map<string, string>();

export function register(name: string, handler: CommandHandler, description: string, helpText?: string, readsFiles?: boolean): void {
  commands.set(name, { handler, description, helpText, readsFiles });
}

export function registerAsync(name: string, handler: AsyncCommandHandler, description: string, helpText?: string, readsFiles?: boolean): void {
  asyncCommands.set(name, { handler, description, helpText, readsFiles });
}

/** Register an alias that shares the primary command's handler. */
export function registerAlias(alias: string, primaryName: string): void {
  const syncEntry = commands.get(primaryName);
  if (syncEntry) {
    commands.set(alias, syncEntry);
  }
  const asyncEntry = asyncCommands.get(primaryName);
  if (asyncEntry) {
    asyncCommands.set(alias, asyncEntry);
  }
  aliases.set(alias, primaryName);
}

/** Returns the primary name for an alias, or the name itself if it's already primary. */
export function getPrimaryName(name: string): string {
  return aliases.get(name) ?? name;
}

/** Returns all aliases for a given primary command name. */
export function getAliasesFor(name: string): string[] {
  const result: string[] = [];
  for (const [alias, primary] of aliases) {
    if (primary === name) result.push(alias);
  }
  return result;
}

/** Returns true if the command reads files (triggers file_read events in applyResult). */
export function commandReadsFiles(name: string): boolean {
  return !!(commands.get(name)?.readsFiles ?? asyncCommands.get(name)?.readsFiles);
}

/** zsh-style command-not-found error, with a dimmed tutorial hint for new players. */
function commandNotFound(commandName: string): string {
  return (
    colorize(`zsh: command not found: ${commandName}`, ansi.red) +
    "\n" +
    colorize("Type 'help' for available commands.", ansi.dim)
  );
}

export function execute(
  commandName: string,
  args: string[],
  flags: Record<string, boolean>,
  ctx: CommandContext
): CommandResult {
  if (!isCommandAvailable(commandName, ctx.activeComputer, ctx.storyFlags)) {
    // Dev-container-only tools are never installed on the workstation, so the
    // "colleagues will help you get set up" hint would be a false promise
    if (ctx.activeComputer === "nexacorp" && !DEVCONTAINER_ONLY.has(commandName)) {
      const hint = NEXACORP_GATE_HINTS[commandName] ?? "Check your mail and Piper messages; your colleagues will help you get set up.";
      return { output: colorize(`${commandName}: not yet available. ${hint}`, ansi.yellow), exitCode: 127 };
    }
    return { output: commandNotFound(commandName), exitCode: 127 };
  }
  const entry = commands.get(commandName);
  if (!entry) {
    return { output: commandNotFound(commandName), exitCode: 127 };
  }
  if (flags["help"] && entry.helpText) {
    return { output: entry.helpText };
  }
  if (shouldValidateFlags(commandName)) {
    const err = rejectUnknownFlags(commandName, flags, getKnownFlags(commandName) ?? {});
    if (err) return err;
  }
  return entry.handler(args, flags, ctx);
}

export async function executeAsync(
  commandName: string,
  args: string[],
  flags: Record<string, boolean>,
  ctx: CommandContext
): Promise<CommandResult> {
  // Path execution: ./script.sh or /path/to/script.sh
  if (isPathCommand(commandName)) {
    return executePathCommand(commandName, ctx);
  }
  const asyncEntry = asyncCommands.get(commandName);
  if (asyncEntry) {
    if (flags["help"] && asyncEntry.helpText) {
      return { output: asyncEntry.helpText };
    }
    if (shouldValidateFlags(commandName)) {
      const err = rejectUnknownFlags(commandName, flags, getKnownFlags(commandName) ?? {});
      if (err) return err;
    }
    return asyncEntry.handler(args, flags, ctx);
  }
  return execute(commandName, args, flags, ctx);
}

/** Execute a file path as a script (./script.sh or /path/to/script). */
async function executePathCommand(pathStr: string, ctx: CommandContext): Promise<CommandResult> {
  const absPath = resolvePath(pathStr, ctx.cwd, ctx.homeDir);
  const node = ctx.fs.getNode(absPath);
  if (!node) {
    return { output: `zsh: no such file or directory: ${pathStr}`, exitCode: 127 };
  }
  // zsh reports directories as "permission denied" (it tries to exec them), not "Is a directory"
  if (node.type === "directory") {
    return { output: `zsh: permission denied: ${pathStr}`, exitCode: 126 };
  }
  // Check execute permission (owner execute = index 2 in "rwxr-xr-x")
  const perms = node.permissions ?? "rw-r--r--";
  if (perms[2] !== "x") {
    return { output: `zsh: permission denied: ${pathStr}`, exitCode: 126 };
  }
  // Intercept auto_apply.py on home PC
  if (ctx.activeComputer === "home" && absPath.endsWith("/auto_apply.py")) {
    const { simulateAutoApply } = await import("./builtins/python");
    return simulateAutoApply([]);
  }

  const content = node.type === "file" ? node.content : "";
  // Lazy import to avoid circular dependency at module load time
  const { executeScript } = await import("./builtins/bash");
  // parseInput strips the command token from rawArgs, so ctx.rawArgs is already
  // the positional args for ./script.sh — do NOT slice again.
  const result = await executeScript(content, ctx, ctx.rawArgs);
  // Add file_read event for the script file
  const scriptEvent = { type: "file_read" as const, detail: absPath };
  const events = result.triggerEvents ? [scriptEvent, ...result.triggerEvents] : [scriptEvent];
  return { ...result, triggerEvents: events };
}

export function isAsyncCommand(name: string): boolean {
  if (isPathCommand(name)) return true;
  return asyncCommands.has(name);
}

export function getCommandList(): { name: string; description: string; aliases?: string[] }[] {
  const all = new Map<string, string>();
  for (const [name, { description }] of commands) {
    if (!aliases.has(name)) all.set(name, description);
  }
  for (const [name, { description }] of asyncCommands) {
    if (!aliases.has(name)) all.set(name, description);
  }
  return Array.from(all.entries()).map(([name, description]) => {
    const cmdAliases = getAliasesFor(name);
    return {
      name,
      description,
      ...(cmdAliases.length > 0 ? { aliases: cmdAliases } : {}),
    };
  });
}

/** Returns only commands available on the given computer. */
export function getAvailableCommands(computer: ComputerId, storyFlags?: StoryFlags): { name: string; description: string }[] {
  return getCommandList().filter((c) => isCommandAvailable(c.name, computer, storyFlags));
}
