import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "../../../lib/pathUtils";
import { isFile, isDirectory } from "../../filesystem/types";
import { HELP_TEXTS } from "./helpTexts";

const mv: CommandHandler = (args, _flags, ctx) => {
  if (args.length < 2) {
    return { output: "mv: missing operand\nUsage: mv SOURCE DEST" };
  }

  const srcPath = resolvePath(args[0], ctx.cwd, ctx.homeDir);
  let destPath = resolvePath(args[1], ctx.cwd, ctx.homeDir);

  const srcNode = ctx.fs.getNode(srcPath);
  if (!srcNode) {
    return { output: `mv: cannot stat '${args[0]}': No such file or directory`, exitCode: 1 };
  }

  // If dest is a directory, move source into it
  const destNode = ctx.fs.getNode(destPath);
  if (destNode && isDirectory(destNode)) {
    destPath = destPath + "/" + srcNode.name;
  }

  // Copy then remove
  if (isFile(srcNode)) {
    const writeResult = ctx.fs.writeFile(destPath, srcNode.content);
    if (writeResult.error) {
      return { output: writeResult.error, exitCode: 1 };
    }
    const removeResult = writeResult.fs!.removeNode(srcPath);
    if (removeResult.error) {
      return { output: removeResult.error, exitCode: 1 };
    }
    return { output: "", newFs: removeResult.fs };
  }

  return { output: `mv: cannot move '${args[0]}' to '${args[1]}': directory moves are not supported` };
};

register("mv", mv, "Move (rename) files", HELP_TEXTS.mv);
setKnownFlags("mv", {});
