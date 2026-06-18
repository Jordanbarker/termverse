import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { isDirectory } from "@tt/core/filesystem/types";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { splitOnChainOperators } from "../commands/parser";

const HISTORY_SCAN_DEPTH = 100;

export interface SuggestionContext {
  commandHistory: string[];
  commandNames: string[];
  aliasNames?: string[];
  aliases?: Record<string, string>;
  fs: VirtualFS;
  cwd: string;
  homeDir: string;
}

/** Commands that accept path arguments */
export const PATH_COMMANDS = [
  "cd", "ls", "cat", "less", "nano", "head", "tail", "grep", "diff", "wc", "file",
  "sort", "uniq", "chmod", "rm", "cp", "mv", "touch", "find", "tree",
  "pdftotext", "bash", "sh",
];

/** Subcommand lists keyed by parent command */
export const SUBCOMMAND_MAP: Record<string, string[]> = {
  dbt: ["run", "test", "build", "ls", "list", "debug", "compile", "show", "--version"],
  snow: ["sql"],
  sudo: ["apt"],
  apt: ["install"],
  bash: ["-c"],
  sh: ["-c"],
  git: ["init", "clone", "add", "rm", "commit", "status", "log", "branch", "checkout", "switch", "diff", "stash", "push", "pull", "help"],
};

/**
 * List entries in a directory matching a prefix.
 * Returns matching entries with their display names (name + "/" for dirs).
 */
export function listMatchingEntries(
  parentDir: string,
  prefix: string,
  ctx: SuggestionContext,
  directoriesOnly: boolean,
  caseInsensitive: boolean,
): { name: string; displayName: string }[] {
  const { entries } = ctx.fs.listDirectory(parentDir);
  if (!entries.length) return [];

  const sorted = entries.slice().sort((a, b) => a.name.localeCompare(b.name));
  const results: { name: string; displayName: string }[] = [];

  for (const entry of sorted) {
    if (directoriesOnly && !isDirectory(entry)) continue;

    const matches = caseInsensitive
      ? entry.name.toLowerCase().startsWith(prefix.toLowerCase())
      : entry.name.startsWith(prefix);

    if (!matches) continue;
    if (!prefix && entry.name === prefix) continue;

    const displayName = entry.name + (isDirectory(entry) ? "/" : "");
    results.push({ name: entry.name, displayName });
  }

  return results;
}

/**
 * Find the last unquoted single pipe `|` (not `||`) in input.
 * Returns the index, or -1 if none found.
 */
export function findLastUnquotedPipe(input: string): number {
  let inSingle = false;
  let inDouble = false;
  let lastPipe = -1;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (char === "|" && !inSingle && !inDouble) {
      // Check it's not part of ||
      if (input[i - 1] !== "|" && input[i + 1] !== "|") {
        lastPipe = i;
      }
    }
  }

  return lastPipe;
}

/**
 * Check if input contains an unquoted redirect operator (> or >>).
 */
export function hasUnquotedRedirect(input: string): boolean {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (char === ">" && !inSingle && !inDouble) {
      return true;
    }
  }

  return false;
}

/**
 * Resolve an alias to its underlying command name.
 */
export function resolveAlias(cmd: string, aliases?: Record<string, string>): string {
  if (aliases?.[cmd]) {
    return aliases[cmd].split(/\s+/)[0];
  }
  return cmd;
}

/**
 * Compute a zsh-style autosuggestion for the current input.
 * Returns the full suggested string, or null if no suggestion.
 */
