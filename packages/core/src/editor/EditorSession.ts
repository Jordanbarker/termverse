import { Terminal } from "@xterm/xterm";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { EditorState, EditorConfig, PromptState } from "./types";
import { parseEditorInput, EditorAction } from "./keymap";
import { renderEditor } from "./render";
import { ISession, SessionResult } from "../session/types";
import { findPrevWordBoundary, findNextWordBoundary } from "@tt/core/terminal/wordBoundary";
import { GameEvent } from "@tt/core";

export interface EditorTrigger {
  triggerRow: number;
  triggerEvents: GameEvent[];
  requireSave?: boolean;
}

export class EditorSession implements ISession {
  private state: EditorState;
  private config: EditorConfig;
  private fs: VirtualFS;
  private terminal: Terminal;
  private onSave: (newFs: VirtualFS) => void;
  private trigger?: EditorTrigger;
  private maxRowReached = 0;
  private hasSaved = false;
  private fileEvents: GameEvent[] = [];

  constructor(
    terminal: Terminal,
    fs: VirtualFS,
    filePath: string,
    content: string,
    readOnly: boolean,
    onSave: (newFs: VirtualFS) => void,
    trigger?: EditorTrigger
  ) {
    this.terminal = terminal;
    this.fs = fs;
    this.onSave = onSave;
    this.trigger = trigger;

    const fileName = filePath.split("/").pop() || filePath;
    const lines = content.split("\n");
    // Ensure at least one line
    if (lines.length === 0) lines.push("");

    this.config = {
      rows: terminal.rows,
      cols: terminal.cols,
    };

    this.state = {
      lines,
      cursor: { row: 0, col: 0 },
      scrollOffset: 0,
      filePath,
      fileName,
      modified: false,
      readOnly,
      cutBuffer: null,
      message: readOnly ? "[ File is read-only ]" : null,
      promptState: { type: "none" },
      showHelp: false,
      search: { lastSearchTerm: "" },
    };
  }

  canClose(): boolean {
    return !this.state.modified;
  }

  resize(): void {
    this.config.rows = this.terminal.rows;
    this.config.cols = this.terminal.cols;
    this.ensureCursorVisible();
    this.render();
  }

  /** Enter the alternate screen buffer and render initial state. */
  enter(): void {
    this.terminal.write("\x1b[?1049h"); // Enter alt buffer
    this.render();
  }

  /** Process raw xterm input. Returns SessionResult. */
  handleInput(data: string): SessionResult {
    const actions = parseEditorInput(data);

    for (const action of actions) {
      // Help overlay: any key dismisses it
      if (this.state.showHelp && action.type !== "help") {
        this.state.showHelp = false;
        this.render();
        return { type: "continue" };
      }

      // Route through prompt handler when a prompt is active
      if (this.state.promptState.type !== "none") {
        const result = this.handlePromptAction(action);
        if (result.type === "exit") return result;
        continue;
      }

      const result = this.processAction(action);
      if (result.type === "exit") return result;
    }

    this.render();
    return { type: "continue" };
  }

  // === Prompt handling ===

  private handlePromptAction(action: EditorAction): SessionResult {
    const prompt = this.state.promptState;

    switch (prompt.type) {
      case "saveExit":
        return this.handleSaveExitPrompt(action);
      case "replaceConfirm":
        this.handleReplaceConfirmPrompt(action, prompt);
        this.render();
        return { type: "continue" };
      case "search":
      case "replaceSearch":
      case "replaceWith":
      case "gotoLine":
      case "readFile":
      case "writeOut":
        this.handleTextInputPrompt(action, prompt);
        this.render();
        return { type: "continue" };
      default:
        return { type: "continue" };
    }
  }

