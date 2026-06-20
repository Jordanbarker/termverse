/**
 * Pure keystroke reducer for the tmux `(rename-window)` inline prompt. The
 * prompt is fully modal while open, so every key is consumed; the result's
 * `done` says whether this key closed it (commit/cancel) or kept it editing.
 */
export interface RenameKeyResult {
  /** The buffer after applying the key (unchanged on commit/cancel/ignored keys). */
  buffer: string;
  /** `"commit"` on Enter, `"cancel"` on Esc/Ctrl+C, else `null` (still editing). */
  done: "commit" | "cancel" | null;
}

export function applyRenameKey(buffer: string, data: string): RenameKeyResult {
  if (data === "\r" || data === "\n") return { buffer, done: "commit" };
  if (data === "\x1b" || data === "\x03") return { buffer, done: "cancel" };
  // Backspace — drop the last char and keep editing.
  if (data === "\x7f" || data === "\b") return { buffer: buffer.slice(0, -1), done: null };
  // Printable character (single byte; skips CSI/arrow escape sequences).
  if (data.length === 1 && data >= " ") return { buffer: buffer + data, done: null };
  // Ignore other control/escape sequences but keep the prompt open.
  return { buffer, done: null };
}
