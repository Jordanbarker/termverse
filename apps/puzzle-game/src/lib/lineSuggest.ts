import type { Terminal } from "@xterm/xterm";
import { getSuggestion, type SuggestionContext } from "@tt/core/suggestions/suggest";
import { getCompletions, type CompletionResult } from "@tt/core/suggestions/complete";

/**
 * Lean zsh-style ghost-text + TAB-completion renderer for the puzzle game's
 * terminal. The shared suggestion *engine* (`@tt/core/suggestions`) computes what
 * to suggest; this file is the thin xterm-ANSI *rendering* glue, modelled on the
 * main game's `useCommandLine` but simplified for the puzzle game's end-of-line
 * input model (the cursor is always at `buffer.length`, so there is no mid-line
 * cursor math). One `LineSuggestState` lives per pane.
 */

export interface CompletionState extends CompletionResult {
  cycleIndex: number;      // -1 = common prefix applied, 0..N = cycling matches
  originalInput: string;
  menuVisible: boolean;
  menuLineCount: number;
  promptCol: number;       // cursor column after the applied input (for menu re-seek)
}

export interface LineSuggestState {
  ghostLen: number;
  completion: CompletionState | null;
}

export function makeLineSuggestState(): LineSuggestState {
  return { ghostLen: 0, completion: null };
}

/** Erase any ghost text currently shown after the cursor. */
export function clearGhost(term: Terminal, state: LineSuggestState): void {
  if (state.ghostLen > 0) {
    term.write("\x1b[s\x1b[K\x1b[u");
    state.ghostLen = 0;
  }
}

/** Draw dim ghost text for the top suggestion (cursor restored to line end). */
export function renderGhost(
  term: Terminal,
  buffer: string,
  ctx: SuggestionContext,
  state: LineSuggestState,
): void {
  if (!buffer) return;
  const suggestion = getSuggestion(buffer, ctx);
  if (suggestion && suggestion.length > buffer.length) {
    const suffix = suggestion.slice(buffer.length);
    term.write(`\x1b[s\x1b[2m${suffix}\x1b[0m\x1b[u`);
    state.ghostLen = suffix.length;
  }
}

/**
 * Accept the visible ghost text (zsh Right-arrow / End behaviour). Returns the
 * extended buffer, or the unchanged buffer if there is nothing to accept.
 */
export function acceptGhost(
  term: Terminal,
  buffer: string,
  ctx: SuggestionContext,
  state: LineSuggestState,
): string {
  if (state.ghostLen <= 0) return buffer;
  const suggestion = getSuggestion(buffer, ctx);
  if (!suggestion || suggestion.length <= buffer.length) return buffer;
  clearGhost(term, state);
  term.write(suggestion.slice(buffer.length));
  renderGhost(term, suggestion, ctx, state);
  return suggestion;
}

/** Replace the whole input line in place (cursor ends at the new line end). */
function rewriteLine(term: Terminal, oldLen: number, newBuffer: string): void {
  if (oldLen > 0) term.write(`\x1b[${oldLen}D`);
  term.write(newBuffer + "\x1b[K");
}

/** Erase the completion menu printed below the input line. */
export function clearCompletionMenu(term: Terminal, state: CompletionState): void {
  if (!state.menuVisible || state.menuLineCount === 0) return;
  for (let i = 0; i < state.menuLineCount; i++) term.write("\x1b[B\x1b[2K");
  term.write(`\x1b[${state.menuLineCount}A`);
  term.write(`\r\x1b[${state.promptCol}C`);
}