  private handleSaveExitPrompt(action: EditorAction): SessionResult {
    if (action.type === "promptYes" || action.type === "insert") {
      const ch = action.type === "insert" ? action.char : "";
      if (ch === "y" || ch === "Y" || action.type === "promptYes") {
        this.save();
        return this.exitEditor();
      }
      if (ch === "n" || ch === "N") {
        return this.exitEditor();
      }
    }
    if (action.type === "exit" || action.type === "showPosition") {
      this.cancelPrompt();
      this.render();
    }
    return { type: "continue" };
  }

  private handleTextInputPrompt(
    action: EditorAction,
    prompt: Exclude<PromptState, { type: "none" } | { type: "saveExit" } | { type: "replaceConfirm" }>
  ): void {
    if (action.type === "showPosition") {
      this.cancelPrompt();
      return;
    }
    if (action.type === "insert") {
      this.setPromptInput(prompt, prompt.input + action.char);
      return;
    }
    if (action.type === "backspace") {
      if (prompt.input.length > 0) {
        this.setPromptInput(prompt, prompt.input.slice(0, -1));
      }
      return;
    }
    if (action.type === "enter") {
      this.submitPrompt(prompt);
      return;
    }
    // Ctrl+W again while search is open: submit immediately (repeats last search if input is empty)
    if (action.type === "search" && prompt.type === "search") {
      this.submitPrompt(prompt);
      return;
    }
  }

  private handleReplaceConfirmPrompt(
    action: EditorAction,
    prompt: Extract<PromptState, { type: "replaceConfirm" }>
  ): void {
    if (action.type === "showPosition") {
      this.cancelPrompt();
      return;
    }
    if (action.type === "insert") {
      const ch = action.char.toLowerCase();
      if (ch === "y") {
        this.replaceCurrentAndFindNext(prompt.searchTerm, prompt.replacement);
      } else if (ch === "n") {
        this.skipAndFindNextReplace(prompt.searchTerm, prompt.replacement);
      } else if (ch === "a") {
        this.replaceAll(prompt.searchTerm, prompt.replacement);
      }
    }
  }

  private setPromptInput(
    prompt: Exclude<PromptState, { type: "none" } | { type: "saveExit" } | { type: "replaceConfirm" }>,
    newInput: string
  ): void {
    switch (prompt.type) {
      case "search":
        this.state.promptState = { type: "search", input: newInput };
        break;
      case "replaceSearch":
        this.state.promptState = { type: "replaceSearch", input: newInput };
        break;
      case "replaceWith":
        this.state.promptState = { type: "replaceWith", searchTerm: prompt.searchTerm, input: newInput };
        break;
      case "gotoLine":
        this.state.promptState = { type: "gotoLine", input: newInput };
        break;
      case "readFile":
        this.state.promptState = { type: "readFile", input: newInput };
        break;
      case "writeOut":
        this.state.promptState = { type: "writeOut", input: newInput };
        break;
    }
  }

  private submitPrompt(
    prompt: Exclude<PromptState, { type: "none" } | { type: "saveExit" } | { type: "replaceConfirm" }>
  ): void {
    switch (prompt.type) {
      case "search":
        this.submitSearch(prompt.input);
        break;
      case "replaceSearch":
        this.submitReplaceSearch(prompt.input);
        break;
      case "replaceWith":
        this.submitReplaceWith(prompt.searchTerm, prompt.input);
        break;
      case "gotoLine":
        this.submitGotoLine(prompt.input);
        break;
      case "readFile":
        this.submitReadFile(prompt.input);
        break;
      case "writeOut":
        this.submitWriteOut(prompt.input);
        break;
    }
  }

  private cancelPrompt(): void {
    this.state.promptState = { type: "none" };
    this.state.message = null;
  }

  // === Action dispatch ===

