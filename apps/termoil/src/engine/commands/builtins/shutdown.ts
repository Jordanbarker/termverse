import { CommandHandler } from "@tt/core/commands/types";
import { register } from "@tt/core/commands/registry";
import { setHelpVisibilityFilter } from "@tt/core/commands/builtins/help";
import { setKnownFlags } from "@tt/core/commands/flagValidation";
import { getShutdownIncrementalLines, getRemoteShutdownIncrementalLines } from "@/lib/ascii";
import { COMPUTERS, CONNECTION_PARENT, ComputerId } from "../../../state/types";
import { HELP_TEXTS } from "./helpTexts";
import { ansi, colorize } from "@tt/core/lib/ansi";
import { errorResult } from "@tt/core/commands/fsErrors";

const shutdown: CommandHandler = (args, flags, ctx) => {
  if (flags.c) {
    if (flags.h || args.length > 0) return errorResult("Usage: shutdown [-h] [now] or shutdown -c", 2);
    return {
      output: ctx.pendingCommands?.includes("shutdown") ? "Shutdown cancelled.\n" : "",
      deferredCommands: [{ type: "cancel", command: "shutdown" }],
      deferEvents: true,
    };
  }
  const immediate = args.length === 1 && args[0] === "now";
  if (!immediate && args.length > 0) {
    return errorResult("Usage: shutdown [-h] [now] or shutdown -c", 2);
  }

  if (!immediate) {
    if (ctx.pendingCommands?.includes("shutdown")) {
      return { ...errorResult("Shutdown already scheduled. Use 'shutdown -c' to cancel.", 1), deferEvents: true };
    }
    const hostname = COMPUTERS[(ctx.activeComputer || "home") as ComputerId].promptHostname;
    return {
      output: [
        "",
        colorize(`Broadcast message from root@${hostname}:`, ansi.yellow),
        colorize("The system is going down for poweroff in 1 minute!", ansi.yellow),
        "",
      ].join("\n"),
      deferredCommands: [{ type: "schedule", command: "shutdown", args: ["now"], flags: { h: true }, delayMs: 60000 }],
      deferEvents: true,
    };
  }

  // Remote machines: the box powers off under the SSH session, which drops
  // back to wherever the player connected from. Nothing is lost — the machine
  // is back up (unchanged) the next time they connect.
  const computer = ctx.activeComputer as ComputerId;
  if (computer && computer !== "home") {
    const target = CONNECTION_PARENT[computer];
    if (!target) return { output: "shutdown: operation not permitted\n" };
    const hostname = COMPUTERS[computer].promptHostname;
    return {
      output: "",
      incrementalLines: getRemoteShutdownIncrementalLines(hostname),
      transitionTo: target,
      // A rebooting box drops every SSH session to it, not just this one,
      // plus any session chained through it (the handler expands this to the
      // connection closure). Unlike `exit`, which only ends this session and
      // leaves sibling tabs connected.
      closeTabsForComputer: computer,
      // Powering off the workstation post-accusation is a logoff: fire the
      // same Day-2 wrap event as `exit` so the evening plays out identically.
      ...(computer === "nexacorp" && ctx.storyFlags?.accusation_made
        ? { triggerEvents: [{ type: "command_executed" as const, detail: "exit_day2_logoff" }] }
        : {}),
    };
  }

  const endgame = Boolean(ctx.storyFlags?.read_board_debrief_day2);

  // Questline shutdowns: the scripted end of Day 1 (advances to Day 2) and
  // the endgame credits roll. Everything else falls through to a cosmetic
  // reboot below.
  if ((ctx.storyFlags?.returned_home_day1 && !ctx.storyFlags?.day1_shutdown) || endgame) {
    return {
      output: "",
      incrementalLines: getShutdownIncrementalLines(),
      gameAction: { type: "shutdown" },
    };
  }

  // Cosmetic reboot: power off, boot right back up. Same in-game datetime,
  // no flags, no deliveries — nothing changes.
  return {
    output: "",
    incrementalLines: getShutdownIncrementalLines(),
    gameAction: { type: "reboot" },
  };
};

register("shutdown", shutdown, "Power off the system", HELP_TEXTS.shutdown);
setKnownFlags("shutdown", { short: ["h", "c"] });

// Once the scripted Day-1 shutdown has happened, `help` stops advertising
// shutdown (it stays runnable — it's just no longer part of the quest surface).
setHelpVisibilityFilter((name, flags) => !(name === "shutdown" && flags?.day1_shutdown));
