import { CommandHandler } from "../types";
import { register } from "../registry";

const exit: CommandHandler = (_args, _flags, ctx) => {
  if (ctx.activeComputer === "erik-pc") {
    return { output: "", transitionTo: "chipinfra" };
  }
  if (ctx.activeComputer === "devcontainer" || ctx.activeComputer === "chipinfra") {
    return { output: "", transitionTo: "nexacorp" };
  }
  // Day 2 wrap, post-accusation: paced wind-down at the desk, then transition
  // home. The board-meeting debrief from Marcus arrives at home as a real email
  // (delivered by the returned_home_day2 flag triggered here); the player reads
  // it via `mail`. See storyFlags.ts for the trigger chain.
  if (ctx.activeComputer === "nexacorp" && ctx.storyFlags?.accusation_made) {
    return {
      output: "",
      incrementalLines: [
        { text: "Packing up.", delayMs: 0 },
        { text: "", delayMs: 600 },
        { text: "End of day. 18:47.", delayMs: 700 },
        { text: "", delayMs: 700 },
      ],
      transitionTo: "home",
      triggerEvents: [{ type: "command_executed", detail: "exit_day2_logoff" }],
    };
  }
  // Any other case on NexaCorp: log off the SSH session and return to the home
  // shell, exactly like a real `exit`. This is reversible: the player can `ssh`
  // back in to finish the day. The day does NOT advance here: `shutdown` stays
  // locked until `returned_home_day1` is set, which runExitToHome only does on a
  // genuine end-of-day exit (read_end_of_day). See useComputerTransitions.ts.
  if (ctx.activeComputer === "nexacorp") {
    return { output: "", transitionTo: "home" };
  }
  return { output: "" };
};

register("exit", exit, "Exit the current remote session");