/** Render the columnar completion menu below the input line, highlighting the cycled match. */
export function renderCompletionMenu(term: Terminal, state: CompletionState): void {
  const { displayNames, cycleIndex } = state;
  const maxDisplayRows = 10;

  const maxNameLen = Math.max(...displayNames.map((n) => n.length));
  const colWidth = maxNameLen + 2;
  const numCols = Math.max(1, Math.floor(term.cols / colWidth));
  const totalRows = Math.ceil(displayNames.length / numCols);
  const truncated = totalRows > maxDisplayRows;
  const displayRows = truncated ? maxDisplayRows : totalRows;
  const displayCount = truncated ? displayRows * numCols : displayNames.length;
  const menuLineCount = displayRows + (truncated ? 1 : 0);

  // Scroll up if the menu would not fit below the cursor.
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
      if (idx >= displayCount || idx >= displayNames.length) break;
      const padded = displayNames[idx].padEnd(colWidth);
      line += idx === cycleIndex ? `\x1b[7m${padded}\x1b[27m` : padded;
    }
    term.write(`\r\n${line}\x1b[K`);
  }

  if (truncated) {
    const remaining = displayNames.length - displayCount;
    term.write(`\r\n\x1b[2m... and ${remaining} more\x1b[0m\x1b[K`);
  }

  // Move back up to the input line and re-seek the cursor column.
  term.write(`\x1b[${menuLineCount}A`);
  term.write(`\r\x1b[${state.promptCol}C`);

  state.menuVisible = true;
  state.menuLineCount = menuLineCount;
}

/**
 * Tear down completion: clear ghost + menu, optionally restore the original
 * input. Returns the resulting buffer.
 */
export function clearCompletion(
  term: Terminal,
  buffer: string,
  state: LineSuggestState,
  restore: boolean,
): string {
  const c = state.completion;
  if (!c) return buffer;
  clearGhost(term, state);
  if (c.menuVisible) clearCompletionMenu(term, c);
  let result = buffer;
  if (restore) {
    rewriteLine(term, buffer.length, c.originalInput);
    result = c.originalInput;
  }
  state.completion = null;
  return result;
}

/**
 * Handle a TAB press. `promptWidth` is the prompt's visual column width, which
 * the caller computes as `term.buffer.active.cursorX - buffer.length` *before*
 * any writes. Returns the (possibly updated) buffer.
 */
export function handleTab(
  term: Terminal,
  buffer: string,
  promptWidth: number,
  ctx: SuggestionContext,
  state: LineSuggestState,
): string {
  const existing = state.completion;

  if (!existing) {
    // First TAB.
    if (buffer.trim() === "") {
      term.write("\x07");
      return buffer;
    }
    clearGhost(term, state);

    const result = getCompletions(buffer, ctx);
    if (!result || result.matches.length === 0) {
      term.write("\x07");
      renderGhost(term, buffer, ctx, state);
      return buffer;
    }

    if (result.matches.length === 1) {
      // Single match — apply and finish (no cycling state).
      const newInput = result.commonPrefix;
      rewriteLine(term, buffer.length, newInput);
      renderGhost(term, newInput, ctx, state);
      return newInput;
    }

    if (result.commonPrefix.length > buffer.length) {
      // Common prefix extends the input — apply it, arm the menu for next TAB.
      const newInput = result.commonPrefix;
      rewriteLine(term, buffer.length, newInput);
      state.completion = {
        ...result,
        cycleIndex: -1,
        originalInput: buffer,
        menuVisible: false,
        menuLineCount: 0,
        promptCol: promptWidth + newInput.length,
      };
      renderGhost(term, newInput, ctx, state);
      return newInput;
    }

    // No extension possible — select the first match and show the menu now.
    const newInput = buffer.slice(0, result.replaceFrom) + result.matches[0];
    rewriteLine(term, buffer.length, newInput);
    state.completion = {
      ...result,
      cycleIndex: 0,
      originalInput: buffer,
      menuVisible: false,
      menuLineCount: 0,
      promptCol: promptWidth + newInput.length,
    };
    renderCompletionMenu(term, state.completion);
    return newInput;
  }

  // Subsequent TAB — cycle to the next match.
  clearGhost(term, state);
  if (existing.menuVisible) clearCompletionMenu(term, existing);

  const newIndex =
    existing.cycleIndex === -1 ? 0 : (existing.cycleIndex + 1) % existing.matches.length;
  existing.cycleIndex = newIndex;

  const newInput = existing.originalInput.slice(0, existing.replaceFrom) + existing.matches[newIndex];
  rewriteLine(term, buffer.length, newInput);
  existing.promptCol = promptWidth + newInput.length;
  renderCompletionMenu(term, existing);
  return newInput;
}
