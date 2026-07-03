import { splitOnChainOperators } from "@tt/core/commands/parser";
import {
  SuggestionContext,
  PATH_COMMANDS,
  SUBCOMMAND_MAP,
  listMatchingEntries,
  splitPartialPath,
  findLastUnquotedPipe,
  hasUnquotedRedirect,
  resolveAlias,
} from "./suggest";

export interface CompletionResult {
  matches: string[];       // Full replacement strings from replaceFrom onward
  displayNames: string[];  // Short names for menu display
  commonPrefix: string;    // Full input with longest common prefix applied
  replaceFrom: number;     // Index in input where replacement starts
}

/**
 * Get tab completions for the current input.
 * Returns null if no completions are available.
 */
export function getCompletions(
  input: string,
  ctx: SuggestionContext
): CompletionResult | null {
  // Chain operator support: complete last segment
  const chainSegments = splitOnChainOperators(input);
  if (chainSegments.length > 1) {
    const lastSeg = chainSegments[chainSegments.length - 1];
    const trimmed = lastSeg.text.trimStart();
    const lastSegStart = input.length - lastSeg.text.length;
    const leadingSpace = lastSeg.text.length - trimmed.length;
    const offset = lastSegStart + leadingSpace;

    const result = getCompletions(trimmed, ctx);
    if (!result) return null;

    return {
      matches: result.matches,
      displayNames: result.displayNames,
      commonPrefix: input.slice(0, offset) + result.commonPrefix,
      replaceFrom: result.replaceFrom + offset,
    };
  }

  // Pipe support: complete last pipe segment
  const lastPipeIdx = findLastUnquotedPipe(input);
  if (lastPipeIdx >= 0) {
    const pipeText = input.slice(lastPipeIdx + 1);
    const trimmed = pipeText.trimStart();
    const leadingSpace = pipeText.length - trimmed.length;
    const offset = lastPipeIdx + 1 + leadingSpace;

    const result = getCompletions(trimmed, ctx);
    if (!result) return null;

    return {
      matches: result.matches,
      displayNames: result.displayNames,
      commonPrefix: input.slice(0, offset) + result.commonPrefix,
      replaceFrom: result.replaceFrom + offset,
    };
  }

  // Guard: block completion if segment has unquoted redirect
  if (hasUnquotedRedirect(input)) return null;

  // Command completion (no space in input)
  if (!input.includes(" ")) {
    return completeCommand(input, ctx);
  }

  // Has space — determine completion type
  const spaceIdx = input.indexOf(" ");
  const cmd = input.slice(0, spaceIdx);
  const resolvedCmd = resolveAlias(cmd, ctx.aliases);

  // Subcommand completion
  const subs = SUBCOMMAND_MAP[resolvedCmd];
  if (subs) {
    const rest = input.slice(spaceIdx + 1);
    // Only complete subcommand if no additional spaces (i.e., first arg position)
    if (!rest.includes(" ")) {
      const result = completeSubcommand(rest, subs);
      if (result) {
        return {
          matches: result.matches,
          displayNames: result.displayNames,
          commonPrefix: cmd + " " + result.commonPrefix,
          replaceFrom: spaceIdx + 1,
        };
      }
    }
  }

  // Path completion
  if (PATH_COMMANDS.includes(resolvedCmd)) {
    const rest = input.slice(spaceIdx + 1);
    const lastSpaceInRest = rest.lastIndexOf(" ");
    const partial = lastSpaceInRest === -1 ? rest : rest.slice(lastSpaceInRest + 1);
    const restPrefix = lastSpaceInRest === -1 ? "" : rest.slice(0, lastSpaceInRest + 1);
    const replaceFrom = spaceIdx + 1 + (lastSpaceInRest === -1 ? 0 : lastSpaceInRest + 1);

    const result = completePaths(partial, ctx, resolvedCmd === "cd");
    if (result) {
      return {
        matches: result.matches,
        displayNames: result.displayNames,
        commonPrefix: cmd + " " + restPrefix + result.commonPrefix,
        replaceFrom,
      };
    }
  }

  return null;
}

function completeCommand(
  input: string,
  ctx: SuggestionContext
): CompletionResult | null {
  const allNames = [...ctx.commandNames, ...(ctx.aliasNames ?? [])];
  const lower = input.toLowerCase();
  const matches = allNames
    .filter((name) => name.toLowerCase().startsWith(lower))
    .sort();

  if (matches.length === 0) return null;

  return {
    matches,
    displayNames: matches,
    commonPrefix: computeCommonPrefix(matches),
    replaceFrom: 0,
  };
}

function completeSubcommand(
  partial: string,
  subs: string[]
): CompletionResult | null {
  const lower = partial.toLowerCase();
  const matches = subs
    .filter((s) => s.toLowerCase().startsWith(lower))
    .sort();

  if (matches.length === 0) return null;

  return {
    matches,
    displayNames: matches,
    commonPrefix: computeCommonPrefix(matches),
    replaceFrom: 0,
  };
}

function completePaths(
  partial: string,
  ctx: SuggestionContext,
  directoriesOnly: boolean
): CompletionResult | null {
  const { parentDir, prefix, pathPrefix } = splitPartialPath(partial, ctx);

  const entries = listMatchingEntries(parentDir, prefix, ctx, directoriesOnly, true);
  if (entries.length === 0) return null;

  const matches = entries.map((e) => pathPrefix + e.displayName);
  const displayNames = entries.map((e) => e.displayName);

  return {
    matches,
    displayNames,
    commonPrefix: computeCommonPrefix(matches),
    replaceFrom: 0,
  };
}

/**
 * Compute the longest common prefix of an array of strings.
 * Uses actual casing from the matches (filesystem-cased).
 */
function computeCommonPrefix(matches: string[]): string {
  if (matches.length === 0) return "";
  if (matches.length === 1) return matches[0];

  const first = matches[0];
  let len = first.length;

  for (let i = 1; i < matches.length; i++) {
    len = Math.min(len, matches[i].length);
    for (let j = 0; j < len; j++) {
      if (first[j] !== matches[i][j]) {
        len = j;
        break;
      }
    }
  }

  return first.slice(0, len);
}
