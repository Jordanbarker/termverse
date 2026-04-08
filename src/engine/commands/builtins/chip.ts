import { register } from "../registry";

register(
  "chip",
  (_args, _flags, ctx) => {
    if (!ctx.envVars?.CHIP_API_KEY) {
      return {
        output: "chip: error: CHIP_API_KEY not set",
        exitCode: 1,
        triggerEvents: [{ type: "command_executed", detail: "chip_api_error" }],
      };
    }
    return {
      output: "",
      chipSession: { storyFlags: ctx.storyFlags ?? {}, currentComputer: ctx.activeComputer },
    };
  },
  "Chat with Chip, NexaCorp's AI assistant"
);
