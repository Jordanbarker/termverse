import { useCallback, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore } from "../state/gameStore";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { EditorSession } from "../engine/editor/EditorSession";
import { PythonReplSession } from "../engine/python/PythonReplSession";
import { SnowSqlSession } from "../engine/snowflake/session/SnowSqlSession";
import { createDefaultContext } from "../engine/snowflake/session/context";
import { gameNowFor } from "../engine/snowflake/session/gameClock";
import { checkEmailDeliveries, type GameEvent } from "../engine/mail/delivery";
import { getTriggersForComputer, checkStoryFlagTriggers } from "../engine/narrative/storyFlags";
import { colorize, ansi } from "../lib/ansi";
import { PromptSession } from "../engine/prompt/PromptSession";
import { SshSession } from "../engine/ssh/SshSession";
import { ChipSession } from "../engine/chip/ChipSession";
import { PiperSession } from "../engine/piper/PiperSession";
import { deliverPiperAndCascade } from "../engine/piper/delivery";
import { ISession } from "../engine/session/types";
import { SessionToStart } from "../engine/commands/applyResult";
import { ComputerId } from "../state/types";
import { isCommandAvailable } from "../engine/commands/availability";
import { PiperSessionInfo } from "../engine/piper/types";

interface EventActionContext {
  term: Terminal;
  computerId: ComputerId;
}

interface EventActionResult {
  skipDefault?: boolean;
}

/** Maps objective_completed event details to special actions. New events go here. */
const EVENT_ACTIONS: Record<string, (ctx: EventActionContext) => EventActionResult> = {
  ssh_connect: () => {
    // Named for the home → nexacorp first SSH. SshSession only emits this
    // event for the nexacorp route; other routes (e.g. erik-pc) emit no
    // ssh_connect event so this flag stays scoped to its original meaning.
    const store = useGameStore.getState();
    store.setStoryFlag("first_ssh_connect", true);
    return { skipDefault: true };
  },
  search_tools_accepted: (ctx) => {
    const store = useGameStore.getState();
    store.setStoryFlag("search_tools_unlocked", true);
    store.addToast("grep, find, and diff are now available!");
    // Unlock multi-terminal tabs alongside search tools
    if (!store.storyFlags.tabs_unlocked) {
      store.setStoryFlag("tabs_unlocked", true);
      store.addToast("Terminal tabs unlocked!");
    }
    return {};
  },
  inspection_tools_accepted: (ctx) => {
    const store = useGameStore.getState();
    store.setStoryFlag("inspection_tools_unlocked", true);
    store.addToast("head, tail, and wc are now available!");
    return {};
  },
  processing_tools_accepted: (ctx) => {
    const store = useGameStore.getState();
    store.setStoryFlag("processing_tools_unlocked", true);
    store.addToast("sort and uniq are now available!");
    return {};
  },
  pipeline_tools_accepted: (ctx) => {
    const store = useGameStore.getState();
    store.setStoryFlag("coder_unlocked", true);
    store.addToast("coder command is now available! Try: coder ssh ai");
    return {};
  },
  dana_ops_accepted: (ctx) => {
    const store = useGameStore.getState();
    store.setStoryFlag("chmod_unlocked", true);
    store.addToast("chmod command unlocked!");
    return {};
  },
  dana_ops_no_access: () => {
    return {};
  },
};

interface SessionEntry {
  session: ISession;
  type: string;
  piperInfo?: PiperSessionInfo;
}

interface SessionRouterDeps {
  activeComputerRef: React.MutableRefObject<ComputerId>;
  writePrompt: (term: Terminal) => void;
  getPrompt: () => string;
  dispatchTransition: (term: Terminal, transitionTo: ComputerId, sourceComputer: ComputerId) => boolean;
  pendingNotificationsRef: React.MutableRefObject<{ email: number; piper: number } | null>;
}