  private processAction(action: EditorAction): SessionResult {
    switch (action.type) {
      case "insert":
        this.insertChar(action.char);
        break;
      case "enter":
        this.insertNewline();
        break;
      case "backspace":
        this.handleBackspace();
        break;
      case "delete":
        this.handleDelete();
        break;
      case "arrowUp":
        this.moveCursor(0, -1);
        break;
      case "arrowDown":
        this.moveCursor(0, 1);
        break;
      case "arrowLeft":
        this.moveCursor(-1, 0);
        break;
      case "arrowRight":
        this.moveCursor(1, 0);
        break;
      case "wordLeft":
        this.moveWordLeft();
        break;
      case "wordRight":
        this.moveWordRight();
        break;
      case "home":
        this.state.cursor.col = 0;
        break;
      case "end":
        this.state.cursor.col = this.currentLine().length;
        break;
      case "pageUp":
        this.pageMove(-1);
        break;
      case "pageDown":
        this.pageMove(1);
        break;
      case "save":
        if (this.state.readOnly) {
          this.state.message = "[ File is read-only ]";
        } else {
          this.save();
        }
        break;
      case "exit":
        return this.handleExit();
      case "cutLine":
        this.cutLine();
        break;
      case "pasteLine":
        this.pasteLine();
        break;
      case "help":
        this.state.showHelp = !this.state.showHelp;
        break;
      case "search":
        this.state.promptState = { type: "search", input: "" };
        this.state.message = null;
        break;
      case "replace":
        this.state.promptState = { type: "replaceSearch", input: "" };
        this.state.message = null;
        break;
      case "gotoLine":
        this.state.promptState = { type: "gotoLine", input: "" };
        this.state.message = null;
        break;
      case "readFile":
        if (this.state.readOnly) {
          this.state.message = "[ File is read-only ]";
        } else {
          this.state.promptState = { type: "readFile", input: "" };
          this.state.message = null;
        }
        break;
      case "writeOut":
        if (this.state.readOnly) {
          this.state.message = "[ File is read-only ]";
        } else {
          this.state.promptState = { type: "writeOut", input: this.state.filePath };
          this.state.message = null;
        }
        break;
      case "showPosition":
        this.showPosition();
        break;
      case "justify":
        this.justify();
        break;
      case "execute":
        this.state.message = "[ Not supported ]";
        break;
      default:
        break;
    }
    return { type: "continue" };
  }

  // === Editing operations ===

  private insertChar(char: string): void {
    if (this.state.readOnly) {
      this.state.message = "[ File is read-only ]";
      return;
    }
    const { row, col } = this.state.cursor;
    const line = this.state.lines[row];
    this.state.lines[row] = line.slice(0, col) + char + line.slice(col);
    this.state.cursor.col++;
    this.state.modified = true;
    this.state.message = null;
  }

  private insertNewline(): void {
    if (this.state.readOnly) {
      this.state.message = "[ File is read-only ]";
      return;
    }
    const { row, col } = this.state.cursor;
    const line = this.state.lines[row];
    const before = line.slice(0, col);
    const after = line.slice(col);
    this.state.lines[row] = before;
    this.state.lines.splice(row + 1, 0, after);
    this.state.cursor.row++;
    this.state.cursor.col = 0;
    this.state.modified = true;
    this.state.message = null;
    this.ensureCursorVisible();
  }

  private handleBackspace(): void {
    if (this.state.readOnly) {
      this.state.message = "[ File is read-only ]";
      return;
    }
    const { row, col } = this.state.cursor;
    if (col > 0) {
      const line = this.state.lines[row];
      this.state.lines[row] = line.slice(0, col - 1) + line.slice(col);
      this.state.cursor.col--;
    } else if (row > 0) {
      // Merge with previous line
      const prevLen = this.state.lines[row - 1].length;
      this.state.lines[row - 1] += this.state.lines[row];
      this.state.lines.splice(row, 1);
      this.state.cursor.row--;
      this.state.cursor.col = prevLen;
    }
    this.state.modified = true;
    this.state.message = null;
    this.ensureCursorVisible();
  }

