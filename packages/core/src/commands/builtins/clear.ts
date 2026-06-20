import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { HELP_TEXTS } from "./helpTexts";

const clear: CommandHandler = () => {
  return { output: "", clearScreen: true };
};

register("clear", clear, "Clear the terminal screen", HELP_TEXTS.clear);
