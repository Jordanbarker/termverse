import { isBackspace, isPrintable } from "@tt/core/terminal/keyCodes";

export type EditorAction =
  | { type: "insert"; char: string }
  | { type: "enter" }
  | { type: "backspace" }
  | { type: "delete" }
  | { type: "arrowUp" }
  | { type: "arrowDown" }
  | { type: "arrowLeft" }
  | { type: "arrowRight" }
  | { type: "wordLeft" }
  | { type: "wordRight" }
  | { type: "home" }
  | { type: "end" }
  | { type: "pageUp" }
  | { type: "pageDown" }
  | { type: "save" }
  | { type: "exit" }
  | { type: "cutLine" }
  | { type: "pasteLine" }
  | { type: "help" }
  | { type: "promptYes" }
  | { type: "promptNo" }
  | { type: "search" }
  | { type: "replace" }
  | { type: "gotoLine" }
  | { type: "readFile" }
  | { type: "showPosition" }
  | { type: "justify" }
  | { type: "writeOut" }
  | { type: "execute" };

/**
 * Parse raw xterm input data into a list of semantic editor actions.
 */
export function parseEditorInput(data: string): EditorAction[] {
  const actions: EditorAction[] = [];
  let i = 0;

  while (i < data.length) {
    const code = data.charCodeAt(i);

    // Escape sequences (CSI: \x1b[ params final)
    if (data[i] === "\x1b" && data[i + 1] === "[") {
      // Consume full CSI sequence: \x1b[ followed by parameter bytes (0-9;) then a final byte (A-Z, a-z, ~)
      let j = i + 2;
      while (j < data.length && data[j] >= "0" && data[j] <= "?") j++;
      const params = data.slice(i + 2, j);
      const final = j < data.length ? data[j] : "";
      i = j + 1;

      // Map final byte to action. Ctrl+Left/Right (modifier 5) jump by word like real
      // nano; other modified keys (e.g. \x1b[1;3C) are treated the same as plain keys.
      const modifier = params.includes(";") ? parseInt(params.split(";")[1], 10) : 0;
      if (final === "A") {
        actions.push({ type: "arrowUp" });
      } else if (final === "B") {
        actions.push({ type: "arrowDown" });
      } else if (final === "C") {
        actions.push(modifier === 5 ? { type: "wordRight" } : { type: "arrowRight" });
      } else if (final === "D") {
        actions.push(modifier === 5 ? { type: "wordLeft" } : { type: "arrowLeft" });
      } else if (final === "H") {
        actions.push({ type: "home" });
      } else if (final === "F") {
        actions.push({ type: "end" });
      } else if (final === "~") {
        // Tilde sequences: extract the key number (before any ;modifier)
        const keyNum = params.split(";")[0];
        if (keyNum === "3") {
          actions.push({ type: "delete" });
        } else if (keyNum === "5") {
          actions.push({ type: "pageUp" });
        } else if (keyNum === "6") {
          actions.push({ type: "pageDown" });
        }
        // else: unknown tilde sequence — ignore
      }
      // else: unknown CSI final — ignore
    } else if (code === 1) {
      // Ctrl+A → home
      actions.push({ type: "home" });
      i++;
    } else if (code === 3) {
      // Ctrl+C → show position (also cancel in prompts)
      actions.push({ type: "showPosition" });
      i++;
    } else if (code === 5) {
      // Ctrl+E → end
      actions.push({ type: "end" });
      i++;
    } else if (code === 7) {
      // Ctrl+G → help
      actions.push({ type: "help" });
      i++;
    } else if (code === 9) {
      // Tab → insert tab character
      actions.push({ type: "insert", char: "\t" });
      i++;
    } else if (code === 10) {
      // Ctrl+J (LF) → justify
      actions.push({ type: "justify" });
      i++;
    } else if (code === 11) {
      // Ctrl+K → cut line
      actions.push({ type: "cutLine" });
      i++;
    } else if (code === 15) {
      // Ctrl+O → write out (with prompt)
      actions.push({ type: "writeOut" });
      i++;
    } else if (code === 18) {
      // Ctrl+R → read file
      actions.push({ type: "readFile" });
      i++;
    } else if (code === 19) {
      // Ctrl+S → direct save (no prompt)
      actions.push({ type: "save" });
      i++;
    } else if (code === 20) {
      // Ctrl+T → execute
      actions.push({ type: "execute" });
      i++;
    } else if (code === 21) {
      // Ctrl+U → paste line
      actions.push({ type: "pasteLine" });
      i++;
    } else if (code === 22) {
      // Ctrl+V → page down
      actions.push({ type: "pageDown" });
      i++;
    } else if (code === 23) {
      // Ctrl+W → search
      actions.push({ type: "search" });
      i++;
    } else if (code === 24) {
      // Ctrl+X → exit
      actions.push({ type: "exit" });
      i++;
    } else if (code === 25) {
      // Ctrl+Y → page up
      actions.push({ type: "pageUp" });
      i++;
    } else if (code === 28) {
      // Ctrl+\ → replace
      actions.push({ type: "replace" });
      i++;
    } else if (code === 31) {
      // Ctrl+_ → go to line
      actions.push({ type: "gotoLine" });
      i++;
    } else if (isBackspace(code)) {
      actions.push({ type: "backspace" });
      i++;
    } else if (data[i] === "\r") {
      actions.push({ type: "enter" });
      i++;
    } else if (isPrintable(code)) {
      actions.push({ type: "insert", char: data[i] });
      i++;
    } else {
      // Unknown control character — skip
      i++;
    }
  }

  return actions;
}
