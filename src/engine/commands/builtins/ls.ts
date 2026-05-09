import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "../../../lib/pathUtils";
import { isDirectory, isFile, FSNode } from "../../filesystem/types";
import { colorize, ansi } from "../../../lib/ansi";
import { formatSize } from "../../../lib/formatSize";
import { HELP_TEXTS } from "./helpTexts";

function getSize(entry: FSNode): number {
  return isFile(entry) ? entry.content.length : 4096;
}

function colorName(e: FSNode): string {
  if (isDirectory(e)) return colorize(e.name, ansi.bold, ansi.blue);
  if (e.permissions[2] === "x") return colorize(e.name, ansi.bold, ansi.green);
  return e.name;
}

function colorPermissions(typeChar: string, perms: string): string {
  const tc = typeChar === "d" ? colorize(typeChar, ansi.blue) : typeChar;
  const colored = perms
    .split("")
    .map((ch) => {
      switch (ch) {
        case "r": return colorize(ch, ansi.yellow);
        case "w": return colorize(ch, ansi.red);
        case "x": return colorize(ch, ansi.green);
        default: return colorize(ch, ansi.dim);
      }
    })
    .join("");
  return tc + colored;
}

function formatLongEntries(entries: FSNode[], humanReadable: boolean): string[] {
  const sizes = entries.map((e) => formatSize(getSize(e), humanReadable));
  const maxWidth = Math.max(...sizes.map((s) => s.length));

  return entries.map((e, i) => {
    const typeChar = isDirectory(e) ? "d" : "-";
    const perms = e.permissions;
    const sizeStr = sizes[i].padStart(maxWidth);
    const name = colorName(e);
    return `${colorPermissions(typeChar, perms)}  ${sizeStr}  ${name}`;
  });
}

const ls: CommandHandler = (args, flags, ctx) => {
  const targets = args.length > 0 ? args : [ctx.cwd];
  // `-A`/`--almost-all` differs from `-a` only by hiding `.` and `..`, which
  // our virtual FS doesn't list as entries — treat them identically.
  const showHidden = flags["a"] || flags["all"] || flags["A"] || flags["almost-all"];
  const longFormat = flags["l"];
  const humanReadable = flags["h"] || flags["human-readable"];
  const showHeaders = targets.length > 1;

  const errors: string[] = [];
  const fileEntries: FSNode[] = [];
  const dirs: { label: string; entries: FSNode[] }[] = [];
  const visitedDirs: string[] = [];

  for (const target of targets) {
    const absolutePath = resolvePath(target, ctx.cwd, ctx.homeDir);
    const node = ctx.fs.getNode(absolutePath);

    if (!node) {
      errors.push(`ls: cannot access '${target}': No such file or directory`);
    } else if (isFile(node)) {
      fileEntries.push(node);
    } else {
      const result = ctx.fs.listDirectory(absolutePath);
      if (result.error) {
        errors.push(`ls: cannot open directory '${target}': Permission denied`);
        continue;
      }
      let entries = result.entries;
      if (!showHidden) {
        entries = entries.filter((e) => !e.hidden);
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      dirs.push({ label: target, entries });
      if (args.length > 0) {
        visitedDirs.push(absolutePath);
      }
    }
  }

  const sections: string[] = [];

  if (errors.length > 0) {
    sections.push(errors.join("\n"));
  }

  if (fileEntries.length > 0) {
    if (longFormat) {
      sections.push(formatLongEntries(fileEntries, humanReadable).join("\n"));
    } else {
      const formatted = fileEntries.map((e) => colorName(e));
      const separator = ctx.isPiped ? "\n" : "  ";
      sections.push(formatted.join(separator));
    }
  }

  for (const dir of dirs) {
    const lines: string[] = [];
    if (showHeaders) {
      lines.push(`${dir.label}:`);
    }
    if (dir.entries.length > 0) {
      if (longFormat) {
        lines.push(formatLongEntries(dir.entries, humanReadable).join("\n"));
      } else {
        const formatted = dir.entries.map((e) => colorName(e));
        const separator = ctx.isPiped ? "\n" : "  ";
        lines.push(formatted.join(separator));
      }
    }
    sections.push(lines.join("\n"));
  }

  return {
    output: sections.join("\n\n"),
    exitCode: errors.length > 0 ? 1 : 0,
    ...(visitedDirs.length > 0 && {
      triggerEvents: visitedDirs.map((p) => ({ type: "directory_visit" as const, detail: p })),
    }),
  };
};

register("ls", ls, "List directory contents", HELP_TEXTS.ls);
setKnownFlags("ls", { short: ["a", "A", "l", "h"], long: ["all", "almost-all", "human-readable"] });
