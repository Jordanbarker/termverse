import { EditorState, EditorConfig } from "./types";

const ESC = "\x1b[";
const REVERSE = `${ESC}7m`;
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;

const HELP_TEXT = [
  "  nano help — keyboard shortcuts",
  "",
  "  ^G        Toggle this help",
  "  ^X        Exit editor",
  "  ^O        Write Out (save with path prompt)",
  "  ^S        Quick Save (no prompt)",
  "",
  "  ^W        Search (Where Is)",
  "  ^\\        Search and Replace",
  "  ^_        Go to Line (line or line,col)",
  "",
  "  ^K        Cut current line",
  "  ^U        Paste cut line",
  "  ^J        Justify paragraph",
  "  ^R        Read File (insert file at cursor)",
  "  ^C        Show cursor position",
  "  ^T        Execute (not supported)",
  "",
  "  ^A / Home   Move to start of line",
  "  ^E / End    Move to end of line",
  "  ^Y / PgUp   Page up",
  "  ^V / PgDn   Page down",
  "",
  "  Arrow keys to navigate, type to insert text.",
  "  Press any key to close this help.",
];

function shortcutLabel(key: string, label: string, cols: number): string {
  const padded = `${REVERSE}${key}${RESET} ${label}`;
  // Each shortcut gets roughly 1/6 of the width (6 items per row)
  const cellWidth = Math.floor(cols / 6);
  // We need to account for ANSI codes in padding calculation
  const visibleLen = key.length + 1 + label.length;
  const padding = Math.max(0, cellWidth - visibleLen);
  return padded + " ".repeat(padding);
}

/** Get the prompt label for the current prompt state. */
function getPromptLabel(state: EditorState): string | null {
  const p = state.promptState;
  switch (p.type) {
    case "search":
      return "Search: ";
    case "replaceSearch":
      return "Search (to replace): ";
    case "replaceWith":
      return `Replace with: `;
    case "replaceConfirm":
      return "Replace this instance? ";
    case "gotoLine":
      return "Enter line number, column number: ";
    case "readFile":
      return "File to insert: ";
    case "writeOut":
      return "File Name to Write: ";
    default:
      return null;
  }
}

/** Check whether the current prompt is a text-input prompt. */
function isTextInputPrompt(state: EditorState): boolean {
  const t = state.promptState.type;
  return t === "search" || t === "replaceSearch" || t === "replaceWith"
    || t === "gotoLine" || t === "readFile" || t === "writeOut";
}

/**
 * Render the full editor screen as a single ANSI string.
 */
export function renderEditor(state: EditorState, config: EditorConfig): string {
  const { rows, cols } = config;
  const contentRows = rows - 4; // title(1) + status(1) + shortcut rows(2)
  const parts: string[] = [];

  // Hide cursor during redraw
  parts.push(`${ESC}?25l`);
  // Move to top-left
  parts.push(`${ESC}1;1H`);

  // === Row 1: Title bar ===
  const modifiedTag = state.modified ? " [Modified]" : "";
  const titleText = `  GNU nano    ${state.fileName}${modifiedTag}`;
  const titlePadded = titleText.padEnd(cols);
  parts.push(`${REVERSE}${titlePadded}${RESET}`);

  // === Rows 2..N-3: File content ===
  if (state.showHelp) {
    for (let r = 0; r < contentRows; r++) {
      parts.push(`${ESC}${r + 2};1H${ESC}2K`);
      if (r < HELP_TEXT.length) {
        parts.push(`${BOLD}${HELP_TEXT[r].slice(0, cols)}${RESET}`);
      }
    }
  } else {
    for (let r = 0; r < contentRows; r++) {
      const lineIdx = r + state.scrollOffset;
      parts.push(`${ESC}${r + 2};1H${ESC}2K`);
      if (lineIdx < state.lines.length) {
        const line = state.lines[lineIdx];
        parts.push(line.slice(0, cols));
      }
    }
  }

  // === Row N-2: Status/message line ===
  const statusRow = rows - 2;
  parts.push(`${ESC}${statusRow};1H${ESC}2K`);

  const promptLabel = getPromptLabel(state);
  const inPrompt = state.promptState.type !== "none" && state.promptState.type !== "saveExit";
  const inTextPrompt = isTextInputPrompt(state);

  if (inPrompt && promptLabel) {
    // Show prompt label and input on status line
    const inputText = inTextPrompt ? (state.promptState as { input: string }).input : "";
    const statusText = promptLabel + inputText;
    parts.push(`${REVERSE}${statusText.slice(0, cols).padEnd(cols)}${RESET}`);
  } else if (state.message) {
    parts.push(`${REVERSE}${state.message.slice(0, cols).padEnd(cols)}${RESET}`);
  }

  // === Shortcut hint rows ===
  const hintRow1 = rows - 1;
  const hintRow2 = rows;
  parts.push(`${ESC}${hintRow1};1H${ESC}2K`);
  parts.push(`${ESC}${hintRow2};1H${ESC}2K`);

  if (inPrompt) {
    // In prompt mode: show contextual hints
    if (state.promptState.type === "replaceConfirm") {
      parts.push(`${ESC}${hintRow1};1H`);
      parts.push(
        shortcutLabel("Y", "Yes", cols) +
        shortcutLabel("N", "No", cols) +
        shortcutLabel("A", "All", cols) +
        shortcutLabel("^C", "Cancel", cols)
      );
    } else {
      parts.push(`${ESC}${hintRow1};1H`);
      parts.push(shortcutLabel("^C", "Cancel", cols));
    }
  } else {
    // Normal mode: real nano bottom bar (6 items per row)
    parts.push(`${ESC}${hintRow1};1H`);
    parts.push(
      shortcutLabel("^G", "Help", cols) +
      shortcutLabel("^O", "Write Out", cols) +
      shortcutLabel("^W", "Where Is", cols) +
      shortcutLabel("^K", "Cut", cols) +
      shortcutLabel("^U", "Paste", cols) +
      shortcutLabel("^T", "Execute", cols)
    );
    parts.push(`${ESC}${hintRow2};1H`);
    parts.push(
      shortcutLabel("^X", "Exit", cols) +
      shortcutLabel("^R", "Read File", cols) +
      shortcutLabel("^\\", "Replace", cols) +
      shortcutLabel("^J", "Justify", cols) +
      shortcutLabel("^C", "Location", cols) +
      shortcutLabel("^_", "Go To Line", cols)
    );
  }

  // Position cursor
  if (inTextPrompt && promptLabel) {
    // Place cursor at end of prompt input
    const inputText = (state.promptState as { input: string }).input;
    const cursorCol = promptLabel.length + inputText.length + 1;
    parts.push(`${ESC}${statusRow};${cursorCol}H`);
  } else if (!state.showHelp) {
    const screenRow = state.cursor.row - state.scrollOffset + 2;
    const screenCol = state.cursor.col + 1;
    parts.push(`${ESC}${screenRow};${screenCol}H`);
  }
  parts.push(`${ESC}?25h`);

  return parts.join("");
}
