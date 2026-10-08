// Store-agnostic pipeline orchestrator shared by both apps.
//
// Owns the chained-segment loop (`&&`/`||`/`;`), per-segment stdout
// redirection, the per-pipe command execution with stdin threading, and
// trigger-event/security-violation accumulation. Everything app-specific
// (Zustand writes, computeEffects wiring, terminal rendering, sessions,
// transitions) is injected via callbacks — the same injection pattern as
// `ApplyContext.processDeliveries`.
import { CommandContext, CommandResult, ChainSegment, ParsedCommand } from "./types";
import { parseInput, parsedFromTokens } from "./parser";
import { expandWords, makeShellLookup } from "./expansion";
import { execute, executeAsync, isAsyncCommand, commandReadsFiles } from "./registry";
import { applyRedirection, extractStdoutRedirect, extractStderrRedirect, precheckRedirects, StderrMode } from "./redirection";
import { SecurityPolicy } from "./security";
import { VirtualFS } from "../filesystem/VirtualFS";
import { Mounts } from "../filesystem/mounts";
import { resolvePath } from "../lib/pathUtils";
import { stripAnsi, colorize, ansi } from "../lib/ansi";
import { MachineId } from "../machine";

/** Check if a command result contains fields that require stopping the chain. */
export function isChainEarlyReturn(result: CommandResult): boolean {
  return !!(result.editorSession || result.interactiveSession || result.snowSqlSession ||
    result.sshSession || result.chipSession || result.piperSession || result.promptSession ||
    result.incrementalLines || result.transitionTo);
}

/** Accumulated running state, passed to `applySegment` and returned at the end. */
export interface PipelineRunState {
  fs: VirtualFS;
  cwd: string;
  mounts: Mounts;
  lastExitCode: number;
}

/** Chain-control decision returned by `applySegment` after applying one segment's effects. */
export interface ApplySegmentOutcome {
  /** cwd change (from `cd` etc.) to thread into subsequent segments. */
  newCwd?: string;
  /** Segment triggered a session/transition/incremental — abort remaining segments. */
  stopChain?: boolean;
  /** Suppress the caller's prompt (e.g. a session or transition took over). */
  earlyReturn?: boolean;
}

export interface RunPipelineOptions {
  /** Alias-expanded, parsed chain (caller runs `expandAliases` + `parseChainedPipeline`). */
  chain: ChainSegment[];
  fs: VirtualFS;
  cwd: string;
  homeDir: string;
  mounts?: Mounts;

  /**
   * Exit status of the *previous* submitted line in this shell, for `$?`. The
   * caller owns the continuity: `$?` is per-shell (per pane), and a fresh shell
   * starts at 0, so the apps keep it in a per-pane ref/store field rather than
   * persisting it. Omit for a fresh shell.
   */
  initialExitCode?: number;

  /** Build the per-command CommandContext; the loop supplies the varying parts. */
  buildContext(args: {
    fs: VirtualFS;
    cwd: string;
    stdin: string | undefined;
    rawArgs: string[];
    isPiped: boolean;
    mounts: Mounts;
  }): CommandContext;

  /** Write error/status text to the terminal (redirect errors, async "Loading..."). */
  write(text: string): void;

  /** Enable zsh stdout redirection (`>`/`>>`). Omit to disable. */
  redirection?: { computerId: MachineId; securityPolicy?: SecurityPolicy };

  /** Emit `file_read` trigger events for intermediate piped commands. Default false. */
  intermediateFileReadEvents?: boolean;

  /**
   * Apply one segment's final CommandResult (computeEffects + store/terminal
   * writes). `isFinal` is true for the last executed segment of the chain.
   */
  applySegment(
    result: CommandResult,
    lastParsed: ParsedCommand,
    state: PipelineRunState,
    isFinal: boolean
  ): ApplySegmentOutcome | Promise<ApplySegmentOutcome> | void;
}

export interface RunPipelineResult extends PipelineRunState {
  earlyReturn: boolean;
}

