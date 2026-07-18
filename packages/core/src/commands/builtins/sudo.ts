import { CommandHandler } from "@tt/core/commands/types";
import { register, execute } from "../registry";
import { HELP_TEXTS } from "./helpTexts";

const sudo: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return { output: "usage: sudo command [arg ...]" };
  }

  const [subcommand, ...subArgs] = args;
  return execute(subcommand, subArgs, {}, { ...ctx, elevated: true });
};

register("sudo", sudo, "Execute a command with elevated privileges", HELP_TEXTS.sudo);
