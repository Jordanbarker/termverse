import { CommandHandler } from "../types";
import { register } from "../registry";
import { skipFlagValidation } from "../flagValidation";
import { resolvePath } from "../../../lib/pathUtils";
import { splitLines } from "../../../lib/textUtils";
import { isBinaryFile } from "../../filesystem/VirtualFS";
import { colorizeCsv } from "../../../lib/ansi";
import { HELP_TEXTS } from "./helpTexts";

const tail: CommandHandler = (args, _flags, ctx) => {
  // Use rawArgs to preserve -n token that the parser strips
  const effectiveArgs = ctx.rawArgs ?? args;
  let numLines = 10;
  const fileArgs: string[] = [];

  for (let i = 0; i < effectiveArgs.length; i++) {
    if (effectiveArgs[i] === "-f" || effectiveArgs[i] === "--follow") {
      return { output: "tail: -f: follow not supported in this terminal", exitCode: 2 };
    }
    if (effectiveArgs[i] === "-n" && i + 1 < effectiveArgs.length) {
      numLines = parseInt(effectiveArgs[i + 1], 10);
      if (isNaN(numLines) || numLines < 0) numLines = 10;
      i++;
    } else if (/^-\d+$/.test(effectiveArgs[i])) {
      // -N shorthand (e.g. tail -3 file)
      numLines = parseInt(effectiveArgs[i].slice(1), 10);
    } else {
      fileArgs.push(effectiveArgs[i]);
    }
  }

  // Read from stdin if no file args
  if (fileArgs.length === 0 && ctx.stdin !== undefined) {
    if (numLines === 0) return { output: "" };
    const lines = splitLines(ctx.stdin);
    return { output: lines.slice(-numLines).join("\n") };
  }

  if (fileArgs.length === 0) {
    return { output: "tail: missing file operand", exitCode: 2 };
  }

  const outputs: string[] = [];
  const multiFile = fileArgs.length > 1;

  for (const fileArg of fileArgs) {
    const absPath = resolvePath(fileArg, ctx.cwd, ctx.homeDir);
    const node = ctx.fs.getNode(absPath);

    if (isBinaryFile(node)) {
      const hint = fileArg.endsWith(".pdf") ? " — use 'pdftotext' for PDFs or 'file' to inspect" : " — use 'file' to inspect";
      outputs.push(`tail: ${fileArg}: binary file${hint}`);
      continue;
    }

    const result = ctx.fs.readFile(absPath);

    if (result.error) {
      outputs.push(result.error.replace("cat:", "tail:"));
      continue;
    }

    if (multiFile) {
      outputs.push(`==> ${fileArg} <==`);
    }

    if (numLines === 0) {
      outputs.push("");
      continue;
    }
    const lines = splitLines(result.content ?? "");
    const sliced = lines.slice(-numLines).join("\n");
    outputs.push(fileArg.endsWith(".csv") ? colorizeCsv(sliced) : sliced);
  }

  return { output: outputs.join("\n") };
};

register("tail", tail, "Display last lines of a file", HELP_TEXTS.tail, true);
// rawArgs-driven: -5 / -n 5 come through stripped or split by the parser;
// the handler re-parses ctx.rawArgs.
skipFlagValidation("tail");
