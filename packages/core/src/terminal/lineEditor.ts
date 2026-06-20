import { Terminal } from "@xterm/xterm";
import { getSuggestion, SuggestionContext } from "../suggestions/suggest";
import { getCompletions, CompletionResult } from "../suggestions/complete";
import {
  isBackspace,
  isPrintable,
  CTRL_A,
  CTRL_C,
  CTRL_D,
  CTRL_E,
  CTRL_K,
  CTRL_L,
  CTRL_U,
  CTRL_BACKSPACE,
  TAB,
} from "./keyCodes";

/**
 * App-injected dependencies. All three are **thunks** that the editor calls fresh
 * on every keystroke — never cache their results, because cwd/fs/history change as
 * the user works.
 */
export interface LineEditorDeps {
  /** Suggestion context for ghost text + TAB completion (or null if unavailable). */
  getContext: () => SuggestionContext | null;
  /** The recall list (parsed `.zsh_history`) for up/down-arrow navigation. */
  getHistory: () => string[];
  /** The bare prompt string. The editor composes `\r\n` itself where needed. */
  getPrompt: () => string;
}

export interface LineEditorResult {
  type: "submit";
  input: string;
  /** Don't record this submission in .zsh_history (e.g. Ctrl+D EOF exit). */
  skipHistory?: boolean;
}

interface CompletionState {
  matches: string[];
  displayNames: string[];
  commonPrefix: string;
  replaceFrom: number;
  cycleIndex: number; // -1 = common prefix shown, 0..N = cycling
  originalInput: string;
  menuVisible: boolean;
  menuLineCount: number;
  promptCol: number;
}

/**
 * Framework-agnostic, cursor-aware zsh-style line editor for an xterm `Terminal`.
 *
 * Owns the editing state (`buffer`, `cursorPos`, ghost length, completion state,
 * history index), the raw-input CSI/control-key parser, and all xterm rendering
 * (cursor math, ghost text, columnar completion menu). App-specific concerns
 * (suggestion context, history list, prompt string) are injected via {@link LineEditorDeps}.
 *
 * `handleData` is the single entry point: feed it each xterm `onData` chunk and it
 * mutates state, writes ANSI, and returns a {@link LineEditorResult} on Enter / Ctrl+D-EOF
 * (else `null`). On submit the editor clears its line state and writes the trailing
 * `\r\n` itself; the caller runs the command and reprints the prompt.
 */
export class LineEditor {
  private buffer = "";
  private cursorPos = 0;
  private ghostLen = 0;
  private completion: CompletionState | null = null;
  private historyIndex = -1;

  constructor(private readonly deps: LineEditorDeps) {}

  // ── Public entry point ───────────────────────────────────────────────────

