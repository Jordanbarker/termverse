import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "../../../lib/pathUtils";
import { colorize, ansi } from "../../../lib/ansi";
import { computeDiff } from "../../../lib/diff";
import { HELP_TEXTS } from "./helpTexts";

const diff: CommandHandler = (args, _flags, ctx) => {
  if (args.length < 2) {
    return { output: "diff: missing operand\nUsage: diff FILE1 FILE2", exitCode: 2 };
  }

  const path1 = resolvePath(args[0], ctx.cwd, ctx.homeDir);
  const path2 = resolvePath(args[1], ctx.cwd, ctx.homeDir);

  const file1 = ctx.fs.readFile(path1);
  if (file1.error) {
    return { output: file1.error.replace("cat:", "diff:"), exitCode: 2 };
  }

  const file2 = ctx.fs.readFile(path2);
  if (file2.error) {
    return { output: file2.error.replace("cat:", "diff:"), exitCode: 2 };
  }

  const content1 = file1.content ?? "";
  const content2 = file2.content ?? "";

  if (content1 === content2) {
    return { output: "", exitCode: 0 };
  }

  const aLines = content1.split("\n");
  const bLines = content2.split("\n");
  const diffResult = computeDiff(aLines, bLines);

  const outputLines: string[] = [
    colorize(`--- ${args[0]}`, ansi.bold),
    colorize(`+++ ${args[1]}`, ansi.bold),
  ];

  for (const entry of diffResult) {
    switch (entry.type) {
      case "removed":
        outputLines.push(colorize(`-${entry.line}`, ansi.red));
        break;
      case "added":
        outputLines.push(colorize(`+${entry.line}`, ansi.green));
        break;
      case "context":
        outputLines.push(` ${entry.line}`);
        break;
    }
  }

  const result: import("../types").CommandResult = { output: outputLines.join("\n"), exitCode: 1 };

  // Emit trigger event when comparing .bak and current log files
  const nonFlagArgs = args.filter((a) => !a.startsWith("-"));
  const hasBak = nonFlagArgs.some((a) => a.includes(".bak"));
  const hasLog = nonFlagArgs.some((a) => a.includes("system.log") && !a.includes(".bak"));
  if (hasBak && hasLog) {
    result.triggerEvents = [{ type: "file_read", detail: "discovered_log_tampering" }];
  }

  return result;
};

register("diff", diff, "Compare two files line by line", HELP_TEXTS.diff, true);
setKnownFlags("diff", {});