/** Cheap gate: only these characters can make a word expand into something else. */
const EXPANDABLE = /[$*?[]/;

/**
 * Expand `$VAR` then filename globs in every pipeline stage's argv, rewriting
 * the stages in place. Returns zsh's `nomatch` message when a pattern matched
 * nothing (the caller must then skip the whole segment without running it),
 * otherwise `undefined`.
 *
 * Scope notes (see the commands skill): argv only. Redirect targets have
 * already been split off by the time this runs and are left exactly as typed,
 * so `> $F` writes a file called `$F`.
 *
 * The env map is read through `buildContext` rather than a snapshot on
 * `RunPipelineOptions`, so it is always the app's *current* env (term-crunch
 * mutates a local, termoil reads the store) and `export X=1 && echo $X` works.
 * The extra context build only happens for a segment that actually mentions
 * `$`.
 */
function expandSegmentWords(
  pipeline: ParsedCommand[],
  run: {
    fs: VirtualFS;
    cwd: string;
    homeDir: string;
    mounts: Mounts;
    lastExitCode: number;
    opts: RunPipelineOptions;
  },
): string | undefined {
  const candidates: number[] = [];
  let needsVars = false;
  for (let pi = 0; pi < pipeline.length; pi++) {
    if (!pipeline[pi].command || !EXPANDABLE.test(pipeline[pi].raw)) continue;
    candidates.push(pi);
    if (pipeline[pi].raw.includes("$")) needsVars = true;
  }
  if (candidates.length === 0) return undefined;

  const ctx = needsVars
    ? run.opts.buildContext({
        fs: run.fs, cwd: run.cwd, stdin: undefined, rawArgs: [], isPiped: false, mounts: run.mounts,
      })
    : undefined;
  const lookup = makeShellLookup({
    envVars: ctx?.envVars,
    homeDir: run.homeDir,
    cwd: run.cwd,
    username: ctx?.username,
    lastExitCode: run.lastExitCode,
  });

  for (const pi of candidates) {
    const raw = pipeline[pi].raw;
    const { tokens, error } = expandWords(raw, {
      fs: run.fs, cwd: run.cwd, homeDir: run.homeDir, lookup,
    });
    if (error) return error;
    pipeline[pi] = parsedFromTokens(tokens, raw);
  }
  return undefined;
}

export async function runPipeline(opts: RunPipelineOptions): Promise<RunPipelineResult> {
  let runningFs = opts.fs;
  let runningCwd = opts.cwd;
  let runningMounts: Mounts = opts.mounts ?? {};
  let lastExitCode = opts.initialExitCode ?? 0;
  let earlyReturn = false;
  let wroteOutput = false;
  const { chain, homeDir } = opts;

  for (let ci = 0; ci < chain.length; ci++) {
    const seg = chain[ci];

    if (seg.operator === "&&" && lastExitCode !== 0) continue;
    if (seg.operator === "||" && lastExitCode === 0) continue;
    // ';' and null (first): always execute

    const pipeline = [...seg.pipeline];

    /** Write a zsh error, fail the segment, and skip execution. */
    const rejectSegment = (message: string) => {
      if (wroteOutput) opts.write("\r\n");
      opts.write(colorize(message, ansi.red));
      wroteOutput = true;
      lastExitCode = 1;
    };

    // Extract redirection (per-segment). Stdout targets are read off the LAST
    // pipeline command, as zsh's `a | b > f` does; `2>` tokens are stripped
    // from every stage (otherwise `cat x 2>/dev/null | wc -l` hands cat a file
    // called "2>/dev/null") and the resulting disposition applies segment-wide.
    let redirects: ReturnType<typeof extractStdoutRedirect>["redirects"] = [];
    let stderrMode: StderrMode = "default";
    if (opts.redirection) {
      let syntaxError: string | undefined;
      for (let pi = 0; pi < pipeline.length - 1; pi++) {
        const ext = extractStderrRedirect(pipeline[pi].raw);
        syntaxError ??= ext.parseError;
        if (ext.mode !== "default") {
          stderrMode = ext.mode;
          pipeline[pi] = parseInput(ext.command);
        }
      }

      const extracted = extractStdoutRedirect(pipeline[pipeline.length - 1].raw);
      syntaxError ??= extracted.parseError;
      if (syntaxError) {
        rejectSegment(syntaxError);
        continue;
      }
      if (extracted.stderrMode !== "default") stderrMode = extracted.stderrMode;
      redirects = extracted.redirects;
      if (redirects.length > 0) {
        // zsh opens redirect targets before exec — a bad target means the command never runs
        const precheckError = precheckRedirects(redirects, runningCwd, homeDir, runningFs);
        if (precheckError) {
          rejectSegment(precheckError);
          continue;
        }
      }
      if (extracted.command !== pipeline[pipeline.length - 1].raw.trim()) {
        pipeline[pipeline.length - 1] = parseInput(extracted.command);
      }
    }

    // Word expansion (`$VAR`, then globs) over every stage's argv. It runs
    // AFTER the redirect split above, so redirect targets are never expanded,
    // and inside the chain loop, so `$?` and a just-`export`ed var are current.
    const expansionError = expandSegmentWords(pipeline, {
      fs: runningFs, cwd: runningCwd, homeDir, mounts: runningMounts, lastExitCode, opts,
    });
    if (expansionError) {
      rejectSegment(expansionError);
      continue;
    }

    const hasAsyncCmd = pipeline.some((p) => isAsyncCommand(p.command));
    if (hasAsyncCmd) {
      if (wroteOutput) opts.write("\r\n");
      opts.write(colorize("Loading...", ansi.dim));
    }

    let stdin: string | undefined; // reset per chain segment
    let lastResult: CommandResult = { output: "" };
    const allTriggerEvents: NonNullable<CommandResult["triggerEvents"]> = [];
    let pipelineViolation: CommandResult["securityViolation"];
    // stderr from EVERY stage, not just the last one: `cat nosuch | wc -l` has
    // to show cat's error even though wc produced the segment's stdout.
    const pipelineStderr: string[] = [];
    const deferredCommands: NonNullable<CommandResult["deferredCommands"]> = [];

    for (let pi = 0; pi < pipeline.length; pi++) {
      const p = pipeline[pi];
      if (!p.command) continue;

      const ctx = opts.buildContext({
        fs: runningFs,
        cwd: runningCwd,
        stdin,
        rawArgs: p.rawArgs,
        isPiped: pi < pipeline.length - 1 || redirects.length > 0,
        mounts: runningMounts,
      });

      lastResult = isAsyncCommand(p.command)
        ? await executeAsync(p.command, p.args, p.flags, ctx)
        : execute(p.command, p.args, p.flags, ctx);

      if (lastResult.triggerEvents) {
        allTriggerEvents.push(...lastResult.triggerEvents);
      }

      if (lastResult.stderr) pipelineStderr.push(lastResult.stderr);
      if (lastResult.deferredCommands) deferredCommands.push(...lastResult.deferredCommands);

      if (lastResult.securityViolation && !pipelineViolation) {
        pipelineViolation = lastResult.securityViolation;
      }

      // Intermediate pipeline commands: generate file_read events
      if (opts.intermediateFileReadEvents && pi < pipeline.length - 1 && commandReadsFiles(p.command)) {
        for (const arg of p.args) {
          if (!arg.startsWith("-")) {
            const absPath = resolvePath(arg, runningCwd, homeDir);
            if (!runningFs.readFile(absPath).error) {
              allTriggerEvents.push({ type: "file_read" as const, detail: absPath });
            }
          }
        }
      }

      if (lastResult.newFs) runningFs = lastResult.newFs;
      if (lastResult.newMounts) runningMounts = lastResult.newMounts;

      stdin = stripAnsi(lastResult.output);
    }

    if (allTriggerEvents.length > 0) {
      lastResult = { ...lastResult, triggerEvents: allTriggerEvents };
    }
    if (deferredCommands.length > 0) lastResult = { ...lastResult, deferredCommands };

    if (pipelineViolation && !lastResult.securityViolation) {
      lastResult = { ...lastResult, securityViolation: pipelineViolation };
    }

    // Every stage's stderr becomes the segment's stderr. It deliberately does
    // NOT go through `applyRedirection` below (fd 2 is not what `>` captures),
    // so the diagnostics reach the terminal even when stdout goes to a file.
    // `2>/dev/null` drops it; `2>&1` folds it into stdout *before* the redirect
    // so it lands in the file with the rest.
    const segStderr = pipelineStderr.join("\n");
    if (segStderr && stderrMode === "merge") {
      lastResult = { ...lastResult, output: [segStderr, lastResult.output].filter(Boolean).join("\n"), stderr: undefined };
    } else {
      lastResult = {
        ...lastResult,
        stderr: segStderr && stderrMode === "default" ? segStderr : undefined,
      };
    }

    if (opts.redirection && redirects.length > 0) {
      const redir = applyRedirection(
        redirects, lastResult, runningCwd, homeDir, runningFs,
        opts.redirection.computerId, opts.redirection.securityPolicy,
      );
      lastResult = redir.result;
      runningFs = redir.fs;
    }

    lastExitCode = lastResult.exitCode ?? 0;

    if (hasAsyncCmd) {
      opts.write("\r\x1b[K");
    }

    // Output carries no trailing newline (the next prompt supplies it), so the
    // line break between two printing segments is ours to write. Hosts write
    // the segment's output raw inside applySegment, right after this.
    if (lastResult.clearScreen) wroteOutput = false;
    const prints = !!(lastResult.output || lastResult.stderr || lastResult.incrementalLines?.length);
    // An async segment's "Loading..." line was just cleared in place, so the
    // cursor already sits at the start of a fresh line.
    if (wroteOutput && prints && !hasAsyncCmd) opts.write("\r\n");
    if (prints) wroteOutput = true;

    const isFinal = ci === chain.length - 1 || isChainEarlyReturn(lastResult);
    const state: PipelineRunState = { fs: runningFs, cwd: runningCwd, mounts: runningMounts, lastExitCode };
    const outcome = (await opts.applySegment(lastResult, pipeline[pipeline.length - 1], state, isFinal)) ?? {};

    if (outcome.newCwd) runningCwd = outcome.newCwd;
    earlyReturn = outcome.earlyReturn ?? false;

    if (isChainEarlyReturn(lastResult) || outcome.stopChain || earlyReturn) break;
  }

  return { fs: runningFs, cwd: runningCwd, mounts: runningMounts, lastExitCode, earlyReturn };
}
