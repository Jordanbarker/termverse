import { ParsedCommand, ChainOperator, ChainSegment } from "@tt/core/commands/types";

/**
 * Tokenize and parse raw terminal input into a structured command.
 */
export function parseInput(raw: string): ParsedCommand {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { command: "", args: [], flags: {}, raw: trimmed, rawArgs: [] };
  }

  const tokens = tokenize(trimmed);
  if (tokens === null) {
    return { command: "", args: [], flags: {}, raw: trimmed, rawArgs: [], error: "syntax error: unterminated quote" };
  }
  const command = tokens[0] || "";
  const rawArgs = tokens.slice(1);
  const args: string[] = [];
  const flags: Record<string, boolean> = {};

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith("--")) {
      flags[token.slice(2)] = true;
    } else if (token.startsWith("-") && token.length > 1) {
      // Expand combined short flags: -la -> -l -a
      for (const char of token.slice(1)) {
        flags[char] = true;
      }
    } else {
      args.push(token);
    }
  }

  return { command, args, flags, raw: trimmed, rawArgs };
}

/**
 * Split raw input on unquoted `|` characters and parse each segment.
 * Returns an array of ParsedCommands representing the pipeline.
 */
export function parsePipeline(raw: string): ParsedCommand[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [{ command: "", args: [], flags: {}, raw: trimmed, rawArgs: [] }];
  }

  const segments = splitOnPipe(trimmed);
  return segments.map((seg) => parseInput(seg));
}

/**
 * Split input on unquoted `|` characters, respecting single/double quotes.
 * Also handles `>` and `>>` redirection operators as separate segments.
 */
export function splitOnPipe(input: string): string[] {
  const segments: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      current += char;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      current += char;
    } else if (char === "|" && !inSingle && !inDouble) {
      segments.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}

/**
 * Split raw input on unquoted `&&`, `||`, `;` chain operators, respecting quotes.
 * Returns segments with the operator that preceded them (null for the first).
 * Does NOT split on single `&` or single `|` — those pass through for pipe parsing.
 * No backslash escaping — consistent with splitOnPipe.
 */
export function splitOnChainOperators(input: string): { text: string; operator: ChainOperator | null }[] {
  const segments: { text: string; operator: ChainOperator | null }[] = [];
  let current = "";
  let currentOperator: ChainOperator | null = null;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      current += char;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      current += char;
    } else if (!inSingle && !inDouble) {
      // Two-character lookahead for && and ||
      if (char === '&' && input[i + 1] === '&') {
        segments.push({ text: current, operator: currentOperator });
        current = "";
        currentOperator = '&&';
        i++; // skip second &
      } else if (char === '|' && input[i + 1] === '|') {
        segments.push({ text: current, operator: currentOperator });
        current = "";
        currentOperator = '||';
        i++; // skip second |
      } else if (char === ';') {
        segments.push({ text: current, operator: currentOperator });
        current = "";
        currentOperator = ';';
      } else {
        current += char;
      }
    } else {
      current += char;
    }
  }

  segments.push({ text: current, operator: currentOperator });
  return segments;
}

/**
 * Parse raw input into a chain of pipeline segments.
 * Splits on `&&`, `||`, `;` first, then calls `parsePipeline` on each segment.
 * This ordering is essential: `||` must be consumed before `splitOnPipe` sees it.
 *
 * `shell` selects the syntax-error wording: the interactive shell is zsh
 * (`zsh: parse error near \`&&'`), while `bash script.sh` lines keep bash's
 * `bash: syntax error near unexpected token` form.
 */
export function parseChainedPipeline(raw: string, shell: "zsh" | "bash" = "zsh"): ChainSegment[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [{ pipeline: [{ command: "", args: [], flags: {}, raw: trimmed, rawArgs: [] }], operator: null }];
  }

  const syntaxError = (op: string) =>
    shell === "bash"
      ? `bash: syntax error near unexpected token \`${op}'`
      : `zsh: parse error near \`${op}'`;

  const segments = splitOnChainOperators(trimmed);

  // Validate: check for empty segments (syntax errors)
  for (let i = 0; i < segments.length; i++) {
    const text = segments[i].text.trim();
    if (!text) {
      // Determine which operator caused the issue
      if (i === 0 && segments.length > 1) {
        // Leading operator: e.g., "&& cmd"
        const nextOp = segments[1].operator ?? '&&';
        return [{ pipeline: [{ command: "", args: [], flags: {}, raw: trimmed, rawArgs: [], error: syntaxError(nextOp) }], operator: null }];
      } else if (i === segments.length - 1 && segments[i].operator) {
        // Trailing operator: e.g., "cmd &&"
        return [{ pipeline: [{ command: "", args: [], flags: {}, raw: trimmed, rawArgs: [], error: syntaxError(segments[i].operator!) }], operator: null }];
      } else if (segments[i].operator && i + 1 < segments.length && segments[i + 1].operator) {
        // Consecutive operators: e.g., "cmd && && cmd2"
        const op = segments[i + 1].operator!;
        return [{ pipeline: [{ command: "", args: [], flags: {}, raw: trimmed, rawArgs: [], error: syntaxError(op) }], operator: null }];
      }
    }
  }

  return segments.map((seg) => ({
    pipeline: parsePipeline(seg.text),
    operator: seg.operator,
  }));
}

