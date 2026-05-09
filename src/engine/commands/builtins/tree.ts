import { CommandHandler, CommandResult } from "../types";
import { register } from "../registry";
import { skipFlagValidation } from "../flagValidation";
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
  depth: number,
  maxDepth: number | undefined,
): string[] {
  if (maxDepth !== undefined && depth >= maxDepth) return [];
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
      lines.push(...buildTree(fs, childPath, prefix + childPrefix, counts, showAll, depth + 1, maxDepth));
    } else {
      counts.files++;
      lines.push(prefix + connector + entry.name);
    }
  }

  return lines;
}

const tree: CommandHandler = (args, flags, ctx) => {
  let showAll = !!(flags["a"] || flags["all"]);
  let maxDepth: number | undefined;
  const positional: string[] = [];

  // When invoked through the parser, `ctx.rawArgs` carries the unstripped tokens
  // so we can recover `-L N`. When called directly (e.g. from tests), fall back
  // to the already-parsed `args` and `flags`.
  const effectiveArgs = ctx.rawArgs ?? args;
  const usingRawArgs = ctx.rawArgs !== undefined;

  for (let i = 0; i < effectiveArgs.length; i++) {
    const tok = effectiveArgs[i];
    if (usingRawArgs && tok === "-L") {
      const next = effectiveArgs[i + 1];
      if (next === undefined) {
        return { output: "tree: option requires an argument -- 'L'", exitCode: 1 };
      }
      const parsed = parseInt(next, 10);
      if (isNaN(parsed) || parsed < 0 || String(parsed) !== next) {
        return { output: `tree: Invalid level, must be greater than 0.`, exitCode: 1 };
      }
      maxDepth = parsed;
      i++;
    } else if (usingRawArgs && /^-L\d+$/.test(tok)) {
      const parsed = parseInt(tok.slice(2), 10);
      if (isNaN(parsed) || parsed < 0) {
        return { output: `tree: Invalid level, must be greater than 0.`, exitCode: 1 };
      }
      maxDepth = parsed;
    } else if (usingRawArgs && (tok === "-a" || tok === "--all")) {
      showAll = true;
    } else if (usingRawArgs && tok === "--help") {
      positional.push(tok);
    } else if (usingRawArgs && tok.startsWith("--")) {
      return {
        output: `tree: unrecognized option '${tok}'\nTry 'tree --help' for more information.`,
        exitCode: 2,
      };
    } else if (usingRawArgs && tok.startsWith("-") && tok.length > 1) {
      const bad = tok[1];
      return {
        output: `tree: invalid option -- '${bad}'\nTry 'tree --help' for more information.`,
        exitCode: 2,
      };
    } else {
      positional.push(tok);
    }
  }

  const target = positional[0] || ".";
  const absPath = resolvePath(target, ctx.cwd, ctx.homeDir);
  const node = ctx.fs.getNode(absPath);

  if (!node) {
    return { output: `${target} [error opening dir]` };
  }

  if (!isDirectory(node)) {
    return { output: target };
  }

  const counts = { dirs: 0, files: 0 };
  const lines = [colorize(target, ansi.bold, ansi.blue)];
  lines.push(...buildTree(ctx.fs, absPath, "", counts, showAll, 0, maxDepth));
  lines.push("");
  lines.push(`${counts.dirs} directories, ${counts.files} files`);

  const result: CommandResult = {
    output: lines.join("\n"),
    triggerEvents: [{ type: "command_executed", detail: "files_searched" }],
  };
  return result;
};

register("tree", tree, "Display directory tree", HELP_TEXTS.tree);
skipFlagValidation("tree");
