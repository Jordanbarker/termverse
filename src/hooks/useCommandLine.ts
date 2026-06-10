import { useCallback, useEffect, useMemo, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore } from "../state/gameStore";
import { getAvailableCommands } from "../engine/commands/registry";
import { getSuggestion, SuggestionContext } from "../engine/suggestions/suggest";
import { getCompletions, CompletionResult } from "../engine/suggestions/complete";
import { isBackspace, isPrintable, CTRL_C, TAB } from "../engine/terminal/keyCodes";
import { parseZshHistory } from "../engine/terminal/zshHistory";
import { ComputerId } from "../state/types";

interface CommandLineDeps {
  cwdRef: React.MutableRefObject<string>;
  activeComputerRef: React.MutableRefObject<ComputerId>;
  writePrompt: (term: Terminal) => void;
}

export interface CommandLineResult {
  type: "submit";
  input: string;
}

interface CompletionState {
  matches: string[];
  displayNames: string[];
  commonPrefix: string;
  replaceFrom: number;
  cycleIndex: number;       // -1 = common prefix shown, 0..N = cycling
  originalInput: string;
  menuVisible: boolean;
  menuLineCount: number;
  promptCol: number;
}

export function useCommandLine(deps: CommandLineDeps) {
  const { cwdRef, activeComputerRef, writePrompt } = deps;
  const lineBuffer = useRef("");
  const cursorPos = useRef(0);
  const ghostLengthRef = useRef(0);
  const completionStateRef = useRef<CompletionState | null>(null);

  // The `.zsh_history` file is the single source of truth for history recall.
  // Select the file *content string* (not a derived array): strings compare by
  // value, so the selector stays stable and avoids React's "getSnapshot should
  // be cached" infinite-loop bailout. Parse it into the recall list via useMemo.
  const computerId = activeComputerRef.current;
  const historyFileContent = useGameStore((s) => {
    const fs = s.computerState[computerId]?.fs;
    return fs ? fs.readFile(`${fs.homeDir}/.zsh_history`).content ?? "" : "";
  });
  const commandHistory = useMemo(() => parseZshHistory(historyFileContent), [historyFileContent]);

  const historyRef = useRef(commandHistory);
  const historyIndexRef = useRef(-1);
  // historyRef is only read inside event-handler callbacks (recall, suggestions),
  // never during render — so keep it in sync via an effect rather than a render-time write.
  useEffect(() => {
    historyRef.current = commandHistory;
  }, [commandHistory]);

  const clearGhost = useCallback((term: Terminal) => {
    if (ghostLengthRef.current > 0) {
      term.write("\x1b[s\x1b[K\x1b[u");
      ghostLengthRef.current = 0;
    }
  }, []);

  /** Rewrite visible text from cursor to end-of-line, clear any leftover chars. */
  const rewriteFromCursor = useCallback(
    (term: Terminal, buffer: string, pos: number) => {
      const tail = buffer.slice(pos);
      term.write(tail + "\x1b[K");
      // Move cursor back to pos
      const moveBack = buffer.length - pos;
      if (moveBack > 0) term.write(`\x1b[${moveBack}D`);
    },
    []
  );

  /** Clear the entire input area and rewrite with new content at newPos. */
  const clearAndRewriteLine = useCallback(
    (term: Terminal, oldLen: number, oldPos: number, newBuffer: string, newPos: number) => {
      // Move cursor to start of input
      if (oldPos > 0) term.write(`\x1b[${oldPos}D`);
      // Write new content and clear leftover
      term.write(newBuffer + "\x1b[K");
      // Move cursor to newPos
      const moveBack = newBuffer.length - newPos;
      if (moveBack > 0) term.write(`\x1b[${moveBack}D`);
    },
    []
  );

  const buildSuggestionContext = useCallback((): SuggestionContext | null => {
    const store = useGameStore.getState();
    const cId = activeComputerRef.current;
    const currentFs = store.computerState[cId]?.fs;
    if (!currentFs) return null;

    const commandNames = getAvailableCommands(cId, store.storyFlags).map((c) => c.name);
    const aliases = store.computerState[cId]?.aliases ?? {};
    const aliasNames = Object.keys(aliases);

    return {
      commandHistory: historyRef.current,
      commandNames,
      aliasNames,
      aliases,
      fs: currentFs,
      cwd: cwdRef.current,
      homeDir: currentFs.homeDir,
    };
  }, [cwdRef, activeComputerRef]);

  const renderGhostText = useCallback((term: Terminal) => {
    const input = lineBuffer.current;
    if (!input) return;
    if (cursorPos.current !== input.length) return;

    const ctx = buildSuggestionContext();
    if (!ctx) return;

    const suggestion = getSuggestion(input, ctx);

    if (suggestion && suggestion.length > input.length) {
      const suffix = suggestion.slice(input.length);
      term.write(`\x1b[s\x1b[2m${suffix}\x1b[0m\x1b[u`);
      ghostLengthRef.current = suffix.length;
    }
  }, [buildSuggestionContext]);

  /** Clear the completion menu from the terminal display. */
  const clearCompletionMenu = useCallback((term: Terminal) => {
    const state = completionStateRef.current;
    if (!state || !state.menuVisible || state.menuLineCount === 0) return;

    // Move down from input line, clear each menu line, move back
    for (let i = 0; i < state.menuLineCount; i++) {
      term.write("\x1b[B\x1b[2K");
    }
    // Move back up to input line
    term.write(`\x1b[${state.menuLineCount}A`);
    // Restore cursor column
    term.write(`\r\x1b[${state.promptCol}C`);
  }, []);

  /** Render the completion menu below the input line. */
  const renderCompletionMenu = useCallback((term: Terminal, state: CompletionState) => {
    const { displayNames, cycleIndex } = state;
    const maxDisplayRows = 10;

    // Columnar layout
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

    // Write menu rows
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

    // Move cursor back to input line
    term.write(`\x1b[${menuLineCount}A`);
    term.write(`\r\x1b[${promptCol}C`);

    // Update state
    state.menuVisible = true;
    state.menuLineCount = menuLineCount;
  }, []);

  /** Clear completion state and optionally restore original input. */
  const clearCompletionState = useCallback((term: Terminal, restoreInput: boolean) => {
    const state = completionStateRef.current;
    if (!state) return;

    clearGhost(term);

    if (state.menuVisible) {
      clearCompletionMenu(term);
    }

    if (restoreInput) {
      const oldLen = lineBuffer.current.length;
      const oldPos = cursorPos.current;
      clearAndRewriteLine(term, oldLen, oldPos, state.originalInput, state.originalInput.length);
      lineBuffer.current = state.originalInput;
      cursorPos.current = state.originalInput.length;
    }

    completionStateRef.current = null;
  }, [clearGhost, clearCompletionMenu, clearAndRewriteLine]);

  /** Handle Tab key press for completion. */
  const handleTabCompletion = useCallback((term: Terminal) => {
    // Compute prompt visual width before any writes (cursorX is accurate here)
    const promptWidth = term.buffer.active.cursorX - cursorPos.current;

    const state = completionStateRef.current;

    if (!state) {
      // First Tab press
      if (cursorPos.current !== lineBuffer.current.length) {
        term.write("\x07");
        return;
      }

      // Bell on empty input
      if (lineBuffer.current.trim() === "") {
        term.write("\x07");
        return;
      }

      clearGhost(term);

      const ctx = buildSuggestionContext();
      if (!ctx) return;

      const result = getCompletions(lineBuffer.current, ctx);
      if (!result || result.matches.length === 0) {
        term.write("\x07");
        renderGhostText(term);
        return;
      }

      if (result.matches.length === 1) {
        // Single match — replace and done
        const newInput = result.commonPrefix;
        const oldLen = lineBuffer.current.length;
        const oldPos = cursorPos.current;
        clearAndRewriteLine(term, oldLen, oldPos, newInput, newInput.length);
        lineBuffer.current = newInput;
        cursorPos.current = newInput.length;
        renderGhostText(term);
        return;
      }

      // Multiple matches
      if (result.commonPrefix.length > lineBuffer.current.length) {
        // Common prefix extends input — apply it
        const newInput = result.commonPrefix;
        const oldLen = lineBuffer.current.length;
        const oldPos = cursorPos.current;
        clearAndRewriteLine(term, oldLen, oldPos, newInput, newInput.length);

        completionStateRef.current = {
          ...result,
          cycleIndex: -1,
          originalInput: lineBuffer.current,
          menuVisible: false,
          menuLineCount: 0,
          promptCol: promptWidth + newInput.length,
        };

        lineBuffer.current = newInput;
        cursorPos.current = newInput.length;
        renderGhostText(term);
        return;
      }

      // No extension possible — show menu immediately at first match
      const newInput = input_slice_prefix(lineBuffer.current, result) + result.matches[0];
      const oldLen = lineBuffer.current.length;
      const oldPos = cursorPos.current;
      clearAndRewriteLine(term, oldLen, oldPos, newInput, newInput.length);

      completionStateRef.current = {
        ...result,
        cycleIndex: 0,
        originalInput: lineBuffer.current,
        menuVisible: false,
        menuLineCount: 0,
        promptCol: promptWidth + newInput.length,
      };

      lineBuffer.current = newInput;
      cursorPos.current = newInput.length;

      renderCompletionMenu(term, completionStateRef.current);
      return;
    }

    // Subsequent Tab presses — cycle
    clearGhost(term);

    if (state.menuVisible) {
      clearCompletionMenu(term);
    }

    const newIndex = state.cycleIndex === -1 ? 0 : (state.cycleIndex + 1) % state.matches.length;
    state.cycleIndex = newIndex;

    const newInput = input_slice_prefix(state.originalInput, state) + state.matches[newIndex];
    const oldLen = lineBuffer.current.length;
    const oldPos = cursorPos.current;
    clearAndRewriteLine(term, oldLen, oldPos, newInput, newInput.length);
    lineBuffer.current = newInput;
    cursorPos.current = newInput.length;

    state.promptCol = promptWidth + newInput.length;
    renderCompletionMenu(term, state);
  }, [clearGhost, buildSuggestionContext, clearAndRewriteLine, renderGhostText, clearCompletionMenu, renderCompletionMenu]);

  /**
   * Process a single character of input for the command line.
   * Returns a CommandLineResult if a command was submitted, null otherwise.
   */
  const handleChar = useCallback(
    (term: Terminal, char: string, code: number): CommandLineResult | null => {
      // If completion state is active, handle Tab/cancel/clear
      if (completionStateRef.current) {
        if (code === TAB) {
          handleTabCompletion(term);
          return null;
        }
        if (code === CTRL_C || char === "\x1b") {
          clearCompletionState(term, true);
          return null;
        }
        // Any other key: clear menu, then fall through to normal handling
        clearCompletionState(term, false);
      }

      // No active completion — first Tab press
      if (code === TAB) {
        handleTabCompletion(term);
        return null;
      }

      if (char === "\r" || char === "\n") {
        clearGhost(term);
        const input = lineBuffer.current;
        lineBuffer.current = "";
        cursorPos.current = 0;

        if (input.trim()) {
          term.write("\r\n");
          // History is recorded by the command runner appending to the
          // `.zsh_history` file (the single source of truth) once the command
          // executes; no separate push needed here.
          historyIndexRef.current = -1;
          return { type: "submit", input };
        }

        // writePrompt already includes a leading \r\n
        writePrompt(term);
        return null;
      }

      if (isBackspace(code)) {
        clearGhost(term);
        const pos = cursorPos.current;
        if (pos > 0) {
          const buf = lineBuffer.current;
          lineBuffer.current = buf.slice(0, pos - 1) + buf.slice(pos);
          cursorPos.current = pos - 1;
          term.write("\b");
          rewriteFromCursor(term, lineBuffer.current, pos - 1);
        }
        renderGhostText(term);
        return null;
      }

      if (code === CTRL_C) {
        clearGhost(term);
        lineBuffer.current = "";
        cursorPos.current = 0;
        term.write("^C");
        writePrompt(term);
        return null;
      }

      if (isPrintable(code)) {
        clearGhost(term);
        const pos = cursorPos.current;
        const buf = lineBuffer.current;
        lineBuffer.current = buf.slice(0, pos) + char + buf.slice(pos);
        cursorPos.current = pos + 1;
        term.write(char);
        if (pos < buf.length) {
          rewriteFromCursor(term, lineBuffer.current, pos + 1);
        }
        renderGhostText(term);
        return null;
      }

      return null;
    },
    [clearGhost, renderGhostText, rewriteFromCursor, writePrompt, handleTabCompletion, clearCompletionState]
  );

  const findPrevWordBoundary = useCallback((buffer: string, pos: number): number => {
    let p = pos;
    // Skip non-word chars behind cursor
    while (p > 0 && !/[a-zA-Z0-9_]/.test(buffer[p - 1])) p--;
    // Skip word chars
    while (p > 0 && /[a-zA-Z0-9_]/.test(buffer[p - 1])) p--;
    return p;
  }, []);

  const findNextWordBoundary = useCallback((buffer: string, pos: number): number => {
    let p = pos;
    // Skip word chars ahead of cursor
    while (p < buffer.length && /[a-zA-Z0-9_]/.test(buffer[p])) p++;
    // Skip non-word chars
    while (p < buffer.length && !/[a-zA-Z0-9_]/.test(buffer[p])) p++;
    return p;
  }, []);

  const deleteWordBackward = useCallback(
    (term: Terminal): void => {
      clearCompletionState(term, false);
      clearGhost(term);
      const pos = cursorPos.current;
      if (pos > 0) {
        const buf = lineBuffer.current;
        const newPos = findPrevWordBoundary(buf, pos);
        const delta = pos - newPos;
        lineBuffer.current = buf.slice(0, newPos) + buf.slice(pos);
        cursorPos.current = newPos;
        if (delta > 0) term.write(`\x1b[${delta}D`);
        rewriteFromCursor(term, lineBuffer.current, newPos);
      }
      renderGhostText(term);
    },
    [clearCompletionState, clearGhost, renderGhostText, rewriteFromCursor, findPrevWordBoundary]
  );

  const deleteWordForward = useCallback(
    (term: Terminal): void => {
      clearCompletionState(term, false);
      clearGhost(term);
      const pos = cursorPos.current;
      const buf = lineBuffer.current;
      if (pos < buf.length) {
        const endPos = findNextWordBoundary(buf, pos);
        lineBuffer.current = buf.slice(0, pos) + buf.slice(endPos);
        rewriteFromCursor(term, lineBuffer.current, pos);
      }
      renderGhostText(term);
    },
    [clearCompletionState, clearGhost, renderGhostText, rewriteFromCursor, findNextWordBoundary]
  );

  const handleArrow = useCallback(
    (term: Terminal, arrow: string, modifier: number = 0): void => {
      clearCompletionState(term, false);
      const isWordSkip = modifier === 3 || modifier === 5;
      if (arrow === "A") {
        // Up arrow — navigate history
        clearGhost(term);
        const history = historyRef.current;
        const idx = historyIndexRef.current;
        const newIdx = idx === -1 ? history.length - 1 : idx - 1;

        if (newIdx >= 0 && history.length > 0) {
          const historyEntry = history[newIdx];
          clearAndRewriteLine(term, lineBuffer.current.length, cursorPos.current, historyEntry, historyEntry.length);
          lineBuffer.current = historyEntry;
          cursorPos.current = historyEntry.length;
          historyIndexRef.current = newIdx;
        }
        renderGhostText(term);
      } else if (arrow === "B") {
        // Down arrow — navigate history forward
        clearGhost(term);
        const history = historyRef.current;
        const idx = historyIndexRef.current;
        const oldLen = lineBuffer.current.length;
        const oldPos = cursorPos.current;

        if (idx === -1 || idx >= history.length - 1) {
          clearAndRewriteLine(term, oldLen, oldPos, "", 0);
          lineBuffer.current = "";
          cursorPos.current = 0;
          historyIndexRef.current = -1;
        } else {
          const newIdx = idx + 1;
          const historyEntry = history[newIdx];
          clearAndRewriteLine(term, oldLen, oldPos, historyEntry, historyEntry.length);
          lineBuffer.current = historyEntry;
          cursorPos.current = historyEntry.length;
          historyIndexRef.current = newIdx;
        }
        renderGhostText(term);
      } else if (arrow === "C") {
        // Right arrow — move cursor or accept suggestion
        const pos = cursorPos.current;
        if (isWordSkip && pos < lineBuffer.current.length) {
          clearGhost(term);
          const newPos = findNextWordBoundary(lineBuffer.current, pos);
          const delta = newPos - pos;
          if (delta > 0) {
            cursorPos.current = newPos;
            term.write(`\x1b[${delta}C`);
          }
          renderGhostText(term);
        } else if (pos < lineBuffer.current.length) {
          cursorPos.current = pos + 1;
          term.write("\x1b[C");
        } else if (ghostLengthRef.current > 0) {
          const ctx = buildSuggestionContext();
          const suggestion = ctx ? getSuggestion(lineBuffer.current, ctx) : null;

          if (suggestion && suggestion.length > lineBuffer.current.length) {
            clearGhost(term);
            const suffix = suggestion.slice(lineBuffer.current.length);
            term.write(suffix);
            lineBuffer.current = suggestion;
            cursorPos.current = suggestion.length;
            renderGhostText(term);
          }
        }
      } else if (arrow === "D") {
        // Left arrow — move cursor left
        if (cursorPos.current > 0) {
          clearGhost(term);
          if (isWordSkip) {
            const newPos = findPrevWordBoundary(lineBuffer.current, cursorPos.current);
            const delta = cursorPos.current - newPos;
            if (delta > 0) {
              cursorPos.current = newPos;
              term.write(`\x1b[${delta}D`);
            }
          } else {
            cursorPos.current -= 1;
            term.write("\x1b[D");
          }
          renderGhostText(term);
        }
      } else if (arrow === "H") {
        // Home — move cursor to start
        if (cursorPos.current > 0) {
          clearGhost(term);
          term.write(`\x1b[${cursorPos.current}D`);
          cursorPos.current = 0;
          renderGhostText(term);
        }
      } else if (arrow === "F") {
        // End — move cursor to end
        const pos = cursorPos.current;
        const len = lineBuffer.current.length;
        if (pos < len) {
          clearGhost(term);
          term.write(`\x1b[${len - pos}C`);
          cursorPos.current = len;
          renderGhostText(term);
        }
      }
    },
    [clearCompletionState, clearGhost, clearAndRewriteLine, renderGhostText, buildSuggestionContext, findPrevWordBoundary, findNextWordBoundary]
  );

  return { handleChar, handleArrow, deleteWordBackward, deleteWordForward };
}

/** Helper to get the prefix portion of the original input before replaceFrom. */
function input_slice_prefix(originalInput: string, result: Pick<CompletionResult, 'replaceFrom'>): string {
  return originalInput.slice(0, result.replaceFrom);
}