  private handleDelete(): void {
    if (this.state.readOnly) {
      this.state.message = "[ File is read-only ]";
      return;
    }
    const { row, col } = this.state.cursor;
    const line = this.state.lines[row];
    if (col < line.length) {
      this.state.lines[row] = line.slice(0, col) + line.slice(col + 1);
    } else if (row < this.state.lines.length - 1) {
      // Merge with next line
      this.state.lines[row] += this.state.lines[row + 1];
      this.state.lines.splice(row + 1, 1);
    }
    this.state.modified = true;
    this.state.message = null;
  }

  private cutLine(): void {
    if (this.state.readOnly) {
      this.state.message = "[ File is read-only ]";
      return;
    }
    const { row } = this.state.cursor;
    this.state.cutBuffer = this.state.lines[row];
    if (this.state.lines.length > 1) {
      this.state.lines.splice(row, 1);
      if (this.state.cursor.row >= this.state.lines.length) {
        this.state.cursor.row = this.state.lines.length - 1;
      }
    } else {
      this.state.lines[0] = "";
    }
    this.clampCol();
    this.state.modified = true;
    this.state.message = null;
    this.ensureCursorVisible();
  }

  private pasteLine(): void {
    if (this.state.readOnly) {
      this.state.message = "[ File is read-only ]";
      return;
    }
    if (this.state.cutBuffer === null) return;
    this.state.lines.splice(this.state.cursor.row + 1, 0, this.state.cutBuffer);
    this.state.cursor.row++;
    this.state.cursor.col = 0;
    this.state.modified = true;
    this.state.message = null;
    this.ensureCursorVisible();
  }

  // === New features ===

  private showPosition(): void {
    const { row, col } = this.state.cursor;
    const totalLines = this.state.lines.length;
    const lineLen = this.state.lines[row].length;
    // Count total chars in file
    const totalChars = this.state.lines.reduce((sum, l) => sum + l.length, 0) + (totalLines - 1); // newlines
    // Count chars before cursor
    let charsBefore = 0;
    for (let i = 0; i < row; i++) {
      charsBefore += this.state.lines[i].length + 1; // +1 for newline
    }
    charsBefore += col;

    const linePct = totalLines > 0 ? Math.round(((row + 1) / totalLines) * 100) : 100;
    const colPct = lineLen > 0 ? Math.round(((col + 1) / (lineLen + 1)) * 100) : 100;
    const charPct = totalChars > 0 ? Math.round((charsBefore / totalChars) * 100) : 0;

    this.state.message = `line ${row + 1}/${totalLines} (${linePct}%), col ${col + 1}/${lineLen + 1} (${colPct}%), char ${charsBefore}/${totalChars} (${charPct}%)`;
  }

  private submitSearch(input: string): void {
    const term = input || this.state.search.lastSearchTerm;
    if (!term) {
      this.cancelPrompt();
      return;
    }
    this.state.search.lastSearchTerm = term;
    const found = this.findNext(term, this.state.cursor.row, this.state.cursor.col + 1);
    if (found) {
      this.state.cursor.row = found.row;
      this.state.cursor.col = found.col;
      this.ensureCursorVisible();
    } else {
      this.state.message = `[ "${term}" not found ]`;
    }
    this.state.promptState = { type: "none" };
  }

  /**
   * Search forward from (startRow, startCol), wrapping around the file.
   * Case-insensitive.
   */
  private findNext(term: string, startRow: number, startCol: number): { row: number; col: number } | null {
    const lowerTerm = term.toLowerCase();
    const totalLines = this.state.lines.length;

    // Search from startCol on startRow, then subsequent lines, wrapping
    for (let i = 0; i < totalLines; i++) {
      const lineIdx = (startRow + i) % totalLines;
      const line = this.state.lines[lineIdx].toLowerCase();
      const searchFrom = i === 0 ? startCol : 0;
      const idx = line.indexOf(lowerTerm, searchFrom);
      if (idx !== -1) {
        return { row: lineIdx, col: idx };
      }
    }
    return null;
  }

