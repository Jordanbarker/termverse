import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolveCommandPath, pythonLocatedEvents } from "./which";
import { HELP_TEXTS } from "./helpTexts";

const command: CommandHandler = (args, flags, ctx) => {
  if (!flags["v"] || args.length === 0) {
    return { output: HELP_TEXTS.command, exitCode: 2 };
  }

  const outputs: string[] = [];
  let anyMissing = false;
  for (const arg of args) {
    const path = resolveCommandPath(arg, ctx);
    if (path) outputs.push(path);
    else anyMissing = true;
  }

  return {
    output: outputs.join("\n"),
    exitCode: anyMissing ? 1 : 0,
    triggerEvents: pythonLocatedEvents(args),
  };
};

register("command", command, "Show command path (POSIX)", HELP_TEXTS.command);
setKnownFlags("command", { short: ["v"] });
