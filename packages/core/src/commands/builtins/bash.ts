import { registerAsync, registerAlias } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { AsyncCommandHandler, CommandContext, CommandResult } from "@tt/core/commands/types";
import { parsePipeline, parseInput, parseChainedPipeline } from "../parser";
import { execute, executeAsync, isAsyncCommand } from "../registry";
import { applyRedirection, extractStdoutRedirect, precheckRedirects } from "../redirection";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { HELP_TEXTS } from "./helpTexts";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { GameEvent } from "@tt/core";
import { isCommandAvailable } from "../availability";
import { getAvailableCommands } from "../registry";
import { COMMAND_PATHS } from "./which";
import { stripAnsi } from "@tt/core/lib/ansi";

const MAX_SUBSTITUTION_DEPTH = 5;

/** Session fields that indicate an interactive command. */
const SESSION_FIELDS = [
  "editorSession",
  "interactiveSession",
  "snowSqlSession",
  "sshSession",
  "chipSession",
  "piperSession",
  "promptSession",
] as const;

// ---------------------------------------------------------------------------
// Script node types
// ---------------------------------------------------------------------------

type ScriptNode =
  | { type: "command"; text: string; lineNumber: number }
  | { type: "assignment"; name: string; value: string; lineNumber: number }
  | { type: "function"; name: string; body: ScriptNode[]; lineNumber: number }
  | { type: "if"; condition: string; thenBody: ScriptNode[]; elseBody: ScriptNode[]; lineNumber: number };

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Quote-aware split of a single line on top-level `;`. Lets inline forms like
 * `X=hi; echo $X` and `if true; then echo yes; fi` decompose into the same
 * line-oriented statements parseNodes expects. Does not split inside quotes.
 */
function splitLineOnSemicolons(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; current += ch; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; current += ch; continue; }
    if (ch === ";" && !inSingle && !inDouble) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = "";
      continue;
    }
    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);
  return parts;
}

/** Join lines ending with `\` (line continuation) and strip comments/blanks. */
function preprocessLines(content: string): { text: string; lineNumber: number }[] {
  const rawLines = content.split("\n");
  const joined: { text: string; lineNumber: number }[] = [];
  let accumulator = "";
  let startLine = -1;

  /**
   * Inline forms like `if cond; then BODY; fi` collapse to `then BODY` after
   * the `;` split. The if-block parser expects the keyword on its own line,
   * so peel `then`/`else`/`do` off the front into a separate emitted line.
   */
  const peelKeyword = (piece: string): string[] => {
    for (const kw of ["then", "else", "do"] as const) {
      if (piece === kw) return [piece];
      if (piece.startsWith(kw + " ")) {
        return [kw, piece.slice(kw.length + 1).trim()];
      }
    }
    return [piece];
  };

  const emit = (text: string, lineNumber: number) => {
    const pieces = splitLineOnSemicolons(text);
    if (pieces.length === 0) return;
    for (const piece of pieces) {
      for (const part of peelKeyword(piece)) {
        if (part) joined.push({ text: part, lineNumber });
      }
    }
  };

  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();

    if (accumulator) {
      accumulator += " " + trimmed;
      if (trimmed.endsWith("\\")) {
        accumulator = accumulator.slice(0, -1);
      } else {
        emit(accumulator, startLine);
        accumulator = "";
      }
      continue;
    }

    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;

    if (trimmed.endsWith("\\")) {
      accumulator = trimmed.slice(0, -1);
      startLine = i + 1;
    } else {
      emit(trimmed, i + 1);
    }
  }

  if (accumulator) {
    emit(accumulator, startLine);
  }

  return joined;
}

