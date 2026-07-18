import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { skipFlagValidation } from "../flagValidation";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { isDirectory, isFile, FSNode } from "@tt/core/filesystem/types";
import { HELP_TEXTS } from "./helpTexts";

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

function walkAll(
  fs: { getNode: (p: string) => FSNode | null; listDirectory: (p: string) => { entries: FSNode[]; error?: string } },
  dirPath: string,
): { path: string; node: FSNode }[] {
  const results: { path: string; node: FSNode }[] = [];
  const { entries, error } = fs.listDirectory(dirPath);
  if (error) return results; // skip permission-denied subtrees
  for (const entry of entries) {
    const childPath = dirPath === "/" ? `/${entry.name}` : `${dirPath}/${entry.name}`;
    results.push({ path: childPath, node: entry });
    if (isDirectory(entry)) {
      results.push(...walkAll(fs, childPath));
    }
  }
  return results;
}

const find: CommandHandler = (args, _flags, ctx) => {
  // Parse find-style arguments: find [PATH] [EXPRESSIONS]
  // Expressions: -name PATTERN, -type f|d
  // Use rawArgs to preserve -name/-type tokens that the parser strips
  const effectiveArgs = ctx.rawArgs ?? args;
  if (effectiveArgs.length === 0) {
    return { output: HELP_TEXTS.find, exitCode: 1 };
  }
  let searchPath = ctx.cwd;
  let namePattern: RegExp | null = null;
  let typeFilter: "f" | "d" | null = null;

  let i = 0;
  // First non-expression arg is the path
  if (i < effectiveArgs.length && !effectiveArgs[i].startsWith("-")) {
    searchPath = resolvePath(effectiveArgs[i], ctx.cwd, ctx.homeDir);
    i++;
  }

  // Parse expressions
  while (i < effectiveArgs.length) {
    if (effectiveArgs[i] === "-name") {
      if (i + 1 >= effectiveArgs.length) {
        return { output: "find: -name: requires additional arguments", exitCode: 1 };
      }
      namePattern = globToRegex(effectiveArgs[i + 1]);
      i += 2;
    } else if (effectiveArgs[i] === "-type") {
      if (i + 1 >= effectiveArgs.length) {
        return { output: "find: -type: requires additional arguments", exitCode: 1 };
      }
      const t = effectiveArgs[i + 1];
      if (t !== "f" && t !== "d") {
        return { output: `find: -type: ${t}: unknown type`, exitCode: 1 };
      }
      typeFilter = t;
      i += 2;
    } else {
      i++;
    }
  }

  const searchedEvent = { type: "command_executed" as const, detail: "files_searched" };

  const node = ctx.fs.getNode(searchPath);
  if (!node) {
    return { output: `find: '${searchPath}': No such file or directory`, exitCode: 1 };
  }
  if (!isDirectory(node)) {
    // Single file — check if it matches
    const name = node.name;
    if (namePattern && !namePattern.test(name)) {
      return { output: "", exitCode: 0, triggerEvents: [searchedEvent] };
    }
    if (typeFilter === "d") {
      return { output: "", exitCode: 0, triggerEvents: [searchedEvent] };
    }
    return { output: searchPath, exitCode: 0, triggerEvents: [searchedEvent] };
  }

  const allEntries = walkAll(ctx.fs, searchPath);
  const matches: string[] = [];

  // Include the search path itself if it matches
  if (!namePattern && (!typeFilter || typeFilter === "d")) {
    matches.push(searchPath);
  }

  for (const { path, node: entry } of allEntries) {
    const entryName = entry.name;

    if (namePattern && !namePattern.test(entryName)) continue;
    if (typeFilter === "f" && !isFile(entry)) continue;
    if (typeFilter === "d" && !isDirectory(entry)) continue;

    matches.push(path);
  }

  return {
    output: matches.join("\n"),
    exitCode: 0,
    triggerEvents: [searchedEvent],
  };
};

register("find", find, "Search for files by name", HELP_TEXTS.find);
// rawArgs-driven: -name/-type tokens come through as `flags: {n,a,m,e}` etc.
// after parser splitting; the handler re-parses ctx.rawArgs.
skipFlagValidation("find");
