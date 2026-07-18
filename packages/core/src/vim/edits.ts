import { CursorPosition } from "../editor/types";
import { Register } from "./types";
import { firstNonBlank } from "./motions";

/**
 * Pure buffer operations. All functions return fresh arrays and never mutate
 * their inputs, so undo snapshots and callers can share line arrays safely.
 */

export interface EditResult {
  lines: string[];
  cursor: CursorPosition;
}

/** Delete the charwise span [start, endEx). endEx.col is clamped to its line length. */
export function deleteCharwise(
  lines: string[],
  start: CursorPosition,
  endEx: CursorPosition
): EditResult & { register: Register } {
  const endCol = Math.min(endEx.col, lines[endEx.row].length);
  if (start.row === endEx.row) {
    const line = lines[start.row];
    const seg = line.slice(start.col, endCol);
    const next = lines.slice();
    next[start.row] = line.slice(0, start.col) + line.slice(endCol);
    return { lines: next, cursor: { ...start }, register: { text: [seg], linewise: false } };
  }
  const segs: string[] = [lines[start.row].slice(start.col)];
  for (let r = start.row + 1; r < endEx.row; r++) segs.push(lines[r]);
  segs.push(lines[endEx.row].slice(0, endCol));
  const joined = lines[start.row].slice(0, start.col) + lines[endEx.row].slice(endCol);
  const next = [...lines.slice(0, start.row), joined, ...lines.slice(endEx.row + 1)];
  return { lines: next, cursor: { ...start }, register: { text: segs, linewise: false } };
}

/** Yank the charwise span [start, endEx) without changing the buffer. */
export function yankCharwise(lines: string[], start: CursorPosition, endEx: CursorPosition): Register {
  const endCol = Math.min(endEx.col, lines[endEx.row].length);
  if (start.row === endEx.row) {
    return { text: [lines[start.row].slice(start.col, endCol)], linewise: false };
  }
  const segs: string[] = [lines[start.row].slice(start.col)];
  for (let r = start.row + 1; r < endEx.row; r++) segs.push(lines[r]);
  segs.push(lines[endEx.row].slice(0, endCol));
  return { text: segs, linewise: false };
}

/** Delete whole lines startRow..endRow. Deleting every line leaves [""]. */
export function deleteLinewise(
  lines: string[],
  startRow: number,
  endRow: number
): EditResult & { register: Register } {
  const removed = lines.slice(startRow, endRow + 1);
  const next = [...lines.slice(0, startRow), ...lines.slice(endRow + 1)];
  if (next.length === 0) next.push("");
  const row = Math.min(startRow, next.length - 1);
  return {
    lines: next,
    cursor: { row, col: firstNonBlank(next[row]) },
    register: { text: removed, linewise: true },
  };
}

export function yankLinewise(lines: string[], startRow: number, endRow: number): Register {
  return { text: lines.slice(startRow, endRow + 1), linewise: true };
}

/** cc / linewise c: replace the rows with a single empty line to type into. */
export function changeLinewise(
  lines: string[],
  startRow: number,
  endRow: number
): EditResult & { register: Register } {
  const removed = lines.slice(startRow, endRow + 1);
  const next = [...lines.slice(0, startRow), "", ...lines.slice(endRow + 1)];
  return {
    lines: next,
    cursor: { row: startRow, col: 0 },
    register: { text: removed, linewise: true },
  };
}

/** p / P. Charwise pastes within the line; linewise pastes whole lines below/above. */
export function putRegister(
  lines: string[],
  cursor: CursorPosition,
  reg: Register,
  before: boolean,
  count: number
): EditResult {
  if (reg.linewise) {
    const pasted: string[] = [];
    for (let i = 0; i < count; i++) pasted.push(...reg.text);
    const at = before ? cursor.row : cursor.row + 1;
    const next = [...lines.slice(0, at), ...pasted, ...lines.slice(at)];
    return { lines: next, cursor: { row: at, col: firstNonBlank(pasted[0] ?? "") } };
  }

  const segs: string[] = [];
  for (let i = 0; i < count; i++) {
    if (segs.length === 0) segs.push(...reg.text);
    else {
      // Repeated charwise text concatenates: last segment joins the next copy's first.
      segs[segs.length - 1] += reg.text[0];
      segs.push(...reg.text.slice(1));
    }
  }
  const line = lines[cursor.row];
  const at = before ? cursor.col : Math.min(cursor.col + 1, line.length);
  const next = lines.slice();
  if (segs.length === 1) {
    next[cursor.row] = line.slice(0, at) + segs[0] + line.slice(at);
    return { lines: next, cursor: { row: cursor.row, col: Math.max(at, at + segs[0].length - 1) } };
  }
  const tail = line.slice(at);
  next[cursor.row] = line.slice(0, at) + segs[0];
  const middle = segs.slice(1, -1);
  const last = segs[segs.length - 1] + tail;
  next.splice(cursor.row + 1, 0, ...middle, last);
  return { lines: next, cursor: { row: cursor.row, col: at } };
}

/** x: delete count chars under/after the cursor (clamped at EOL). Null on an empty line. */
export function deleteChars(
  lines: string[],
  cursor: CursorPosition,
  count: number
): (EditResult & { register: Register }) | null {
  const line = lines[cursor.row];
  if (cursor.col >= line.length) return null;
  const endCol = Math.min(line.length, cursor.col + count);
  const next = lines.slice();
  next[cursor.row] = line.slice(0, cursor.col) + line.slice(endCol);
  return {
    lines: next,
    cursor: { row: cursor.row, col: Math.min(cursor.col, Math.max(0, next[cursor.row].length - 1)) },
    register: { text: [line.slice(cursor.col, endCol)], linewise: false },
  };
}

/** r: overwrite count chars with ch. Null (vim beeps) if the line is too short. */
export function replaceChars(
  lines: string[],
  cursor: CursorPosition,
  ch: string,
  count: number
): EditResult | null {
  const line = lines[cursor.row];
  if (cursor.col + count > line.length) return null;
  const next = lines.slice();
  next[cursor.row] = line.slice(0, cursor.col) + ch.repeat(count) + line.slice(cursor.col + count);
  return { lines: next, cursor: { row: cursor.row, col: cursor.col + count - 1 } };
}

/** o / O: open an empty line below/above and put the cursor on it. */
export function openLine(lines: string[], cursor: CursorPosition, above: boolean): EditResult {
  const at = above ? cursor.row : cursor.row + 1;
  const next = [...lines.slice(0, at), "", ...lines.slice(at)];
  return { lines: next, cursor: { row: at, col: 0 } };
}