export function useSessionRouter(deps: SessionRouterDeps) {
  const { activeComputerRef, writePrompt, getPrompt, dispatchTransition, pendingNotificationsRef } = deps;

  const sessionMapRef = useRef<Map<string, SessionEntry>>(new Map());

  const hasActiveSession = useCallback(() => {
    const activeTabId = useGameStore.getState().activeTabId;
    return sessionMapRef.current.has(activeTabId);
  }, []);

  /** Refresh piper session state from the store (other tabs may have progressed). */
  const refreshPiperSession = useCallback(() => {
    const activeTabId = useGameStore.getState().activeTabId;
    const entry = sessionMapRef.current.get(activeTabId);
    if (!entry || entry.type !== "piper" || !entry.piperInfo) return;

    const store = useGameStore.getState();
    const sessionIds = new Set(entry.piperInfo.deliveredPiperIds);
    const newFromStore = store.deliveredPiperIds.filter(id => !sessionIds.has(id));
    const flagsChanged = entry.piperInfo.storyFlags !== store.storyFlags;
    if (newFromStore.length > 0) {
      entry.piperInfo.deliveredPiperIds.push(...newFromStore);
    }
    if (flagsChanged) {
      entry.piperInfo.storyFlags = store.storyFlags;
    }
    if (newFromStore.length > 0 || flagsChanged) {
      (entry.session as PiperSession).refresh();
    }
  }, []);

  /** Sync piper IDs from the live session back to game state. */
  const syncPiperIds = useCallback((tabId: string) => {
    const entry = sessionMapRef.current.get(tabId);
    if (!entry?.piperInfo) return;
    const store = useGameStore.getState();
    const newIds = entry.piperInfo.deliveredPiperIds.filter(
      (id) => !store.deliveredPiperIds.includes(id)
    );
    if (newIds.length > 0) {
      store.addDeliveredPiperMessages(newIds);

      // Fire piper_delivered story flag triggers for newly delivered messages
      const computerId = activeComputerRef.current;
      const latestStore = useGameStore.getState();
      const piperTriggers = getTriggersForComputer(computerId, latestStore.username);
      for (const id of newIds) {
        if (id.startsWith("reply:") || id.startsWith("seen:")) continue;
        const pdEvent = { type: "piper_delivered" as const, detail: id };
        const flagResults = checkStoryFlagTriggers(pdEvent, piperTriggers, latestStore.storyFlags);
        for (const flagResult of flagResults) {
          latestStore.setStoryFlag(flagResult.flag, flagResult.value);
          if (flagResult.toast) latestStore.addToast(flagResult.toast);
        }
      }
    }
  }, [activeComputerRef]);

  /**
   * Process trigger events from a session result.
   * When notify is false (mid-session), skip terminal notifications since the session owns the screen.
   *
   * Note: post-SSH computer transitions are NOT driven by trigger events anymore.
   * The router reads `result.transitionTo` (set by SshSession) directly and routes
   * via `dispatchTransition`. Trigger events here are purely for story/email/piper effects.
   */
  const processTriggerEvents = useCallback(
    (term: Terminal, events: import("../engine/mail/delivery").GameEvent[], notify: boolean): void => {
      const computerId = activeComputerRef.current;
      const actionCtx: EventActionContext = { term, computerId };

      for (const event of events) {
        // Check for registered event actions
        if (event.type === "objective_completed" && EVENT_ACTIONS[event.detail]) {
          const actionResult = EVENT_ACTIONS[event.detail](actionCtx);
          if (actionResult.skipDefault) continue;
        }

        // Wire objective_completed events to store
        if (event.type === "objective_completed") {
          useGameStore.getState().completeObjective(event.detail);
        }
      }

      // Process story flag triggers first so deliveries see updated flags
      const triggers = getTriggersForComputer(computerId, useGameStore.getState().username);
      for (const event of events) {
        const latestFlags = useGameStore.getState().storyFlags;
        const flagResults = checkStoryFlagTriggers(event, triggers, latestFlags);
        for (const flagResult of flagResults) {
          useGameStore.getState().setStoryFlag(flagResult.flag, flagResult.value);
          if (flagResult.toast) useGameStore.getState().addToast(flagResult.toast);
        }
      }

      // Check email deliveries (now sees updated story flags)
      for (const event of events) {
        const store = useGameStore.getState();
        const currentFs = store.computerState[computerId]!.fs;

        const delivery = checkEmailDeliveries(
          currentFs,
          event,
          store.deliveredEmailIds,
          computerId,
          store.storyFlags
        );
        if (delivery.newDeliveries.length > 0) {
          store.setComputerFs(computerId, delivery.fs);
          store.addDeliveredEmails(delivery.newDeliveries);
          if (notify) {
            term.write(`\r\n${colorize(`You have new mail in /var/mail/${store.username}`, ansi.yellow, ansi.bold)}`);
          }
        }

        // Piper deliveries (scoped + cross-computer) and piper_delivered flag cascade.
        const latestStore = useGameStore.getState();
        const cascade = deliverPiperAndCascade(
          event,
          computerId,
          latestStore.username,
          latestStore.deliveredPiperIds,
          latestStore.storyFlags
        );
        if (cascade.newPiperIds.length > 0) {
          useGameStore.getState().addDeliveredPiperMessages(cascade.newPiperIds);
          if (notify) {
            const flags = useGameStore.getState().storyFlags;
            if (isCommandAvailable("piper", computerId, flags)) {
              term.write(`\r\n${colorize("You have new messages on Piper", ansi.yellow, ansi.bold)}`);
            } else {
              useGameStore.getState().setPendingPiperNotification(true);
            }
          }
          for (const update of cascade.flagUpdates) {
            useGameStore.getState().setStoryFlag(update.flag, update.value);
            if (update.toast) useGameStore.getState().addToast(update.toast);
          }
        }
      }
    },
    [activeComputerRef]
  );

  /** Route input to the active session. Returns true if input was consumed. */
  const routeInput = useCallback(
    (term: Terminal, data: string): boolean => {
      const activeTabId = useGameStore.getState().activeTabId;
      const entry = sessionMapRef.current.get(activeTabId);
      if (!entry) return false;

      // Refresh piper state from store before routing input (other tabs may have progressed)
      refreshPiperSession();

      const result = entry.session.handleInput(data);
      if (!result) return true; // still waiting (prompt session)

      const computerId = activeComputerRef.current;

      // Apply session FS changes FIRST so trigger event deliveries build on top
      if (result.newFs) {
        useGameStore.getState().setComputerFs(computerId, result.newFs);
      }

      // Sync piper IDs mid-session BEFORE processing trigger events,
      // so processTriggerEvents sees already-delivered IDs and doesn't re-deliver them
      if (entry.type === "piper") {
        syncPiperIds(activeTabId);
      }

      // Process mid-session events without terminal notifications (session owns the screen)
      if (result.triggerEvents?.length && result.type !== "exit") {
        processTriggerEvents(term, result.triggerEvents, false);
      }

      if (result.type !== "exit") return true; // continue

      // Session exited — clean up
      const type = entry.type;
      sessionMapRef.current.delete(activeTabId);

      // Mark intro as seen when player exits nano (not when it opens)
      if (type === "editor" && computerId === "home") {
        const store = useGameStore.getState();
        if (!store.hasSeenIntro) {
          store.setHasSeenIntro();
        }
      }

      if (type === "snow-sql") {
        if (result.newState) {
          useGameStore.getState().setSnowflakeState(result.newState);
        }
        useGameStore.getState().setActiveSnowSession(null);
      }

      // Final piper ID sync on exit
      if (type === "piper") {
        syncPiperIds(activeTabId);
      }

      if (result.output) {
        term.write(result.output.replace(/\n/g, "\r\n"));
      }

      // Process exit trigger events AFTER output, with notification
      if (result.triggerEvents?.length) {
        processTriggerEvents(term, result.triggerEvents, true);
      }

      // Computer transition driven directly by the session's transitionTo field
      if (result.transitionTo) {
        pendingNotificationsRef.current = null;
        if (dispatchTransition(term, result.transitionTo, computerId)) {
          return true;
        }
      }

      // Flush notifications deferred from the command that started this session
      let wroteNotifications = false;
      if (pendingNotificationsRef.current) {
        const pending = pendingNotificationsRef.current;
        pendingNotificationsRef.current = null;
        const username = useGameStore.getState().username;
        if (pending.email > 0) {
          term.write(`\r\n${colorize(`You have new mail in /var/mail/${username}`, ansi.yellow, ansi.bold)}`);
          wroteNotifications = true;
        }
        if (pending.piper > 0) {
          if (isCommandAvailable("piper", computerId, useGameStore.getState().storyFlags)) {
            term.write(`\r\n${colorize("You have new messages on Piper", ansi.yellow, ansi.bold)}`);
            wroteNotifications = true;
          } else {
            useGameStore.getState().setPendingPiperNotification(true);
          }
        }
      }

      // FS was already synced to store via setComputerFs above
      // Piper and editor use the alternate screen buffer — no leading \r\n needed
      // (but if notifications were just written, we need a newline before the prompt)
      const usedAltScreen = type === "piper" || type === "editor";
      if (usedAltScreen) {
        term.write((wroteNotifications ? "\r\n" : "") + getPrompt());
      } else {
        writePrompt(term);
      }
      return true;
    },
    [activeComputerRef, processTriggerEvents, syncPiperIds, refreshPiperSession, writePrompt, getPrompt, dispatchTransition, pendingNotificationsRef]
  );

  /** Start a new session from an AppliedEffects startSession descriptor. */
  const startSession = useCallback(
    (term: Terminal, session: SessionToStart, tabId?: string): void => {
      const computerId = activeComputerRef.current;
      const targetTabId = tabId ?? useGameStore.getState().activeTabId;

      // Defensive: if this tab already has a session, exit its alt-buffer before replacing
      const existing = sessionMapRef.current.get(targetTabId);
      if (existing) {
        term.write("\x1b[?1049l"); // exit any stale alt-buffer
        sessionMapRef.current.delete(targetTabId);
      }

      if (session.type === "editor") {
        const store = useGameStore.getState();
        const currentFs = store.computerState[computerId]!.fs;
        const { filePath, content, readOnly, triggerRow, triggerEvents, requireSave } = session.info;
        const trigger = triggerEvents
          ? { triggerRow: triggerRow ?? 0, triggerEvents, requireSave }
          : undefined;
        const editorSession = new EditorSession(
          term,
          currentFs,
          filePath,
          content,
          readOnly,
          (newFs: VirtualFS) => {
            useGameStore.getState().setComputerFs(computerId, newFs);
          },
          trigger
        );
        sessionMapRef.current.set(targetTabId, { session: editorSession, type: "editor" });
        editorSession.enter();
      } else if (session.type === "snow-sql") {
        const store = useGameStore.getState();
        if (store.activeSnowSession) {
          term.write("\r\n" + colorize("Another Snowflake session is already active.", ansi.red) + "\r\n");
          writePrompt(term);
          return;
        }
        const snowTabId = store.activeTabId;
        store.setActiveSnowSession(snowTabId);
        const snowSqlSession = new SnowSqlSession(
          term,
          store.snowflakeState,
          createDefaultContext(store.username),
          (newState) => useGameStore.getState().setSnowflakeState(newState),
          () => useGameStore.getState().setActiveSnowSession(null),
          () => {
            const s = useGameStore.getState();
            return gameNowFor(s.deliveredPiperIds, s.username, computerId);
          }
        );
        sessionMapRef.current.set(targetTabId, { session: snowSqlSession, type: "snow-sql" });
        snowSqlSession.enter();
      } else if (session.type === "prompt") {
        const store = useGameStore.getState();
        const currentFs = store.computerState[computerId]!.fs;
        const promptSession = new PromptSession(
          term,
          session.info,
          currentFs,
          store.username
        );
        sessionMapRef.current.set(targetTabId, { session: promptSession, type: "prompt" });
        promptSession.enter();
      } else if (session.type === "pythonRepl") {
        const pythonSession = new PythonReplSession(term);
        sessionMapRef.current.set(targetTabId, { session: pythonSession, type: "pythonRepl" });
        pythonSession.enter().then(() => {
          if (!pythonSession.isReady()) {
            sessionMapRef.current.delete(targetTabId);
            writePrompt(term);
          }
        });
      } else if (session.type === "ssh") {
        const store = useGameStore.getState();
        const currentFs = store.computerState[computerId]!.fs;
        const sshSession = new SshSession(
          term,
          currentFs,
          session.info.host,
          session.info.username,
          currentFs.homeDir,
          session.info.targetComputer
        );
        sessionMapRef.current.set(targetTabId, { session: sshSession, type: "ssh" });
        const enterResult = sshSession.enter();
        if (enterResult && enterResult.type === "exit") {
          // Known host — process exit immediately without waiting for input
          sessionMapRef.current.delete(targetTabId);
          if (enterResult.triggerEvents?.length) {
            processTriggerEvents(term, enterResult.triggerEvents, true);
          }
          if (enterResult.transitionTo) {
            pendingNotificationsRef.current = null;
            if (dispatchTransition(term, enterResult.transitionTo, computerId)) {
              return;
            }
          }
          writePrompt(term);
          return;
        }
      } else if (session.type === "chip") {
        const store = useGameStore.getState();
        const currentFs = store.computerState[computerId]!.fs;
        const chipSession = new ChipSession(
          term,
          currentFs,
          currentFs.homeDir,
          session.info,
          (topics) => {
            const value = topics.join(",");
            useGameStore.getState().setStoryFlag("used_chip_topics", value);
          }
        );
        sessionMapRef.current.set(targetTabId, { session: chipSession, type: "chip" });
        chipSession.enter();
      } else if (session.type === "piper") {
        const store = useGameStore.getState();
        const piperInfo = {
          ...session.info,
          deliveredPiperIds: [...store.deliveredPiperIds],
        };
        const piperSession = new PiperSession(term, piperInfo, store.username);
        sessionMapRef.current.set(targetTabId, { session: piperSession, type: "piper", piperInfo });
        piperSession.enter();
      }
    },
    [activeComputerRef, writePrompt, processTriggerEvents, dispatchTransition, pendingNotificationsRef]
  );

  const canCloseCurrentSession = useCallback((): boolean => {
    const activeTabId = useGameStore.getState().activeTabId;
    const entry = sessionMapRef.current.get(activeTabId);
    if (!entry) return true;
    return entry.session.canClose?.() ?? true;
  }, []);

  /**
   * Remove the session entry for a tab being closed.
   * NOTE: This only deletes the map entry — it does NOT write \x1b[?1049l to exit the
   * alt-buffer. This is safe because cleanupTab is always called immediately before
   * store.removeTab() / term.dispose(), which destroys the xterm instance entirely.
   */
  const cleanupTab = useCallback((tabId: string) => {
    const store = useGameStore.getState();
    if (store.activeSnowSession === tabId) {
      store.setActiveSnowSession(null);
    }
    sessionMapRef.current.delete(tabId);
  }, []);

  /** Notify the active tab's session (if any) that the terminal was resized. */
  const resizeActiveSession = useCallback(() => {
    const tabId = useGameStore.getState().activeTabId;
    const entry = sessionMapRef.current.get(tabId);
    entry?.session.resize?.();
  }, []);

  return { hasActiveSession, routeInput, startSession, canCloseCurrentSession, refreshPiperSession, cleanupTab, resizeActiveSession };
}