export function getSuggestion(
  input: string,
  ctx: SuggestionContext
): string | null {
  if (!input) return null;

  // Strategy 1: History match against FULL input (scan reverse, first entry starting with input)
  for (let i = ctx.commandHistory.length - 1; i >= Math.max(0, ctx.commandHistory.length - HISTORY_SCAN_DEPTH); i--) {
    const entry = ctx.commandHistory[i];
    if (entry.startsWith(input) && entry.length > input.length) {
      return entry;
    }
  }

  // For chain operators (&&, ||, ;): extract the last segment for completion
  const chainSegments = splitOnChainOperators(input);
  if (chainSegments.length > 1) {
    const lastSeg = chainSegments[chainSegments.length - 1];
    const lastText = lastSeg.text.trimStart();
    // If last segment is empty/whitespace, no suggestion
    if (!lastText) return null;
    // Compute suggestion for just the last segment
    const segSuggestion = getSuggestion(lastText, ctx);
    if (segSuggestion === null) return null;
    // Reconstruct: use original input up to the last segment, then append suggestion
    const lastSegStart = input.length - lastSeg.text.length;
    const leadingSpace = lastSeg.text.length - lastSeg.text.trimStart().length;
    const prefix = input.slice(0, lastSegStart + leadingSpace);
    return prefix + segSuggestion;
  }

  // Pipe support: extract last pipe segment
  const lastPipeIdx = findLastUnquotedPipe(input);
  if (lastPipeIdx >= 0) {
    const pipeText = input.slice(lastPipeIdx + 1);
    const trimmed = pipeText.trimStart();
    if (!trimmed) return null;
    const offset = lastPipeIdx + 1 + (pipeText.length - trimmed.length);
    const segSuggestion = getSuggestion(trimmed, ctx);
    if (segSuggestion === null) return null;
    return input.slice(0, offset) + segSuggestion;
  }

  // Strategy 2: Command name completion (no spaces = still typing command)
  if (!input.includes(" ")) {
    const allNames = [...ctx.commandNames, ...(ctx.aliasNames ?? [])];
    const match = allNames
      .slice()
      .sort()
      .find((name) => name.toLowerCase().startsWith(input.toLowerCase()) && name.length > input.length);
    if (match) return match;
  }

  // Strategy 3: Path argument completion (for cd, ls, cat)
  const spaceIdx = input.indexOf(" ");
  if (spaceIdx !== -1) {
    const cmd = input.slice(0, spaceIdx);
    const resolvedCmd = resolveAlias(cmd, ctx.aliases);

    if (PATH_COMMANDS.includes(resolvedCmd)) {
      const rest = input.slice(spaceIdx + 1);
      const lastSpaceInRest = rest.lastIndexOf(" ");
      const partial = lastSpaceInRest === -1 ? rest : rest.slice(lastSpaceInRest + 1);
      const prefix = lastSpaceInRest === -1 ? "" : rest.slice(0, lastSpaceInRest + 1);
      const completed = completePath(partial, ctx, resolvedCmd === "cd");
      if (completed !== null) {
        return cmd + " " + prefix + completed;
      }
    }

    // Strategy 3b: Subcommand completion
    const subs = SUBCOMMAND_MAP[resolvedCmd];
    if (subs) {
      const partial = input.slice(spaceIdx + 1);
      const match = subs.find((s) => s.toLowerCase().startsWith(partial.toLowerCase()) && s.length > partial.length);
      if (match) return cmd + " " + match;
    }
  }

  return null;
}

/**
 * Complete a partial path against the virtual filesystem.
 * Returns the completed path string, or null if no match.
 * Used for ghost-text suggestions (returns first match only, no empty prefix).
 */
function completePath(
  partial: string,
  ctx: SuggestionContext,
  directoriesOnly: boolean
): string | null {
  if (!partial) return null;

  const lastSlash = partial.lastIndexOf("/");
  let parentInput: string;
  let prefix: string;

  if (lastSlash === -1) {
    parentInput = ctx.cwd;
    prefix = partial;
  } else {
    parentInput = resolvePath(
      partial.slice(0, lastSlash + 1),
      ctx.cwd,
      ctx.homeDir
    );
    prefix = partial.slice(lastSlash + 1);
  }

  if (!prefix) return null;

  const matches = listMatchingEntries(parentInput, prefix, ctx, directoriesOnly, true);
  if (matches.length === 0) return null;

  // Return first match (for ghost text, just show the top suggestion)
  const first = matches[0];
  const completedName = first.displayName;
  if (lastSlash === -1) {
    return completedName;
  } else {
    return partial.slice(0, lastSlash + 1) + completedName;
  }
}
