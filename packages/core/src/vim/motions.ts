import { CursorPosition } from "../editor/types";

/**
 * How a motion combines with an operator:
 * - exclusive: the range covers [start, target) characters
 * - inclusive: the range covers [start, target] characters
 * - linewise: the range covers whole lines from start.row to target.row
 */
export type MotionWise = "exclusive" | "inclusive" | "linewise";

export type MotionKey =
  | "h" | "l" | "j" | "k"
  | "w" | "b" | "e"
  | "0" | "^" | "$"
  | "gg" | "G"
  | "f" | "t";

/** Single-key motions that resolve immediately (0, gg, f, t are handled separately). */
export const MOTION_CHARS = new Set<string>(["h", "l", "j", "k", "w", "b", "e", "^", "$", "G"]);

export interface MotionResult {
  /** Raw target. col may equal line length (one past the last char); callers clamp for display. */
  target: CursorPosition;
  wise: MotionWise;
}

/** Vim's 3-class character model: whitespace / word (alnum + _) / punctuation. */
export type CharClass = 0 | 1 | 2;

export function charClass(ch: string): CharClass {
  if (/\s/.test(ch)) return 0;
  if (/[A-Za-z0-9_]/.test(ch)) return 1;
  return 2;
}

/** Column of the first non-blank character (0 for blank/empty lines). */
export function firstNonBlank(line: string): number {
  const idx = line.search(/\S/);
  return idx === -1 ? 0 : idx;
}

/** One `w` step: start of the next word. An empty line counts as a word. */
function stepWordForward(lines: string[], pos: CursorPosition): CursorPosition {
  let { row, col } = pos;
  const line = lines[row];
  if (col < line.length) {
    const cls = charClass(line[col]);
    if (cls !== 0) {
      while (col < line.length && charClass(line[col]) === cls) col++;
    }
  }
  for (;;) {
    const cur = lines[row];
    while (col < cur.length && charClass(cur[col]) === 0) col++;
    if (col < cur.length) return { row, col };
    if (row >= lines.length - 1) return { row, col: cur.length };
    row++;
    col = 0;
    if (lines[row].length === 0) return { row, col: 0 };
  }
}

/** One `b` step: start of the previous word. An empty line counts as a word. */
function stepWordBack(lines: string[], pos: CursorPosition): CursorPosition {
  let { row, col } = pos;
  col--;
  for (;;) {
    if (col < 0) {
      if (row === 0) return { row: 0, col: 0 };
      row--;
      if (lines[row].length === 0) return { row, col: 0 };
      col = lines[row].length - 1;
    }
    const line = lines[row];
    if (charClass(line[col]) === 0) {
      col--;
      continue;
    }
    const cls = charClass(line[col]);
    while (col > 0 && charClass(line[col - 1]) === cls) col--;
    return { row, col };
  }
}

/** One `e` step: end of the next word (skips empty lines, like vim). */
function stepWordEnd(lines: string[], pos: CursorPosition): CursorPosition {
  let { row, col } = pos;
  col++;
  for (;;) {
    const line = lines[row];
    if (col >= line.length) {
      if (row >= lines.length - 1) return { row, col: Math.max(0, line.length - 1) };
      row++;
      col = 0;
      continue;
    }
    if (charClass(line[col]) === 0) {
      col++;
      continue;
    }
    const cls = charClass(line[col]);
    while (col + 1 < line.length && charClass(line[col + 1]) === cls) col++;
    return { row, col };
  }
}

/** Apply a single-step motion `count` times, stopping early once it stops moving. */
function repeat(
  step: (lines: string[], pos: CursorPosition) => CursorPosition,
  lines: string[],
  cursor: CursorPosition,
  count: number
): CursorPosition {
  let p = cursor;
  for (let i = 0; i < count; i++) {
    const next = step(lines, p);
    if (next.row === p.row && next.col === p.col) break;
    p = next;
  }
  return p;
}

