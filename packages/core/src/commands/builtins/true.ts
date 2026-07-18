import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { HELP_TEXTS } from "./helpTexts";

const trueHandler: CommandHandler = () => ({ output: "", exitCode: 0 });
const falseHandler: CommandHandler = () => ({ output: "", exitCode: 1 });

register("true", trueHandler, "Do nothing, successfully", HELP_TEXTS["true"]);
register("false", falseHandler, "Do nothing, unsuccessfully", HELP_TEXTS["false"]);
