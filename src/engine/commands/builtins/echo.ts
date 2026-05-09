import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { HELP_TEXTS } from "./helpTexts";

const echo: CommandHandler = (args, flags, ctx) => {
  if (args.length === 0) {
    return { output: "\n" };
  }
  const text = args.join(" ");
  // The trailing newline only matters where a downstream consumer can see it
  // (pipes, redirects). Direct terminal rendering relies on the next prompt's
  // own \r\n, so adding one here would double-space; leave that case untouched.
  const output = ctx.isPiped && !flags["n"] ? text + "\n" : text;
  const triggerEvents = ctx.isPiped
    ? [{ type: "command_executed" as const, detail: "echo_pipe" }]
    : undefined;
  return { output, triggerEvents };
};

register("echo", echo, "Print text to standard output", HELP_TEXTS.echo);
setKnownFlags("echo", { short: ["n"] });
