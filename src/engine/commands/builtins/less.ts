import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath } from "../../../lib/pathUtils";
import { isBinaryFile } from "../../filesystem/VirtualFS";
import { isDirectory } from "../../filesystem/types";
import { HELP_TEXTS } from "./helpTexts";

const less: CommandHandler = (args, _flags, ctx) => {
  const fileArgs = args.filter((a) => !a.startsWith("-"));

  if (fileArgs.length === 0) {
    if (ctx.stdin !== undefined) {
      if (ctx.stdin === "") {
        return { output: "" };
      }
      return {
        output: "",
        lessSession: { filename: null, content: ctx.stdin },
      };
    }
    return { output: "less: missing file operand", exitCode: 1 };
  }

  const fileArg = fileArgs[0];
  const absolutePath = resolvePath(fileArg, ctx.cwd, ctx.homeDir);
  const node = ctx.fs.getNode(absolutePath);

  if (node && isDirectory(node)) {
    return { output: `less: "${fileArg}": Is a directory`, exitCode: 1 };
  }

  if (isBinaryFile(node)) {
    const hint = fileArg.endsWith(".pdf")
      ? " — use 'pdftotext' for PDFs or 'file' to inspect"
      : " — use 'file' to inspect";
    return { output: `less: ${fileArg}: binary file${hint}`, exitCode: 1 };
  }

  const result = ctx.fs.readFile(absolutePath);
  if (result.error) {
    return { output: result.error.replace("cat:", "less:"), exitCode: 1 };
  }

  return {
    output: "",
    lessSession: { filename: fileArg, content: result.content ?? "" },
  };
};

register("less", less, "View file contents with paging", HELP_TEXTS.less, true);