/** Parse preprocessed lines into a tree of ScriptNodes. */
function parseNodes(lines: { text: string; lineNumber: number }[]): ScriptNode[] {
  const nodes: ScriptNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const { text, lineNumber } = lines[i];

    // Function definition: funcname() {
    const funcMatch = text.match(/^(\w+)\(\)\s*\{$/);
    if (funcMatch) {
      const name = funcMatch[1];
      // Collect body lines until matching }
      const bodyLines: { text: string; lineNumber: number }[] = [];
      let depth = 1;
      i++;
      while (i < lines.length && depth > 0) {
        const t = lines[i].text;
        if (t === "}") {
          depth--;
          if (depth === 0) { i++; break; }
        }
        // Track nested braces
        if (t.match(/\{\s*$/) || t.match(/^\w+\(\)\s*\{$/)) depth++;
        bodyLines.push(lines[i]);
        i++;
      }
      nodes.push({ type: "function", name, body: parseNodes(bodyLines), lineNumber });
      continue;
    }

    // if CONDITION; then
    const ifMatch = text.match(/^if\s+(.+?);\s*then$/);
    if (ifMatch) {
      const condition = ifMatch[1];
      const { thenBody, elseBody, endIndex } = collectIfBody(lines, i + 1);
      nodes.push({
        type: "if",
        condition,
        thenBody: parseNodes(thenBody),
        elseBody: parseNodes(elseBody),
        lineNumber,
      });
      i = endIndex;
      continue;
    }

    // if CONDITION (then on next line)
    const ifMatch2 = text.match(/^if\s+(.+)$/);
    if (ifMatch2 && i + 1 < lines.length && lines[i + 1].text.trim() === "then") {
      const condition = ifMatch2[1];
      const { thenBody, elseBody, endIndex } = collectIfBody(lines, i + 2);
      nodes.push({
        type: "if",
        condition,
        thenBody: parseNodes(thenBody),
        elseBody: parseNodes(elseBody),
        lineNumber,
      });
      i = endIndex;
      continue;
    }

    // Variable assignment: NAME=VALUE — only when the whole line is a bare
    // assignment. Lines with top-level separators (`;`, `|`, `&&`, `||`) fall
    // through to the command branch so executeSingleLine can split the chain.
    const assignMatch = text.match(/^([A-Za-z_]\w*)=(.*)$/);
    if (assignMatch && !hasTopLevelSeparator(assignMatch[2])) {
      nodes.push({ type: "assignment", name: assignMatch[1], value: assignMatch[2], lineNumber });
      i++;
      continue;
    }

    // Everything else is a command
    nodes.push({ type: "command", text, lineNumber });
    i++;
  }

  return nodes;
}

/** Collect then/else body lines for an if block, handling nesting. Returns index after fi. */
function collectIfBody(
  lines: { text: string; lineNumber: number }[],
  start: number,
): { thenBody: { text: string; lineNumber: number }[]; elseBody: { text: string; lineNumber: number }[]; endIndex: number } {
  const thenBody: { text: string; lineNumber: number }[] = [];
  const elseBody: { text: string; lineNumber: number }[] = [];
  let collecting = thenBody;
  let depth = 1;
  let i = start;

  while (i < lines.length) {
    const t = lines[i].text;

    // Track nested if depth
    if (t.match(/^if\s+/)) depth++;

    if (t === "fi" || t === "fi;") {
      depth--;
      if (depth === 0) {
        return { thenBody, elseBody, endIndex: i + 1 };
      }
    }

    if ((t === "else" || t === "else;") && depth === 1) {
      collecting = elseBody;
      i++;
      continue;
    }

    collecting.push(lines[i]);
    i++;
  }

  return { thenBody, elseBody, endIndex: i };
}

/** Parse script content into ScriptNodes. */
function parseScript(content: string): ScriptNode[] {
  const lines = preprocessLines(content);
  return parseNodes(lines);
}

// ---------------------------------------------------------------------------
// Variable expansion
// ---------------------------------------------------------------------------

/** Expand shell variables in text, respecting quote boundaries. Does NOT touch $(...). */
function expandVariables(
  text: string,
  variables: Map<string, string>,
  positionalArgs?: string[],
): string {
  let result = "";
  let inSingle = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    // Track single quotes (no expansion inside)
    if (ch === "'" && !inSingle) {
      inSingle = true;
      result += ch;
      i++;
      continue;
    }
    if (ch === "'" && inSingle) {
      inSingle = false;
      result += ch;
      i++;
      continue;
    }
    if (inSingle) {
      result += ch;
      i++;
      continue;
    }

    // Skip $(...) — command substitution handled separately
    if (ch === "$" && i + 1 < text.length && text[i + 1] === "(") {
      // Copy through the entire $(...) block
      const closeIdx = findMatchingParen(text, i + 2);
      if (closeIdx === -1) {
        result += text.slice(i);
        break;
      }
      result += text.slice(i, closeIdx + 1);
      i = closeIdx + 1;
      continue;
    }

    // ${VAR:-default} or ${VAR}
    if (ch === "$" && i + 1 < text.length && text[i + 1] === "{") {
      const closeIdx = text.indexOf("}", i + 2);
      if (closeIdx === -1) {
        result += ch;
        i++;
        continue;
      }
      const inner = text.slice(i + 2, closeIdx);
      const defaultMatch = inner.match(/^(\w+):-(.*)$/);
      if (defaultMatch) {
        const val = variables.get(defaultMatch[1]);
        result += val !== undefined ? val : defaultMatch[2];
      } else {
        result += variables.get(inner) ?? "";
      }
      i = closeIdx + 1;
      continue;
    }

    // $N positional args
    if (ch === "$" && positionalArgs && i + 1 < text.length && /[1-9]/.test(text[i + 1])) {
      const idx = parseInt(text[i + 1]) - 1;
      result += positionalArgs[idx] ?? "";
      i += 2;
      continue;
    }

    // $VAR
    if (ch === "$" && i + 1 < text.length && /[A-Za-z_]/.test(text[i + 1])) {
      const varMatch = text.slice(i + 1).match(/^[A-Za-z_]\w*/);
      if (varMatch) {
        result += variables.get(varMatch[0]) ?? "";
        i += 1 + varMatch[0].length;
        continue;
      }
    }

    result += ch;
    i++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Stderr redirect stripping
// ---------------------------------------------------------------------------

/** Strip `2>&1` and `2>/dev/null` from a raw command string, respecting quotes. */
function stripStderrRedirects(raw: string): string {
  let result = "";
  let inSingle = false;
  let inDouble = false;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];

    if (ch === "'" && !inDouble) { inSingle = !inSingle; result += ch; i++; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; result += ch; i++; continue; }

    if (!inSingle && !inDouble) {
      // 2>&1
      if (raw.slice(i, i + 4) === "2>&1") { i += 4; continue; }
      // 2>/dev/null
      if (raw.slice(i, i + 11) === "2>/dev/null") { i += 11; continue; }
    }

    result += ch;
    i++;
  }

  return result.trim();
}

// ---------------------------------------------------------------------------
// Command execution helpers
// ---------------------------------------------------------------------------

/** Find the matching closing paren for $( at position `start`, handling nesting. */
function findMatchingParen(text: string, start: number): number {
  let depth = 1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "(" && i > 0 && text[i - 1] === "$") {
      depth++;
    } else if (text[i] === "(") {
      depth++;
    } else if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Expand $(command) substitutions by executing inner commands. */
async function expandSubstitutions(
  text: string,
  ctx: CommandContext,
  runningFs: VirtualFS,
  currentCwd: string,
  allTriggerEvents: GameEvent[],
  depth: number,
): Promise<{ text: string; fs: VirtualFS; cwd: string }> {
  if (depth > MAX_SUBSTITUTION_DEPTH) return { text, fs: runningFs, cwd: currentCwd };

  let result = "";
  let i = 0;
  let fs = runningFs;
  let cwd = currentCwd;
  let inSingle = false;

  while (i < text.length) {
    if (text[i] === "'" && !inSingle) { inSingle = true; result += text[i]; i++; continue; }
    if (text[i] === "'" && inSingle) { inSingle = false; result += text[i]; i++; continue; }
    if (inSingle) { result += text[i]; i++; continue; }

    if (text[i] === "$" && i + 1 < text.length && text[i + 1] === "(") {
      const innerStart = i + 2;
      const closeIdx = findMatchingParen(text, innerStart);
      if (closeIdx === -1) {
        result += text.slice(i);
        break;
      }
      const innerCmd = text.slice(innerStart, closeIdx);

      // Recursively expand nested substitutions
      const expanded = await expandSubstitutions(innerCmd, ctx, fs, cwd, allTriggerEvents, depth + 1);
      fs = expanded.fs;
      cwd = expanded.cwd;

      // Execute the inner command
      const innerResult = await executeSingleLine(expanded.text, {
        ...ctx,
        fs,
        cwd,
      }, fs, cwd, allTriggerEvents);
      fs = innerResult.fs;
      cwd = innerResult.cwd;

      // Replace with trimmed output
      result += innerResult.output.trim();
      i = closeIdx + 1;
    } else {
      result += text[i];
      i++;
    }
  }

  return { text: result, fs, cwd };
}

/** Execute a single pipeline (no chain operators). Returns exitCode. */
async function executePipeline(
  pipeline: import("@tt/core/commands/types").ParsedCommand[],
  ctx: CommandContext,
  runningFs: VirtualFS,
  currentCwd: string,
  allTriggerEvents: GameEvent[],
  functions?: Map<string, ScriptNode[]>,
  redirects?: import("../redirection").RedirectTarget[],
): Promise<{ output: string; fs: VirtualFS; cwd: string; stopped: boolean; exitCode: number }> {
  let stdin: string | undefined;
  let lastResult: CommandResult = { output: "" };
  let fs = runningFs;
  let cwd = currentCwd;

  for (let pi = 0; pi < pipeline.length; pi++) {
    const p = pipeline[pi];
    if (!p.command) continue;

    // Handle `command -v NAME` builtin
    if (p.command === "command" && p.flags.v && p.args.length > 0) {
      const target = p.args[0];
      const registeredNames = getAvailableCommands(ctx.activeComputer).map((c) => c.name);
      const isRegistered = COMMAND_PATHS[target] || registeredNames.includes(target);
      if (functions?.has(target)) {
        lastResult = { output: target, exitCode: 0 };
      } else if (isRegistered && isCommandAvailable(target, ctx.activeComputer, ctx.storyFlags)) {
        const path = COMMAND_PATHS[target] ?? `/usr/bin/${target}`;
        lastResult = { output: path, exitCode: 0 };
      } else {
        lastResult = { output: "", exitCode: 1 };
      }
      stdin = stripAnsi(lastResult.output);
      continue;
    }

    const subCtx: CommandContext = {
      ...ctx,
      fs,
      cwd,
      stdin,
      rawArgs: p.rawArgs,
      isPiped: pi < pipeline.length - 1 || (redirects?.length ?? 0) > 0,
    };

    if (isAsyncCommand(p.command)) {
      lastResult = await executeAsync(p.command, p.args, p.flags, subCtx);
    } else {
      lastResult = execute(p.command, p.args, p.flags, subCtx);
    }

    // Check for interactive session — skip with warning
    if (SESSION_FIELDS.some((f) => lastResult[f])) {
      const cleaned: CommandResult = { output: lastResult.output, exitCode: lastResult.exitCode };
      if (lastResult.triggerEvents) cleaned.triggerEvents = lastResult.triggerEvents;
      if (lastResult.newFs) cleaned.newFs = lastResult.newFs;
      if (lastResult.newCwd) cleaned.newCwd = lastResult.newCwd;
      lastResult = cleaned;
    }

    // Check for computer transition — stop script
    if (lastResult.transitionTo) {
      if (lastResult.triggerEvents) allTriggerEvents.push(...lastResult.triggerEvents);
      return {
        output: `bash: cannot transition computers from within a script`,
        fs: lastResult.newFs ?? fs,
        cwd,
        stopped: true,
        exitCode: 1,
      };
    }

    if (lastResult.triggerEvents) {
      allTriggerEvents.push(...lastResult.triggerEvents);
    }

    if (lastResult.newFs) {
      fs = lastResult.newFs;
    }

    if (lastResult.newCwd) {
      cwd = lastResult.newCwd;
    }

    stdin = stripAnsi(lastResult.output);
  }

  // Apply redirection
  if (redirects && redirects.length > 0 && lastResult) {
    const redir = applyRedirection(redirects, lastResult, cwd, ctx.homeDir, fs, ctx.activeComputer, ctx.security);
    lastResult = redir.result;
    fs = redir.fs;
  }

  return { output: lastResult.output, fs, cwd, stopped: false, exitCode: lastResult.exitCode ?? 0 };
}

/** Execute a single line (may contain chain operators and pipelines). Returns exitCode. */
async function executeSingleLine(
  lineText: string,
  ctx: CommandContext,
  runningFs: VirtualFS,
  currentCwd: string,
  allTriggerEvents: GameEvent[],
  functions?: Map<string, ScriptNode[]>,
): Promise<{ output: string; fs: VirtualFS; cwd: string; stopped: boolean; exitCode: number }> {
  // Strip stderr redirects before parsing
  const cleanedText = stripStderrRedirects(lineText);
  const chain = parseChainedPipeline(cleanedText, "bash");

  // Check for parse errors in any segment
  for (const seg of chain) {
    const parseError = seg.pipeline.find((p) => p.error);
    if (parseError) {
      return { output: parseError.error!, fs: runningFs, cwd: currentCwd, stopped: false, exitCode: 2 };
    }
  }

  let fs = runningFs;
  let cwd = currentCwd;
  let lastExitCode = 0;
  const outputs: string[] = [];

  for (const seg of chain) {
    // Check chain operator logic
    if (seg.operator === '&&' && lastExitCode !== 0) continue;
    if (seg.operator === '||' && lastExitCode === 0) continue;
    // ';' and null (first segment): always execute

    const pipeline = [...seg.pipeline];

    // Extract redirection from last pipeline command (quote-aware)
    const lastSegment = pipeline[pipeline.length - 1];
    const { command: stripped, redirects, parseError } =
      extractStdoutRedirect(lastSegment.raw);
    if (parseError) {
      outputs.push(parseError);
      lastExitCode = 1;
      continue;
    }
    if (redirects.length > 0) {
      // Redirect targets are opened before exec — a bad target means the command never runs
      const precheckError = precheckRedirects(redirects, cwd, ctx.homeDir, fs);
      if (precheckError) {
        outputs.push(precheckError);
        lastExitCode = 1;
        continue;
      }
      pipeline[pipeline.length - 1] = parseInput(stripped);
    }

    const result = await executePipeline(
      pipeline, { ...ctx, fs, cwd }, fs, cwd, allTriggerEvents, functions, redirects,
    );

    if (result.output) outputs.push(result.output);
    fs = result.fs;
    cwd = result.cwd;
    lastExitCode = result.exitCode;

    if (result.stopped) {
      return { output: outputs.join("\n"), fs, cwd, stopped: true, exitCode: lastExitCode };
    }
  }

  return { output: outputs.join("\n"), fs, cwd, stopped: false, exitCode: lastExitCode };
}

// ---------------------------------------------------------------------------
// Execution context + node executor
// ---------------------------------------------------------------------------

interface ExecContext {
  ctx: CommandContext;
  variables: Map<string, string>;
  functions: Map<string, ScriptNode[]>;
  allTriggerEvents: GameEvent[];
  positionalArgs?: string[];
}

/**
 * Quote-aware scan: does `text` contain an unquoted top-level statement
 * separator (`;`, `|`, `&&`, `||`)? Used to detect compound lines so the
 * assignment classifier doesn't swallow them.
 */
function hasTopLevelSeparator(text: string): boolean {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (inSingle || inDouble) continue;
    if (ch === ";") return true;
    if (ch === "|") return true; // covers both `|` and `||`
    if (ch === "&" && text[i + 1] === "&") return true;
  }
  return false;
}

