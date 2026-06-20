import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { isFile } from "@tt/core/filesystem/types";
import { HELP_TEXTS } from "./helpTexts";

const pdftotext: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return { output: "pdftotext: missing PDF file operand\nUsage: pdftotext FILE" };
  }

  const filePath = args[0];
  const absPath = resolvePath(filePath, ctx.cwd, ctx.homeDir);
  const node = ctx.fs.getNode(absPath);

  if (!node) {
    return { output: `pdftotext: ${filePath}: No such file or directory` };
  }

  if (!isFile(node)) {
    return { output: `pdftotext: ${filePath}: Is a directory` };
  }

  if (!node.name.endsWith(".pdf")) {
    return { output: `pdftotext: ${filePath}: Not a PDF file` };
  }

  const textContent = node.metadata?.textContent as string | undefined;
  if (!textContent) {
    return { output: `pdftotext: ${filePath}: Could not extract text` };
  }

  return { output: textContent };
};

register("pdftotext", pdftotext, "Convert PDF to text", HELP_TEXTS.pdftotext, true);
