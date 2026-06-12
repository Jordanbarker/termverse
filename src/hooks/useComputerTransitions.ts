import { useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore, buildFs } from "../state/gameStore";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { createDevcontainerFilesystem } from "../story/filesystem/devcontainer";
import { createChipinfraFilesystem } from "../story/filesystem/chipinfra";
import { createHomeFilesystem } from "../story/filesystem/home";
import { checkEmailDeliveries, seedDeliveredEmails, GameEvent } from "../engine/mail/delivery";
import { getReadEmailIds } from "../engine/mail/mailUtils";
import { getEmailDefinitions } from "../engine/mail/emails";
import { seedImmediatePiper, deliverPiperAndCascade } from "../engine/piper/delivery";
import { gitClone } from "../engine/git/repo";
import { syncToVirtualFS } from "../engine/snowflake/bridge/fs_bridge";
import { createInitialSnowflakeState } from "../engine/snowflake/seed/initial_data";
import { colorize, ansi } from "../lib/ansi";
import { nexacorpLogo, getSshConnectionSequence, getBootSequence, getHomeBootSequence, getCoderConnectionSequence, getCoderBanner, getHomeWelcome, UNLOCK_BOX, getUpdateNotification, getEndgameCreditsBlock } from "../lib/ascii";
import {
  BOOT_LINE_INTERVAL_MS,
  SECURITY_ALERT_LINE_INTERVAL_MS,
  SECURITY_DISCONNECT_PAUSE_MS,
  TERMINATION_PRE_BLACKOUT_MS,
  TERMINATION_BLACKOUT_MS,
} from "../lib/timing";
import { ComputerId, COMPUTERS } from "../state/types";
import { SecurityViolation, getTerminationAlertLines } from "../story/security";

interface TransitionDeps {
  cwdRef: React.MutableRefObject<string>;
  activeComputerRef: React.MutableRefObject<ComputerId>;
  writePrompt: (term: Terminal) => void;
}

