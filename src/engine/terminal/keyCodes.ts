/**
 * Named constants for terminal key codes used across session handlers.
 */

export const TAB = 9;
export const BACKSPACE = 127;
export const BACKSPACE_ALT = 8;
// xterm.js sends \x7f for plain Backspace and \x08 for Ctrl+Backspace on all OSes
export const CTRL_BACKSPACE = 8;
export const CTRL_C = 3;
export const CTRL_D = 4;
export const SPACE = 32;

export function isBackspace(code: number): boolean {
  return code === BACKSPACE || code === BACKSPACE_ALT;
}

export function isPrintable(code: number): boolean {
  return code >= SPACE;
}
