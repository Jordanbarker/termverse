import { CommandHandler } from "../types";
import { register } from "../registry";

const trueHandler: CommandHandler = () => ({ output: "", exitCode: 0 });
const falseHandler: CommandHandler = () => ({ output: "", exitCode: 1 });

register("true", trueHandler, "Do nothing, successfully");
register("false", falseHandler, "Do nothing, unsuccessfully");
