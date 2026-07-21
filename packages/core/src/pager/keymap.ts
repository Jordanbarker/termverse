import { BACKSPACE, BACKSPACE_ALT, CTRL_C, isPrintable, parseCsi } from "@tt/core/terminal/keyCodes";

const CTRL_L = 0x0c;
const ENTER = 0x0d;
const LF = 0x0a;

export type PagerAction =
  | { type: "arrowDown" }
  | { type: "arrowUp" }
  | { type: "pageDown" }
  | { type: "pageUp" }
  | { type: "home" }
  | { type: "end" }
  | { type: "enter" }
  | { type: "escape" }
  | { type: "backspace" }
  | { type: "ctrlC" }
  | { type: "ctrlL" }
  | { type: "char"; ch: string };

/**
 * Parse raw xterm input bytes into semantic pager actions. The parser is
 * mode-agnostic — the session decides how to interpret each action based on
 * whether it is in view, search, or help mode.
 */
export function parsePagerInput(data: string): PagerAction[] {
  const actions: PagerAction[] = [];
  let i = 0;

  while (i < data.length) {
    const ch = data[i];
    const code = data.charCodeAt(i);

    if (ch === "\x1b") {
      if (data[i + 1] === "[") {
        const csi = parseCsi(data, i);
        const { params, final } = csi;
        i = csi.next;

        if (final === "A") {
          actions.push({ type: "arrowUp" });
        } else if (final === "B") {
          actions.push({ type: "arrowDown" });
        } else if (final === "H") {
          actions.push({ type: "home" });
        } else if (final === "F") {
          actions.push({ type: "end" });
        } else if (final === "~") {
          if (params === "5") actions.push({ type: "pageUp" });
          else if (params === "6") actions.push({ type: "pageDown" });
          else if (params === "1" || params === "7") actions.push({ type: "home" });
          else if (params === "4" || params === "8") actions.push({ type: "end" });
        }
        continue;
      }
      actions.push({ type: "escape" });
      i++;
      continue;
    }

    if (code === CTRL_C) {
      actions.push({ type: "ctrlC" });
    } else if (code === CTRL_L) {
      actions.push({ type: "ctrlL" });
    } else if (code === ENTER || code === LF) {
      actions.push({ type: "enter" });
    } else if (code === BACKSPACE || code === BACKSPACE_ALT) {
      actions.push({ type: "backspace" });
    } else if (isPrintable(code)) {
      actions.push({ type: "char", ch });
    }
    i++;
  }

  return actions;
}