/**
 * Perform one-level textual alias expansion on raw input before parsing.
 * Substitutes alias names at "command positions" (start of input, or after
 * unquoted `&&`, `||`, `;`). Remaining args stay appended after expansion.
 * Respects quotes — words inside quotes are never expanded.
 */
export function expandAliases(input: string, aliases: Record<string, string>): string {
  if (!input || Object.keys(aliases).length === 0) return input;

  const result: string[] = [];
  let i = 0;
  let atCommandPos = true; // start of input is a command position
  let inSingle = false;
  let inDouble = false;

  while (i < input.length) {
    const char = input[i];

    // Track quote state
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      result.push(char);
      atCommandPos = false;
      i++;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      result.push(char);
      atCommandPos = false;
      i++;
      continue;
    }

    // Detect chain operators outside quotes → next word is a command position
    if (!inSingle && !inDouble) {
      if (char === '&' && input[i + 1] === '&') {
        result.push('&&');
        i += 2;
        atCommandPos = true;
        continue;
      }
      if (char === '|' && input[i + 1] === '|') {
        result.push('||');
        i += 2;
        atCommandPos = true;
        continue;
      }
      if (char === ';') {
        result.push(';');
        i++;
        atCommandPos = true;
        continue;
      }
    }

    // Skip whitespace (preserve it)
    if (char === ' ' && !inSingle && !inDouble) {
      result.push(char);
      i++;
      continue;
    }

    // At a command position outside quotes: extract the word and check aliases
    if (atCommandPos && !inSingle && !inDouble) {
      // Extract the word (until space, quote, or chain operator)
      let word = '';
      while (i < input.length) {
        const c = input[i];
        if (c === ' ' || c === "'" || c === '"') break;
        if (c === '&' && input[i + 1] === '&') break;
        if (c === '|' && input[i + 1] === '|') break;
        if (c === ';') break;
        word += c;
        i++;
      }

      if (word in aliases) {
        result.push(aliases[word]);
      } else {
        result.push(word);
      }
      atCommandPos = false;
      continue;
    }

    // Non-command-position content: just pass through
    result.push(char);
    atCommandPos = false;
    i++;
  }

  return result.join('');
}

export type ContinuationKind = "quote" | "dquote" | "backslash" | "pipe" | "cmdand" | "cmdor";

/**
 * Detect whether raw input is syntactically incomplete and should open a zsh-style
 * secondary prompt (`dquote>`, `pipe>`, ...) instead of erroring, mirroring real
 * interactive zsh behavior. Returns `null` when the input is complete/submittable.
 *
 * The quote scan below duplicates `tokenize`'s exact quote rules (no backslash
 * escaping, `'`/`"` toggle unless the other is active) — keep the two in sync.
 */
export function analyzeIncompleteInput(input: string): { kind: ContinuationKind; prompt: string } | null {
  if (!input) return null;

  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    }
  }

  if (inSingle) return { kind: "quote", prompt: "quote> " };
  if (inDouble) return { kind: "dquote", prompt: "dquote> " };

  let backslashRun = 0;
  for (let i = input.length - 1; i >= 0 && input[i] === "\\"; i--) backslashRun++;
  if (backslashRun % 2 === 1) return { kind: "backslash", prompt: "> " };

  const trimmed = input.trimEnd();
  if (trimmed.endsWith("||")) return { kind: "cmdor", prompt: "cmdor> " };
  if (trimmed.endsWith("&&")) return { kind: "cmdand", prompt: "cmdand> " };
  if (trimmed.endsWith("|")) return { kind: "pipe", prompt: "pipe> " };

  return null;
}

/**
 * Split input into tokens, respecting single and double quotes.
 *
 * Quote rules here must stay in sync with `analyzeIncompleteInput`'s scan above.
 */
function tokenize(input: string): string[] | null {
  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (char === " " && !inSingle && !inDouble) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (inSingle || inDouble) return null;

  if (current) tokens.push(current);
  return tokens;
}
