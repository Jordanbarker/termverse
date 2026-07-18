import { CommandHandler } from "@tt/core/commands/types";
import { register, registerAlias } from "../registry";
import { openFileForEditing } from "./editorOpen";
import { HELP_TEXTS } from "./helpTexts";

const vim: CommandHandler = (args, _flags, ctx) => openFileForEditing(args[0], ctx, "vim");

register("vim", vim, "Edit files with the vim modal text editor", HELP_TEXTS.vim);
registerAlias("vi", "vim");
