/**
 * Shell-config parsing (core, story-agnostic).
 *
 * Extracts environment-variable assignments and alias definitions from
 * `.zshrc`-style file content. Pure string parsing with no game knowledge, used
 * by the `source` builtin and by app-side env seeding.
 */

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Parses environment variable assignments from shell config file content.
 * Extracts `export VAR=VALUE` and plain `VAR=VALUE` assignments.
 * Skips comments, aliases, setopt, bindkey, autoload, function calls, conditionals.
 */
export function parseEnvAssignments(content: string): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip empty lines, comments, and non-assignment constructs
    if (
      !trimmed ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("alias ") ||
      trimmed.startsWith("setopt ") ||
      trimmed.startsWith("bindkey ") ||
      trimmed.startsWith("autoload ") ||
      trimmed.startsWith("if ") ||
      trimmed.startsWith("fi") ||
      trimmed.startsWith("then") ||
      trimmed.startsWith("else") ||
      trimmed.startsWith("function ") ||
      trimmed.startsWith("source ") ||
      trimmed.startsWith(". ")
    ) {
      continue;
    }

    // Match `export VAR=VALUE` or `export VAR="VALUE"` or `export VAR='VALUE'`
    const exportMatch = trimmed.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (exportMatch) {
      vars[exportMatch[1]] = stripQuotes(exportMatch[2]);
      continue;
    }

    // Match plain `VAR=VALUE` (only if it looks like a standalone assignment)
    const assignMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (assignMatch) {
      vars[assignMatch[1]] = stripQuotes(assignMatch[2]);
    }
  }

  return vars;
}

/**
 * Parses alias definitions from shell config file content.
 * Matches `alias NAME='VALUE'` and `alias NAME="VALUE"` patterns.
 */
export function parseAliases(content: string): Record<string, string> {
  const aliases: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("alias ")) continue;

    // Match: alias NAME='VALUE' or alias NAME="VALUE" or alias NAME=VALUE.
    // zsh allows essentially any non-whitespace, non-`=` characters in alias
    // names (e.g. `-`, `..`, `...`).
    const match = trimmed.match(/^alias\s+([^\s=]+)=(.*)$/);
    if (match) {
      aliases[match[1]] = stripQuotes(match[2]);
    }
  }

  return aliases;
}
