import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { HELP_TEXTS } from "./helpTexts";

const echo: CommandHandler = (args, flags, ctx) => {
  const text = args.length === 0 ? "\n" : args.join(" ");
  const suppressNewline = flags["n"];
  // In terminal output, newlines are handled by the caller,
  // so we just return the text as-is. The -n flag is noted
  // but doesn't change output here since we don't add trailing newlines.
  const triggerEvents = ctx.isPiped
    ? [{ type: "command_executed" as const, detail: "echo_pipe" }]
    : undefined;
  return { output: suppressNewline ? text : text, triggerEvents };
};

register("echo", echo, "Print text to standard output", HELP_TEXTS.echo);
setKnownFlags("echo", { short: ["n"] });
