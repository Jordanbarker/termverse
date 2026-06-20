import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { HELP_TEXTS } from "./helpTexts";

const pwd: CommandHandler = (_args, _flags, ctx) => {
  return { output: ctx.cwd };
};

register("pwd", pwd, "Print the current working directory", HELP_TEXTS.pwd);
