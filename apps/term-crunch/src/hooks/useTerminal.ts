import type { Terminal } from "@xterm/xterm";
import { expandAliases, parseChainedPipeline } from "@tt/core/commands/parser";
import { getAvailableCommands } from "@tt/core/commands/registry";
import { runPipeline } from "@tt/core/commands/runPipeline";
import { computeEffects, type ApplyContext, type SessionToStart } from "@tt/core/commands/applyResult";
import type { TmuxAction } from "@tt/core/commands/types";
import { parseZshHistory, appendZshHistory } from "@tt/core/terminal/zshHistory";
import { findLeaf } from "@tt/core/terminal/paneTypes";
import type { SuggestionContext } from "@tt/core/suggestions/suggest";
// Side-effect import: registers every builtin (ls/cd/cat/git/echo/...) into the registry.
import "@tt/core/commands/builtins";
// Side-effect import: registers the per-challenge command-allowlist policy.
import "../lib/availabilityPolicy";
// Registers the challenge-navigation builtins (challenges/goto/next/prev/track)
// and exposes the pending navigation they queue for post-commit application.
import { consumePendingNavigation } from "../engine/commands/navigation";

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

/**
 * Run a full command line (alias-expanded, chained, piped) in the given pane,
 * writing output to its terminal and committing FS/cwd/env to the store. Returns
 * a session to start when a command opens one (nano/less) so the caller can
 * instantiate it against this pane's terminal.
 *
 * Thin wrapper over the shared @tt/core runPipeline: no redirects, story
 * flags, deliveries, or multi-machine routing (none are needed by the
 * term-crunch challenges).
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

  let envVars = { ...store.envVars };
  let aliases = { ...store.aliases };
  let runningFs = store.fs;
  let runningCwd = startCwd;
  let startSession: SessionToStart | undefined;
  let tmuxAction: TmuxAction | undefined;

  if (!empty) {
    const run = await runPipeline({
      chain,
      fs: store.fs,
      cwd: startCwd,
      homeDir: HOME_DIR,
      buildContext: ({ fs, cwd, stdin, rawArgs, isPiped }) => ({
        fs,
        cwd,
        homeDir: HOME_DIR,
        username: USERNAME,
        activeComputer: CRUNCH_MACHINE,
        rawArgs,
        isPiped,
        stdin,
        commandHistory: parseZshHistory(fs.readFile(HIST_PATH).content ?? ""),
        envVars,
        setEnvVars: (e) => { envVars = e; },
        aliases,
        setAliases: (a) => { aliases = a; },
        gitAuthor: GIT_AUTHOR,
        tmux: (() => {
          const s = useGameStore.getState();
          return {
            attachedSession: s.tmuxAttachedSession?.name ?? null,
            sessions: [
              ...(s.tmuxAttachedSession
                ? [{
                    name: s.tmuxAttachedSession.name,
                    windowCount: s.windows.length,
                    createdAt: s.tmuxAttachedSession.createdAt,
                    attached: true,
                  }]
                : []),
              // Detach order (most recent last) — bare attach targets the last.
              ...s.tmuxDetachedSessions.map((d) => ({
                name: d.name,
                windowCount: d.windows.length,
                createdAt: d.createdAt,
                attached: false,
              })),
            ],
          };
        })(),
      }),
      write: (t) => term.write(t),
      applySegment: (lastResult, lastParsed, state) => {
        const applyCtx: ApplyContext = {
          parsedCommand: lastParsed.command,
          parsedArgs: lastParsed.args,
          cwd: state.cwd,
          homeDir: HOME_DIR,
          activeComputer: CRUNCH_MACHINE,
          username: USERNAME,
          deliveredEmailIds: [],
          deliveredPiperIds: [],
          storyFlags: {},
          fs: state.fs,
        };
        const effects = computeEffects(lastResult, applyCtx);

        if (effects.newFs) runningFs = effects.newFs;
        if (effects.clearScreen) term.clear();
        writeOut(term, effects.output);

        if (effects.startSession?.type === "editor" || effects.startSession?.type === "less") {
          startSession = effects.startSession;
          return { newCwd: effects.newCwd, stopChain: true }; // session takes over the screen
        }
        if (effects.tmuxAction) {
          // Applied after the shell-state commit below (same timing shape as
          // the queued challenge navigation) — the swap replaces the panes.
          tmuxAction = effects.tmuxAction;
          return { newCwd: effects.newCwd, stopChain: true };
        }
        return { newCwd: effects.newCwd };
      },
    });
    // Prefer the effects-level FS (it bakes cd's new cwd into the VirtualFS);
    // fall back to the loop's accumulated FS when no segment produced one.
    if (runningFs === store.fs) runningFs = run.fs;
    runningCwd = run.cwd;
  }

  // Append to history, then commit shell state to the store.
  const histContent = runningFs.readFile(HIST_PATH).content ?? "";
  const newHist = appendZshHistory(histContent, input);
  if (newHist !== histContent) {
    const w = runningFs.writeFile(HIST_PATH, newHist);
    if (w.fs) runningFs = w.fs;
  }

  store.setFs(runningFs);
  store.setEnvVars(envVars);
  store.setAliases(aliases);
  store.setPaneCwd(paneId, runningCwd);
  store.checkCompletion();

  // Apply any navigation queued by challenges/goto/next/prev/track AFTER the
  // shell-state commit above, so loadChallenge's freshly seeded fs/windows
  // aren't clobbered by this pipeline's accumulated state.
  const nav = consumePendingNavigation();
  if (nav?.type === "load") store.loadChallenge(nav.index);
  else if (nav?.type === "category") store.selectCategory(nav.id);

  // tmux lifecycle swap — after the shell-state commit for the same reason.
  if (tmuxAction) store.applyTmuxAction(tmuxAction);

  return { startSession };
}