export function useComputerTransitions(deps: TransitionDeps) {
  const { cwdRef, activeComputerRef, writePrompt } = deps;

  /** Arrival on Erik's laptop via stolen ssh-agent. No boot animation —
   * SSHing into an already-running box just prints the last-login line
   * and drops you into a shell.
   */
  const runErikpcArrival = useCallback((term: Terminal) => {
    const store = useGameStore.getState();
    const username = store.username;

    // Lazy-init: only build the FS the first time. Re-pivots preserve any edits.
    let entry = store.computerState["erik-pc"];
    if (!entry) {
      const newFs = buildFs(username, "erik-pc", store.storyFlags, store.deliveredEmailIds);
      store.initComputer("erik-pc", newFs);
      entry = useGameStore.getState().computerState["erik-pc"]!;
    }

    const newCwd = entry.fs.cwd;
    store.setTabComputer(store.activeTabId, "erik-pc", newCwd);
    activeComputerRef.current = "erik-pc";
    cwdRef.current = newCwd;

    // Flag is set on arrival so the path is reliable even if the player
    // backs out of the fingerprint prompt and tries again from scratch.
    if (!store.storyFlags.pivoted_to_erik_pc) {
      store.setStoryFlag("pivoted_to_erik_pc", true);
    }

    // Realistic OpenSSH last-login line. No "Connected to X." text — real ssh
    // prints nothing of the sort. Erik's laptop has MOTD disabled (typical
    // for personal dev workstations), so no system banner either.
    term.writeln("");
    term.writeln(colorize("Last login: Fri May  9 14:23:18 2026 from coder-chip.platform.internal", ansi.dim));
    useGameStore.getState().setGamePhase("playing");
    writePrompt(term);
  }, [cwdRef, activeComputerRef, writePrompt]);

  const runSshTransition = useCallback((term: Terminal, target: ComputerId = "nexacorp") => {
    if (target === "erik-pc") {
      runErikpcArrival(term);
      return;
    }
    const store = useGameStore.getState();
    store.setGamePhase("transitioning");

    const username = store.username;
    const sshLines = getSshConnectionSequence(username);
    let i = 0;
    const sshInterval = setInterval(() => {
      if (i < sshLines.length) {
        term.writeln(sshLines[i]);
        i++;
      } else {
        clearInterval(sshInterval);

        setTimeout(() => {
          term.clear();
          const s = useGameStore.getState();

          // Close all non-active home tabs
          const homeTabs = s.tabs.filter(
            (t) => t.computerId === "home" && t.id !== s.activeTabId
          );
          for (const t of homeTabs) s.removeTab(t.id);
          if (s.currentChapter === "chapter-1") {
            s.setCurrentChapter("chapter-2");
          }

          // On Day 2, rebuild SnowflakeState with extended data
          if (s.storyFlags.day1_shutdown) {
            const newSfState = createInitialSnowflakeState({ includeDay2: true });
            s.setSnowflakeState(newSfState);
          }

          // Build NexaCorp filesystem directly and init computer state
          const nexaFs = buildFs(username, "nexacorp", s.storyFlags, s.deliveredEmailIds);
          const sfState = useGameStore.getState().snowflakeState;
          const finalFs = syncToVirtualFS(sfState, nexaFs);
          s.initComputer("nexacorp", finalFs);
          const newCwd = finalFs.cwd;

          // Update current tab to nexacorp
          s.setTabComputer(s.activeTabId, "nexacorp", newCwd);
          activeComputerRef.current = "nexacorp";
          cwdRef.current = newCwd;

          const state = useGameStore.getState();

          // Seed immediate piper messages for NexaCorp
          const piperIds = seedImmediatePiper(state.username, "nexacorp");
          if (piperIds.length > 0) {
            state.addDeliveredPiperMessages(piperIds);
          }

          // Track whether new Piper messages were delivered during transition
          let hadNewPiper = false;

          // On Day 2 SSH, set ssh_day2 flag and run delivery cascade
          if (state.storyFlags.day1_shutdown) {
            state.setStoryFlag("ssh_day2", true);

            // Deliver Piper messages triggered by ssh_day2 (e.g. auri_day2_morning)
            const sshState = useGameStore.getState();
            const cascade = deliverPiperAndCascade(
              { type: "command_executed", detail: "ssh_nexacorp" },
              "nexacorp",
              sshState.username,
              sshState.deliveredPiperIds,
              sshState.storyFlags
            );
            if (cascade.newPiperIds.length > 0) {
              hadNewPiper = true;
              useGameStore.getState().addDeliveredPiperMessages(cascade.newPiperIds);
              for (const update of cascade.flagUpdates) {
                useGameStore.getState().setStoryFlag(update.flag, update.value);
              }
            }
          }

          // Boot sequence
          state.setGamePhase("booting");
          const bootLines = getBootSequence(username);
          let j = 0;
          const bootInterval = setInterval(() => {
            if (j < bootLines.length) {
              term.writeln(bootLines[j]);
              j++;
            } else {
              clearInterval(bootInterval);
              term.writeln("");
              nexacorpLogo.forEach((line) => term.writeln(line));
              if (hadNewPiper) {
                term.writeln("");
                term.writeln(colorize("You have new messages on Piper", ansi.yellow, ansi.bold));
              }
              useGameStore.getState().setGamePhase("playing");
            }
          }, BOOT_LINE_INTERVAL_MS);
        }, BOOT_LINE_INTERVAL_MS);
      }
    }, BOOT_LINE_INTERVAL_MS);
  }, [cwdRef, activeComputerRef, runErikpcArrival]);

  /**
   * Build a fresh per-computer filesystem for a Coder workspace transition.
   * Centralizes the per-target divergence so runCoderTransition stays generic.
   */
  const buildCoderTargetFs = (
    target: "devcontainer" | "chipinfra",
    username: string,
    storyFlags: Record<string, string | boolean>,
  ): VirtualFS => {
    if (target === "chipinfra") {
      const root = createChipinfraFilesystem(username, storyFlags);
      return new VirtualFS(root, `/home/${username}`, `/home/${username}`);
    }
    // devcontainer: rebuild with dbt_project_cloned suppressed; gitClone re-creates it with .git below.
    const rebuildFlags = { ...storyFlags, dbt_project_cloned: false };
    const root = createDevcontainerFilesystem(username, rebuildFlags);
    let newFs = new VirtualFS(root, `/home/${username}`, `/home/${username}`);
    if (storyFlags.dbt_project_cloned) {
      const cloneResult = gitClone(newFs, `/home/${username}`, "nexacorp/nexacorp-analytics", username);
      if (!cloneResult.error) newFs = cloneResult.fs;
    }
    return newFs;
  };

  const runCoderTransition = useCallback((term: Terminal, target: "devcontainer" | "chipinfra" = "devcontainer") => {
    const store = useGameStore.getState();
    const visitedFlag = target === "chipinfra" ? "chipinfra_visited" : "devcontainer_visited";
    const workspaceName = target === "chipinfra" ? "chip" : "ai";
    const banner = getCoderBanner(workspaceName);
    const isSubsequent = !!store.computerState[target] || !!store.storyFlags[visitedFlag];

    if (isSubsequent) {
      // Subsequent visit — no animation, just repurpose tab
      let entry = store.computerState[target];

      if (!entry) {
        // State was removed (e.g. exit to home) — rebuild silently
        const newFs = buildCoderTargetFs(target, store.username, store.storyFlags);
        store.initComputer(target, newFs);
        entry = useGameStore.getState().computerState[target]!;
      }

      const newCwd = entry.fs.cwd;
      store.setTabComputer(store.activeTabId, target, newCwd);
      activeComputerRef.current = target;
      cwdRef.current = newCwd;
      term.writeln("");
      banner.forEach((line) => term.writeln(line));
      writePrompt(term);
      return;
    }

    // First-time visit — full connection animation
    store.setGamePhase("transitioning");

    const lines = getCoderConnectionSequence(workspaceName);
    let i = 0;
    const interval = setInterval(() => {
      if (i < lines.length) {
        term.writeln(lines[i]);
        i++;
      } else {
        clearInterval(interval);

        const s = useGameStore.getState();
        if (!s.storyFlags[visitedFlag]) {
          s.setStoryFlag(visitedFlag, true);
          if (target === "devcontainer") {
            s.addToast("dbt and snow commands unlocked on NexaCorp!");
          }
          // Cross-arc bridge: if the player already read the USB note before
          // first chipinfra visit, open "Pulling at a Loose Thread" now. The
          // reverse ordering (visit-first, read-later) is handled by a
          // file_read trigger in storyFlags.ts requiring chipinfra_visited.
          if (
            target === "chipinfra" &&
            s.storyFlags.read_usb_note &&
            !s.storyFlags.loose_thread_quest_started
          ) {
            s.setStoryFlag("loose_thread_quest_started", true);
            s.addToast("New quest: Pulling at a Loose Thread");
          }
        }

        const newFs = buildCoderTargetFs(target, s.username, s.storyFlags);
        const newCwd = newFs.cwd;

        s.initComputer(target, newFs);

        // Repurpose current tab to the new target
        s.setTabComputer(s.activeTabId, target, newCwd);
        activeComputerRef.current = target;
        cwdRef.current = newCwd;

        term.writeln("");
        banner.forEach((line) => term.writeln(line));
        useGameStore.getState().setGamePhase("playing");
        writePrompt(term);
      }
    }, BOOT_LINE_INTERVAL_MS);
  }, [cwdRef, activeComputerRef, writePrompt]);

  /**
   * Generalized "exit back to the parent" transition. Closes other tabs on the
   * source workspace, repurposes the active tab to `target`, restores the
   * target's cwd, and writes a disconnect banner using the source hostname.
   *
   * Used by:
   *   - chipinfra/devcontainer → nexacorp
   *   - erik-pc → chipinfra
   */
  const runExitToParent = useCallback((term: Terminal, target: ComputerId) => {
    const store = useGameStore.getState();
    const sourceComputer = store.tabs.find((t) => t.id === store.activeTabId)?.computerId;

    // Close any other tabs still pointing at the workspace we're leaving.
    if (sourceComputer === "devcontainer" || sourceComputer === "chipinfra" || sourceComputer === "erik-pc") {
      const otherTabs = store.tabs.filter(
        (t) => t.computerId === sourceComputer && t.id !== store.activeTabId
      );
      for (const t of otherTabs) store.removeTab(t.id);
    }

    // Restore target cwd from computerState (default to its conventional home dir)
    const targetEntry = store.computerState[target];
    const fallbackHome = `/home/${store.username}`;
    const targetCwd = targetEntry?.fs?.cwd ?? fallbackHome;

    store.setTabComputer(store.activeTabId, target, targetCwd);
    activeComputerRef.current = target;
    cwdRef.current = targetCwd;

    const sourceHostname = sourceComputer
      ? COMPUTERS[sourceComputer].promptHostname
      : "remote";
    term.writeln(colorize(`\r\nDisconnected from ${sourceHostname}.`, ansi.dim));

    // Piper notifications only land on nexacorp — chipinfra/devcontainer/erik-pc
    // don't surface them. So gate the deferred-notification flush to nexacorp.
    if (target === "nexacorp") {
      const latest = useGameStore.getState();
      if (latest.pendingPiperNotification) {
        term.write(`\r\n${colorize("You have new messages on Piper", ansi.yellow, ansi.bold)}`);
        latest.setPendingPiperNotification(false);
      }
    }

    writePrompt(term);
  }, [cwdRef, activeComputerRef, writePrompt]);

  /** Backwards-compatible shim — callers that still ask for nexacorp explicitly. */
  const runExitToNexacorp = useCallback((term: Terminal) => runExitToParent(term, "nexacorp"), [runExitToParent]);

  const runExitToHome = useCallback((term: Terminal) => {
    const store = useGameStore.getState();
    store.setGamePhase("transitioning");

    const logoffLines = [
      colorize("Logging off NexaCorp workstation...", ansi.dim),
      "",
      colorize("Session closed.", ansi.dim),
    ];
    let i = 0;
    const interval = setInterval(() => {
      if (i < logoffLines.length) {
        term.writeln(logoffLines[i]);
        i++;
      } else {
        clearInterval(interval);

        const s = useGameStore.getState();

        // Close all other nexacorp / devcontainer / chipinfra tabs
        const tabsToClose = s.tabs.filter(
          (t) =>
            (t.computerId === "nexacorp" ||
              t.computerId === "devcontainer" ||
              t.computerId === "chipinfra") &&
            t.id !== s.activeTabId
        );
        for (const t of tabsToClose) s.removeTab(t.id);

        // Rebuild home FS
        const username = s.username;
        const prevHomeFs = s.computerState.home?.fs;

        // Capture read email IDs before rebuilding FS
        const readIds = prevHomeFs
          ? getReadEmailIds(prevHomeFs, getEmailDefinitions(username, "home").map((d) => d.email))
          : new Set<string>();

        const root = createHomeFilesystem(username);
        let newFs = new VirtualFS(root, `/home/${username}`, `/home/${username}`);

        // Re-seed previously delivered emails, preserving read state
        const allDelivered = s.deliveredEmailIds;
        if (allDelivered.length > 0) {
          newFs = seedDeliveredEmails(newFs, allDelivered, "home", username, readIds, s.storyFlags);
        }

        // Preserve known_hosts from previous FS
        if (prevHomeFs) {
          const knownHostsPath = `/home/${username}/.ssh/known_hosts`;
          const prev = prevHomeFs.readFile(knownHostsPath);
          if (prev.content) {
            const result = newFs.writeFile(knownHostsPath, prev.content);
            if (result.fs) newFs = result.fs;
          }
        }

        s.initComputer("home", newFs);

        // Tracks-exposed scan. If the player pivoted to Erik's PC and left
        // chipinfra's ~/.ssh/known_hosts containing the nexacorp-lt05 entry that
        // SshSession appended on first connect, fire tracks_exposed_chapter4
        // so the hr_security_freeze email delivers alongside marcus_board_debrief.
        // Must run BEFORE removeComputer("chipinfra") below.
        if (s.storyFlags.pivoted_to_erik_pc) {
          const chipFs = s.computerState.chipinfra?.fs;
          const kh = chipFs?.readFile(`/home/${username}/.ssh/known_hosts`).content ?? "";
          if (kh.includes("nexacorp-lt05")) {
            s.setStoryFlag("tracks_exposed_chapter4", true);
          }
        }

        // Remove non-home computers from computerState so they don't appear in "+" dropdown
        s.removeComputer("nexacorp");
        s.removeComputer("devcontainer");
        s.removeComputer("chipinfra");

        // Repurpose current tab to home
        const homeCwd = newFs.cwd;
        s.setTabComputer(s.activeTabId, "home", homeCwd);
        activeComputerRef.current = "home";
        cwdRef.current = homeCwd;

        // Day 2 wrap path: accusation_made was set during Chapter 3, and the
        // synthetic `exit_day2_logoff` event from exit.ts set returned_home_day2
        // just before this transition. read_board_debrief_day2 is still unset
        // (it only fires when the player opens Marcus's email at home).
        const isDay2Wrap = !!s.storyFlags.returned_home_day2 && !s.storyFlags.read_board_debrief_day2;

        const runDeliveries = () => {
          const ss = useGameStore.getState();
          // Idempotent on Day 2 (already set/completed).
          ss.setStoryFlag("returned_home_day1", true);
          ss.completeObjective("head_home");

          // Pass storyFlags so after_story_flag triggers (e.g. marcus_board_debrief)
          // fire and any flag-branched bodies render correctly.
          const latest = useGameStore.getState();
          const homeFs = latest.computerState.home?.fs ?? newFs;
          const deliveryResult = checkEmailDeliveries(
            homeFs,
            { type: "objective_completed", detail: "head_home" },
            [...latest.deliveredEmailIds],
            "home",
            latest.storyFlags
          );
          if (deliveryResult.newDeliveries.length > 0) {
            latest.setComputerFs("home", deliveryResult.fs);
            latest.addDeliveredEmails(deliveryResult.newDeliveries);
            term.writeln("");
            term.write(colorize(`You have new mail in /var/mail/${username}`, ansi.yellow, ansi.bold));
          }

          // Deliver Piper messages triggered by returned_home_day1
          const latestForPiper = useGameStore.getState();
          const cascade = deliverPiperAndCascade(
            { type: "objective_completed", detail: "head_home" },
            "home",
            username,
            latestForPiper.deliveredPiperIds,
            latestForPiper.storyFlags
          );
          if (cascade.newPiperIds.length > 0) {
            useGameStore.getState().addDeliveredPiperMessages(cascade.newPiperIds);
            term.writeln("");
            term.writeln(colorize("You have new messages on Piper", ansi.yellow, ansi.bold));
            for (const update of cascade.flagUpdates) {
              useGameStore.getState().setStoryFlag(update.flag, update.value);
            }
          }

          useGameStore.getState().setGamePhase("playing");
          writePrompt(term);
        };

        // Only a genuine end-of-day exit progresses the story. `read_end_of_day`
        // is set by reading Edward's end-of-day email (Day 1) and persists into
        // Day 2. When it is unset the player is logging off mid-shift: drop them
        // at the home shell without setting returned_home_day1 (so `shutdown`
        // stays locked and they can `ssh` back to finish). No evening deliveries.
        const isEndOfDay = Boolean(s.storyFlags.read_end_of_day);

        if (!isEndOfDay) {
          useGameStore.getState().setGamePhase("playing");
          writePrompt(term);
        } else if (isDay2Wrap) {
          // Evening pause — implies hours passing between leaving work and
          // arriving home. Then a quiet grounding line before deliveries.
          term.writeln("");
          setTimeout(() => {
            term.writeln("");
            term.writeln(colorize("21:14. You're home.", ansi.dim));
            term.writeln("");
            setTimeout(runDeliveries, 800);
          }, 1800);
        } else {
          runDeliveries();
        }
      }
    }, BOOT_LINE_INTERVAL_MS);
  }, [cwdRef, activeComputerRef, writePrompt]);

  /**
   * Cosmetic home-PC reboot for a non-questline `shutdown`: power off, boot
   * right back up. No FS rebuild, no story flags, no deliveries, no chapter
   * change — the in-game clock derives from delivery progression, so the
   * datetime is unchanged too. Other tabs are closed (a reboot kills every
   * terminal and any SSH session originating from this box) but computerState
   * is kept, so reconnecting finds everything as it was.
   */
  const runRebootTransition = useCallback((term: Terminal) => {
    const store = useGameStore.getState();
    store.setGamePhase("transitioning");

    term.write("\x1b[?25l"); // hide cursor during animation
    term.clear();

    setTimeout(() => {
      const s = useGameStore.getState();
      const otherTabs = s.tabs.filter((t) => t.id !== s.activeTabId);
      for (const t of otherTabs) s.removeTab(t.id);

      // Fresh login shell starts in ~
      const homeDir = `/home/${s.username}`;
      s.setTabCwd(s.activeTabId, homeDir);
      cwdRef.current = homeDir;

      useGameStore.getState().setGamePhase("booting");
      const bootLines = getHomeBootSequence();
      let j = 0;
      const bootInterval = setInterval(() => {
        if (j < bootLines.length) {
          term.writeln(bootLines[j]);
          j++;
        } else {
          clearInterval(bootInterval);
          term.write("\x1b[?25h"); // restore cursor
          useGameStore.getState().setGamePhase("playing");
          writePrompt(term);
        }
      }, BOOT_LINE_INTERVAL_MS);
    }, 2500);
  }, [cwdRef, writePrompt]);

  const runShutdownTransition = useCallback((term: Terminal) => {
    const store = useGameStore.getState();
    const isEndgame = Boolean(store.storyFlags.read_board_debrief_day2);
    store.setGamePhase("transitioning");

    // Black screen pause (simulating overnight on Day 1; "lights out" for endgame).
    term.write("\x1b[?25l"); // hide cursor during animation
    term.clear();

    if (isEndgame) {
      // Endgame: no FS rebuild, no Day-2 boot, no delivery cascades. Just print
      // the credits block, set game_ended, and leave the terminal idle.
      setTimeout(() => {
        const credits = getEndgameCreditsBlock();
        credits.forEach((line) => term.writeln(line));
        useGameStore.getState().setStoryFlag("game_ended", true);
        // Stay in "transitioning" phase so the input handler never re-enables
        // and writePrompt is never called.
      }, 2500);
      return;
    }

    setTimeout(() => {
      const s = useGameStore.getState();
      const username = s.username;

      // Capture read email IDs before rebuilding FS
      const prevHomeFs = s.computerState.home?.fs;
      const readIds = prevHomeFs
        ? getReadEmailIds(prevHomeFs, getEmailDefinitions(username, "home").map((d) => d.email))
        : new Set<string>();

      // Rebuild home FS for Day 2
      const root = createHomeFilesystem(username);
      let newFs = new VirtualFS(root, `/home/${username}`, `/home/${username}`);
      const allDelivered = s.deliveredEmailIds;
      if (allDelivered.length > 0) {
        newFs = seedDeliveredEmails(newFs, allDelivered, "home", username, readIds);
      }

      // Preserve known_hosts from previous FS
      if (prevHomeFs) {
        const knownHostsPath = `/home/${username}/.ssh/known_hosts`;
        const prev = prevHomeFs.readFile(knownHostsPath);
        if (prev.content) {
          const result = newFs.writeFile(knownHostsPath, prev.content);
          if (result.fs) newFs = result.fs;
        }
      }

      // (.zsh_history is now restored generically by initComputer from the
      // durable zshHistory mirror — no per-transition preservation needed.)

      s.initComputer("home", newFs);

      // Set Day 2 state
      s.setStoryFlag("day1_shutdown", true);
      s.setStoryFlag("apt_unlocked", true);
      s.setCurrentChapter("chapter-3");

      // Repurpose current tab to home
      const homeCwd = newFs.cwd;
      s.setTabComputer(s.activeTabId, "home", homeCwd);
      activeComputerRef.current = "home";
      cwdRef.current = homeCwd;

      // Run delivery cascade for day1_shutdown
      const latest = useGameStore.getState();
      const homeFs = latest.computerState.home?.fs ?? newFs;
      const shutdownEvent: GameEvent = { type: "command_executed", detail: "shutdown" };
      const emailResult = checkEmailDeliveries(
        homeFs,
        shutdownEvent,
        [...latest.deliveredEmailIds],
        "home"
      );
      if (emailResult.newDeliveries.length > 0) {
        latest.setComputerFs("home", emailResult.fs);
        latest.addDeliveredEmails(emailResult.newDeliveries);
      }

      const latestForPiper = useGameStore.getState();
      const cascade = deliverPiperAndCascade(
        shutdownEvent,
        "home",
        username,
        latestForPiper.deliveredPiperIds,
        latestForPiper.storyFlags
      );
      if (cascade.newPiperIds.length > 0) {
        useGameStore.getState().addDeliveredPiperMessages(cascade.newPiperIds);
        for (const update of cascade.flagUpdates) {
          useGameStore.getState().setStoryFlag(update.flag, update.value);
        }
      }

      // Cinematic boot sequence
      useGameStore.getState().setGamePhase("booting");
      const bootLines = getHomeBootSequence();
      let j = 0;
      const bootInterval = setInterval(() => {
        if (j < bootLines.length) {
          term.writeln(bootLines[j]);
          j++;
        } else {
          clearInterval(bootInterval);

          // Show Day 2 welcome banner
          const day2Welcome = getHomeWelcome(2);
          day2Welcome.forEach((line) => term.writeln(line));
          UNLOCK_BOX.forEach((line) => term.writeln(line));

          if (!useGameStore.getState().storyFlags.apt_upgraded) {
            getUpdateNotification().forEach((line) => term.writeln(line));
          }

          term.write("\x1b[?25h"); // restore cursor
          useGameStore.getState().setGamePhase("playing");
        }
      }, BOOT_LINE_INTERVAL_MS);
    }, 2500);
  }, [cwdRef, activeComputerRef]);

  /**
   * Forced disconnect from NexaCorp after a security tripwire fires. Mirrors
   * the FS-rebuild path of runExitToHome but: prints a hostile-disconnect line,
   * sets the termination flags before delivery, and triggers the termination
   * email via a synthesized `terminated` event.
   */
  const runTerminationTransition = useCallback(
    (term: Terminal, violation: SecurityViolation) => {
      const store = useGameStore.getState();
      store.setGamePhase("transitioning");

      // t=0: flip flags immediately so any code reading them during the cinematic
      // sees the post-termination state. Violation specifics are persisted so the
      // HR email body can name the actual command and path, and survive save/load.
      store.setStoryFlag("terminated_for_misconduct", true);
      store.setStoryFlag("termination_reason", violation.kind);
      store.setStoryFlag("termination_path", violation.path);
      store.setStoryFlag("termination_command", violation.command);
      store.setStoryFlag("termination_descendant_count", String(violation.descendantCount));
      if (violation.destPath) {
        store.setStoryFlag("termination_dest_path", violation.destPath);
      }

      // t=0: close sibling nexacorp/devcontainer/chipinfra tabs so the player can't
      // Ctrl+B,N to another tab on the doomed workstation and keep working while the
      // cinematic plays.
      const siblingTabs = store.tabs.filter(
        (t) =>
          (t.computerId === "nexacorp" ||
            t.computerId === "devcontainer" ||
            t.computerId === "chipinfra") &&
          t.id !== store.activeTabId
      );
      for (const t of siblingTabs) store.removeTab(t.id);

      const pid = Math.floor(1000 + Math.random() * 9000);
      const alertLines = getTerminationAlertLines(violation, pid);

      term.writeln("");

      // Stages 1-3: stream the corp-sec audit lines.
      alertLines.forEach((line, i) => {
        setTimeout(() => term.writeln(line), SECURITY_ALERT_LINE_INTERVAL_MS * (i + 1));
      });

      // Stage 4: disconnect.
      const disconnectAt =
        SECURITY_ALERT_LINE_INTERVAL_MS * alertLines.length + SECURITY_DISCONNECT_PAUSE_MS;
      setTimeout(() => {
        term.writeln("");
        term.writeln(colorize("Connection to nexacorp closed by remote host.", ansi.red));
        term.writeln(colorize("Killed by signal 1.", ansi.dim));
      }, disconnectAt);

      // Stage 5: blackout.
      const blackoutAt = disconnectAt + TERMINATION_PRE_BLACKOUT_MS;
      setTimeout(() => {
        term.write("\x1b[?25l");
        term.clear();
      }, blackoutAt);

      // Stage 6: home reentry.
      const reentryAt = blackoutAt + TERMINATION_BLACKOUT_MS;
      setTimeout(() => {
        const s = useGameStore.getState();
        const username = s.username;
        const prevHomeFs = s.computerState.home?.fs;
        const readIds = prevHomeFs
          ? getReadEmailIds(prevHomeFs, getEmailDefinitions(username, "home").map((d) => d.email))
          : new Set<string>();

        const root = createHomeFilesystem(username);
        let newFs = new VirtualFS(root, `/home/${username}`, `/home/${username}`);

        const allDelivered = s.deliveredEmailIds;
        if (allDelivered.length > 0) {
          newFs = seedDeliveredEmails(newFs, allDelivered, "home", username, readIds, s.storyFlags);
        }

        if (prevHomeFs) {
          const knownHostsPath = `/home/${username}/.ssh/known_hosts`;
          const prev = prevHomeFs.readFile(knownHostsPath);
          if (prev.content) {
            const result = newFs.writeFile(knownHostsPath, prev.content);
            if (result.fs) newFs = result.fs;
          }
        }

        s.initComputer("home", newFs);
        s.removeComputer("nexacorp");
        s.removeComputer("devcontainer");
        s.removeComputer("chipinfra");

        const homeCwd = newFs.cwd;
        s.setTabComputer(s.activeTabId, "home", homeCwd);
        activeComputerRef.current = "home";
        cwdRef.current = homeCwd;

        const finalState = useGameStore.getState();
        const homeFs = finalState.computerState.home?.fs ?? newFs;
        const deliveryResult = checkEmailDeliveries(
          homeFs,
          { type: "terminated", detail: violation.kind },
          [...finalState.deliveredEmailIds],
          "home",
          finalState.storyFlags
        );
        if (deliveryResult.newDeliveries.length > 0) {
          finalState.setComputerFs("home", deliveryResult.fs);
          finalState.addDeliveredEmails(deliveryResult.newDeliveries);
          term.writeln("");
          term.write(colorize(`You have new mail in /var/mail/${username}`, ansi.yellow, ansi.bold));
        }

        term.write("\x1b[?25h");
        useGameStore.getState().setGamePhase("playing");
        writePrompt(term);
      }, reentryAt);
    },
    [cwdRef, activeComputerRef, writePrompt]
  );

  /**
   * Source-aware transition dispatcher. Centralizes the matrix of
   * (transitionTo × sourceComputer) → which transition function to run.
   * Both the command-result dispatcher in useTerminal and the session-result
   * dispatcher in useSessionRouter route through this helper.
   *
   * Returns true if a transition was dispatched.
   */
  const dispatchTransition = useCallback(
    (
      term: Terminal,
      transitionTo: ComputerId,
      sourceComputer: ComputerId,
      terminationReason?: SecurityViolation,
    ): boolean => {
      // Security tripwire: forced disconnect from nexacorp.
      if (transitionTo === "home" && sourceComputer === "nexacorp" && terminationReason) {
        runTerminationTransition(term, terminationReason);
        return true;
      }
      // First-time pivots from nexacorp → coder workspace
      if (transitionTo === "devcontainer") {
        runCoderTransition(term, "devcontainer");
        return true;
      }
      if (transitionTo === "chipinfra" && sourceComputer === "nexacorp") {
        runCoderTransition(term, "chipinfra");
        return true;
      }
      // Exit erik-pc → chipinfra
      if (transitionTo === "chipinfra" && sourceComputer === "erik-pc") {
        runExitToParent(term, "chipinfra");
        return true;
      }
      // Exit coder workspace → nexacorp
      if (transitionTo === "nexacorp" && (sourceComputer === "devcontainer" || sourceComputer === "chipinfra")) {
        runExitToParent(term, "nexacorp");
        return true;
      }
      // SSH home → nexacorp (first ssh)
      if (transitionTo === "nexacorp" && sourceComputer === "home") {
        runSshTransition(term, "nexacorp");
        return true;
      }
      // SSH chipinfra → erik-pc
      if (transitionTo === "erik-pc" && sourceComputer === "chipinfra") {
        runSshTransition(term, "erik-pc");
        return true;
      }
      // Exit nexacorp → home (end of day)
      if (transitionTo === "home" && sourceComputer === "nexacorp") {
        runExitToHome(term);
        return true;
      }
      return false;
    },
    [runCoderTransition, runExitToParent, runSshTransition, runExitToHome, runTerminationTransition]
  );

  return { runSshTransition, runCoderTransition, runExitToNexacorp, runExitToParent, runExitToHome, runShutdownTransition, runRebootTransition, runTerminationTransition, dispatchTransition };
}
