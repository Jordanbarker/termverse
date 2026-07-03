import type { Terminal } from "@xterm/xterm";
import { expandAliases, parseChainedPipeline } from "@tt/core/commands/parser";
import { execute, executeAsync, isAsyncCommand, getAvailableCommands } from "@tt/core/commands/registry";
import { computeEffects, type ApplyContext, type SessionToStart } from "@tt/core/commands/applyResult";
import type { CommandContext, CommandResult } from "@tt/core/commands/types";
import { parseZshHistory } from "@tt/core/terminal/zshHistory";
import { findLeaf } from "@tt/core/terminal/paneTypes";
import type { SuggestionContext } from "@tt/core/suggestions/suggest";
// Side-effect import: registers every builtin (ls/cd/cat/git/echo/...) into the registry.
import "@tt/core/commands/builtins";
// Side-effect import: registers the per-challenge command-allowlist policy.
import "../lib/availabilityPolicy";

import { useGameStore } from "../state/gameStore";
import { CRUNCH_MACHINE, HOME_DIR, USERNAME, GIT_AUTHOR } from "../lib/machine";

const HIST_PATH = `${HOME_DIR}/.zsh_history`;

/** Convert engine `\n` line breaks to terminal `\r\n`. */
function writeOut(term: Terminal, text: string): void {
  if (text) term.write(text.replace(/\n/g, "\r\n"));
}

function shortenCwd(cwd: string): string {
  if (cwd === HOME_DIR) return "~";
  if (cwd.startsWith(HOME_DIR + "/")) return "~" + cwd.slice(HOME_DIR.length);
  return cwd;
}

/** Coloured prompt for a given pane, e.g. `player@crunch:~/project$ `. */
export function getPrompt(paneId: string): string {
  const { windows } = useGameStore.getState();
  const win = windows.find((w) => findLeaf(w.root, paneId));
  const cwd = win ? findLeaf(win.root, paneId)?.cwd ?? HOME_DIR : HOME_DIR;
  return `\x1b[32m${USERNAME}@crunch\x1b[0m:\x1b[34m${shortenCwd(cwd)}\x1b[0m$ `;
}

/**
 * Build the context the shared `@tt/core/suggestions` engine needs for ghost-text
 * autosuggestions and TAB completion in a given pane. Completable commands honor
 * the current challenge's allowlist (`getAvailableCommands`), so suggestions match
 * what `help` lists.
 */
export function buildSuggestionContext(paneId: string): SuggestionContext {
  const { windows, fs, aliases } = useGameStore.getState();
  const win = windows.find((w) => findLeaf(w.root, paneId));
  const cwd = win ? findLeaf(win.root, paneId)?.cwd ?? HOME_DIR : HOME_DIR;
  return {
    commandHistory: parseZshHistory(fs.readFile(HIST_PATH).content ?? ""),
    commandNames: getAvailableCommands(CRUNCH_MACHINE).map((c) => c.name),
    aliasNames: Object.keys(aliases),
    aliases,
    fs,
    cwd,
    homeDir: HOME_DIR,
  };
}

function appendHistory(content: string, input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return content;
  const lines = content.split("\n").filter((l) => l.length > 0);
  if (lines[lines.length - 1] === trimmed) return content; // HIST_IGNORE_DUPS
  const sep = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  return content + sep + trimmed + "\n";
}

/**
 * Run a full command line (alias-expanded, chained, piped) in the given pane,
 * writing output to its terminal and committing FS/cwd/env to the store. Returns
 * a session to start when a command opens one (nano/less) so the caller can
 * instantiate it against this pane's terminal.
 *
 * Lean port of useTerminal.ts: no redirects, story flags, deliveries, or
 * multi-machine routing (none are needed by the term-crunch challenges).
 */