  private submitReplaceSearch(input: string): void {
    if (!input) {
      this.cancelPrompt();
      return;
    }
    this.state.promptState = { type: "replaceWith", searchTerm: input, input: "" };
  }

  private submitReplaceWith(searchTerm: string, replacement: string): void {
    // Find first occurrence from cursor
    const found = this.findNext(searchTerm, this.state.cursor.row, this.state.cursor.col);
    if (!found) {
      this.state.message = `[ "${searchTerm}" not found ]`;
      this.state.promptState = { type: "none" };
      return;
    }
    this.state.cursor.row = found.row;
    this.state.cursor.col = found.col;
    this.ensureCursorVisible();
    this.state.promptState = { type: "replaceConfirm", searchTerm, replacement };
    this.state.message = `Replace this instance?`;
  }

  private replaceCurrentAndFindNext(searchTerm: string, replacement: string): void {
    this.replaceAtCursor(searchTerm, replacement);
    const found = this.findNext(searchTerm, this.state.cursor.row, this.state.cursor.col);
    if (found) {
      this.state.cursor.row = found.row;
      this.state.cursor.col = found.col;
      this.ensureCursorVisible();
      this.state.message = "Replace this instance?";
    } else {
      this.state.promptState = { type: "none" };
      this.state.message = "[ Replaced 1 occurrence ]";
    }
  }

  private skipAndFindNextReplace(searchTerm: string, replacement: string): void {
    // Move past current match to find the next one
    const found = this.findNext(searchTerm, this.state.cursor.row, this.state.cursor.col + 1);
    if (found && (found.row !== this.state.cursor.row || found.col !== this.state.cursor.col)) {
      this.state.cursor.row = found.row;
      this.state.cursor.col = found.col;
      this.ensureCursorVisible();
      this.state.message = "Replace this instance?";
      this.state.promptState = { type: "replaceConfirm", searchTerm, replacement };
    } else {
      this.state.promptState = { type: "none" };
      this.state.message = "[ Search Wrapped ]";
    }
  }

  private replaceAll(searchTerm: string, replacement: string): void {
    let count = 0;
    const lowerTerm = searchTerm.toLowerCase();

    for (let i = 0; i < this.state.lines.length; i++) {
      const line = this.state.lines[i];
      let newLine = "";
      let searchIdx = 0;
      while (searchIdx <= line.length) {
        const idx = line.toLowerCase().indexOf(lowerTerm, searchIdx);
        if (idx === -1) {
          newLine += line.slice(searchIdx);
          break;
        }
        newLine += line.slice(searchIdx, idx) + replacement;
        searchIdx = idx + searchTerm.length;
        count++;
      }
      if (newLine !== line) {
        this.state.lines[i] = newLine;
      }
    }

    if (count > 0) {
      this.state.modified = true;
    }
    this.state.promptState = { type: "none" };
    this.state.message = `Replaced ${count} occurrence${count !== 1 ? "s" : ""}`;
    this.clampCol();
  }

  private replaceAtCursor(searchTerm: string, replacement: string): void {
    const { row, col } = this.state.cursor;
    const line = this.state.lines[row];
    this.state.lines[row] = line.slice(0, col) + replacement + line.slice(col + searchTerm.length);
    this.state.cursor.col = col + replacement.length;
    this.state.modified = true;
  }

  private submitGotoLine(input: string): void {
    this.state.promptState = { type: "none" };
    if (!input) return;

    const parts = input.split(",");
    const lineNum = parseInt(parts[0], 10);
    const colNum = parts.length > 1 ? parseInt(parts[1], 10) : 1;

    if (isNaN(lineNum)) {
      this.state.message = "[ Invalid line number ]";
      return;
    }

    const totalLines = this.state.lines.length;
    let targetRow: number;
    if (lineNum < 0) {
      // Negative: count from end
      targetRow = Math.max(0, totalLines + lineNum);
    } else if (lineNum === 0) {
      targetRow = 0;
    } else {
      targetRow = Math.min(lineNum - 1, totalLines - 1);
    }

    this.state.cursor.row = targetRow;
    const lineLen = this.state.lines[targetRow].length;
    if (!isNaN(colNum) && colNum > 0) {
      this.state.cursor.col = Math.min(colNum - 1, lineLen);
    } else {
      this.state.cursor.col = 0;
    }
    this.ensureCursorVisible();
  }

