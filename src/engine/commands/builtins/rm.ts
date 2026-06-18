import { CommandHandler } from "../types";
import { GameEvent } from "../../mail/delivery";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "../../../lib/pathUtils";
import { FSNode, isDirectory } from "../../filesystem/types";
import { HELP_TEXTS } from "./helpTexts";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { SecurityViolation } from "../security";

function collectRemoveEvents(node: FSNode, path: string): GameEvent[] {
  const out: GameEvent[] = [];
  const walk = (n: FSNode, p: string) => {
    if (isDirectory(n)) {
      out.push({ type: "directory_removed", detail: p });
      for (const c of Object.values(n.children)) walk(c, p + "/" + c.name);
    } else {
      out.push({ type: "file_removed", detail: p });
    }
  };
  walk(node, path);
  return out;
}

const rm: CommandHandler = (args, flags, ctx) => {
  if (args.length === 0) {
    return { output: "rm: missing operand" };
  }

  const recursive = flags["r"] || flags["R"];
  const force = flags["f"];
  let currentFs: VirtualFS = ctx.fs;
  const triggerEvents: GameEvent[] = [];
  let securityViolation: SecurityViolation | undefined;

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

    if (!securityViolation) {
      const flagStr = recursive ? (force ? "-rf " : "-r ") : force ? "-f " : "";
      const v = ctx.security?.checkPathOp(currentFs, absPath, "rm", {
        computerId: ctx.activeComputer,
        homeDir: ctx.homeDir,
        command: `rm ${flagStr}${arg}`,
      });
      if (v) securityViolation = v;
    }

    const events = collectRemoveEvents(node, absPath);
    const result = currentFs.removeNode(absPath);
    if (result.error) {
      return { output: result.error, exitCode: 1 };
    }
    currentFs = result.fs!;
    triggerEvents.push(...events);
  }

  return { output: "", newFs: currentFs, triggerEvents, securityViolation };
};

register("rm", rm, "Remove files or directories", HELP_TEXTS.rm);
setKnownFlags("rm", { short: ["r", "R", "f"] });
