import { CursorPosition } from "../editor/types";

export interface SearchHit {
  pos: CursorPosition;
  /** True when the search passed the end (or start) of the buffer to find the match. */
  wrapped: boolean;
}

/**
 * Literal, case-sensitive substring search starting just past `from`,
 * wrapping around the buffer. Returns null when the term appears nowhere.
 */
export function searchBuffer(
  lines: string[],
  from: CursorPosition,
  term: string,
  backward: boolean
): SearchHit | null {
  if (!term) return null;
  const total = lines.length;

  if (!backward) {
    const first = lines[from.row].indexOf(term, from.col + 1);
    if (first !== -1) return { pos: { row: from.row, col: first }, wrapped: false };
    for (let i = 1; i <= total; i++) {
      const row = (from.row + i) % total;
      const idx = lines[row].indexOf(term);
      if (idx !== -1) return { pos: { row, col: idx }, wrapped: from.row + i >= total };
    }
    return null;
  }

  if (from.col > 0) {
    const first = lines[from.row].lastIndexOf(term, from.col - 1);
    if (first !== -1) return { pos: { row: from.row, col: first }, wrapped: false };
  }
  for (let i = 1; i <= total; i++) {
    const row = (from.row - i + total * 2) % total;
    const idx = lines[row].lastIndexOf(term);
    if (idx !== -1) return { pos: { row, col: idx }, wrapped: from.row - i < 0 };
  }
  return null;
}
