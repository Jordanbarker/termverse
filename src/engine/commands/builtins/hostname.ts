import { CommandHandler } from "@tt/core/commands/types";
import { register } from "@tt/core/commands/registry";
import { setKnownFlags } from "@tt/core/commands/flagValidation";
import { COMPUTERS, ComputerId } from "../../../state/types";
import { HELP_TEXTS } from "@tt/core/commands/builtins/helpTexts";

const hostname: CommandHandler = (_args, flags, ctx) => {
  const computer = COMPUTERS[ctx.activeComputer as ComputerId];
  if (flags["I"]) {
    return { output: `${computer.ip} ` };
  }
  return { output: computer.hostname };
};

register("hostname", hostname, "Print system hostname", HELP_TEXTS.hostname);
setKnownFlags("hostname", { short: ["I"] });
