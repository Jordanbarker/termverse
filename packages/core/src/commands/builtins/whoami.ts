import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { HELP_TEXTS } from "./helpTexts";

const whoami: CommandHandler = (_args, _flags, ctx) => {
  // Derive username from homeDir: /home/ren -> ren
  const parts = ctx.homeDir.split("/");
  const username = parts[parts.length - 1];
  return { output: username };
};

register("whoami", whoami, "Print current username", HELP_TEXTS.whoami);
