import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolveCommandPath, pythonLocatedEvents } from "./which";
import { HELP_TEXTS } from "./helpTexts";

const SHELL_BUILTINS = new Set([
  "cd", "pwd", "echo", "export", "alias", "unalias", "source", ".",
  "history", "exit", "type", "command",
]);

const type: CommandHandler = (args, flags, ctx) => {
  if (args.length === 0) {
    return { output: "type: missing command argument", exitCode: 2 };
  }

  const showAll = !!flags["a"];
  const outputs: string[] = [];
  let anyMissing = false;

  for (const arg of args) {
    const isBuiltin = SHELL_BUILTINS.has(arg);
    const path = resolveCommandPath(arg, ctx);

    if (showAll) {
      const matches: string[] = [];
      if (isBuiltin) matches.push(`${arg} is a shell builtin`);
      if (path) matches.push(`${arg} is ${path}`);
      if (matches.length === 0) {
        outputs.push(`type: ${arg}: not found`);
        anyMissing = true;
      } else {
        outputs.push(matches.join("\n"));
      }
    } else if (isBuiltin) {
      outputs.push(`${arg} is a shell builtin`);
    } else if (path) {
      outputs.push(`${arg} is ${path}`);
    } else {
      outputs.push(`type: ${arg}: not found`);
      anyMissing = true;
    }
  }

  return {
    output: outputs.join("\n"),
    exitCode: anyMissing ? 1 : 0,
    triggerEvents: pythonLocatedEvents(args),
  };
};

register("type", type, "Describe how a command would be interpreted", HELP_TEXTS.type);
setKnownFlags("type", { short: ["a"] });
