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
  // shell, exactly like a real `exit`. Mid-shift this is a soft disconnect:
  // other tabs and all work-machine state survive, and `ssh` back reattaches to
  // the workstation as it was left. Only a genuine end-of-day exit (Day 1:
  // read_end_of_day; Day 2: accusation_made) tears the workday down and
  // progresses the story — see isEndOfDayExit/runExitToHome in
  // useComputerTransitions.ts.
  if (ctx.activeComputer === "nexacorp") {
    return { output: "", transitionTo: "home" };
  }
  return { output: "" };
};

register("exit", exit, "Exit the current remote session");
