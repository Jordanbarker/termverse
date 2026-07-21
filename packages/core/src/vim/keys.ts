import { isBackspace, isPrintable, parseCsi } from "@tt/core/terminal/keyCodes";

export type VimKey =
  | { type: "char"; char: string }
  | { type: "esc" }
  | { type: "enter" }
  | { type: "backspace" }
  | { type: "ctrl"; code: number }
  | { type: "up" }
  | { type: "down" }
  | { type: "left" }
  | { type: "right" }
  | { type: "home" }
  | { type: "end" }
  | { type: "delete" }
  | { type: "pageUp" }
  | { type: "pageDown" };

/**
 * Decode raw xterm bytes into vim key tokens. Unlike nano's keymap, a bare
 * ESC byte must survive decoding: it is how vim leaves insert/visual mode.
 * An ESC not opening a CSI sequence is the ESC key (Alt-chords decode as
 * ESC followed by the plain key, which matches vim).
 */
export function decodeKeys(data: string): VimKey[] {
  const keys: VimKey[] = [];
  let i = 0;

  while (i < data.length) {
    const code = data.charCodeAt(i);

    if (data[i] === "\x1b" && data[i + 1] === "[") {
      const { params, final, next } = parseCsi(data, i);
      i = next;

      if (final === "A") keys.push({ type: "up" });
      else if (final === "B") keys.push({ type: "down" });
      else if (final === "C") keys.push({ type: "right" });
      else if (final === "D") keys.push({ type: "left" });
      else if (final === "H") keys.push({ type: "home" });
      else if (final === "F") keys.push({ type: "end" });
      else if (final === "~") {
        const keyNum = params.split(";")[0];
        if (keyNum === "3") keys.push({ type: "delete" });
        else if (keyNum === "5") keys.push({ type: "pageUp" });
        else if (keyNum === "6") keys.push({ type: "pageDown" });
        else if (keyNum === "1" || keyNum === "7") keys.push({ type: "home" });
        else if (keyNum === "4" || keyNum === "8") keys.push({ type: "end" });
      }
      // else: unknown CSI final: ignore
    } else if (data[i] === "\x1b") {
      keys.push({ type: "esc" });
      i++;
    } else if (data[i] === "\r") {
      keys.push({ type: "enter" });
      i++;
    } else if (isBackspace(code)) {
      keys.push({ type: "backspace" });
      i++;
    } else if (code === 9) {
      keys.push({ type: "char", char: "\t" });
      i++;
    } else if (isPrintable(code)) {
      keys.push({ type: "char", char: data[i] });
      i++;
    } else {
      keys.push({ type: "ctrl", code });
      i++;
    }
  }

  return keys;
}
