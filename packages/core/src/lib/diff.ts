import { colorize, ansi } from "./ansi";

export interface DiffEntry {
  type: "context" | "removed" | "added";
  line: string;
}

/**
 * Simple LCS-based line diff. Files are small (<100 lines) so O(n*m) is fine.
 */
export function computeDiff(aLines: string[], bLines: string[]): DiffEntry[] {
  const n = aLines.length;
  const m = bLines.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (aLines[i - 1] === bLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const stack: DiffEntry[] = [];
  let i = n, j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
      stack.push({ type: "context", line: aLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: "added", line: bLines[j - 1] });
      j--;
    } else {
      stack.push({ type: "removed", line: aLines[i - 1] });
      i--;
    }
  }

  stack.reverse();
  return stack;
}

/**
 * Format diff entries with ANSI colors. Pass plain=true to skip colors (for piped output).
 */
export function formatDiffLines(entries: DiffEntry[], plain?: boolean): string[] {
  const lines: string[] = [];
  for (const entry of entries) {
    switch (entry.type) {
      case "removed":
        lines.push(plain ? `-${entry.line}` : colorize(`-${entry.line}`, ansi.red));
        break;
      case "added":
        lines.push(plain ? `+${entry.line}` : colorize(`+${entry.line}`, ansi.green));
        break;
      case "context":
        lines.push(` ${entry.line}`);
        break;
    }
  }
  return lines;
}
