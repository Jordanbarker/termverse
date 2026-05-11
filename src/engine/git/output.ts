import { colorize, ansi } from "../../lib/ansi";
import { computeDiff, formatDiffLines } from "../../lib/diff";
import { pad2 } from "../../lib/format";
import { GitCommit } from "./types";
import { StatusResult, DiffFile } from "./repo";

export function formatStatus(status: StatusResult, short: boolean, plain: boolean): string {
  if (short) return formatStatusShort(status);

  const lines: string[] = [];
  lines.push(`On branch ${status.branch ?? "(detached HEAD)"}`);

  if (status.staged.length > 0) {
    lines.push("");
    lines.push("Changes to be committed:");
    lines.push('  (use "git restore --staged <file>..." to unstage)');
    for (const s of status.staged) {
      const label = `\t${s.status}:   ${s.path}`;
      lines.push(plain ? label : colorize(label, ansi.green));
    }
  }

  if (status.unstaged.length > 0) {
    lines.push("");
    lines.push("Changes not staged for commit:");
    lines.push('  (use "git add <file>..." to update what will be committed)');
    for (const u of status.unstaged) {
      const label = `\t${u.status}:   ${u.path}`;
      lines.push(plain ? label : colorize(label, ansi.red));
    }
  }

  if (status.untracked.length > 0) {
    lines.push("");
    lines.push("Untracked files:");
    lines.push('  (use "git add <file>..." to include in what will be committed)');
    for (const path of status.untracked) {
      const label = `\t${path}`;
      lines.push(plain ? label : colorize(label, ansi.red));
    }
  }

  if (status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0) {
    lines.push("nothing to commit, working tree clean");
  }

  return lines.join("\n");
}

function formatStatusShort(status: StatusResult): string {
  const lines: string[] = [];
  for (const s of status.staged) {
    const prefix = s.status === "new file" ? "A " : s.status === "deleted" ? "D " : "M ";
    lines.push(`${prefix} ${s.path}`);
  }
  for (const u of status.unstaged) {
    const prefix = u.status === "deleted" ? " D" : " M";
    lines.push(`${prefix} ${u.path}`);
  }
  for (const path of status.untracked) {
    lines.push(`?? ${path}`);
  }
  return lines.join("\n");
}

/**
 * Format a UTC timestamp as git-style date with -0700 (Pacific) offset.
 * The stored timestamp stays UTC; we shift the display by -7h.
 */
function formatGitDate(ts: number): string {
  const OFFSET_MS = 7 * 60 * 60 * 1000;
  const d = new Date(ts - OFFSET_MS);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${d.getUTCDate()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} ${d.getUTCFullYear()} -0700`;
}

export function formatLog(commits: GitCommit[], oneline: boolean, graph: boolean, plain: boolean): string {
  if (commits.length === 0) return "";

  const lines: string[] = [];
  for (const commit of commits) {
    const graphPrefix = graph ? "* " : "";

    if (oneline) {
      const hashStr = plain ? commit.hash : colorize(commit.hash, ansi.yellow);
      lines.push(`${graphPrefix}${hashStr} ${commit.message}`);
    } else {
      const hashStr = plain ? `commit ${commit.hash}` : colorize(`commit ${commit.hash}`, ansi.yellow);
      lines.push(`${graphPrefix}${hashStr}`);
      lines.push(`Author: ${commit.author}`);
      lines.push(`Date:   ${formatGitDate(commit.timestamp)}`);
      lines.push("");
      lines.push(`    ${commit.message}`);
      lines.push("");
    }
  }
  return lines.join("\n").trimEnd();
}

export function formatDiff(diffs: DiffFile[], plain: boolean): string {
  if (diffs.length === 0) return "";

  const outputLines: string[] = [];
  for (const diff of diffs) {
    const header1 = plain ? `--- a/${diff.path}` : colorize(`--- a/${diff.path}`, ansi.bold);
    const header2 = plain ? `+++ b/${diff.path}` : colorize(`+++ b/${diff.path}`, ansi.bold);
    outputLines.push(header1);
    outputLines.push(header2);

    const aLines = diff.oldContent.split("\n");
    const bLines = diff.newContent.split("\n");
    const entries = computeDiff(aLines, bLines);
    outputLines.push(...formatDiffLines(entries, plain));
    outputLines.push("");
  }

  return outputLines.join("\n").trimEnd();
}

export function formatBranches(
  branches: string[],
  remotes: string[],
  current: string | null,
  plain: boolean,
): string {
  const lines: string[] = [];
  for (const b of branches) {
    if (b === current) {
      const label = `* ${b}`;
      lines.push(plain ? label : colorize(label, ansi.green));
    } else {
      lines.push(`  ${b}`);
    }
  }
  for (const r of remotes) {
    const label = `  ${r}`;
    lines.push(plain ? label : colorize(label, ansi.red));
  }
  return lines.join("\n");
}
