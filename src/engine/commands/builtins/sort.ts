import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { splitLines } from "@tt/core/lib/textUtils";
import { HELP_TEXTS } from "./helpTexts";

const sort: CommandHandler = (args, flags, ctx) => {
  const reverse = flags["r"];
  const numeric = flags["n"];
  const unique = flags["u"];
  const fileArgs = args.filter((a) => !a.startsWith("-"));

  let lines: string[];
  if (fileArgs.length === 0 && ctx.stdin !== undefined) {
    lines = splitLines(ctx.stdin);
  } else if (fileArgs.length > 0) {
    lines = [];
    for (const file of fileArgs) {
      const absPath = resolvePath(file, ctx.cwd, ctx.homeDir);
      const result = ctx.fs.readFile(absPath);
      if (result.error) {
        return { output: result.error.replace("cat:", "sort:"), exitCode: 2 };
      }
      lines.push(...splitLines(result.content ?? ""));
    }
  } else {
    return { output: "sort: missing file operand", exitCode: 2 };
  }

  lines.sort((a, b) => {
    if (numeric) {
      const na = parseFloat(a) || 0;
      const nb = parseFloat(b) || 0;
      return na - nb;
    }
    return a.localeCompare(b);
  });

  if (reverse) lines.reverse();

  if (unique) {
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const line of lines) {
      if (!seen.has(line)) {
        seen.add(line);
        deduped.push(line);
      }
    }
    return {
      output: deduped.join("\n"),
      triggerEvents: [{ type: "command_executed", detail: "data_deduped" }],
    };
  }

  return { output: lines.join("\n") };
};

register("sort", sort, "Sort lines of text", HELP_TEXTS.sort, true);
setKnownFlags("sort", { short: ["r", "n", "u"] });