  private submitReadFile(input: string): void {
    this.state.promptState = { type: "none" };
    if (!input) return;

    const absPath = this.fs.resolve(input);
    const result = this.fs.readFile(absPath);
    if (result.error) {
      this.state.message = `[ ${result.error} ]`;
      return;
    }

    const newLines = (result.content ?? "").split("\n");
    const insertAfter = this.state.cursor.row;
    this.state.lines.splice(insertAfter + 1, 0, ...newLines);
    this.state.modified = true;
    this.state.message = `[ Read ${newLines.length} lines ]`;
  }

  private submitWriteOut(input: string): void {
    this.state.promptState = { type: "none" };
    if (!input) return;

    const content = this.state.lines.join("\n");
    const existedBefore = !!this.fs.getNode(input);
    const result = this.fs.writeFile(input, content);
    if (result.fs) {
      this.fs = result.fs;
      this.onSave(result.fs);
      this.state.modified = false;
      this.state.filePath = input;
      this.state.fileName = input.split("/").pop() || input;
      this.fileEvents.push({
        type: existedBefore ? "file_modified" : "file_created",
        detail: input,
      });
      this.state.message = `[ Wrote ${this.state.lines.length} lines ]`;
    } else if (result.error) {
      this.state.message = `[ Error: ${result.error} ]`;
    }
  }

  private justify(): void {
    if (this.state.readOnly) {
      this.state.message = "[ File is read-only ]";
      return;
    }

    const { row } = this.state.cursor;

    // Find paragraph boundaries (consecutive non-empty lines)
    let start = row;
    while (start > 0 && this.state.lines[start - 1].trim() !== "") {
      start--;
    }
    let end = row;
    while (end < this.state.lines.length - 1 && this.state.lines[end + 1].trim() !== "") {
      end++;
    }

    // Collect all words from the paragraph
    const words: string[] = [];
    for (let i = start; i <= end; i++) {
      const lineWords = this.state.lines[i].split(/\s+/).filter(w => w.length > 0);
      words.push(...lineWords);
    }
    if (words.length === 0) return;

    // Reflow words to fit within terminal width
    const maxWidth = this.config.cols;
    const newLines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      if (currentLine.length + 1 + words[i].length <= maxWidth) {
        currentLine += " " + words[i];
      } else {
        newLines.push(currentLine);
        currentLine = words[i];
      }
    }
    newLines.push(currentLine);

