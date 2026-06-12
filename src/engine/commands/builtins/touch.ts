import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath } from "../../../lib/pathUtils";
import { HELP_TEXTS } from "./helpTexts";
import { VirtualFS } from "../../filesystem/VirtualFS";

const touch: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return { output: "touch: missing file operand", exitCode: 1 };
  }

  let currentFs: VirtualFS = ctx.fs;
  const createdPaths: string[] = [];

  for (const arg of args) {
    const absPath = resolvePath(arg, ctx.cwd, ctx.homeDir);
    const existing = currentFs.getNode(absPath);

    if (!existing) {
      const result = currentFs.writeFile(absPath, "");
      if (result.error) {
        return { output: `touch: cannot touch '${arg}': No such file or directory`, exitCode: 1 };
      }
      currentFs = result.fs!;
      createdPaths.push(absPath);
    }
    // If exists, no-op (real touch updates timestamps, but we don't track them)
  }

  return {
    output: "",
    newFs: currentFs,
    triggerEvents: createdPaths.map((p) => ({ type: "file_created" as const, detail: p })),
  };
};

register("touch", touch, "Create empty files", HELP_TEXTS.touch);
