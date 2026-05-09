import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "../../../lib/pathUtils";
import { isDirectory, FSNode } from "../../filesystem/types";
import { colorize, ansi } from "../../../lib/ansi";
import { HELP_TEXTS } from "./helpTexts";

function buildTree(
  fs: { listDirectory: (p: string) => { entries: FSNode[]; error?: string } },
  dirPath: string,
  prefix: string,
  counts: { dirs: number; files: number },
  showAll: boolean,
): string[] {
  const { entries, error } = fs.listDirectory(dirPath);
  if (error) return [prefix + "[error opening dir]"];
  const sorted = entries
    .filter((e) => showAll || !e.hidden)
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const isLast = i === sorted.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    if (isDirectory(entry)) {
      counts.dirs++;
      lines.push(prefix + connector + colorize(entry.name, ansi.bold, ansi.blue));
      const childPath = dirPath === "/" ? `/${entry.name}` : `${dirPath}/${entry.name}`;
      lines.push(...buildTree(fs, childPath, prefix + childPrefix, counts, showAll));
    } else {
      counts.files++;
      lines.push(prefix + connector + entry.name);
    }
  }

  return lines;
}

const tree: CommandHandler = (args, flags, ctx) => {
  const target = args[0] || ".";
  const absPath = resolvePath(target, ctx.cwd, ctx.homeDir);
  const node = ctx.fs.getNode(absPath);

  if (!node) {
    return { output: `${target} [error opening dir]` };
  }

  if (!isDirectory(node)) {
    return { output: target };
  }

  const showAll = !!(flags["a"] || flags["all"]);
  const counts = { dirs: 0, files: 0 };
  const lines = [colorize(target, ansi.bold, ansi.blue)];
  lines.push(...buildTree(ctx.fs, absPath, "", counts, showAll));
  lines.push("");
  lines.push(`${counts.dirs} directories, ${counts.files} files`);

  return {
    output: lines.join("\n"),
    triggerEvents: [{ type: "command_executed", detail: "files_searched" }],
  };
};

register("tree", tree, "Display directory tree", HELP_TEXTS.tree);
setKnownFlags("tree", { short: ["a"], long: ["all"] });
