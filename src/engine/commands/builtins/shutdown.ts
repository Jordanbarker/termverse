import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { getShutdownIncrementalLines, getRemoteShutdownIncrementalLines } from "../../../lib/ascii";
import { ComputerId, COMPUTERS } from "../../../state/types";

/** Where an SSH session lands when the machine it's connected to powers off. */
const SHUTDOWN_RETURNS_TO: Partial<Record<ComputerId, ComputerId>> = {
  nexacorp: "home",
  devcontainer: "nexacorp",
  chipinfra: "nexacorp",
  "erik-pc": "chipinfra",
};

const shutdown: CommandHandler = (args, flags, ctx) => {
  const immediate = Boolean(flags.h && args.includes("now"));
  if (!immediate && args.length > 0) {
    return { output: 'Usage: shutdown or shutdown -h now\n' };
  }

  // Remote machines: the box powers off under the SSH session, which drops
  // back to wherever the player connected from. Nothing is lost — the machine
  // is back up (unchanged) the next time they connect.
  const computer = ctx.activeComputer;
  if (computer && computer !== "home") {
    const target = SHUTDOWN_RETURNS_TO[computer];
    if (!target) return { output: "shutdown: operation not permitted\n" };
    const hostname = COMPUTERS[computer].promptHostname;
    return {
      output: "",
      incrementalLines: getRemoteShutdownIncrementalLines(hostname, !immediate),
      transitionTo: target,
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
    // bare shutdown → 60s countdown on Day 1; immediate on endgame (nobody
    // else is on this machine to broadcast to).
    return {
      output: "",
      incrementalLines: getShutdownIncrementalLines(!immediate && !endgame),
      gameAction: { type: "shutdown" },
    };
  }

  // Cosmetic reboot: power off, boot right back up. Same in-game datetime,
  // no flags, no deliveries — nothing changes.
  return {
    output: "",
    incrementalLines: getShutdownIncrementalLines(!immediate),
    gameAction: { type: "reboot" },
  };
};

register("shutdown", shutdown, "Power off the system");
setKnownFlags("shutdown", { short: ["h"] });
