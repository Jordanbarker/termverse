import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { isDirectory, isFile, FSNode } from "@tt/core/filesystem/types";
import { colorize, ansi } from "@tt/core/lib/ansi";
import { formatSize } from "@tt/core/lib/formatSize";
import { HELP_TEXTS } from "./helpTexts";

function getSize(entry: FSNode): number {
  return isFile(entry) ? entry.content.length : 4096;
}

function formatTotalLine(entries: FSNode[], humanReadable: boolean): string {
  const blocks = entries.reduce((sum, e) => sum + Math.ceil(getSize(e) / 1024), 0);
  const value = humanReadable ? formatSize(blocks * 1024, true) : String(blocks);
  return `total ${value}`;
}

function colorName(e: FSNode): string {
  if (isDirectory(e)) return colorize(e.name, ansi.bold, ansi.blue);
  if (e.permissions[2] === "x") return colorize(e.name, ansi.bold, ansi.green);
  return e.name;
}

function classify(node: FSNode): string {
  if (isDirectory(node)) return "/";
  if (isFile(node) && node.permissions[2] === "x") return "*";
  return "";
}

function formatColumnar(entries: string[], visibleWidths: number[], termWidth: number): string {
  if (entries.length === 0) return "";
  const maxWidth = Math.max(...visibleWidths);
  const colWidth = maxWidth + 2;
  const cols = Math.max(1, Math.floor(termWidth / colWidth));
  const rows = Math.ceil(entries.length / cols);
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      const idx = c * rows + r;
      if (idx >= entries.length) break;
      line += entries[idx] + " ".repeat(colWidth - visibleWidths[idx]);
    }
    lines.push(line.trimEnd());
  }
  return lines.join("\n");
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

function formatLongEntries(entries: FSNode[], humanReadable: boolean, useClassify: boolean): string[] {
  const sizes = entries.map((e) => formatSize(getSize(e), humanReadable));
  const maxWidth = Math.max(...sizes.map((s) => s.length));

  return entries.map((e, i) => {
    const typeChar = isDirectory(e) ? "d" : "-";
    const perms = e.permissions;
    const sizeStr = sizes[i].padStart(maxWidth);
    const name = colorName(e) + (useClassify ? classify(e) : "");
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
  const columnar = flags["C"];
  const useClassify = flags["F"];
  const showHeaders = targets.length > 1;
  const termWidth = parseInt(ctx.envVars?.COLUMNS ?? "", 10) || 80;

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

  const formatEntries = (entries: FSNode[]): string => {
    if (longFormat) {
      return formatLongEntries(entries, humanReadable, useClassify).join("\n");
    }
    const suffixes = entries.map((e) => (useClassify ? classify(e) : ""));
    const formatted = entries.map((e, i) => colorName(e) + suffixes[i]);
    if (columnar && !ctx.isPiped) {
      const widths = entries.map((e, i) => e.name.length + suffixes[i].length);
      return formatColumnar(formatted, widths, termWidth);
    }
    const separator = ctx.isPiped ? "\n" : "  ";
    return formatted.join(separator);
  };

  if (fileEntries.length > 0) {
    sections.push(formatEntries(fileEntries));
  }

  for (const dir of dirs) {
    const lines: string[] = [];
    if (showHeaders) {
      lines.push(`${dir.label}:`);
    }
    if (longFormat) {
      lines.push(formatTotalLine(dir.entries, humanReadable));
    }
    if (dir.entries.length > 0) {
      lines.push(formatEntries(dir.entries));
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
setKnownFlags("ls", { short: ["a", "A", "l", "h", "C", "F"], long: ["all", "almost-all", "human-readable"] });
