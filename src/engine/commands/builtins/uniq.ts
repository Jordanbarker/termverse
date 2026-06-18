import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { splitLines } from "@tt/core/lib/textUtils";
import { HELP_TEXTS } from "./helpTexts";

const uniq: CommandHandler = (args, flags, ctx) => {
  const showCount = flags["c"];
  const duplicatesOnly = flags["d"];
  const ignoreCase = flags["i"];
  const fileArgs = args.filter((a) => !a.startsWith("-"));

  let content: string;
  if (fileArgs.length === 0 && ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else if (fileArgs.length > 0) {
    const absPath = resolvePath(fileArgs[0], ctx.cwd, ctx.homeDir);
    const result = ctx.fs.readFile(absPath);
    if (result.error) {
      return { output: result.error.replace("cat:", "uniq:"), exitCode: 2 };
    }
    content = result.content ?? "";
  } else {
    return { output: "uniq: missing file operand", exitCode: 2 };
  }

  const lines = splitLines(content);
  const groups: { line: string; count: number }[] = [];

  for (const line of lines) {
    const prev = groups.length > 0 ? groups[groups.length - 1].line : null;
    const matches = ignoreCase
      ? prev !== null && prev.toLowerCase() === line.toLowerCase()
      : prev === line;
    if (matches) {
      groups[groups.length - 1].count++;
    } else {
      groups.push({ line, count: 1 });
    }
  }

  let filtered = groups;
  if (duplicatesOnly) {
    filtered = groups.filter((g) => g.count > 1);
  }

  const outputLines = filtered.map((g) => {
    if (showCount) {
      return `${String(g.count).padStart(7)} ${g.line}`;
    }
    return g.line;
  });

  return {
    output: outputLines.join("\n"),
    triggerEvents: [{ type: "command_executed", detail: "data_deduped" }],
  };
};

register("uniq", uniq, "Filter adjacent duplicate lines", HELP_TEXTS.uniq, true);
setKnownFlags("uniq", { short: ["c", "d", "i"] });