    // Replace paragraph lines with reflowed lines
    this.state.lines.splice(start, end - start + 1, ...newLines);
    this.state.cursor.row = start;
    this.state.cursor.col = 0;
    this.state.modified = true;
    this.ensureCursorVisible();
  }

  // === Cursor movement ===

  private moveCursor(dx: number, dy: number): void {
    if (dy !== 0) {
      const newRow = this.state.cursor.row + dy;
      if (newRow >= 0 && newRow < this.state.lines.length) {
        this.state.cursor.row = newRow;
        this.clampCol();
      }
    }
    if (dx !== 0) {
      const newCol = this.state.cursor.col + dx;
      if (newCol < 0) {
        // Wrap to end of previous line
        if (this.state.cursor.row > 0) {
          this.state.cursor.row--;
          this.state.cursor.col = this.currentLine().length;
        }
      } else if (newCol > this.currentLine().length) {
        // Wrap to start of next line
        if (this.state.cursor.row < this.state.lines.length - 1) {
          this.state.cursor.row++;
          this.state.cursor.col = 0;
        }
      } else {
        this.state.cursor.col = newCol;
      }
    }
    this.ensureCursorVisible();
  }

  /** Ctrl+Left — move to the previous word start, crossing line boundaries like real nano. */
  private moveWordLeft(): void {
    const cursor = this.state.cursor;
    if (cursor.col === 0) {
      if (cursor.row > 0) {
        cursor.row--;
        cursor.col = this.currentLine().length;
      }
    } else {
      cursor.col = findPrevWordBoundary(this.currentLine(), cursor.col);
    }
    this.ensureCursorVisible();
  }

  /** Ctrl+Right — move to the next word start, crossing line boundaries like real nano. */
  private moveWordRight(): void {
    const cursor = this.state.cursor;
    if (cursor.col >= this.currentLine().length) {
      if (cursor.row < this.state.lines.length - 1) {
        cursor.row++;
        cursor.col = 0;
      }
    } else {
      cursor.col = findNextWordBoundary(this.currentLine(), cursor.col);
    }
    this.ensureCursorVisible();
  }

  private pageMove(direction: number): void {
    const contentRows = this.config.rows - 4;
    const delta = direction * contentRows;
    const newRow = Math.max(0, Math.min(this.state.lines.length - 1, this.state.cursor.row + delta));
    this.state.cursor.row = newRow;
    this.clampCol();
    this.ensureCursorVisible();
  }

  private clampCol(): void {
    const maxCol = this.currentLine().length;
    if (this.state.cursor.col > maxCol) {
      this.state.cursor.col = maxCol;
    }
  }

  private currentLine(): string {
    return this.state.lines[this.state.cursor.row] || "";
  }

  private ensureCursorVisible(): void {
    const contentRows = this.config.rows - 4;
    if (this.state.cursor.row < this.state.scrollOffset) {
      this.state.scrollOffset = this.state.cursor.row;
    } else if (this.state.cursor.row >= this.state.scrollOffset + contentRows) {
      this.state.scrollOffset = this.state.cursor.row - contentRows + 1;
    }
    this.maxRowReached = Math.max(this.maxRowReached, this.state.cursor.row);
  }

  // === Save / Exit ===

  private save(): void {
    const content = this.state.lines.join("\n");
    const existedBefore = !!this.fs.getNode(this.state.filePath);
    const result = this.fs.writeFile(this.state.filePath, content);
    if (result.fs) {
      this.fs = result.fs;
      this.onSave(result.fs);
      this.state.modified = false;
      this.hasSaved = true;
      this.fileEvents.push({
        type: existedBefore ? "file_modified" : "file_created",
        detail: this.state.filePath,
      });
      this.state.message = `[ Wrote ${this.state.lines.length} lines ]`;
    } else if (result.error) {
      this.state.message = `[ Error: ${result.error} ]`;
    }
  }

  private handleExit(): SessionResult {
    if (this.state.modified) {
      this.state.promptState = { type: "saveExit" };
      this.state.message = "Save modified buffer? (Y/N)";
      this.render();
      return { type: "continue" };
    }
    return this.exitEditor();
  }

  private exitEditor(): SessionResult {
    this.terminal.write("\x1b[?25h\x1b[?1049l"); // Show cursor + exit alt buffer
    const rowOk = !this.trigger || this.maxRowReached >= this.trigger.triggerRow;
    const saveOk = !this.trigger?.requireSave || this.hasSaved;
    const explicitTrigger = this.trigger && rowOk && saveOk ? this.trigger.triggerEvents : [];
    const triggerEvents = [...this.fileEvents, ...explicitTrigger];
    return {
      type: "exit",
      newFs: this.fs,
      triggerEvents: triggerEvents.length > 0 ? triggerEvents : undefined,
    };
  }

  // === Rendering ===

  private render(): void {
    const output = renderEditor(this.state, this.config);
    this.terminal.write(output);
  }
}
