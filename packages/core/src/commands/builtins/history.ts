import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { HELP_TEXTS } from "./helpTexts";

const history: CommandHandler = (_args, _flags, ctx) => {
  const entries = ctx.commandHistory ?? [];
  if (entries.length === 0) {
    return { output: "" };
  }

  const lines = entries.map((entry, i) =>
    `  ${String(i + 1).padStart(4)}  ${entry}`
  );

  return { output: lines.join("\n") };
};

register("history", history, "Display command history", HELP_TEXTS.history);
