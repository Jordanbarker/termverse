import { colorize, ansi } from "@tt/core/lib/ansi";
import { computeDiff, formatDiffLines, DiffEntry } from "@tt/core/lib/diff";
import { pad2 } from "@tt/core/lib/format";
import { GitCommit } from "./types";
import { StatusResult, DiffFile, contentLines, shortHash } from "./repo";

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
    if (status.branch) {
      lines.push(`On branch ${status.branch}`);
    } else if (status.detachedAt) {
      lines.push(`HEAD detached at ${status.detachedAt.slice(0, 7)}`);
    } else {
      lines.push("On branch (detached HEAD)");
    }
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

  // A merge in progress is reported *after* the branch/tracking header, not instead of
  // it — real git only replaces the header for a rebase.
  if (status.merge) {
    lines.push("");
    if (status.merge.unmerged.length > 0) {
      lines.push("You have unmerged paths.");
      lines.push('  (fix conflicts and run "git commit")');
    } else {
      lines.push("All conflicts fixed but you are still merging.");
      lines.push('  (use "git commit" to conclude merge)');
    }
    lines.push('  (use "git merge --abort" to abort the merge)');
  }

  const unmergedPaths = status.rebase?.unmerged ?? status.merge?.unmerged ?? [];
  if (unmergedPaths.length > 0) {
    lines.push("");
    lines.push("Unmerged paths:");
    lines.push('  (use "git add <file>..." to mark resolution)');
    for (const f of unmergedPaths) {
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
    lines.push('  (use "git restore <file>..." to discard changes in working directory)');
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

  if (!status.rebase && !status.merge && status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0) {
    lines.push("nothing to commit, working tree clean");
  }

  return lines.join("\n");
}

function formatStatusShort(status: StatusResult): string {
  const lines: string[] = [];
  for (const f of status.rebase?.unmerged ?? status.merge?.unmerged ?? []) {
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
 * The `ctx.clock` seam constructs Dates with local-time field semantics, so we read back
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

/** Lines of leading/trailing context git shows around each change. */
const HUNK_CONTEXT = 3;

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  entries: DiffEntry[];
}

/**
 * Group an ordered DiffEntry list into unified-diff hunks: runs of changes with
 * ±HUNK_CONTEXT context, merged when two runs are close enough that their
 * context would overlap or abut.
 */
export function buildHunks(entries: DiffEntry[]): Hunk[] {
  // Line number each entry occupies on the old/new side, before it is consumed.
  const oldBefore: number[] = [];
  const newBefore: number[] = [];
  let oldNo = 1;
  let newNo = 1;
  for (const entry of entries) {
    oldBefore.push(oldNo);
    newBefore.push(newNo);
    if (entry.type !== "added") oldNo++;
    if (entry.type !== "removed") newNo++;
  }

  const changeIdx = entries.map((e, i) => (e.type === "context" ? -1 : i)).filter((i) => i >= 0);
  if (changeIdx.length === 0) return [];

  // A gap wider than two context blocks splits the hunk; anything less merges.
  const groups: [number, number][] = [];
  let start = changeIdx[0];
  let end = changeIdx[0];
  for (const i of changeIdx.slice(1)) {
    if (i - end - 1 > HUNK_CONTEXT * 2) {
      groups.push([start, end]);
      start = i;
    }
    end = i;
  }
  groups.push([start, end]);

  return groups.map(([first, last]) => {
    const from = Math.max(0, first - HUNK_CONTEXT);
    const to = Math.min(entries.length - 1, last + HUNK_CONTEXT);
    const slice = entries.slice(from, to + 1);
    const oldCount = slice.filter((e) => e.type !== "added").length;
    const newCount = slice.filter((e) => e.type !== "removed").length;
    return {
      // A hunk with no lines on one side anchors *after* the previous line, as
      // git does for whole-file adds/deletes (`@@ -0,0 +1,N @@`).
      oldStart: oldCount > 0 ? oldBefore[from] : oldBefore[from] - 1,
      oldCount,
      newStart: newCount > 0 ? newBefore[from] : newBefore[from] - 1,
      newCount,
      entries: slice,
    };
  });
}

export function formatDiff(diffs: DiffFile[], plain: boolean): string {
  if (diffs.length === 0) return "";

  const meta = (line: string) => (plain ? line : colorize(line, ansi.bold));
  const NULL_BLOB = "0000000";

  const outputLines: string[] = [];
  for (const diff of diffs) {
    const oldBlob = diff.status === "added" ? NULL_BLOB : shortHash(diff.oldContent);
    const newBlob = diff.status === "deleted" ? NULL_BLOB : shortHash(diff.newContent);

    outputLines.push(meta(`diff --git a/${diff.path} b/${diff.path}`));
    if (diff.status === "added") outputLines.push(meta("new file mode 100644"));
    if (diff.status === "deleted") outputLines.push(meta("deleted file mode 100644"));
    // Mode suffix only appears when the mode is unchanged, i.e. not on add/delete.
    const modeSuffix = diff.status === "modified" ? " 100644" : "";
    outputLines.push(meta(`index ${oldBlob}..${newBlob}${modeSuffix}`));
    outputLines.push(meta(diff.status === "added" ? "--- /dev/null" : `--- a/${diff.path}`));
    outputLines.push(meta(diff.status === "deleted" ? "+++ /dev/null" : `+++ b/${diff.path}`));

    // Unified-diff ranges drop the `,N` when the side spans exactly one line.
    const range = (start: number, count: number) => (count === 1 ? `${start}` : `${start},${count}`);

    const entries = computeDiff(contentLines(diff.oldContent), contentLines(diff.newContent));
    for (const hunk of buildHunks(entries)) {
      const header = `@@ -${range(hunk.oldStart, hunk.oldCount)} +${range(hunk.newStart, hunk.newCount)} @@`;
      outputLines.push(plain ? header : colorize(header, ansi.cyan));
      outputLines.push(...formatDiffLines(hunk.entries, plain));
    }
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
