import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { colorizeCsv } from "@tt/core/lib/ansi";
import { highlightSql } from "@tt/core/lib/sqlHighlight";
import { highlightPython } from "@tt/core/lib/pythonHighlight";
import { isBinaryFile } from "@tt/core/filesystem/VirtualFS";
import { HELP_TEXTS } from "./helpTexts";

function numberLines(text: string, startCounter: { value: number }): string {
  const lines = text.split("\n");
  return lines
    .map((line) => `${String(startCounter.value++).padStart(6, " ")}\t${line}`)
    .join("\n");
}

const cat: CommandHandler = (args, flags, ctx) => {
  const numbered = !!flags["n"];
  const counter = { value: 1 };

  if (args.length === 0 && ctx.stdin !== undefined) {
    return { output: numbered ? numberLines(ctx.stdin, counter) : ctx.stdin };
  }
  if (args.length === 0) {
    return { output: "cat: missing file operand", exitCode: 1 };
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
      const raw = result.content;
      const highlighted = arg.endsWith(".csv")
        ? colorizeCsv(raw)
        : arg.endsWith(".sql")
          ? highlightSql(raw)
          : arg.endsWith(".py")
            ? highlightPython(raw)
            : raw;
      outputs.push(numbered ? numberLines(highlighted, counter) : highlighted);
    }
  }

  return { output: outputs.join("\n"), exitCode: hasError ? 1 : 0 };
};

register("cat", cat, "Display file contents", HELP_TEXTS.cat, true);
setKnownFlags("cat", { short: ["n"] });
