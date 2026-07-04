import { useCallback, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore, getActiveLeaf, getActivePaneId } from "../state/gameStore";
import { parseChainedPipeline, expandAliases } from "@tt/core/commands/parser";
import { runPipeline } from "@tt/core/commands/runPipeline";
import { STANDARD_MODEL_ORDER } from "@/story/data/dbt/data";
import { colorize, ansi } from "@tt/core/lib/ansi";
import { expandZshPrompt } from "@tt/core/lib/promptExpand";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { createDefaultContext } from "@tt/core/snowflake/session/context";
import { SaveSlotId } from "../state/saveTypes";
import { formatSlotName } from "../state/saveManager";
import { COMPUTERS, ComputerId, getConnectionClosure } from "../state/types";
import { getComputerUsername, PLAYER } from "../story/player";
import { NEXACORP_SECURITY_POLICY } from "../story/security";
import { createDeviceProvider } from "../story/blockDevices";
import { createGameClock } from "../story/clock";
// Registers the termoil command-availability policy (side-effect import).
import "../story/availabilityPolicy";
import { isCommandAvailable } from "@tt/core/commands/availability";
import { computeEffects, AppliedEffects } from "@tt/core/commands/applyResult";
import { processDeliveries } from "../engine/commands/processDeliveries";
import { renderSavesList, renderCheckpointsList } from "../story/listingOutput";
import { CHECKPOINTS } from "../story/checkpoints";
import { useSessionRouter } from "./useSessionRouter";
import { useCommandLine } from "./useCommandLine";
import { useComputerTransitions } from "./useComputerTransitions";
import { CommandContext } from "@tt/core/commands/types";
import { parseTmuxPrefix } from "@tt/core/terminal/tmuxConfig";
import { parseZshHistory, appendZshHistory } from "@tt/core/terminal/zshHistory";
import { Mounts } from "@tt/core/filesystem/mounts";

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

// Email domain used in `git commit` author lines, per machine. App-side because
// these are NexaCorp-specific; the engine just consumes the finished string.
const GIT_AUTHOR_EMAIL_DOMAIN: Record<ComputerId, string> = {
  home: "maniac-iv.local",
  nexacorp: "nexacorp.com",
  devcontainer: "nexacorp.com",
  chipinfra: "nexacorp.com",
  "erik-pc": "nexacorp.com",
};

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
    // NexaCorp is the only machine with security tripwires; other machines get
    // no policy, so no operation is ever flagged there.
    security: computerId === "nexacorp" ? NEXACORP_SECURITY_POLICY : undefined,
    devices: createDeviceProvider(computerId, store.storyFlags),
    gitAuthor: `${PLAYER.displayName} <${store.username}@${GIT_AUTHOR_EMAIL_DOMAIN[computerId]}>`,
    clock: createGameClock(store.deliveredPiperIds, store.username, computerId),
    dbtModelOrder: STANDARD_MODEL_ORDER,
    tabPrefixLabel: (() => {
      const homeFs = store.computerState.home?.fs;
      const conf = homeFs ? homeFs.readFile(`${homeFs.homeDir}/.tmux.conf`).content : undefined;
      return parseTmuxPrefix(conf).label;
    })(),
    tmux: {
      attachedSession: store.tmuxAttachedSession?.name ?? null,
      sessions: [
        ...(store.tmuxAttachedSession
          ? [{
              name: store.tmuxAttachedSession.name,
              windowCount: store.windows.length,
              createdAt: store.tmuxAttachedSession.createdAt,
              attached: true,
            }]
          : []),
        // Detached sessions in detach order (most recent last) — bare
        // attach/kill-session target the last one.
        ...store.tmuxDetachedSessions.map((s) => ({
          name: s.name,
          windowCount: s.windows.length,
          createdAt: s.createdAt,
          attached: false,
        })),
      ],
    },
  };
}

// Ensure all builtins are registered
import "../engine/commands/builtins";

