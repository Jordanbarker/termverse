import { Terminal } from "@xterm/xterm";
import { ansi, stripAnsi } from "../../lib/ansi";

export interface PagerRenderState {
  lines: string[];
  topLine: number;
  mode: "view" | "search" | "help";
  searchInputBuffer: string;
  searchDirection: "fwd" | "back";
  searchPattern: string;
  filename: string | null;
}

const HELP_LINES = [
  "             SUMMARY OF LESS COMMANDS",
  "",
  "  q  Ctrl+C       Quit",
  "  j  Down  Enter  Forward one line",
  "  k  Up            Backward one line",
  "  Space  f  PgDn  Forward one page",
  "  b  PgUp         Backward one page",
  "  g                Go to first line",
  "  G                Go to last line",
  "  /pattern         Search forward",
  "  ?pattern         Search backward",
  "  n                Next match (in search direction)",
  "  N                Previous match",
  "  Ctrl+L           Redraw screen",
  "  h                This help",
  "",
  "  (press any key to return)",
];

export function render(term: Terminal, state: PagerRenderState): void {
  if (state.mode === "help") {
    renderHelp(term);
    return;
  }
  renderPage(term, state);
  if (state.mode === "search") {
    renderSearchPrompt(term, state);
  } else {
    renderStatusLine(term, state);
  }
}

function renderPage(term: Terminal, state: PagerRenderState): void {
  const rows = term.rows;
  const cols = term.cols;
  const viewportRows = Math.max(1, rows - 1);

  term.write("\x1b[H");

  for (let r = 0; r < viewportRows; r++) {
    const lineIdx = state.topLine + r;
    term.write(`\x1b[${r + 1};1H\x1b[2K`);
    if (lineIdx < state.lines.length) {
      const raw = state.lines[lineIdx];
      const rendered = state.searchPattern
        ? renderLineWithHighlight(raw, state.searchPattern, cols)
        : truncatePreservingAnsi(raw, cols);
      term.write(rendered);
    }
  }
}

function renderStatusLine(term: Terminal, state: PagerRenderState): void {
  const rows = term.rows;
  const viewportRows = Math.max(1, rows - 1);
  const total = state.lines.length;
  const startLine = state.topLine + 1;
  const endLine = Math.min(state.topLine + viewportRows, total);
  const atEnd = endLine >= total;
  const percent = total === 0 ? 100 : Math.floor((endLine / total) * 100);
  const name = state.filename ?? "(stdin)";

  const text = total === 0
    ? `${name} (empty)`
    : atEnd
      ? `${name} lines ${startLine}-${endLine}/${total} (END)`
      : `${name} lines ${startLine}-${endLine}/${total} (${percent}%)`;

  term.write(`\x1b[${rows};1H\x1b[2K`);
  term.write(`${ansi.reverse}${text}${ansi.reset}`);
}

function renderSearchPrompt(term: Terminal, state: PagerRenderState): void {
  const rows = term.rows;
  const prefix = state.searchDirection === "fwd" ? "/" : "?";
  term.write(`\x1b[${rows};1H\x1b[2K`);
  term.write(`${prefix}${state.searchInputBuffer}`);
}

function renderHelp(term: Terminal): void {
  const rows = term.rows;
  term.write("\x1b[2J\x1b[H");
  for (let r = 0; r < Math.min(HELP_LINES.length, rows); r++) {
    term.write(`\x1b[${r + 1};1H${HELP_LINES[r]}`);
  }
}

/**
 * Truncate a line to `cols` visible characters while preserving (and passing
 * through) inline ANSI escape sequences. Appends a reset at the end if any
 * styling was emitted so styling never bleeds into the status line.
 */
function truncatePreservingAnsi(line: string, cols: number): string {
  let visible = 0;
  let out = "";
  let emittedAnsi = false;
  let i = 0;
  while (i < line.length && visible < cols) {
    if (line[i] === "\x1b" && line[i + 1] === "[") {
      let j = i + 2;
      while (j < line.length) {
        const c = line.charCodeAt(j);
        if (c >= 0x40 && c <= 0x7e) break;
        j++;
      }
      out += line.slice(i, j + 1);
      emittedAnsi = true;
      i = j + 1;
      continue;
    }
    out += line[i];
    visible++;
    i++;
  }
  if (emittedAnsi) out += ansi.reset;
  return out;
}

/**
 * If the line contains `pattern`, strip its existing ANSI and re-emit with
 * reverse-video highlights over the matches. Lines without a match render via
 * truncatePreservingAnsi so non-matching content keeps its upstream coloring.
 */
function renderLineWithHighlight(raw: string, pattern: string, cols: number): string {
  const stripped = stripAnsi(raw);
  if (!stripped.includes(pattern)) {
    return truncatePreservingAnsi(raw, cols);
  }
  const truncated = stripped.slice(0, cols);
  let out = "";
  let i = 0;
  while (i < truncated.length) {
    const next = truncated.indexOf(pattern, i);
    if (next === -1) {
      out += truncated.slice(i);
      break;
    }
    out += truncated.slice(i, next);
    out += `${ansi.reverse}${pattern}${ansi.reset}`;
    i = next + pattern.length;
  }
  return out;
}
