import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { openFileForEditing } from "./editorOpen";
import { HELP_TEXTS } from "./helpTexts";

const nano: CommandHandler = (args, _flags, ctx) => openFileForEditing(args[0], ctx, "nano");

register("nano", nano, "Edit files with a simple text editor", HELP_TEXTS.nano);
