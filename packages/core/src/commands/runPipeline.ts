// Store-agnostic pipeline orchestrator shared by both apps.
//
// Owns the chained-segment loop (`&&`/`||`/`;`), per-segment stdout
// redirection, the per-pipe command execution with stdin threading, and
// trigger-event/security-violation accumulation. Everything app-specific
// (Zustand writes, computeEffects wiring, terminal rendering, sessions,
// transitions) is injected via callbacks — the same injection pattern as
// `ApplyContext.processDeliveries`.
import { CommandContext, CommandResult, ChainSegment, ParsedCommand } from "./types";
import { parseInput } from "./parser";
import { execute, executeAsync, isAsyncCommand, commandReadsFiles } from "./registry";
import { applyRedirection, extractStdoutRedirect, precheckRedirects } from "./redirection";
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

export async function runPipeline(opts: RunPipelineOptions): Promise<RunPipelineResult> {
  let runningFs = opts.fs;
  let runningCwd = opts.cwd;
  let runningMounts: Mounts = opts.mounts ?? {};
  let lastExitCode = 0;
  let earlyReturn = false;
  let wroteOutput = false;
  const { chain, homeDir } = opts;

  for (let ci = 0; ci < chain.length; ci++) {
    const seg = chain[ci];

    if (seg.operator === "&&" && lastExitCode !== 0) continue;
    if (seg.operator === "||" && lastExitCode === 0) continue;
    // ';' and null (first): always execute

    const pipeline = [...seg.pipeline];

    // Extract redirection from the last pipeline command (per-segment)
    let redirects: ReturnType<typeof extractStdoutRedirect>["redirects"] = [];
    if (opts.redirection) {
      const lastSegment = pipeline[pipeline.length - 1];
      const extracted = extractStdoutRedirect(lastSegment.raw);
      if (extracted.parseError) {
        if (wroteOutput) opts.write("\r\n");
        opts.write(colorize(extracted.parseError, ansi.red));
        wroteOutput = true;
        lastExitCode = 1;
        continue;
      }
      redirects = extracted.redirects;
      if (redirects.length > 0) {
        // zsh opens redirect targets before exec — a bad target means the command never runs
        const precheckError = precheckRedirects(redirects, runningCwd, homeDir, runningFs);
        if (precheckError) {
          if (wroteOutput) opts.write("\r\n");
          opts.write(colorize(precheckError, ansi.red));
          wroteOutput = true;
          lastExitCode = 1;
          continue;
        }
        pipeline[pipeline.length - 1] = parseInput(extracted.command);
      }
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

    if (pipelineViolation && !lastResult.securityViolation) {
      lastResult = { ...lastResult, securityViolation: pipelineViolation };
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
    if (lastResult.output) wroteOutput = true;

    if (hasAsyncCmd) {
      opts.write("\r\x1b[K");
    }

    const isFinal = ci === chain.length - 1 || isChainEarlyReturn(lastResult);
    const state: PipelineRunState = { fs: runningFs, cwd: runningCwd, mounts: runningMounts, lastExitCode };
    const outcome = (await opts.applySegment(lastResult, pipeline[pipeline.length - 1], state, isFinal)) ?? {};

    if (outcome.newCwd) runningCwd = outcome.newCwd;
    earlyReturn = outcome.earlyReturn ?? false;

    if (isChainEarlyReturn(lastResult) || outcome.stopChain || earlyReturn) break;
  }

  return { fs: runningFs, cwd: runningCwd, mounts: runningMounts, lastExitCode, earlyReturn };
}
