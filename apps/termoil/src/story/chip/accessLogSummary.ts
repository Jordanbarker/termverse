// ---------------------------------------------------------------------------
// Access-log summary — pure re-implementation of the in-game pipeline
//   sort /var/log/access.log | uniq -c | sort -rn | head
// ---------------------------------------------------------------------------
// Used by Chip's `review_access_log` response so that what Chip claims it ran
// equals what the player gets running the same command. Kept as a pure
// string->string function (no engine import); parity with the real sort/uniq
// commands is locked by accessLogSummary.test.ts.
// ---------------------------------------------------------------------------

/**
 * Return the top `topN` lines of `sort | uniq -c | sort -rn` over the given
 * access-log text, formatted exactly as the in-game `uniq -c` would
 * (count right-padded to 7, single space, then the line).
 */
export function accessLogTopSummary(logText: string, topN: number): string {
  if (logText.trim() === "") return "";

  // sort (ascending, localeCompare) — matches sort.ts
  const sorted = logText.split("\n").sort((a, b) => a.localeCompare(b));

  // uniq -c — count adjacent duplicates, format `${padStart(7)} ${line}`
  const groups: { line: string; count: number }[] = [];
  for (const line of sorted) {
    const prev = groups.length > 0 ? groups[groups.length - 1] : null;
    if (prev && prev.line === line) {
      prev.count++;
    } else {
      groups.push({ line, count: 1 });
    }
  }
  const counted = groups.map((g) => `${String(g.count).padStart(7)} ${g.line}`);

  // sort -rn — numeric ascending then reverse — matches sort.ts
  counted.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
  counted.reverse();

  return counted.slice(0, topN).join("\n");
}
