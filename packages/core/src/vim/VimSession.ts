import { Terminal } from "@xterm/xterm";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { basename } from "@tt/core/lib/pathUtils";
import { GameEvent } from "@tt/core";
import { ISession, SessionResult } from "../session/types";
import { EditorTrigger, buildEditorExitResult } from "../editor/EditorSession";
import { CursorPosition, EditorConfig } from "../editor/types";
import { CmdlineState, STICKY_EOL, UndoSnapshot, VimState } from "./types";
import { VimKey, decodeKeys } from "./keys";
import { Motion, MotionKey, applyMotion, charClass, firstNonBlank } from "./motions";
import { EMPTY_PENDING, NormalCommand, Operator, stepNormal } from "./normal";
import { EMPTY_VISUAL_PENDING, orderedRange, stepVisual } from "./visual";
import {
  changeLinewise,
  deleteCharwise,
  deleteChars,
  deleteLinewise,
  openLine,
  putRegister,
  replaceChars,
  yankCharwise,
  yankLinewise,
} from "./edits";
import { searchBuffer } from "./search";
import { parseExCommand } from "./exCommands";
import { renderVim } from "./render";

const MAX_UNDO = 100;
const E45 = "E45: 'readonly' option is set (add ! to override)";

/** Compare two line buffers cheaply: untouched lines are shared, so match by reference. */
function sameLines(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class VimSession implements ISession {
  private state: VimState;
  private config: EditorConfig;
  private fs: VirtualFS;
  private terminal: Terminal;
  private onSave: (newFs: VirtualFS) => void;
  private trigger?: EditorTrigger;
  private maxRowReached = 0;
  private hasSaved = false;
  private fileEvents: GameEvent[] = [];
  /** Buffer content at the last save of filePath; `modified` is derived from it. */
  private lastSavedText: string;

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
    this.lastSavedText = content;

    const fileName = basename(filePath);
    const lines = content.split("\n");
    if (lines.length === 0) lines.push("");

    this.config = { rows: terminal.rows, cols: terminal.cols };

    const isNewFile = !fs.getNode(filePath);
    const message = isNewFile
      ? `"${fileName}" [New File]`
      : `"${fileName}" ${lines.length}L, ${content.length}B${readOnly ? " [readonly]" : ""}`;

    this.state = {
      lines,
      cursor: { row: 0, col: 0 },
      desiredCol: 0,
      scrollOffset: 0,
      mode: "normal",
      pending: EMPTY_PENDING,
      visualPending: EMPTY_VISUAL_PENDING,
      visualAnchor: null,
      register: null,
      undoStack: [],
      redoStack: [],
      cmdline: null,
      lastSearch: null,
      filePath,
      fileName,
      readOnly,
      modified: false,
      message,
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
    this.terminal.write("\x1b[?1049h");
    this.render();
  }

  /** Process raw xterm input, feeding decoded keys one at a time (mode can change mid-chunk). */
  handleInput(data: string): SessionResult {
    const keys = decodeKeys(data);
    for (const key of keys) {
      const result = this.handleKey(key);
      if (result && result.type === "exit") return result;
    }
    this.render();
    return { type: "continue" };
  }

  private handleKey(key: VimKey): SessionResult | null {
    // An open command line (: / ?) captures keys regardless of the underlying
    // mode, so it is the single source of truth; there is no separate mode.
    if (this.state.cmdline) return this.handleCommandKey(this.state.cmdline, key);
    switch (this.state.mode) {
      case "insert":
        this.handleInsertKey(key);
        return null;
      case "visual":
      case "visual-line":
        this.handleVisualKey(key);
        return null;
      default:
        this.handleNormalKey(key);
        return null;
    }
  }

  // === Normal mode ===

  private handleNormalKey(key: VimKey): void {
    this.state.message = null;
    if (key.type === "esc") {
      this.state.pending = EMPTY_PENDING;
      return;
    }
    if (key.type === "ctrl") {
      if (key.code === 18) this.redo(); // Ctrl-R
      return;
    }
    const ch = this.keyToChar(key);
    if (ch === null) return;
    const { pending, command } = stepNormal(this.state.pending, ch);
    this.state.pending = pending;
    if (command) this.runNormalCommand(command);
  }

  /** Translate special keys to their normal-mode equivalents (vim's default mappings). */
  private keyToChar(key: VimKey): string | null {
    switch (key.type) {
      case "char":
        return key.char;
      case "left":
        return "h";
      case "right":
        return "l";
      case "up":
        return "k";
      case "down":
      case "enter":
        return "j";
      case "backspace":
        return "h";
      case "home":
        return "0";
      case "end":
        return "$";
      case "delete":
        return "x";
      default:
        return null;
    }
  }

  private runNormalCommand(cmd: NormalCommand): void {
    const st = this.state;
    switch (cmd.kind) {
      case "move":
        this.moveTo(cmd.motion, cmd.count, cmd.char);
        break;
      case "operate":
        this.applyOperator(cmd.op, cmd.motion, cmd.count, cmd.char);
        break;
      case "deleteChar": {
        if (this.blockIfReadOnly()) break;
        const r = deleteChars(st.lines, st.cursor, cmd.count);
        if (!r) break;
        this.pushUndo();
        st.lines = r.lines;
        st.cursor = r.cursor;
        st.register = r.register;
        this.afterBufferChange();
        break;
      }
      case "replaceChar": {
        if (this.blockIfReadOnly()) break;
        const r = replaceChars(st.lines, st.cursor, cmd.char, cmd.count);
        if (!r) break;
        this.pushUndo();
        st.lines = r.lines;
        st.cursor = r.cursor;
        this.afterBufferChange();
        break;
      }
      case "put": {
        if (this.blockIfReadOnly()) break;
        if (!st.register) break;
        this.pushUndo();
        const r = putRegister(st.lines, st.cursor, st.register, cmd.before, cmd.count);
        st.lines = r.lines;
        st.cursor = r.cursor;
        this.afterBufferChange();
        break;
      }
      case "openLine": {
        if (this.blockIfReadOnly()) break;
        this.pushUndo();
        const r = openLine(st.lines, st.cursor, cmd.above);
        st.lines = r.lines;
        st.cursor = r.cursor;
        this.afterBufferChange();
        this.enterInsertMode(false);
        break;
      }
      case "insert": {
        if (this.blockIfReadOnly()) break;
        this.enterInsertMode(true);
        const line = st.lines[st.cursor.row];
        if (cmd.variant === "a") st.cursor.col = Math.min(st.cursor.col + 1, line.length);
        else if (cmd.variant === "A") st.cursor.col = line.length;
        else if (cmd.variant === "I") st.cursor.col = firstNonBlank(line);
        st.desiredCol = st.cursor.col;
        break;
      }
      case "visual":
        st.visualAnchor = { ...st.cursor };
        st.visualPending = EMPTY_VISUAL_PENDING;
        st.mode = cmd.linewise ? "visual-line" : "visual";
        break;
      case "undo":
        this.undo();
        break;
      case "redo":
        this.redo();
        break;
      case "cmdline":
        st.cmdline = { prefix: cmd.prefix, input: "" };
        break;
      case "searchNext": {
        if (!st.lastSearch) {
          st.message = "E35: No previous regular expression";
          break;
        }
        const backward = cmd.reverse ? !st.lastSearch.backward : st.lastSearch.backward;
        this.doSearch(st.lastSearch.term, backward);
        break;
      }
    }
  }

  // === Motions ===

  private moveTo(motionKey: MotionKey, count: number | null, char?: string): void {
    const st = this.state;
    const motion: Motion = { key: motionKey, count, char };
    const res = applyMotion(st.lines, st.cursor, motion);
    if (!res) return;
    const { row } = res.target;
    let col = res.target.col;
    if (motionKey === "j" || motionKey === "k") {
      col = this.clampToLine(row, st.desiredCol);
    } else {
      col = this.clampToLine(row, col);
      st.desiredCol = motionKey === "$" ? STICKY_EOL : col;
    }
    st.cursor = { row, col };
    this.ensureCursorVisible();
  }

  private clampToLine(row: number, col: number): number {
    const len = this.state.lines[row].length;
    const max = this.state.mode === "insert" ? len : Math.max(0, len - 1);
    return Math.max(0, Math.min(col, max));
  }

  // === Operators ===

  private applyOperator(
    op: Operator,
    motionKey: MotionKey | "line",
    count: number | null,
    char?: string
  ): void {
    const st = this.state;
    if (op !== "y" && this.blockIfReadOnly()) return;

    let linewise: boolean;
    let startRow = 0;
    let endRow = 0;
    let start: CursorPosition = st.cursor;
    let endEx: CursorPosition = st.cursor;

    if (motionKey === "line") {
      linewise = true;
      startRow = st.cursor.row;
      endRow = Math.min(st.lines.length - 1, st.cursor.row + (count ?? 1) - 1);
    } else {
      let effKey = motionKey;
      // Vim special case: cw on a non-blank behaves like ce.
      if (op === "c" && motionKey === "w") {
        const line = st.lines[st.cursor.row];
        if (st.cursor.col < line.length && charClass(line[st.cursor.col]) !== 0) effKey = "e";
      }
      const motion: Motion = { key: effKey, count, char };
      const res = applyMotion(st.lines, st.cursor, motion, { forOperator: true });
      if (!res) return;
      linewise = res.wise === "linewise";
      if (linewise) {
        startRow = Math.min(st.cursor.row, res.target.row);
        endRow = Math.max(st.cursor.row, res.target.row);
      } else {
        const ordered = orderedRange(st.cursor, res.target);
        start = ordered.start;
        const endCol = res.wise === "inclusive" ? ordered.end.col + 1 : ordered.end.col;
        endEx = { row: ordered.end.row, col: Math.min(endCol, st.lines[ordered.end.row].length) };
        if (start.row === endEx.row && start.col >= endEx.col) return;
      }
    }

    if (op === "y") {
      if (linewise) {
        st.register = yankLinewise(st.lines, startRow, endRow);
        const n = endRow - startRow + 1;
        if (n > 1) st.message = `${n} lines yanked`;
      } else {
        st.register = yankCharwise(st.lines, start, endEx);
        st.cursor = { row: start.row, col: this.clampToLine(start.row, start.col) };
        st.desiredCol = st.cursor.col;
        this.ensureCursorVisible();
      }
      return;
    }

    this.pushUndo();
    this.applyDeleteChange(op, linewise, { startRow, endRow, start, endEx });
  }

  /**
   * Delete or change a resolved range: mutate the buffer + register, position the
   * cursor, and (for change) enter insert mode. Shared by the normal-motion
   * operator and the visual operator; callers own undo and visual-mode exit.
   */
  private applyDeleteChange(
    op: "d" | "c",
    linewise: boolean,
    range: { startRow: number; endRow: number; start: CursorPosition; endEx: CursorPosition }
  ): void {
    const st = this.state;
    const r =
      op === "d"
        ? linewise
          ? deleteLinewise(st.lines, range.startRow, range.endRow)
          : deleteCharwise(st.lines, range.start, range.endEx)
        : linewise
          ? changeLinewise(st.lines, range.startRow, range.endRow)
          : deleteCharwise(st.lines, range.start, range.endEx);
    st.lines = r.lines;
    st.register = r.register;
    // After a delete the cursor can land past EOL, so clamp; a change leaves it
    // where the insert begins (insert-mode clamp permits the extra column).
    st.cursor = op === "d" ? { row: r.cursor.row, col: this.clampToLine(r.cursor.row, r.cursor.col) } : r.cursor;
    this.afterBufferChange();
    if (op === "c") this.enterInsertMode(false);
  }

  // === Undo / redo ===

  private pushUndo(): void {
    this.state.undoStack.push({ lines: this.state.lines.slice(), cursor: { ...this.state.cursor } });
    if (this.state.undoStack.length > MAX_UNDO) this.state.undoStack.shift();
    this.state.redoStack = [];
  }

  private undo(): void {
    const snap = this.state.undoStack.pop();
    if (!snap) {
      this.state.message = "Already at oldest change";
      return;
    }
    this.state.redoStack.push({ lines: this.state.lines.slice(), cursor: { ...this.state.cursor } });
    this.restoreSnapshot(snap);
  }

  private redo(): void {
    const snap = this.state.redoStack.pop();
    if (!snap) {
      this.state.message = "Already at newest change";
      return;
    }
    this.state.undoStack.push({ lines: this.state.lines.slice(), cursor: { ...this.state.cursor } });
    this.restoreSnapshot(snap);
  }

  private restoreSnapshot(snap: UndoSnapshot): void {
    this.state.lines = snap.lines.slice();
    const row = Math.min(snap.cursor.row, this.state.lines.length - 1);
    this.state.cursor = { row, col: this.clampToLine(row, snap.cursor.col) };
    this.state.desiredCol = this.state.cursor.col;
    this.recomputeModified();
    this.ensureCursorVisible();
  }

  // === Insert mode ===

  private enterInsertMode(pushSnapshot: boolean): void {
    if (pushSnapshot) this.pushUndo();
    this.state.mode = "insert";
  }

  private handleInsertKey(key: VimKey): void {
    const st = this.state;
    st.message = null;
    switch (key.type) {
      case "esc": {
        st.mode = "normal";
        st.cursor.col = this.clampToLine(st.cursor.row, Math.max(0, st.cursor.col - 1));
        st.desiredCol = st.cursor.col;
        // A whole insert session is one undo unit; drop the entry if nothing changed.
        const top = st.undoStack[st.undoStack.length - 1];
        if (top && sameLines(top.lines, st.lines)) st.undoStack.pop();
        return;
      }
      case "enter": {
        const { row, col } = st.cursor;
        const line = st.lines[row];
        st.lines[row] = line.slice(0, col);
        st.lines.splice(row + 1, 0, line.slice(col));
        st.cursor = { row: row + 1, col: 0 };
        this.afterBufferChange();
        return;
      }
      case "backspace": {
        const { row, col } = st.cursor;
        if (col > 0) {
          const line = st.lines[row];
          st.lines[row] = line.slice(0, col - 1) + line.slice(col);
          st.cursor.col--;
        } else if (row > 0) {
          const prevLen = st.lines[row - 1].length;
          st.lines[row - 1] += st.lines[row];
          st.lines.splice(row, 1);
          st.cursor = { row: row - 1, col: prevLen };
        } else {
          return;
        }
        this.afterBufferChange();
        return;
      }
      case "delete": {
        const { row, col } = st.cursor;
        const line = st.lines[row];
        if (col < line.length) {
          st.lines[row] = line.slice(0, col) + line.slice(col + 1);
        } else if (row < st.lines.length - 1) {
          st.lines[row] += st.lines[row + 1];
          st.lines.splice(row + 1, 1);
        } else {
          return;
        }
        this.afterBufferChange();
        return;
      }
      case "up":
      case "down":
      case "left":
      case "right": {
        const motion =
          key.type === "up" ? "k" : key.type === "down" ? "j" : key.type === "left" ? "h" : "l";
        this.moveTo(motion, null);
        return;
      }
      case "home":
        st.cursor.col = 0;
        return;
      case "end":
        st.cursor.col = st.lines[st.cursor.row].length;
        return;
      case "char": {
        const { row, col } = st.cursor;
        const line = st.lines[row];
        st.lines[row] = line.slice(0, col) + key.char + line.slice(col);
        st.cursor.col++;
        this.afterBufferChange();
        return;
      }
      default:
        return;
    }
  }

  // === Visual mode ===

  private handleVisualKey(key: VimKey): void {
    const st = this.state;
    st.message = null;
    if (key.type === "esc") {
      this.exitVisual();
      return;
    }
    if (key.type === "ctrl") return;
    const ch = this.keyToChar(key);
    if (ch === null) return;
    const { pending, command } = stepVisual(st.visualPending, ch);
    st.visualPending = pending;
    if (!command) return;
    switch (command.kind) {
      case "move":
        this.moveTo(command.motion, command.count, command.char);
        break;
      case "swapEnds": {
        if (st.visualAnchor) {
          const a = st.visualAnchor;
          st.visualAnchor = { ...st.cursor };
          st.cursor = { row: a.row, col: this.clampToLine(a.row, a.col) };
          st.desiredCol = st.cursor.col;
          this.ensureCursorVisible();
        }
        break;
      }
      case "setWise": {
        const isLine = st.mode === "visual-line";
        if (command.linewise === isLine) this.exitVisual();
        else st.mode = command.linewise ? "visual-line" : "visual";
        break;
      }
      case "exit":
        this.exitVisual();
        break;
      case "operate":
        this.applyVisualOperator(command.op);
        break;
    }
  }

  private exitVisual(): void {
    this.state.visualAnchor = null;
    this.state.visualPending = EMPTY_VISUAL_PENDING;
    this.state.mode = "normal";
  }

  private applyVisualOperator(op: "d" | "y" | "c"): void {
    const st = this.state;
    const anchor = st.visualAnchor;
    if (!anchor) {
      this.exitVisual();
      return;
    }
    if (op !== "y" && this.blockIfReadOnly()) {
      this.exitVisual();
      return;
    }
    const linewise = st.mode === "visual-line";
    const { start, end } = orderedRange(anchor, st.cursor);
    const endEx = { row: end.row, col: end.col + 1 };

    if (op === "y") {
      if (linewise) {
        st.register = yankLinewise(st.lines, start.row, end.row);
        const n = end.row - start.row + 1;
        if (n > 1) st.message = `${n} lines yanked`;
      } else {
        st.register = yankCharwise(st.lines, start, endEx);
      }
      st.cursor = { row: start.row, col: this.clampToLine(start.row, start.col) };
      st.desiredCol = st.cursor.col;
      this.exitVisual();
      this.ensureCursorVisible();
      return;
    }

    this.pushUndo();
    this.exitVisual();
    this.applyDeleteChange(op, linewise, { startRow: start.row, endRow: end.row, start, endEx });
  }

  // === Command-line mode (: / ?) ===

  private handleCommandKey(cl: CmdlineState, key: VimKey): SessionResult | null {
    const st = this.state;
    switch (key.type) {
      case "esc":
        st.cmdline = null;
        return null;
      case "enter":
        return this.submitCmdline();
      case "backspace":
        if (cl.input.length > 0) cl.input = cl.input.slice(0, -1);
        else st.cmdline = null;
        return null;
      case "char":
        cl.input += key.char;
        return null;
      default:
        return null;
    }
  }

  private submitCmdline(): SessionResult | null {
    const st = this.state;
    const cl = st.cmdline;
    st.cmdline = null;
    st.message = null;
    if (!cl) return null;

    if (cl.prefix !== ":") {
      const term = cl.input || st.lastSearch?.term || "";
      if (!term) return null;
      st.lastSearch = { term, backward: cl.prefix === "?" };
      this.doSearch(term, cl.prefix === "?");
      return null;
    }

    const directive = parseExCommand(cl.input);
    switch (directive.kind) {
      case "none":
        return null;
      case "error":
        st.message = directive.message;
        return null;
      case "gotoLine": {
        const row = Math.max(0, Math.min(st.lines.length - 1, directive.line - 1));
        st.cursor = { row, col: firstNonBlank(st.lines[row]) };
        st.desiredCol = st.cursor.col;
        this.ensureCursorVisible();
        return null;
      }
      case "quit":
        if (st.modified && !directive.force) {
          st.message = "E37: No write since last change (add ! to override)";
          return null;
        }
        return this.exitSession();
      case "write": {
        if (!directive.onlyIfModified || st.modified) {
          if (st.readOnly) {
            st.message = E45;
            return null;
          }
          if (!this.writeFile(directive.path)) return null;
        }
        if (directive.quit) return this.exitSession();
        return null;
      }
    }
  }

  // === Search ===

  private doSearch(term: string, backward: boolean): void {
    const st = this.state;
    const hit = searchBuffer(st.lines, st.cursor, term, backward);
    if (!hit) {
      st.message = `E486: Pattern not found: ${term}`;
      return;
    }
    if (hit.wrapped) {
      st.message = backward
        ? "search hit TOP, continuing at BOTTOM"
        : "search hit BOTTOM, continuing at TOP";
    }
    st.cursor = { row: hit.pos.row, col: this.clampToLine(hit.pos.row, hit.pos.col) };
    st.desiredCol = st.cursor.col;
    this.ensureCursorVisible();
  }

  // === Save / exit ===

  private writeFile(path?: string): boolean {
    const st = this.state;
    const target = path ? this.fs.resolve(path) : st.filePath;
    const content = st.lines.join("\n");
    const existedBefore = !!this.fs.getNode(target);
    const result = this.fs.writeFile(target, content);
    if (!result.fs) {
      st.message = `E212: Can't open file for writing: ${result.error ?? target}`;
      return false;
    }
    this.fs = result.fs;
    this.onSave(result.fs);
    this.fileEvents.push({
      type: existedBefore ? "file_modified" : "file_created",
      detail: target,
    });
    // Writing elsewhere (:w other) does not reset the buffer's modified state (vim behavior).
    if (target === st.filePath) {
      this.lastSavedText = content;
      this.hasSaved = true;
      this.recomputeModified();
    }
    st.message = `"${path ?? st.fileName}" ${st.lines.length}L, ${content.length}B written`;
    return true;
  }

  private exitSession(): SessionResult {
    this.terminal.write("\x1b[0 q\x1b[?25h\x1b[?1049l"); // Reset cursor shape, show cursor, exit alt buffer
    return buildEditorExitResult(this.fs, this.fileEvents, this.trigger, this.maxRowReached, this.hasSaved);
  }

  // === Shared helpers ===

  private blockIfReadOnly(): boolean {
    if (this.state.readOnly) {
      this.state.message = E45;
      return true;
    }
    return false;
  }

  private afterBufferChange(): void {
    // An edit can only dirty the buffer, so flip the flag in O(1) rather than
    // re-joining the whole buffer on every keystroke. The exact comparison
    // against lastSavedText only runs where the buffer can become clean again:
    // undo/redo (restoreSnapshot) and save (writeFile).
    this.state.modified = true;
    this.state.desiredCol = this.state.cursor.col;
    this.ensureCursorVisible();
  }

  private recomputeModified(): void {
    this.state.modified = this.state.lines.join("\n") !== this.lastSavedText;
  }

  private ensureCursorVisible(): void {
    const contentRows = this.config.rows - 2;
    if (this.state.cursor.row < this.state.scrollOffset) {
      this.state.scrollOffset = this.state.cursor.row;
    } else if (this.state.cursor.row >= this.state.scrollOffset + contentRows) {
      this.state.scrollOffset = this.state.cursor.row - contentRows + 1;
    }
    this.maxRowReached = Math.max(this.maxRowReached, this.state.cursor.row);
  }

  private render(): void {
    this.terminal.write(renderVim(this.state, this.config));
  }
}
