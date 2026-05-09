import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { getShutdownIncrementalLines } from "../../../lib/ascii";

const shutdown: CommandHandler = (args, flags, ctx) => {
  if (ctx.activeComputer !== "home") {
    return { output: "shutdown: operation not permitted\n" };
  }

  // After Day 1 shutdown, command is no longer available
  if (ctx.storyFlags?.day1_shutdown) {
    return { output: "Not now — there's still work to be done.\n" };
  }

  // shutdown -h now → immediate
  if (flags.h && args.includes("now")) {
    return {
      output: "",
      incrementalLines: getShutdownIncrementalLines(false),
      gameAction: { type: "shutdown" },
    };
  }

  // bare shutdown → 60s countdown
  if (args.length === 0) {
    return {
      output: "",
      incrementalLines: getShutdownIncrementalLines(true),
      gameAction: { type: "shutdown" },
    };
  }

  return { output: 'Usage: shutdown or shutdown -h now\n' };
};

register("shutdown", shutdown, "Power off the system");
setKnownFlags("shutdown", { short: ["h"] });