export async function runLine(
  term: Terminal,
  paneId: string,
  input: string
): Promise<{ startSession?: SessionToStart }> {
  const store = useGameStore.getState();
  const win = store.windows.find((w) => findLeaf(w.root, paneId));
  const startCwd = win ? findLeaf(win.root, paneId)?.cwd ?? HOME_DIR : HOME_DIR;

  const expanded = expandAliases(input, store.aliases);
  const chain = parseChainedPipeline(expanded);

  const errCmd = chain.flatMap((s) => s.pipeline).find((p) => p.error);
  if (errCmd?.error) {
    writeOut(term, `\x1b[31m${errCmd.error}\x1b[0m\n`);
    return {};
  }
  const empty = chain.length === 1 && chain[0].pipeline.length === 1 && !chain[0].pipeline[0].command;

  let runningFs = store.fs;
  let runningCwd = startCwd;
  let envVars = { ...store.envVars };
  let aliases = { ...store.aliases };
  let lastExit = 0;
  let startSession: SessionToStart | undefined;

  if (!empty) {
    for (const seg of chain) {
      if (seg.operator === "&&" && lastExit !== 0) continue;
      if (seg.operator === "||" && lastExit === 0) continue;

      let stdin: string | undefined;
      let lastResult: CommandResult = { output: "" };
      const allTrigger: NonNullable<CommandResult["triggerEvents"]> = [];

      for (let pi = 0; pi < seg.pipeline.length; pi++) {
        const p = seg.pipeline[pi];
        if (!p.command) continue;

        const ctx: CommandContext = {
          fs: runningFs,
          cwd: runningCwd,
          homeDir: HOME_DIR,
          username: USERNAME,
          activeComputer: CRUNCH_MACHINE,
          rawArgs: p.rawArgs,
          isPiped: pi < seg.pipeline.length - 1,
          stdin,
          commandHistory: parseZshHistory(runningFs.readFile(HIST_PATH).content ?? ""),
          envVars,
          setEnvVars: (e) => { envVars = e; },
          aliases,
          setAliases: (a) => { aliases = a; },
          gitAuthor: GIT_AUTHOR,
        };

        lastResult = isAsyncCommand(p.command)
          ? await executeAsync(p.command, p.args, p.flags, ctx)
          : execute(p.command, p.args, p.flags, ctx);

        if (lastResult.triggerEvents) allTrigger.push(...lastResult.triggerEvents);
        if (lastResult.newFs) runningFs = lastResult.newFs;
        stdin = lastResult.output;
      }

      if (allTrigger.length > 0) lastResult = { ...lastResult, triggerEvents: allTrigger };
      lastExit = lastResult.exitCode ?? 0;

      const lastParsed = seg.pipeline[seg.pipeline.length - 1];
      const applyCtx: ApplyContext = {
        parsedCommand: lastParsed.command,
        parsedArgs: lastParsed.args,
        cwd: runningCwd,
        homeDir: HOME_DIR,
        activeComputer: CRUNCH_MACHINE,
        username: USERNAME,
        deliveredEmailIds: [],
        deliveredPiperIds: [],
        storyFlags: {},
        fs: runningFs,
      };
      const effects = computeEffects(lastResult, applyCtx);

      if (effects.newFs) runningFs = effects.newFs;
      if (effects.newCwd) runningCwd = effects.newCwd;
      if (effects.clearScreen) term.clear();
      writeOut(term, effects.output);

      if (effects.startSession?.type === "editor" || effects.startSession?.type === "less") {
        startSession = effects.startSession;
        break; // session takes over the screen — stop the chain
      }
    }
  }

  // Append to history, then commit shell state to the store.
  const histContent = runningFs.readFile(HIST_PATH).content ?? "";
  const newHist = appendHistory(histContent, input);
  if (newHist !== histContent) {
    const w = runningFs.writeFile(HIST_PATH, newHist);
    if (w.fs) runningFs = w.fs;
  }

  store.setFs(runningFs);
  store.setEnvVars(envVars);
  store.setAliases(aliases);
  store.setPaneCwd(paneId, runningCwd);
  store.checkCompletion();

  return { startSession };
}
