import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { isDirectory, isFile } from "@tt/core/filesystem/types";
import { HELP_TEXTS } from "./helpTexts";

function guessFileType(name: string, content: string): string {
  if (name.endsWith(".pdf")) return "PDF document, version 1.4";
  if (name.endsWith(".json")) return "JSON text data";
  if (name.endsWith(".yml") || name.endsWith(".yaml")) return "YAML text data";
  if (name.endsWith(".md")) return "Markdown text";
  if (name.endsWith(".py")) return "Python script, ASCII text";
  if (name.endsWith(".ts")) return "TypeScript source, ASCII text";
  if (name.endsWith(".js")) return "JavaScript source, ASCII text";
  if (name.endsWith(".sql")) return "SQL script, ASCII text";
  if (name.endsWith(".sh")) return "Bourne-Again shell script, ASCII text";
  if (name.endsWith(".csv")) return "CSV text";
  if (name.endsWith(".conf") || name.endsWith(".cfg")) return "configuration file, ASCII text";
  if (name.endsWith(".xml")) return "XML document, ASCII text";
  if (name.endsWith(".html")) return "HTML document, ASCII text";
  if (name.endsWith(".txt")) return "ASCII text";
  if (name.endsWith(".log")) return "ASCII text (log file)";
  if (name.endsWith(".deb")) return "Debian binary package (format 2.0)";
  if (name.endsWith(".db")) return "SQLite 3.x database";
  if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) return "gzip compressed data";
  if (name.endsWith(".gz")) return "gzip compressed data";
  if (content.startsWith("[ENCRYPTED]") || content.includes("encrypted")) return "encrypted data";
  if (content.startsWith("#!")) return "script, ASCII text executable";
  if (content.trim() === "") return "empty";
  return "ASCII text";
}

const file: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return { output: "file: missing file operand" };
  }

  const outputs: string[] = [];

  for (const arg of args) {
    const absPath = resolvePath(arg, ctx.cwd, ctx.homeDir);
    const node = ctx.fs.getNode(absPath);

    if (!node) {
      outputs.push(`${arg}: cannot open (No such file or directory)`);
      continue;
    }

    if (isDirectory(node)) {
      outputs.push(`${arg}: directory`);
    } else if (isFile(node)) {
      outputs.push(`${arg}: ${guessFileType(node.name, node.content)}`);
    }
  }

  return { output: outputs.join("\n") };
};

register("file", file, "Determine file type", HELP_TEXTS.file, true);