  /**
   * Process an xterm `onData` chunk. Returns a submit result on Enter / Ctrl+D-EOF,
   * else null. Stops processing at the first submit (the common case is a single
   * keystroke or one line).
   */
  handleData(term: Terminal, data: string): LineEditorResult | null {
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      const code = char.charCodeAt(0);

      // CSI escape sequences (arrows, modifiers like Option+Arrow)
      if (char === "\x1b" && data[i + 1] === "[") {
        let j = i + 2;
        while (j < data.length && data[j] >= "0" && data[j] <= "?") j++;
        const params = data.slice(i + 2, j);
        const final = data[j] ?? "";
        i = j;

        const parts = params.split(";");
        const modifier = parts.length > 1 ? parseInt(parts[1], 10) : 0;

        if (final === "~") {
          const keyCode = parts.length > 0 ? parseInt(parts[0], 10) : 0;
          if (keyCode === 3 && (modifier === 3 || modifier === 5)) {
            this.deleteWordForward(term);
          } else if (keyCode === 3) {
            this.deleteCharForward(term);
          }
          continue;
        }

        this.handleArrow(term, final, modifier);
        continue;
      }

      // ESC + DEL (Option/Alt+Backspace) — delete word backward
      if (char === "\x1b" && i + 1 < data.length && data[i + 1].charCodeAt(0) === 127) {
        i += 1;
        this.deleteWordBackward(term);
        continue;
      }

      // Ctrl+W (0x17) or Ctrl+Backspace (xterm.js sends 0x08)
      if (code === 23 || code === CTRL_BACKSPACE) {
        this.deleteWordBackward(term);
        continue;
      }

      if (code === CTRL_A) {
        this.handleArrow(term, "H");
        continue;
      }
      if (code === CTRL_E) {
        this.handleArrow(term, "F");
        continue;
      }
      if (code === CTRL_U) {
        this.killWholeLine(term);
        continue;
      }
      if (code === CTRL_K) {
        this.killToEnd(term);
        continue;
      }
      if (code === CTRL_L) {
        this.clearScreenAndRedraw(term);
        continue;
      }

      // Ctrl+D: delete-char mid-line; EOF (submits `exit`) on an empty line
      const result = code === CTRL_D ? this.handleEof(term) : this.handleChar(term, char, code);
      if (result) return result;
    }
    return null;
  }

  // ── Rendering helpers ────────────────────────────────────────────────────

  private clearGhost(term: Terminal): void {
    if (this.ghostLen > 0) {
      term.write("\x1b[s\x1b[K\x1b[u");
      this.ghostLen = 0;
    }
  }

  /** Rewrite visible text from cursor to end-of-line, clear any leftover chars. */
  private rewriteFromCursor(term: Terminal, buffer: string, pos: number): void {
    const tail = buffer.slice(pos);
    term.write(tail + "\x1b[K");
    const moveBack = buffer.length - pos;
    if (moveBack > 0) term.write(`\x1b[${moveBack}D`);
  }

  /** Clear the entire input area and rewrite with new content at newPos. */
  private clearAndRewriteLine(
    term: Terminal,
    oldLen: number,
    oldPos: number,
    newBuffer: string,
    newPos: number
  ): void {
    if (oldPos > 0) term.write(`\x1b[${oldPos}D`);
    term.write(newBuffer + "\x1b[K");
    const moveBack = newBuffer.length - newPos;
    if (moveBack > 0) term.write(`\x1b[${moveBack}D`);
  }

  private renderGhostText(term: Terminal): void {
    const input = this.buffer;
    if (!input) return;
    if (this.cursorPos !== input.length) return;

    const ctx = this.deps.getContext();
    if (!ctx) return;

    const suggestion = getSuggestion(input, ctx);

    if (suggestion && suggestion.length > input.length) {
      const suffix = suggestion.slice(input.length);
      term.write(`\x1b[s\x1b[2m${suffix}\x1b[0m\x1b[u`);
      this.ghostLen = suffix.length;
    }
  }

  /** Clear the completion menu from the terminal display. */
  private clearCompletionMenu(term: Terminal): void {
    const state = this.completion;
    if (!state || !state.menuVisible || state.menuLineCount === 0) return;

    for (let i = 0; i < state.menuLineCount; i++) {
      term.write("\x1b[B\x1b[2K");
    }
    term.write(`\x1b[${state.menuLineCount}A`);
    term.write(`\r\x1b[${state.promptCol}C`);
  }

  /** Render the completion menu below the input line. */
  private renderCompletionMenu(term: Terminal, state: CompletionState): void {
    const { displayNames, cycleIndex } = state;
    const maxDisplayRows = 10;

    const maxNameLen = Math.max(...displayNames.map((n) => n.length));
    const colWidth = maxNameLen + 2;
    const numCols = Math.max(1, Math.floor(term.cols / colWidth));
    const totalRows = Math.ceil(displayNames.length / numCols);
    const truncated = totalRows > maxDisplayRows;
    const displayRows = truncated ? maxDisplayRows : totalRows;
    const displayCount = truncated ? displayRows * numCols : displayNames.length;

    const menuLineCount = displayRows + (truncated ? 1 : 0); // +1 for "... and N more"

    // Use pre-computed prompt column (cursorX may be stale after writes)
    const promptCol = state.promptCol;

    // Handle scrolling if needed
    const cursorRow = term.buffer.active.cursorY;
    const availableBelow = term.rows - 1 - cursorRow;
    if (menuLineCount > availableBelow) {
      const scrollNeeded = menuLineCount - availableBelow;
      term.write("\n".repeat(scrollNeeded));
      term.write(`\x1b[${scrollNeeded}A`);
    }

    for (let row = 0; row < displayRows; row++) {
      let line = "";
      for (let col = 0; col < numCols; col++) {
        const idx = row + col * displayRows;
        if (idx >= displayCount) break;
        if (idx >= displayNames.length) break;
        const name = displayNames[idx];
        const padded = name.padEnd(colWidth);
        if (idx === cycleIndex) {
          line += `\x1b[7m${padded}\x1b[27m`;
        } else {
          line += padded;
        }
      }
      term.write(`\r\n${line}\x1b[K`);
    }

    if (truncated) {
      const remaining = displayNames.length - displayCount;
      term.write(`\r\n\x1b[2m... and ${remaining} more\x1b[0m\x1b[K`);
    }

    term.write(`\x1b[${menuLineCount}A`);
    term.write(`\r\x1b[${promptCol}C`);

    state.menuVisible = true;
    state.menuLineCount = menuLineCount;
  }

  /** Clear completion state and optionally restore original input. */
  private clearCompletionState(term: Terminal, restoreInput: boolean): void {
    const state = this.completion;
    if (!state) return;

    this.clearGhost(term);

    if (state.menuVisible) {
      this.clearCompletionMenu(term);
    }

    if (restoreInput) {
      const oldLen = this.buffer.length;
      const oldPos = this.cursorPos;
      this.clearAndRewriteLine(term, oldLen, oldPos, state.originalInput, state.originalInput.length);
      this.buffer = state.originalInput;
      this.cursorPos = state.originalInput.length;
    }

    this.completion = null;
  }

  // ── TAB completion ───────────────────────────────────────────────────────

  private handleTabCompletion(term: Terminal): void {
    // Compute prompt visual width before any writes (cursorX is accurate here)
    const promptWidth = term.buffer.active.cursorX - this.cursorPos;

    const state = this.completion;

    if (!state) {
      // First Tab press
      if (this.cursorPos !== this.buffer.length) {
        term.write("\x07");
        return;
      }

      // Bell on empty input
      if (this.buffer.trim() === "") {
        term.write("\x07");
        return;
      }

      this.clearGhost(term);

      const ctx = this.deps.getContext();
      if (!ctx) return;

      const result = getCompletions(this.buffer, ctx);
      if (!result || result.matches.length === 0) {
        term.write("\x07");
        this.renderGhostText(term);
        return;
      }

      if (result.matches.length === 1) {
        // Single match — replace and done
        const newInput = result.commonPrefix;
        const oldLen = this.buffer.length;
        const oldPos = this.cursorPos;
        this.clearAndRewriteLine(term, oldLen, oldPos, newInput, newInput.length);
        this.buffer = newInput;
        this.cursorPos = newInput.length;
        this.renderGhostText(term);
        return;
      }

      // Multiple matches
      if (result.commonPrefix.length > this.buffer.length) {
        // Common prefix extends input — apply it
        const newInput = result.commonPrefix;
        const oldLen = this.buffer.length;
        const oldPos = this.cursorPos;
        this.clearAndRewriteLine(term, oldLen, oldPos, newInput, newInput.length);

        this.completion = {
          ...result,
          cycleIndex: -1,
          originalInput: this.buffer,
          menuVisible: false,
          menuLineCount: 0,
          promptCol: promptWidth + newInput.length,
        };

        this.buffer = newInput;
        this.cursorPos = newInput.length;
        this.renderGhostText(term);
        return;
      }

      // No extension possible — show menu immediately at first match
      const newInput = sliceCompletionPrefix(this.buffer, result) + result.matches[0];
      const oldLen = this.buffer.length;
      const oldPos = this.cursorPos;
      this.clearAndRewriteLine(term, oldLen, oldPos, newInput, newInput.length);

      this.completion = {
        ...result,
        cycleIndex: 0,
        originalInput: this.buffer,
        menuVisible: false,
        menuLineCount: 0,
        promptCol: promptWidth + newInput.length,
      };

      this.buffer = newInput;
      this.cursorPos = newInput.length;

      this.renderCompletionMenu(term, this.completion);
      return;
    }

    // Subsequent Tab presses — cycle
    this.clearGhost(term);

    if (state.menuVisible) {
      this.clearCompletionMenu(term);
    }

    const newIndex = state.cycleIndex === -1 ? 0 : (state.cycleIndex + 1) % state.matches.length;
    state.cycleIndex = newIndex;

    const newInput = sliceCompletionPrefix(state.originalInput, state) + state.matches[newIndex];
    const oldLen = this.buffer.length;
    const oldPos = this.cursorPos;
    this.clearAndRewriteLine(term, oldLen, oldPos, newInput, newInput.length);
    this.buffer = newInput;
    this.cursorPos = newInput.length;

    state.promptCol = promptWidth + newInput.length;
    this.renderCompletionMenu(term, state);
  }

  // ── Per-character handling ───────────────────────────────────────────────

  private handleChar(term: Terminal, char: string, code: number): LineEditorResult | null {
    // If completion state is active, handle Tab/cancel/clear
    if (this.completion) {
      if (code === TAB) {
        this.handleTabCompletion(term);
        return null;
      }
      if (code === CTRL_C || char === "\x1b") {
        this.clearCompletionState(term, true);
        return null;
      }
      // Any other key: clear menu, then fall through to normal handling
      this.clearCompletionState(term, false);
    }

    // No active completion — first Tab press
    if (code === TAB) {
      this.handleTabCompletion(term);
      return null;
    }

    if (char === "\r" || char === "\n") {
      this.clearGhost(term);
      const input = this.buffer;
      this.buffer = "";
      this.cursorPos = 0;

      if (input.trim()) {
        term.write("\r\n");
        // History is recorded by the command runner appending to the
        // `.zsh_history` file (the single source of truth); no push needed here.
        this.historyIndex = -1;
        return { type: "submit", input };
      }

      // Empty line — reprint the prompt, no submit
      term.write("\r\n" + this.deps.getPrompt());
      return null;
    }

    if (isBackspace(code)) {
      this.clearGhost(term);
      const pos = this.cursorPos;
      if (pos > 0) {
        const buf = this.buffer;
        this.buffer = buf.slice(0, pos - 1) + buf.slice(pos);
        this.cursorPos = pos - 1;
        term.write("\b");
        this.rewriteFromCursor(term, this.buffer, pos - 1);
      }
      this.renderGhostText(term);
      return null;
    }

    if (code === CTRL_C) {
      this.clearGhost(term);
      this.buffer = "";
      this.cursorPos = 0;
      term.write("^C\r\n" + this.deps.getPrompt());
      return null;
    }

    if (isPrintable(code)) {
      this.clearGhost(term);
      const pos = this.cursorPos;
      const buf = this.buffer;
      this.buffer = buf.slice(0, pos) + char + buf.slice(pos);
      this.cursorPos = pos + 1;
      term.write(char);
      if (pos < buf.length) {
        this.rewriteFromCursor(term, this.buffer, pos + 1);
      }
      this.renderGhostText(term);
      return null;
    }

    return null;
  }

  // ── Word boundaries ──────────────────────────────────────────────────────

  private findPrevWordBoundary(buffer: string, pos: number): number {
    let p = pos;
    while (p > 0 && !/[a-zA-Z0-9_]/.test(buffer[p - 1])) p--;
    while (p > 0 && /[a-zA-Z0-9_]/.test(buffer[p - 1])) p--;
    return p;
  }

  private findNextWordBoundary(buffer: string, pos: number): number {
    let p = pos;
    while (p < buffer.length && /[a-zA-Z0-9_]/.test(buffer[p])) p++;
    while (p < buffer.length && !/[a-zA-Z0-9_]/.test(buffer[p])) p++;
    return p;
  }

  // ── Deletion / kill ──────────────────────────────────────────────────────

  private deleteWordBackward(term: Terminal): void {
    this.clearCompletionState(term, false);
    this.clearGhost(term);
    const pos = this.cursorPos;
    if (pos > 0) {
      const buf = this.buffer;
      const newPos = this.findPrevWordBoundary(buf, pos);
      const delta = pos - newPos;
      this.buffer = buf.slice(0, newPos) + buf.slice(pos);
      this.cursorPos = newPos;
      if (delta > 0) term.write(`\x1b[${delta}D`);
      this.rewriteFromCursor(term, this.buffer, newPos);
    }
    this.renderGhostText(term);
  }

  private deleteWordForward(term: Terminal): void {
    this.clearCompletionState(term, false);
    this.clearGhost(term);
    const pos = this.cursorPos;
    const buf = this.buffer;
    if (pos < buf.length) {
      const endPos = this.findNextWordBoundary(buf, pos);
      this.buffer = buf.slice(0, pos) + buf.slice(endPos);
      this.rewriteFromCursor(term, this.buffer, pos);
    }
    this.renderGhostText(term);
  }

  /** Delete the character at the cursor (Delete key / mid-line Ctrl+D). */
  private deleteCharForward(term: Terminal): void {
    this.clearCompletionState(term, false);
    this.clearGhost(term);
    const pos = this.cursorPos;
    const buf = this.buffer;
    if (pos < buf.length) {
      this.buffer = buf.slice(0, pos) + buf.slice(pos + 1);
      this.rewriteFromCursor(term, this.buffer, pos);
    }
    this.renderGhostText(term);
  }

  /** Ctrl+K — kill from cursor to end of line. */
  private killToEnd(term: Terminal): void {
    this.clearCompletionState(term, false);
    this.clearGhost(term);
    const pos = this.cursorPos;
    if (pos < this.buffer.length) {
      this.buffer = this.buffer.slice(0, pos);
      term.write("\x1b[K");
    }
    this.renderGhostText(term);
  }

  /** Ctrl+U — zsh kill-whole-line (clears the entire buffer, not just left of cursor). */
  private killWholeLine(term: Terminal): void {
    this.clearCompletionState(term, false);
    this.clearGhost(term);
    const oldLen = this.buffer.length;
    if (oldLen > 0) {
      this.clearAndRewriteLine(term, oldLen, this.cursorPos, "", 0);
      this.buffer = "";
      this.cursorPos = 0;
    }
  }

  /** Ctrl+L — clear the screen and redraw the prompt with the in-progress line intact. */
  private clearScreenAndRedraw(term: Terminal): void {
    this.clearCompletionState(term, false);
    this.clearGhost(term);
    term.write("\x1b[H\x1b[2J");
    term.write(this.deps.getPrompt() + this.buffer);
    const moveBack = this.buffer.length - this.cursorPos;
    if (moveBack > 0) term.write(`\x1b[${moveBack}D`);
    this.renderGhostText(term);
  }

  /** Ctrl+D — delete-char on a non-empty line; EOF (exit shell) on an empty one, like zsh. */
  private handleEof(term: Terminal): LineEditorResult | null {
    if (this.buffer.length > 0) {
      this.deleteCharForward(term);
      return null;
    }
    this.clearCompletionState(term, false);
    this.clearGhost(term);
    term.write("\r\n");
    this.historyIndex = -1;
    return { type: "submit", input: "exit", skipHistory: true };
  }

  // ── Arrows / cursor movement / history ───────────────────────────────────

  private handleArrow(term: Terminal, arrow: string, modifier: number = 0): void {
    this.clearCompletionState(term, false);
    const isWordSkip = modifier === 3 || modifier === 5;
    if (arrow === "A") {
      // Up arrow — navigate history
      this.clearGhost(term);
      const history = this.deps.getHistory();
      const idx = this.historyIndex;
      const newIdx = idx === -1 ? history.length - 1 : idx - 1;

      if (newIdx >= 0 && history.length > 0) {
        const historyEntry = history[newIdx];
        this.clearAndRewriteLine(term, this.buffer.length, this.cursorPos, historyEntry, historyEntry.length);
        this.buffer = historyEntry;
        this.cursorPos = historyEntry.length;
        this.historyIndex = newIdx;
      }
      this.renderGhostText(term);
    } else if (arrow === "B") {
      // Down arrow — navigate history forward
      this.clearGhost(term);
      const history = this.deps.getHistory();
      const idx = this.historyIndex;
      const oldLen = this.buffer.length;
      const oldPos = this.cursorPos;

      if (idx === -1 || idx >= history.length - 1) {
        this.clearAndRewriteLine(term, oldLen, oldPos, "", 0);
        this.buffer = "";
        this.cursorPos = 0;
        this.historyIndex = -1;
      } else {
        const newIdx = idx + 1;
        const historyEntry = history[newIdx];
        this.clearAndRewriteLine(term, oldLen, oldPos, historyEntry, historyEntry.length);
        this.buffer = historyEntry;
        this.cursorPos = historyEntry.length;
        this.historyIndex = newIdx;
      }
      this.renderGhostText(term);
    } else if (arrow === "C") {
      // Right arrow — move cursor or accept suggestion
      const pos = this.cursorPos;
      if (isWordSkip && pos < this.buffer.length) {
        this.clearGhost(term);
        const newPos = this.findNextWordBoundary(this.buffer, pos);
        const delta = newPos - pos;
        if (delta > 0) {
          this.cursorPos = newPos;
          term.write(`\x1b[${delta}C`);
        }
        this.renderGhostText(term);
      } else if (pos < this.buffer.length) {
        this.cursorPos = pos + 1;
        term.write("\x1b[C");
      } else if (this.ghostLen > 0) {
        const ctx = this.deps.getContext();
        const suggestion = ctx ? getSuggestion(this.buffer, ctx) : null;

        if (suggestion && suggestion.length > this.buffer.length) {
          this.clearGhost(term);
          const suffix = suggestion.slice(this.buffer.length);
          term.write(suffix);
          this.buffer = suggestion;
          this.cursorPos = suggestion.length;
          this.renderGhostText(term);
        }
      }
    } else if (arrow === "D") {
      // Left arrow — move cursor left
      if (this.cursorPos > 0) {
        this.clearGhost(term);
        if (isWordSkip) {
          const newPos = this.findPrevWordBoundary(this.buffer, this.cursorPos);
          const delta = this.cursorPos - newPos;
          if (delta > 0) {
            this.cursorPos = newPos;
            term.write(`\x1b[${delta}D`);
          }
        } else {
          this.cursorPos -= 1;
          term.write("\x1b[D");
        }
        this.renderGhostText(term);
      }
    } else if (arrow === "H") {
      // Home — move cursor to start
      if (this.cursorPos > 0) {
        this.clearGhost(term);
        term.write(`\x1b[${this.cursorPos}D`);
        this.cursorPos = 0;
        this.renderGhostText(term);
      }
    } else if (arrow === "F") {
      // End — move cursor to end
      const pos = this.cursorPos;
      const len = this.buffer.length;
      if (pos < len) {
        this.clearGhost(term);
        term.write(`\x1b[${len - pos}C`);
        this.cursorPos = len;
        this.renderGhostText(term);
      }
    }
  }
}

/** Helper to get the prefix portion of the original input before replaceFrom. */
function sliceCompletionPrefix(
  originalInput: string,
  result: Pick<CompletionResult, "replaceFrom">
): string {
  return originalInput.slice(0, result.replaceFrom);
}
