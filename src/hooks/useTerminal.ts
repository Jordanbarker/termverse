import { useCallback, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore } from "../state/gameStore";
import { parseInput, parseChainedPipeline, expandAliases } from "../engine/commands/parser";
import { execute, executeAsync, isAsyncCommand, commandReadsFiles } from "../engine/commands/registry";
import { resolvePath } from "../lib/pathUtils";
import { colorize, ansi, stripAnsi } from "../lib/ansi";
import { expandZshPrompt } from "../lib/promptExpand";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { createDefaultContext } from "../engine/snowflake/session/context";
import { SaveSlotId } from "../state/saveTypes";
import { formatSlotName } from "../state/saveManager";
import { COMPUTERS, ComputerId } from "../state/types";
import { getComputerUsername } from "../story/player";
import { isCommandAvailable } from "../engine/commands/availability";
import { computeEffects, AppliedEffects } from "../engine/commands/applyResult";
import { CHECKPOINTS } from "../story/checkpoints";
import { useSessionRouter } from "./useSessionRouter";
import { useCommandLine } from "./useCommandLine";
import { useComputerTransitions } from "./useComputerTransitions";
import { CommandContext } from "../engine/commands/types";
import { parseTmuxPrefix } from "../engine/terminal/tmuxConfig";
import { CTRL_BACKSPACE } from "../engine/terminal/keyCodes";
import { parseZshHistory } from "../engine/terminal/zshHistory";
import { Mounts } from "../engine/filesystem/mounts";
import { applyRedirection, extractStdoutRedirect } from "../engine/commands/redirection";

// ---------------------------------------------------------------------------
// Module-scope helpers (no React dependencies)
// ---------------------------------------------------------------------------

// Per-computer command queue: serializes FS mutations to prevent TOCTOU races
// between tabs on the same computer.
const computerQueues: Partial<Record<ComputerId, Promise<void>>> = {};

function enqueueCommand(computerId: ComputerId, fn: () => void | Promise<void>): Promise<void> {
  const prev = computerQueues[computerId] ?? Promise.resolve();
  const next = prev.then(fn).catch((err) => { console.error("[enqueueCommand]", err); });
  computerQueues[computerId] = next;
  return next;
}

/** Build a CommandContext from the provided FS/cwd and store state. */
function buildCommandContext(
  fs: VirtualFS,
  cwd: string,
  computerId: ComputerId,
  homeDir: string,
  stdin: string | undefined,
  rawArgs: string[],
  isPiped: boolean,
  store: ReturnType<typeof useGameStore.getState>,
  mounts: Mounts
): CommandContext {
  return {
    fs,
    cwd,
    homeDir,
    username: store.username,
    activeComputer: computerId,
    storyFlags: store.storyFlags,
    stdin,
    rawArgs,
    isPiped,
    commandHistory: parseZshHistory(fs.readFile(`${homeDir}/.zsh_history`).content ?? ""),
    envVars: store.computerState[computerId]?.envVars ?? {},
    setEnvVars: (env: Record<string, string>) => store.setComputerEnv(computerId, env),
    aliases: store.computerState[computerId]?.aliases ?? {},
    setAliases: (a: Record<string, string>) => store.setComputerAliases(computerId, a),
    snowflakeState: store.snowflakeState,
    snowflakeContext: createDefaultContext(store.username),
    setSnowflakeState: store.setSnowflakeState,
    deliveredPiperIds: store.deliveredPiperIds,
    mounts,
    tabPrefixLabel: (() => {
      const homeFs = store.computerState.home?.fs;
      const conf = homeFs ? homeFs.readFile(`${homeFs.homeDir}/.tmux.conf`).content : undefined;
      return parseTmuxPrefix(conf).label;
    })(),
  };
}

/** Check if a command result contains fields that require stopping the chain. */
function isChainEarlyReturn(result: import("../engine/commands/types").CommandResult): boolean {
  return !!(result.editorSession || result.interactiveSession || result.snowSqlSession ||
    result.sshSession || result.chipSession || result.piperSession || result.promptSession ||
    result.incrementalLines || result.transitionTo);
}

// Ensure all builtins are registered
import "../engine/commands/builtins";

