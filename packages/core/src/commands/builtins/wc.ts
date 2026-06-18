import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { formatSize } from "@tt/core/lib/formatSize";
import { HELP_TEXTS } from "./helpTexts";

function countStats(content: string): { lines: number; words: number; chars: number } {
  const lines = content === "" ? 0 : content.replace(/\n$/, "").split("\n").length;
  const words = content.trim() === "" ? 0 : content.trim().split(/\s+/).length;
  const chars = content.length;
  return { lines, words, chars };
}

function pad(n: number, width: number): string {
  return String(n).padStart(width);
}

function fmtChars(n: number, humanReadable: boolean): string {
  return humanReadable ? formatSize(n, true) : String(n);
}

const wc: CommandHandler = (args, flags, ctx) => {
  const showLines = flags["l"];
  const showWords = flags["w"];
  const showChars = flags["c"];
  const showAll = !showLines && !showWords && !showChars;
  const humanReadable = flags["h"] || flags["human-readable"];

  const fileArgs = args.filter((a) => !a.startsWith("-"));

  // Read from stdin if no file args
  if (fileArgs.length === 0 && ctx.stdin !== undefined) {
    const stats = countStats(ctx.stdin);
    const parts: string[] = [];
    if (showAll || showLines) parts.push(pad(stats.lines, 8));
    if (showAll || showWords) parts.push(pad(stats.words, 8));
    if (showAll || showChars) parts.push(fmtChars(stats.chars, humanReadable).padStart(8));
    return { output: parts.join("") };
  }

  if (fileArgs.length === 0) {
    return { output: "wc: missing file operand", exitCode: 2 };
  }

  const outputLines: string[] = [];
  let totalLines = 0, totalWords = 0, totalChars = 0;

  for (const fileArg of fileArgs) {
    const absPath = resolvePath(fileArg, ctx.cwd, ctx.homeDir);
    const result = ctx.fs.readFile(absPath);

    if (result.error) {
      outputLines.push(result.error.replace("cat:", "wc:"));
      continue;
    }

    const stats = countStats(result.content ?? "");
    totalLines += stats.lines;
    totalWords += stats.words;
    totalChars += stats.chars;

    const parts: string[] = [];
    if (showAll || showLines) parts.push(pad(stats.lines, 8));
    if (showAll || showWords) parts.push(pad(stats.words, 8));
    if (showAll || showChars) parts.push(fmtChars(stats.chars, humanReadable).padStart(8));
    parts.push(` ${fileArg}`);
    outputLines.push(parts.join(""));
  }

  if (fileArgs.length > 1) {
    const parts: string[] = [];
    if (showAll || showLines) parts.push(pad(totalLines, 8));
    if (showAll || showWords) parts.push(pad(totalWords, 8));
    if (showAll || showChars) parts.push(fmtChars(totalChars, humanReadable).padStart(8));
    parts.push(" total");
    outputLines.push(parts.join(""));
  }

  return { output: outputLines.join("\n") };
};

register("wc", wc, "Count lines, words, and characters", HELP_TEXTS.wc, true);
setKnownFlags("wc", { short: ["l", "w", "c", "h"], long: ["human-readable"] });
