import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "../../../lib/pathUtils";
import { colorizeCsv } from "../../../lib/ansi";
import { highlightSql } from "../../../lib/sqlHighlight";
import { highlightPython } from "../../../lib/pythonHighlight";
import { isBinaryFile } from "../../filesystem/VirtualFS";
import { HELP_TEXTS } from "./helpTexts";

const cat: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0 && ctx.stdin !== undefined) {
    return { output: ctx.stdin };
  }
  if (args.length === 0) {
    return { output: "cat: missing file operand" };
  }

  const outputs: string[] = [];
  let hasError = false;

  for (const arg of args) {
    const absolutePath = resolvePath(arg, ctx.cwd, ctx.homeDir);
    const node = ctx.fs.getNode(absolutePath);

    if (isBinaryFile(node)) {
      const hint = arg.endsWith(".pdf") ? " — use 'pdftotext' for PDFs or 'file' to inspect" : " — use 'file' to inspect";
      outputs.push(`cat: ${arg}: binary file${hint}`);
      continue;
    }

    const result = ctx.fs.readFile(absolutePath);

    if (result.error) {
      outputs.push(result.error);
      hasError = true;
    } else if (result.content !== undefined) {
      const content = arg.endsWith(".csv")
        ? colorizeCsv(result.content)
        : arg.endsWith(".sql")
          ? highlightSql(result.content)
          : arg.endsWith(".py")
            ? highlightPython(result.content)
            : result.content;
      outputs.push(content);
    }
  }

  return { output: outputs.join("\n"), exitCode: hasError ? 1 : 0 };
};

register("cat", cat, "Display file contents", HELP_TEXTS.cat, true);
setKnownFlags("cat", {});
