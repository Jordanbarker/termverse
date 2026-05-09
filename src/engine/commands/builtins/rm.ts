import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "../../../lib/pathUtils";
import { isDirectory } from "../../filesystem/types";
import { HELP_TEXTS } from "./helpTexts";
import { VirtualFS } from "../../filesystem/VirtualFS";

const rm: CommandHandler = (args, flags, ctx) => {
  if (args.length === 0) {
    return { output: "rm: missing operand" };
  }

  const recursive = flags["r"] || flags["R"];
  const force = flags["f"];
  let currentFs: VirtualFS = ctx.fs;

  for (const arg of args) {
    const absPath = resolvePath(arg, ctx.cwd, ctx.homeDir);
    const node = currentFs.getNode(absPath);

    if (!node) {
      if (force) continue;
      return { output: `rm: cannot remove '${arg}': No such file or directory`, exitCode: 1 };
    }

    if (isDirectory(node) && !recursive) {
      return { output: `rm: cannot remove '${arg}': Is a directory`, exitCode: 1 };
    }

    const result = currentFs.removeNode(absPath);
    if (result.error) {
      return { output: result.error, exitCode: 1 };
    }
    currentFs = result.fs!;
  }

  return { output: "", newFs: currentFs };
};

register("rm", rm, "Remove files or directories", HELP_TEXTS.rm);
setKnownFlags("rm", { short: ["r", "R", "f"] });