/** Apply an assignment to exec.variables. Mirrors the `case "assignment":` body. */
async function applyAssignment(
  exec: ExecContext,
  name: string,
  rawValue: string,
  fs: VirtualFS,
  cwd: string,
  allTriggerEvents: GameEvent[],
): Promise<{ fs: VirtualFS; cwd: string }> {
  const isSingleQuoted = rawValue.startsWith("'") && rawValue.endsWith("'") && rawValue.length >= 2;
  const unquoted = stripOuterQuotes(rawValue);

  if (isSingleQuoted) {
    exec.variables.set(name, unquoted);
    return { fs, cwd };
  }

  const varExpanded = expandVariables(unquoted, exec.variables, exec.positionalArgs);
  const subExpanded = await expandSubstitutions(
    varExpanded, exec.ctx, fs, cwd, allTriggerEvents, 0,
  );
  exec.variables.set(name, subExpanded.text);
  return { fs: subExpanded.fs, cwd: subExpanded.cwd };
}

/** Strip matching outer quotes from a string. */
function stripOuterQuotes(s: string): string {
  if (s.length >= 2) {
    if ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}

/** Execute an array of ScriptNodes. */
async function executeNodes(
  nodes: ScriptNode[],
  exec: ExecContext,
  runningFs: VirtualFS,
  currentCwd: string,
): Promise<{ outputs: string[]; fs: VirtualFS; cwd: string; exitCode: number; stopped: boolean }> {
  const outputs: string[] = [];
  let fs = runningFs;
  let cwd = currentCwd;
  let exitCode = 0;

  for (const node of nodes) {
    switch (node.type) {
      case "assignment": {
        const next = await applyAssignment(exec, node.name, node.value, fs, cwd, exec.allTriggerEvents);
        fs = next.fs;
        cwd = next.cwd;
        break;
      }

      case "function": {
        exec.functions.set(node.name, node.body);
        break;
      }

      case "if": {
        // Execute condition
        const condExpanded = expandVariables(node.condition, exec.variables, exec.positionalArgs);
        const condSub = await expandSubstitutions(
          condExpanded, exec.ctx, fs, cwd, exec.allTriggerEvents, 0,
        );
        fs = condSub.fs;
        cwd = condSub.cwd;

        const condResult = await executeSingleLine(
          condSub.text,
          { ...exec.ctx, fs, cwd },
          fs, cwd, exec.allTriggerEvents, exec.functions,
        );
        fs = condResult.fs;
        cwd = condResult.cwd;

        // Branch based on exit code
        const body = condResult.exitCode === 0 ? node.thenBody : node.elseBody;
        if (body.length > 0) {
          const bodyResult = await executeNodes(body, exec, fs, cwd);
          outputs.push(...bodyResult.outputs);
          fs = bodyResult.fs;
          cwd = bodyResult.cwd;
          exitCode = bodyResult.exitCode;
          if (bodyResult.stopped) {
            return { outputs, fs, cwd, exitCode, stopped: true };
          }
        }
        break;
      }

      case "command": {
        // Expand variables, then command substitutions
        let expanded = expandVariables(node.text, exec.variables, exec.positionalArgs);
        const subExpanded = await expandSubstitutions(
          expanded, exec.ctx, fs, cwd, exec.allTriggerEvents, 0,
        );
        fs = subExpanded.fs;
        cwd = subExpanded.cwd;
        expanded = subExpanded.text;

        // Check if command name is a defined function
        const parsed = parsePipeline(stripStderrRedirects(expanded));
        const firstCmd = parsed[0];
        if (firstCmd && firstCmd.command && exec.functions.has(firstCmd.command) && parsed.length === 1) {
          const funcBody = exec.functions.get(firstCmd.command)!;
          const funcArgs = firstCmd.args;
          const funcExec: ExecContext = {
            ...exec,
            positionalArgs: funcArgs,
          };
          const funcResult = await executeNodes(funcBody, funcExec, fs, cwd);
          outputs.push(...funcResult.outputs);
          fs = funcResult.fs;
          cwd = funcResult.cwd;
          exitCode = funcResult.exitCode;
          if (funcResult.stopped) {
            return { outputs, fs, cwd, exitCode, stopped: true };
          }
          break;
        }

        // Normal command execution (handles command -v, redirection, etc.)
        const result = await executeSingleLine(
          expanded,
          { ...exec.ctx, fs, cwd },
          fs, cwd, exec.allTriggerEvents, exec.functions,
        );

        if (result.output) {
          outputs.push(result.output);
        }
        fs = result.fs;
        cwd = result.cwd;
        exitCode = result.exitCode;

        if (result.stopped) {
          return { outputs, fs, cwd, exitCode, stopped: true };
        }
        break;
      }
    }
  }

  return { outputs, fs, cwd, exitCode, stopped: false };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Execute a script's content. Exported for use by the registry path-execution fallback. */
export async function executeScript(
  content: string,
  ctx: CommandContext,
  positionalArgs?: string[],
): Promise<CommandResult> {
  const nodes = parseScript(content);
  const exec: ExecContext = {
    ctx,
    variables: new Map(),
    functions: new Map(),
    allTriggerEvents: [],
    positionalArgs,
  };

  const result = await executeNodes(nodes, exec, ctx.fs, ctx.cwd);

  const combinedResult: CommandResult = {
    output: result.outputs.join("\n"),
    exitCode: result.exitCode,
    triggerEvents: exec.allTriggerEvents.length > 0 ? exec.allTriggerEvents : undefined,
  };

  if (result.fs !== ctx.fs) {
    combinedResult.newFs = result.fs;
  }

  // Do NOT propagate newCwd — script runs in a subshell

  return combinedResult;
}

const bashHandler: AsyncCommandHandler = async (args, flags, ctx) => {
  // bash -c "command string"
  if (flags.c) {
    const cmdString = args.join(" ");
    if (!cmdString) {
      return { output: "bash: -c: option requires an argument" };
    }
    return executeScript(cmdString, ctx);
  }

  // bash (no args) — not supported
  if (args.length === 0) {
    return {
      output: "bash: interactive mode not supported. Usage: bash <script.sh> or bash -c \"command\"",
    };
  }

  // bash script.sh — read file and execute
  const filePath = resolvePath(args[0], ctx.cwd, ctx.homeDir);

  // Intercept auto_apply.py on home PC
  if (ctx.activeComputer === "home" && filePath.endsWith("/auto_apply.py")) {
    const { simulateAutoApply } = await import("./python");
    return simulateAutoApply(args.slice(1));
  }

  const fileResult = ctx.fs.readFile(filePath);
  if (fileResult.error) {
    return { output: `bash: ${args[0]}: No such file or directory`, exitCode: 1 };
  }

  const result = await executeScript(fileResult.content!, ctx, args.slice(1));

  // Add file_read event for the script file itself
  const scriptEvent: GameEvent = { type: "file_read", detail: filePath };
  const events = result.triggerEvents ? [scriptEvent, ...result.triggerEvents] : [scriptEvent];
  return { ...result, triggerEvents: events };
};

const description = "Execute shell scripts";
registerAsync("bash", bashHandler, description, HELP_TEXTS.bash);
setKnownFlags("bash", { short: ["c"] });
registerAlias("sh", "bash");
setKnownFlags("sh", { short: ["c"] });
registerAlias("zsh", "bash");
setKnownFlags("zsh", { short: ["c"] });
