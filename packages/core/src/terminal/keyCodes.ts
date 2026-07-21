/**
 * Named constants for terminal key codes used across session handlers.
 */

export const TAB = 9;
export const BACKSPACE = 127;
export const BACKSPACE_ALT = 8;
// xterm.js sends \x7f for plain Backspace and \x08 for Ctrl+Backspace on all OSes
export const CTRL_BACKSPACE = 8;
export const CTRL_A = 1;
export const CTRL_C = 3;
export const CTRL_D = 4;
export const CTRL_E = 5;
export const CTRL_K = 11;
export const CTRL_L = 12;
export const CTRL_U = 21;
export const SPACE = 32;

export function isBackspace(code: number): boolean {
  return code === BACKSPACE || code === BACKSPACE_ALT;
}

export function isPrintable(code: number): boolean {
  return code >= SPACE;
}

export interface CsiSequence {
  /** Parameter bytes between "[" and the final byte, e.g. "1;5" or "3". */
  params: string;
  /** The final byte, e.g. "C" or "~" ("" if the data ended mid-sequence). */
  final: string;
  /** Index just past the sequence, for the caller to resume scanning. */
  next: number;
}

/**
 * Parse one CSI escape sequence starting at `start`, which must point at the ESC
 * of a `\x1b[` introducer. Consumes parameter/intermediate bytes (0x20-0x3f) up
 * to the final byte (0x40-0x7e). Shared by the nano/vim/pager input decoders so
 * they agree on where a sequence ends; each maps (params, final) to its own keys.
 */
export function parseCsi(data: string, start: number): CsiSequence {
  let j = start + 2;
  while (j < data.length) {
    const c = data.charCodeAt(j);
    if (c >= 0x40 && c <= 0x7e) break; // final byte
    j++;
  }
  return {
    params: data.slice(start + 2, j),
    final: j < data.length ? data[j] : "",
    next: j + 1,
  };
}