/**
 * `w` as an operator target (`dw`, `cw` fallback): vim clamps the final step at
 * end-of-line instead of crossing to the next line's first word, unless the
 * step started on an empty line (there `dw` consumes the line break).
 */
function wordForwardForOperator(lines: string[], pos: CursorPosition, count: number): CursorPosition {
  let p = pos;
  for (let i = 0; i < count; i++) {
    const next = stepWordForward(lines, p);
    if (i === count - 1 && next.row > p.row) {
      const eol = lines[p.row].length;
      if (p.col < eol) return { row: p.row, col: eol };
    }
    if (next.row === p.row && next.col === p.col) break;
    p = next;
  }
  return p;
}

export interface Motion {
  key: MotionKey;
  /** null = no count typed (matters for gg/G, which jump to a line number). */
  count: number | null;
  /** Target character for f/t. */
  char?: string;
}

/**
 * Compute a motion target. Returns null when the motion fails (f/t miss),
 * matching vim's beep-and-do-nothing.
 */
export function applyMotion(
  lines: string[],
  cursor: CursorPosition,
  motion: Motion,
  opts: { forOperator?: boolean } = {}
): MotionResult | null {
  const count = motion.count ?? 1;
  const lastRow = lines.length - 1;
  const line = lines[cursor.row];

  switch (motion.key) {
    case "h":
      return { target: { row: cursor.row, col: Math.max(0, cursor.col - count) }, wise: "exclusive" };
    case "l":
      return { target: { row: cursor.row, col: Math.min(line.length, cursor.col + count) }, wise: "exclusive" };
    case "j":
      if (cursor.row >= lastRow) return null;
      return { target: { row: Math.min(lastRow, cursor.row + count), col: cursor.col }, wise: "linewise" };
    case "k":
      if (cursor.row <= 0) return null;
      return { target: { row: Math.max(0, cursor.row - count), col: cursor.col }, wise: "linewise" };
    case "0":
      return { target: { row: cursor.row, col: 0 }, wise: "exclusive" };
    case "^":
      return { target: { row: cursor.row, col: firstNonBlank(line) }, wise: "exclusive" };
    case "$": {
      const row = Math.min(lastRow, cursor.row + count - 1);
      return { target: { row, col: Math.max(0, lines[row].length - 1) }, wise: "inclusive" };
    }
    case "w": {
      if (opts.forOperator) {
        return { target: wordForwardForOperator(lines, cursor, count), wise: "exclusive" };
      }
      return { target: repeat(stepWordForward, lines, cursor, count), wise: "exclusive" };
    }
    case "b":
      return { target: repeat(stepWordBack, lines, cursor, count), wise: "exclusive" };
    case "e":
      return { target: repeat(stepWordEnd, lines, cursor, count), wise: "inclusive" };
    case "gg": {
      const row = motion.count !== null ? Math.max(0, Math.min(lastRow, motion.count - 1)) : 0;
      return { target: { row, col: firstNonBlank(lines[row]) }, wise: "linewise" };
    }
    case "G": {
      const row = motion.count !== null ? Math.max(0, Math.min(lastRow, motion.count - 1)) : lastRow;
      return { target: { row, col: firstNonBlank(lines[row]) }, wise: "linewise" };
    }
    case "f": {
      if (!motion.char) return null;
      let idx = cursor.col;
      for (let i = 0; i < count; i++) {
        idx = line.indexOf(motion.char, idx + 1);
        if (idx === -1) return null;
      }
      return { target: { row: cursor.row, col: idx }, wise: "inclusive" };
    }
    case "t": {
      if (!motion.char) return null;
      let idx = cursor.col;
      for (let i = 0; i < count; i++) {
        idx = line.indexOf(motion.char, idx + 1);
        if (idx === -1) return null;
      }
      if (idx - 1 <= cursor.col) return null;
      return { target: { row: cursor.row, col: idx - 1 }, wise: "inclusive" };
    }
  }
}