export function useTerminal() {
  const busyRef = useRef(false);
  const busyPaneIdRef = useRef<string | null>(null);
  const confirmNewGameRef = useRef(false);
  const pendingNotificationsRef = useRef<{ email: number; piper: number } | null>(null);

  // Per-pane local refs — derived from the active pane (the focused leaf)
  const initState = useGameStore.getState();
  const initLeaf = getActiveLeaf(initState);
  const cwdRef = useRef(initLeaf?.cwd ?? `/home/${initState.username}`);
  const activeComputerRef = useRef<ComputerId>((initLeaf?.computerId ?? "home") as ComputerId);

  // Sync refs whenever the active pane changes (split, focus move, window switch, …)
  useEffect(() => {
    const unsub = useGameStore.subscribe((state) => {
      const leaf = getActiveLeaf(state);
      if (leaf) {
        activeComputerRef.current = leaf.computerId as ComputerId;
        cwdRef.current = leaf.cwd;
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
  const { runShutdownTransition, runRebootTransition, dispatchTransition } = useComputerTransitions({
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
    let prevPaneId = getActivePaneId(useGameStore.getState());
    const unsub = useGameStore.subscribe((state) => {
      const paneId = getActivePaneId(state);
      if (paneId !== prevPaneId) {
        prevPaneId = paneId;
        refreshPiperSession();
      }
    });
    return unsub;
  }, [refreshPiperSession]);

  const commandLine = useCommandLine({
    cwdRef,
    activeComputerRef,
    getPrompt,
  });

  /** Apply state-only effects (FS, cwd, story flags, email/piper deliveries). No terminal writes. */
  const applyStateEffects = useCallback(
    (effects: AppliedEffects, computerId: ComputerId) => {
      const store = useGameStore.getState();
      if (effects.newFs) {
        store.setComputerFs(computerId, effects.newFs);
      }
      if (effects.newCwd) {
        store.setActivePaneCwd(effects.newCwd);
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
        const loadedLeaf = getActiveLeaf(state);
        cwdRef.current = loadedLeaf?.cwd ?? `/home/${state.username}`;
        activeComputerRef.current = (loadedLeaf?.computerId ?? "home") as ComputerId;
        t.clear();
        t.write(colorize(`\r\n${message}\r\n`, ansi.cyan));
        t.write(getPrompt(cwdRef.current));
        return true;
      }

      /**
       * Close sibling tabs when a machine goes down (coder stop, remote
       * shutdown). Expands to the connection closure: a session chained
       * through the dead box (e.g. erik-pc via chipinfra) dies with it.
       * The active tab is excluded; transitionTo handles it.
       */
      function closeTabsForDownedComputer() {
        if (!effects.closeTabsForComputer) return;
        const downed = getConnectionClosure(effects.closeTabsForComputer as ComputerId);
        // Prune every pane on a downed box (and anything chained through it).
        // The active pane is preserved by the store action; transitionTo retargets it.
        useGameStore.getState().closePanesForComputers(downed);
      }

      if (effects.clearScreen) {
        term.clear();
      }

      // Incremental line-by-line rendering (e.g. dbt output)
      if (effects.incrementalLines) {
        applyStateEffects(effects, computerId);
        busyRef.current = true;
        busyPaneIdRef.current = getActivePaneId(useGameStore.getState()) ?? null;
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
            busyPaneIdRef.current = null;
            // The box is down once the broadcast/countdown lines finish.
            closeTabsForDownedComputer();
            if (effects.gameAction?.type === "shutdown") {
              runShutdownTransition(term);
            } else if (effects.gameAction?.type === "reboot") {
              runRebootTransition(term);
            } else if (effects.transitionTo && dispatchTransition(term, effects.transitionTo as ComputerId, computerId, effects.terminationReason)) {
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

      // Close tabs for a downed computer (e.g. coder stop disconnects devcontainer sessions)
      closeTabsForDownedComputer();

      // Computer transitions — source-aware dispatch (see dispatchTransition for the matrix).
      if (effects.transitionTo) {
        if (dispatchTransition(term, effects.transitionTo as ComputerId, computerId, effects.terminationReason)) {
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

      // tmux lifecycle (new/attach/detach/kill). When the client view swapped,
      // this pane is about to be disposed — suppress the prompt; the fresh pane
      // prints its own (plus the exit banner) via onPaneCreated.
      if (effects.tmuxAction) {
        const swapped = useGameStore.getState().applyTmuxAction(effects.tmuxAction);
        if (swapped) {
          const state = useGameStore.getState();
          const leaf = getActiveLeaf(state);
          cwdRef.current = leaf?.cwd ?? `/home/${state.username}`;
          activeComputerRef.current = (leaf?.computerId ?? "home") as ComputerId;
          return true;
        }
      }

      // Write notifications (state already applied by applyStateEffects above)
      writeNotifications(term, effects);

      return effects.suppressPrompt;
    },
    [sessionRouter, getPrompt, dispatchTransition, runShutdownTransition, runRebootTransition, applyStateEffects, writeNotifications, writePrompt]
  );

  const handleInput = useCallback(
    (term: Terminal, data: string) => {
      // Handle newgame confirmation prompt
      if (confirmNewGameRef.current) {
        if (data === "" || data === "\r" || data === "\n") return;
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
      const activePaneId = getActivePaneId(useGameStore.getState());
      if (busyRef.current && activePaneId === busyPaneIdRef.current) return;

      // Cursor-aware line editing (arrows, Home/End, word-skip, Ctrl+A/E/U/K/L/W/D,
      // ghost/TAB completion) is owned by the shared @tt/core LineEditor.
      const result = commandLine.handleData(term, data);
      if (!result) return;

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
        return;
      }

      // Check for empty input (single empty pipeline)
      if (chain.length === 1 && chain[0].pipeline.length === 1 && !chain[0].pipeline[0].command) {
        writePrompt(term);
        return;
      }

      // Capture tab ID at submission time (before async enqueue)
      const submittingPaneId = getActivePaneId(useGameStore.getState());

      // Gate input while command is queued/executing
      busyRef.current = true;
      busyPaneIdRef.current = submittingPaneId ?? null;

      // Enqueue command execution to serialize FS mutations per computer
      enqueueCommand(computerId, async () => {
        try {
        const store = useGameStore.getState();
        const initialFs = store.computerState[computerId]!.fs;
        const homeDir = initialFs.homeDir;
        const initialMounts = store.computerState[computerId]?.mounts ?? {};

        const applyCommandResult = (
          cmdResult: import("@tt/core/commands/types").CommandResult,
          parsedCmd: import("@tt/core/commands/types").ParsedCommand,
          runningFs: VirtualFS,
          isFinal: boolean
        ): import("@tt/core/commands/runPipeline").ApplySegmentOutcome => {
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
            targetComputerExists: targetComputer ? !!latestStore.computerState[targetComputer as ComputerId] : undefined,
            processDeliveries,
            renderSavesList,
            renderCheckpointsList,
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
              useGameStore.getState().setActivePaneCwd(effects.newCwd);
            }
            if (effects.clearScreen) {
              term.clear();
            }
            if (effects.output) {
              term.write(effects.output.replace(/\n/g, "\r\n"));
            }
            // Check if segment triggers session/incremental/transition/tmux swap — must stop chain
            if (effects.startSession || effects.incrementalLines || effects.transitionTo || effects.tmuxAction) {
              const suppress = executeEffects(term, effects, submittingPaneId);
              return { newCwd: effects.newCwd, stopChain: true, earlyReturn: suppress };
            }
            return { newCwd: effects.newCwd };
          }

          return { newCwd: effects.newCwd, earlyReturn: executeEffects(term, effects, submittingPaneId) };
        };

        const run = await runPipeline({
          chain,
          fs: initialFs,
          cwd: cwdRef.current,
          homeDir,
          mounts: initialMounts,
          buildContext: ({ fs, cwd, stdin, rawArgs, isPiped, mounts }) =>
            buildCommandContext(fs, cwd, computerId, homeDir, stdin, rawArgs, isPiped, useGameStore.getState(), mounts),
          write: (t) => term.write(t),
          redirection: {
            computerId,
            securityPolicy: computerId === "nexacorp" ? NEXACORP_SECURITY_POLICY : undefined,
          },
          intermediateFileReadEvents: true,
          applySegment: (cmdResult, parsedCmd, state, isFinal) =>
            applyCommandResult(cmdResult, parsedCmd, state.fs, isFinal),
        });
        let runningFs = run.fs;

        // Append command to .zsh_history in the virtual filesystem (HIST_IGNORE_DUPS)
        if (!result.skipHistory) {
          const historyPath = `${homeDir}/.zsh_history`;
          const prev = runningFs.readFile(historyPath).content ?? "";
          const historyUpdated = appendZshHistory(prev, result.input);
          if (historyUpdated !== prev) {
            const histWrite = runningFs.writeFile(historyPath, historyUpdated);
            if (histWrite.fs) runningFs = histWrite.fs;
          }
        }

        // Write final FS to store once
        if (runningFs !== initialFs) {
          useGameStore.getState().setComputerFs(computerId, runningFs);
        }

        // Write final mounts to store once
        if (run.mounts !== initialMounts) {
          useGameStore.getState().setComputerMounts(computerId, run.mounts);
        }

        if (!run.earlyReturn) {
          writePrompt(term);
        }
        } finally {
          busyRef.current = false;
          busyPaneIdRef.current = null;
        }
      });
    },
    [writePrompt, sessionRouter, commandLine, executeEffects]
  );

  return {
    handleInput,
    getPrompt,
    startSession: sessionRouter.startSession,
    canCloseCurrentSession: sessionRouter.canCloseCurrentSession,
    canClosePaneSession: sessionRouter.canClosePaneSession,
    getActiveSessionType: sessionRouter.getActiveSessionType,
    cleanupPane: sessionRouter.cleanupPane,
    resizeActiveSession: sessionRouter.resizeActiveSession,
    resizePaneSession: sessionRouter.resizePaneSession,
  };
}
