import { EditorConfig } from "../editor/types";
import { ansi } from "@tt/core/lib/ansi";
import { VimState } from "./types";
import { showcmd } from "./normal";
import { orderedRange } from "./visual";

// CSI introducer for cursor positioning; the SGR styles come from the shared ansi table.
const ESC = "\x1b[";
const REVERSE = ansi.reverse;
const RESET = ansi.reset;
const BOLD = ansi.bold;

/** DECSCUSR cursor shapes: block outside insert mode, bar inside it. */
export function cursorShapeFor(mode: VimState["mode"]): string {
  return mode === "insert" ? `${ESC}6 q` : `${ESC}2 q`;
}

/** Highlighted [start, endExclusive) columns of a content row, or null. */
function selectionSpan(state: VimState, lineIdx: number): [number, number] | null {
  if (!state.visualAnchor || (state.mode !== "visual" && state.mode !== "visual-line")) return null;
  const { start, end } = orderedRange(state.visualAnchor, state.cursor);
  if (lineIdx < start.row || lineIdx > end.row) return null;
  const len = state.lines[lineIdx].length;
  if (state.mode === "visual-line") return [0, Math.max(1, len)];
  const from = lineIdx === start.row ? start.col : 0;
  const to = lineIdx === end.row ? end.col + 1 : Math.max(1, len);
  return [from, Math.max(to, from + 1)];
}

function renderContentLine(state: VimState, lineIdx: number, cols: number): string {
  const line = state.lines[lineIdx].slice(0, cols);
  const span = selectionSpan(state, lineIdx);
  if (!span) return line;
  // Pad one cell so a selected empty line / EOL cell is visible.
  const padded = span[1] > line.length ? line + " " : line;
  const from = Math.min(span[0], padded.length);
  const to = Math.min(span[1], padded.length);
  return padded.slice(0, from) + REVERSE + padded.slice(from, to) + RESET + padded.slice(to);
}

function modeIndicator(state: VimState): string {
  switch (state.mode) {
    case "insert":
      return `${BOLD}-- INSERT --${RESET}`;
    case "visual":
      return `${BOLD}-- VISUAL --${RESET}`;
    case "visual-line":
      return `${BOLD}-- VISUAL LINE --${RESET}`;
    default:
      return "";
  }
}

/** Render the full vim screen as one ANSI string (same technique as the nano renderer). */
export function renderVim(state: VimState, config: EditorConfig): string {
  const { rows, cols } = config;
  const contentRows = rows - 2; // status line + command line
  const parts: string[] = [];

  parts.push(`${ESC}?25l`);
  parts.push(cursorShapeFor(state.mode));

  // === Content rows (screen rows 1..rows-2), tildes past EOF ===
  for (let r = 0; r < contentRows; r++) {
    const lineIdx = r + state.scrollOffset;
    parts.push(`${ESC}${r + 1};1H${ESC}2K`);
    if (lineIdx < state.lines.length) {
      parts.push(renderContentLine(state, lineIdx, cols));
    } else {
      parts.push(`${BOLD}~${RESET}`);
    }
  }

  // === Status line (reverse video): file name, flags, ruler ===
  const flags = `${state.modified ? " [+]" : ""}${state.readOnly ? " [RO]" : ""}`;
  const left = ` "${state.fileName}"${flags}`;
  const ruler = `${state.cursor.row + 1},${state.cursor.col + 1} `;
  const gap = Math.max(1, cols - left.length - ruler.length);
  const statusText = (left + " ".repeat(gap) + ruler).slice(0, cols);
  parts.push(`${ESC}${rows - 1};1H${ESC}2K`);
  parts.push(`${REVERSE}${statusText.padEnd(cols)}${RESET}`);

  // === Command line: cmdline input, else message, else mode indicator; showcmd right ===
  parts.push(`${ESC}${rows};1H${ESC}2K`);
  let cmdText: string;
  if (state.cmdline) {
    cmdText = (state.cmdline.prefix + state.cmdline.input).slice(0, cols);
    parts.push(cmdText);
  } else if (state.message) {
    cmdText = state.message.slice(0, cols);
    parts.push(cmdText);
  } else {
    cmdText = "";
    parts.push(modeIndicator(state));
  }
  const echo = state.mode === "visual" || state.mode === "visual-line"
    ? state.visualPending.count
    : showcmd(state.pending);
  if (echo && !state.cmdline) {
    parts.push(`${ESC}${rows};${Math.max(1, cols - 10)}H${echo.slice(0, 10)}`);
  }

  // === Cursor placement ===
  if (state.cmdline) {
    parts.push(`${ESC}${rows};${Math.min(cols, cmdText.length + 1)}H`);
  } else {
    const screenRow = state.cursor.row - state.scrollOffset + 1;
    parts.push(`${ESC}${screenRow};${state.cursor.col + 1}H`);
  }
  parts.push(`${ESC}?25h`);

  return parts.join("");
}
