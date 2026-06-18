import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { CHECKPOINTS } from "../../../story/checkpoints";

const cheat: CommandHandler = (args) => {
  if (args.length === 0) {
    return { output: "", gameAction: { type: "listCheckpoints" } };
  }

  const n = parseInt(args[0], 10);
  if (isNaN(n) || n < 1 || n > CHECKPOINTS.length) {
    return { output: `cheat: invalid checkpoint '${args[0]}'. Use 1-${CHECKPOINTS.length}.` };
  }

  return { output: "", gameAction: { type: "loadCheckpoint", checkpointId: CHECKPOINTS[n - 1].id } };
};

register("cheat", cheat, "Load a checkpoint for play-testing");
