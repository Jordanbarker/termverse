const WORD_CHAR = /[a-zA-Z0-9_]/;

export function findPrevWordBoundary(buffer: string, pos: number): number {
  let p = pos;
  while (p > 0 && !WORD_CHAR.test(buffer[p - 1])) p--;
  while (p > 0 && WORD_CHAR.test(buffer[p - 1])) p--;
  return p;
}

export function findNextWordBoundary(buffer: string, pos: number): number {
  let p = pos;
  while (p < buffer.length && WORD_CHAR.test(buffer[p])) p++;
  while (p < buffer.length && !WORD_CHAR.test(buffer[p])) p++;
  return p;
}