export function useTerminal() {
  const busyRef = useRef(false);
  const busyTabIdRef = useRef<string | null>(null);
  const confirmNewGameRef = useRef(false);
  const pendingNotificationsRef = useRef<{ email: number; piper: number } | null>(null);

  // Per-tab local refs — derived from active tab
  const initState = useGameStore.getState();
  const initTab = initState.tabs.find((t) => t.id === initState.activeTabId);
  const cwdRef = useRef(initTab?.cwd ?? `/home/${initState.username}`);
  const activeComputerRef = useRef<ComputerId>(initTab?.computerId ?? "home");

  // Sync refs whenever the active tab changes (e.g. addTab, setActiveTab, removeTab)
  useEffect(() => {
    const unsub = useGameStore.subscribe((state) => {
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (tab) {
        activeComputerRef.current = tab.computerId;
        cwdRef.current = tab.cwd;
      }
    });
    return unsub;
  }, []);

  const getPrompt = useCallback((currentCwd?: string) => {
    const store = useGameStore.getState();
    const computerId = activeComputerRef.current;
    const displayCwd = currentCwd || cwdRef.current;
    const sessionUser = getComputerUsername(computerId, store.username);
    const homeDir = store.computerState[computerId]?.fs?.homeDir ?? `/home/${sessionUser}`;
    const hostname = COMPUTERS[computerId].promptHostname;

    // Use PROMPT env var if set, otherwise fall back to hardcoded format
    const promptTemplate = store.computerState[computerId]?.envVars?.PROMPT;
    if (promptTemplate) {
      return expandZshPrompt(promptTemplate, {
        username: sessionUser,
        hostname,
        cwd: displayCwd,
        homeDir,
      });
    }

    const displayPath = displayCwd.startsWith(homeDir)
      ? "~" + displayCwd.slice(homeDir.length)
      : displayCwd;
    return `${colorize(`${sessionUser}@${hostname}`, ansi.bold, ansi.green)}:${colorize(displayPath, ansi.bold, ansi.blue)}$ `;
  }, []);

  const writePrompt = useCallback(
    (term: Terminal) => {
      term.write("\r\n" + getPrompt());
    },
    [getPrompt]
  );

  // Compose transition functions
  const { runShutdownTransition, dispatchTransition } = useComputerTransitions({
    cwdRef,
    activeComputerRef,
    writePrompt,
  });

  // Compose sub-hooks
  const sessionRouter = useSessionRouter({
    activeComputerRef,
    writePrompt,
    getPrompt,
    dispatchTransition,
    pendingNotificationsRef,
  });

  // Refresh piper session when switching back to its tab (picks up state changes from other tabs)
  const { refreshPiperSession } = sessionRouter;
  useEffect(() => {
    let prevTabId = useGameStore.getState().activeTabId;
    const unsub = useGameStore.subscribe((state) => {
      if (state.activeTabId !== prevTabId) {
        prevTabId = state.activeTabId;
        refreshPiperSession();
      }
    });
    return unsub;
  }, [refreshPiperSession]);

  const commandLine = useCommandLine({
    cwdRef,
    activeComputerRef,
    writePrompt,
  });

  /** Apply state-only effects (FS, cwd, story flags, email/piper deliveries). No terminal writes. */
  const applyStateEffects = useCallback(
    (effects: AppliedEffects, computerId: ComputerId) => {
      const store = useGameStore.getState();
      if (effects.newFs) {
        store.setComputerFs(computerId, effects.newFs);
      }
      if (effects.newCwd) {
        store.setTabCwd(store.activeTabId, effects.newCwd);
        cwdRef.current = effects.newCwd;
      }
      for (const update of effects.storyFlagUpdates) {
        useGameStore.getState().setStoryFlag(update.flag, update.value);
        if (update.toast) {
          useGameStore.getState().addToast(update.toast);
        }
      }
      if (effects.newDeliveredEmailIds.length > 0) {
        useGameStore.getState().addDeliveredEmails(effects.newDeliveredEmailIds);
      }
      if (effects.newDeliveredPiperIds.length > 0) {
        useGameStore.getState().addDeliveredPiperMessages(effects.newDeliveredPiperIds);
      }
    },
    []
  );

  /** Write email/piper notification lines to the terminal. */
  const writeNotifications = useCallback(
    (term: Terminal, effects: AppliedEffects) => {
      if (effects.emailNotifications > 0) {
        const username = useGameStore.getState().username;
        term.write(`\r\n${colorize(`You have new mail in /var/mail/${username}`, ansi.yellow, ansi.bold)}`);
      }
      if (effects.piperNotifications > 0) {
        const computerId = activeComputerRef.current;
        const storyFlags = useGameStore.getState().storyFlags;
        if (isCommandAvailable("piper", computerId, storyFlags)) {
          term.write(`\r\n${colorize("You have new messages on Piper", ansi.yellow, ansi.bold)}`);
        } else {
          useGameStore.getState().setPendingPiperNotification(true);
        }
      }
    },
    []
  );

  /** Execute the computed effects from applyResult. Returns true if prompt should be suppressed. */
  const executeEffects = useCallback(
    (term: Terminal, effects: AppliedEffects, tabId?: string) => {
      const computerId = activeComputerRef.current;

      /** Shared post-load logic: sync refs, clear screen, show message + prompt. */
      function finishLoad(t: Terminal, message: string): true {
        const state = useGameStore.getState();
        const loadedTab = state.tabs.find((tab) => tab.id === state.activeTabId);
        cwdRef.current = loadedTab?.cwd ?? `/home/${state.username}`;
        activeComputerRef.current = loadedTab?.computerId ?? "home";
        t.clear();
        t.write(colorize(`\r\n${message}\r\n`, ansi.cyan));
        t.write(getPrompt(cwdRef.current));
        return true;
      }

      if (effects.clearScreen) {
        term.clear();
      }

      // Incremental line-by-line rendering (e.g. dbt output)
      if (effects.incrementalLines) {
        applyStateEffects(effects, computerId);
        busyRef.current = true;
        busyTabIdRef.current = useGameStore.getState().activeTabId;
        const lines = effects.incrementalLines;
        let i = 0;
        const writeNext = () => {
          if (i < lines.length) {
            const line = lines[i];
            term.writeln(line.text.replace(/\n/g, "\r\n"));
            i++;
            setTimeout(writeNext, i < lines.length ? lines[i].delayMs : 0);
          } else {
            busyRef.current = false;
            busyTabIdRef.current = null;
            if (effects.gameAction?.type === "shutdown") {
              runShutdownTransition(term);
            } else if (effects.transitionTo && dispatchTransition(term, effects.transitionTo, computerId, effects.terminationReason)) {
              // dispatchTransition handles its own notifications/prompt
            } else {
              writeNotifications(term, effects);
              writePrompt(term);
            }
          }
        };
        writeNext();
        return true;
      }

      if (effects.output) {
        term.write(effects.output.replace(/\n/g, "\r\n"));
      }

      // Apply all state effects (FS, cwd, story flags, deliveries) before any early returns
      applyStateEffects(effects, computerId);

      // Close tabs for a given computer (e.g. coder stop disconnects devcontainer sessions)
      if (effects.closeTabsForComputer) {
        const store = useGameStore.getState();
        const tabsToClose = store.tabs.filter((t) => t.id !== store.activeTabId && t.computerId === effects.closeTabsForComputer);
        for (const t of tabsToClose) {
          store.removeTab(t.id);
        }
      }

      // Computer transitions — source-aware dispatch (see dispatchTransition for the matrix).
      if (effects.transitionTo) {
        if (dispatchTransition(term, effects.transitionTo, computerId, effects.terminationReason)) {
          return true;
        }
      }

      // Start sessions — defer notifications until session exits
      if (effects.startSession) {
        if (effects.emailNotifications > 0 || effects.piperNotifications > 0) {
          pendingNotificationsRef.current = {
            email: effects.emailNotifications,
            piper: effects.piperNotifications,
          };
        }
        sessionRouter.startSession(term, effects.startSession, tabId);
        return true;
      }

      // Handle game actions that need imperative logic
      if (effects.gameAction) {
        const action = effects.gameAction;
        if (action.type === "save") {
          const slotName = formatSlotName(action.slotId as SaveSlotId);
          const ok = useGameStore.getState().saveGame(action.slotId as SaveSlotId);
          if (ok) {
            term.write(colorize(`Game saved to ${slotName}.`, ansi.cyan));
          } else {
            term.write(colorize("Error: failed to save game.", ansi.red));
          }
        } else if (action.type === "load") {
          const slotName = formatSlotName(action.slotId as SaveSlotId);
          const ok = useGameStore.getState().loadGame(action.slotId as SaveSlotId);
          if (ok) {
            return finishLoad(term, `Loaded save from ${slotName}.`);
          } else {
            term.write(colorize(`Error: ${slotName} is empty or corrupted.`, ansi.red));
          }
        } else if (action.type === "loadCheckpoint") {
          const cp = CHECKPOINTS.find((c) => c.id === action.checkpointId);
          if (cp) {
            useGameStore.getState().loadCheckpointData(cp);
            return finishLoad(term, `Loaded checkpoint: ${cp.id}`);
          } else {
            term.write(colorize(`Error: unknown checkpoint '${action.checkpointId}'.`, ansi.red));
          }
        } else if (action.type === "newGame") {
          term.write(colorize("Are you sure you want to start a new game? All unsaved progress will be lost. (y/n) ", ansi.yellow));
          confirmNewGameRef.current = true;
          return true;
        }
      }

      // Write notifications (state already applied by applyStateEffects above)
      writeNotifications(term, effects);

      return effects.suppressPrompt;
    },
    [sessionRouter, getPrompt, dispatchTransition, runShutdownTransition, applyStateEffects, writeNotifications, writePrompt]
  );

  const handleInput = useCallback(
    (term: Terminal, data: string) => {
      // Handle newgame confirmation prompt
      if (confirmNewGameRef.current) {
        if (data === "\r" || data === "\n") return;
        const ch = data[0].toLowerCase();
        confirmNewGameRef.current = false;
        if (ch === "y") {
          term.write("y\r\n");
          useGameStore.getState().resetGame();
          window.location.reload();
        } else {
          term.write(ch === "n" ? "n" : ch);
          term.write(colorize("\r\nNew game cancelled.", ansi.yellow));
          writePrompt(term);
        }
        return;
      }

      // Route input to active session if one exists
      if (sessionRouter.routeInput(term, data)) return;

      // Ignore input while an async command is running in this tab
      const activeTabId = useGameStore.getState().activeTabId;
      if (busyRef.current && activeTabId === busyTabIdRef.current) return;

      // Handle special characters
      for (let i = 0; i < data.length; i++) {
        const char = data[i];
        const code = char.charCodeAt(0);

        // CSI escape sequences (arrows, modifiers like Option+Arrow)
        if (char === "\x1b" && data[i + 1] === "[") {
          let j = i + 2;
          while (j < data.length && data[j] >= "0" && data[j] <= "?") j++;
          const params = data.slice(i + 2, j);
          const final = data[j] ?? "";
          i = j;

          const parts = params.split(";");
          const modifier = parts.length > 1 ? parseInt(parts[1], 10) : 0;

          if (final === "~") {
            const keyCode = parts.length > 0 ? parseInt(parts[0], 10) : 0;
            if (keyCode === 3 && (modifier === 3 || modifier === 5)) {
              commandLine.deleteWordForward(term);
            }
            continue;
          }

          commandLine.handleArrow(term, final, modifier);
          continue;
        }

        if (char === "\x1b" && i + 1 < data.length && data[i + 1].charCodeAt(0) === 127) {
          i += 1;
          commandLine.deleteWordBackward(term);
          continue;
        }

        // Ctrl+W (0x17) or Ctrl+Backspace (xterm.js sends 0x08)
        if (code === 23 || code === CTRL_BACKSPACE) {
          commandLine.deleteWordBackward(term);
          continue;
        }

        const result = commandLine.handleChar(term, char, code);
        if (!result) continue;

        // Command submitted — expand aliases textually, then parse chain of pipelines
        const computerId = activeComputerRef.current;
        const userAliases = useGameStore.getState().computerState[computerId]?.aliases ?? {};
        const expandedInput = expandAliases(result.input, userAliases);
        const chain = parseChainedPipeline(expandedInput);

        // Check for parse errors in any segment
        for (const seg of chain) {
          const parseError = seg.pipeline.find((p) => p.error);
          if (parseError) {
            term.write(colorize(parseError.error!, ansi.red));
            writePrompt(term);
            continue;
          }
        }

        // Check if first segment parse error already handled (continue above skips outer for)
        // Re-check to avoid double-handling — if any segment had error, we already wrote it
        const hasParseError = chain.some((seg) => seg.pipeline.some((p) => p.error));
        if (hasParseError) {
          // The error was already written above, prompt was written, skip execution
          continue;
        }

        // Check for empty input (single empty pipeline)
        if (chain.length === 1 && chain[0].pipeline.length === 1 && !chain[0].pipeline[0].command) {
          writePrompt(term);
          continue;
        }

        // Capture tab ID at submission time (before async enqueue)
        const submittingTabId = useGameStore.getState().activeTabId;

        // Gate input while command is queued/executing
        busyRef.current = true;
        busyTabIdRef.current = submittingTabId;

        // Enqueue command execution to serialize FS mutations per computer
        enqueueCommand(computerId, async () => {
          try {
          const store = useGameStore.getState();
          const initialFs = store.computerState[computerId]!.fs;
          const homeDir = initialFs.homeDir;

          const applyCommandResult = (
            cmdResult: import("../engine/commands/types").CommandResult,
            parsedCmd: import("../engine/commands/types").ParsedCommand,
            runningFs: VirtualFS,
            isFinal: boolean
          ) => {
            const latestStore = useGameStore.getState();
            const targetComputer = cmdResult.transitionTo;
            const effects = computeEffects(cmdResult, {
              parsedCommand: parsedCmd.command,
              parsedArgs: parsedCmd.args,
              cwd: cwdRef.current,
              homeDir,
              activeComputer: computerId,
              username: latestStore.username,
              deliveredEmailIds: latestStore.deliveredEmailIds,
              deliveredPiperIds: latestStore.deliveredPiperIds,
              storyFlags: latestStore.storyFlags,
              fs: runningFs,
              targetComputerExists: targetComputer ? !!latestStore.computerState[targetComputer] : undefined,
            });

            if (!isFinal) {
              // Per-segment: apply story flags, deliveries to store (needed for gating)
              // but do NOT write FS, notifications, or prompt
              for (const update of effects.storyFlagUpdates) {
                useGameStore.getState().setStoryFlag(update.flag, update.value);
                if (update.toast) {
                  useGameStore.getState().addToast(update.toast);
                }
              }
              if (effects.newDeliveredEmailIds.length > 0) {
                useGameStore.getState().addDeliveredEmails(effects.newDeliveredEmailIds);
              }
              if (effects.newDeliveredPiperIds.length > 0) {
                useGameStore.getState().addDeliveredPiperMessages(effects.newDeliveredPiperIds);
              }
              if (effects.newCwd) {
                cwdRef.current = effects.newCwd;
                useGameStore.getState().setTabCwd(useGameStore.getState().activeTabId, effects.newCwd);
              }
              if (effects.clearScreen) {
                term.clear();
              }
              if (effects.output) {
                term.write(effects.output.replace(/\n/g, "\r\n"));
              }
              // Check if segment triggers session/incremental/transition — must stop chain
              if (effects.startSession || effects.incrementalLines || effects.transitionTo) {
                return executeEffects(term, effects, submittingTabId);
              }
              return false;
            }

            return executeEffects(term, effects, submittingTabId);
          };

          let runningFs = initialFs;
          const initialMounts = store.computerState[computerId]?.mounts ?? {};
          let runningMounts: Mounts = initialMounts;
          let lastExitCode = 0;
          let earlyReturn = false;
          let wroteOutput = false;

          for (let ci = 0; ci < chain.length; ci++) {
            const seg = chain[ci];

            // Check chain operator logic
            if (seg.operator === '&&' && lastExitCode !== 0) continue;
            if (seg.operator === '||' && lastExitCode === 0) continue;
            // ';' and null (first): always execute

            const pipeline = [...seg.pipeline];

            // Extract redirection from last pipeline command (per-segment)
            const lastSegment = pipeline[pipeline.length - 1];
            const { command: stripped, redirectFile, redirectAppend } =
              extractStdoutRedirect(lastSegment.raw);
            if (redirectFile) {
              pipeline[pipeline.length - 1] = parseInput(stripped);
            }

            // Async detection per segment
            const hasAsyncCmd = pipeline.some((p) => isAsyncCommand(p.command));
            if (hasAsyncCmd) {
              if (wroteOutput) term.write("\r\n");
              term.write(colorize("Loading...", ansi.dim));
            }

            // Execute pipeline for this segment
            let stdin: string | undefined; // reset per chain segment
            let lastResult: import("../engine/commands/types").CommandResult = { output: "" };
            const allTriggerEvents: import("../engine/mail/delivery").GameEvent[] = [];
            let pipelineViolation: import("../story/security").SecurityViolation | undefined;

            for (let pi = 0; pi < pipeline.length; pi++) {
              const p = pipeline[pi];
              if (!p.command) continue;

              const ctx = buildCommandContext(
                runningFs,
                cwdRef.current,
                computerId,
                homeDir,
                stdin,
                p.rawArgs,
                pi < pipeline.length - 1 || !!redirectFile,
                useGameStore.getState(),
                runningMounts
              );

              if (isAsyncCommand(p.command)) {
                lastResult = await executeAsync(p.command, p.args, p.flags, ctx);
              } else {
                lastResult = execute(p.command, p.args, p.flags, ctx);
              }

              if (lastResult.triggerEvents) {
                allTriggerEvents.push(...lastResult.triggerEvents);
              }

              if (lastResult.securityViolation && !pipelineViolation) {
                pipelineViolation = lastResult.securityViolation;
              }

              // Intermediate pipeline commands: generate file_read events
              if (pi < pipeline.length - 1 && commandReadsFiles(p.command)) {
                for (const arg of p.args) {
                  if (!arg.startsWith("-")) {
                    const absPath = resolvePath(arg, cwdRef.current, homeDir);
                    if (!runningFs.readFile(absPath).error) {
                      allTriggerEvents.push({ type: "file_read" as const, detail: absPath });
                    }
                  }
                }
              }

              if (lastResult.newFs) {
                runningFs = lastResult.newFs;
              }

              if (lastResult.newMounts) {
                runningMounts = lastResult.newMounts;
              }

              stdin = stripAnsi(lastResult.output);
            }

            if (allTriggerEvents.length > 0) {
              lastResult = { ...lastResult, triggerEvents: allTriggerEvents };
            }

            if (pipelineViolation && !lastResult.securityViolation) {
              lastResult = { ...lastResult, securityViolation: pipelineViolation };
            }

            if (redirectFile && lastResult) {
              const redir = applyRedirection(redirectFile, redirectAppend, lastResult, cwdRef.current, homeDir, runningFs, computerId);
              lastResult = redir.result;
              runningFs = redir.fs;
            }

            lastExitCode = lastResult.exitCode ?? 0;
            if (lastResult.output) wroteOutput = true;

            if (hasAsyncCmd) {
              term.write("\r\x1b[K");
            }

            const isFinal = ci === chain.length - 1 || isChainEarlyReturn(lastResult);
            earlyReturn = applyCommandResult(lastResult, pipeline[pipeline.length - 1], runningFs, isFinal) ?? false;

            // If segment triggers session/incremental/transition, stop chain
            if (isChainEarlyReturn(lastResult) || earlyReturn) break;
          }

          // Append command to .zsh_history in the virtual filesystem (HIST_IGNORE_DUPS)
          const historyPath = `${homeDir}/.zsh_history`;
          const existing = runningFs.readFile(historyPath);
          const prev = existing.content ?? "";
          const lastLine = prev.trimEnd().split("\n").pop() ?? "";
          if (lastLine !== result.input) {
            const suffix = prev.endsWith("\n") || prev === "" ? "" : "\n";
            const historyUpdated = prev + suffix + result.input + "\n";
            const histWrite = runningFs.writeFile(historyPath, historyUpdated);
            if (histWrite.fs) runningFs = histWrite.fs;
          }

          // Write final FS to store once
          if (runningFs !== initialFs) {
            useGameStore.getState().setComputerFs(computerId, runningFs);
          }

          // Write final mounts to store once
          if (runningMounts !== initialMounts) {
            useGameStore.getState().setComputerMounts(computerId, runningMounts);
          }

          if (!earlyReturn) {
            writePrompt(term);
          }
          } finally {
            busyRef.current = false;
            busyTabIdRef.current = null;
          }
        });
      }
    },
    [writePrompt, sessionRouter, commandLine, executeEffects]
  );

  return {
    handleInput,
    getPrompt,
    startSession: sessionRouter.startSession,
    canCloseCurrentSession: sessionRouter.canCloseCurrentSession,
    getActiveSessionType: sessionRouter.getActiveSessionType,
    cleanupTab: sessionRouter.cleanupTab,
    resizeActiveSession: sessionRouter.resizeActiveSession,
  };
}
