import { colorize, ansi } from "@tt/core/lib/ansi";
import { computeDiff, formatDiffLines } from "@tt/core/lib/diff";
import { pad2 } from "@tt/core/lib/format";
import { GitCommit } from "./types";
import { StatusResult, DiffFile } from "./repo";

export function formatStatus(status: StatusResult, short: boolean, plain: boolean): string {
  if (short) return formatStatusShort(status);

  const lines: string[] = [];
  if (status.rebase) {
    const onto = status.rebase.onto.slice(0, 7);
    lines.push(`interactive rebase in progress; onto ${onto}`);
    lines.push(`You are currently rebasing branch '${status.rebase.branch}' on '${onto}'.`);
    lines.push('  (fix conflicts and then run "git rebase --continue")');
    lines.push('  (use "git rebase --abort" to check out the original branch)');
  } else {
    lines.push(`On branch ${status.branch ?? "(detached HEAD)"}`);
    const t = status.tracking;
    if (t) {
      const n = (count: number) => `${count} commit${count !== 1 ? "s" : ""}`;
      if (t.behind > 0 && t.ahead === 0) {
        lines.push(`Your branch is behind '${t.remoteRef}' by ${n(t.behind)}, and can be fast-forwarded.`);
        lines.push('  (use "git pull" to update your local branch)');
      } else if (t.ahead > 0 && t.behind === 0) {
        lines.push(`Your branch is ahead of '${t.remoteRef}' by ${n(t.ahead)}.`);
        lines.push('  (use "git push" to publish your local commits)');
      } else if (t.ahead > 0 && t.behind > 0) {
        lines.push(`Your branch and '${t.remoteRef}' have diverged,`);
        lines.push(`and have ${t.ahead} and ${t.behind} different commits each, respectively.`);
        lines.push('  (use "git pull" if you want to integrate the remote branch with yours)');
      } else {
        lines.push(`Your branch is up to date with '${t.remoteRef}'.`);
      }
    }
  }

  if (status.rebase && status.rebase.unmerged.length > 0) {
    lines.push("");
    lines.push("Unmerged paths:");
    lines.push('  (use "git add <file>..." to mark resolution)');
    for (const f of status.rebase.unmerged) {
      const label = `\tboth modified:   ${f}`;
      lines.push(plain ? label : colorize(label, ansi.red));
    }
  }

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

  if (!status.rebase && status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0) {
    lines.push("nothing to commit, working tree clean");
  }

  return lines.join("\n");
}

function formatStatusShort(status: StatusResult): string {
  const lines: string[] = [];
  for (const f of status.rebase?.unmerged ?? []) {
    lines.push(`UU ${f}`);
  }
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
 * Format a game-time timestamp as a git-style date, matching the `date` builtin.
 * gameNowFor() constructs Dates with local-time field semantics, so we read back
 * with local getters and label the output +0000 (the in-game wall clock is UTC).
 */
function formatGitDate(ts: number): string {
  const d = new Date(ts);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${d.getFullYear()} +0000`;
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
