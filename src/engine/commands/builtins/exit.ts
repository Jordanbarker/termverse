import { CommandHandler } from "../types";
import { register } from "../registry";

const exit: CommandHandler = (_args, _flags, ctx) => {
  if (ctx.activeComputer === "erik-pc") {
    return { output: "", transitionTo: "chipinfra" };
  }
  if (ctx.activeComputer === "devcontainer" || ctx.activeComputer === "chipinfra") {
    return { output: "", transitionTo: "nexacorp" };
  }
  if (ctx.activeComputer === "nexacorp" && ctx.storyFlags?.read_end_of_day) {
    return { output: "", transitionTo: "home" };
  }
  return { output: "You still have work to do before you can leave." };
};

register("exit", exit, "Exit the current remote session");
