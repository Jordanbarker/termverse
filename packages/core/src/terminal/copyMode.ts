/**
 * tmux/vi-style copy mode for the xterm.js terminal.
 *
 * Drives a keyboard-navigable cursor over the terminal's scrollback buffer using
 * xterm's native selection: before a visual selection is begun the cursor is a
 * single-cell selection; after `v` it extends to a linear (charwise, inclusive)
 * selection between the anchor and the cursor. `y` yanks the selection out via
 * the `onYank` callback (the caller owns clipboard + toast — kept out of the
 * engine), and any exit restores the live view.
 *
 * Coordinates are absolute buffer-line indices (row = baseY + cursorY at entry),
 * matching `Terminal.select(col, row, length)`, whose `length` wraps across rows.
 */

export interface CopyModeBufferLine {
  translateToString(trimRight?: boolean): string;
}

export interface CopyModeBuffer {
  readonly cursorX: number;
  readonly cursorY: number;
  readonly baseY: number;
  readonly viewportY: number;
  readonly length: number;
  getLine(y: number): CopyModeBufferLine | undefined;
}

/** The subset of the xterm `Terminal` API copy mode depends on. */
export interface CopyModeTerminal {
  readonly cols: number;
  readonly rows: number;
  readonly buffer: { readonly active: CopyModeBuffer };
  select(column: number, row: number, length: number): void;
  clearSelection(): void;
  getSelection(): string;
  scrollLines(amount: number): void;
  scrollToBottom(): void;
  write(data: string): void;
  focus(): void;
}

export interface CopyModeCallbacks {
  /** Fired when copy mode is entered (true) or left (false). */
  onChange(active: boolean): void;
  /** Fired with the yanked text when the user presses `y` on a non-empty selection. */
  onYank(text: string): void;
  /** Fired when the user presses `?` to toggle the key-hint overlay. */
  onToggleHelp?(): void;
}

interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  preventDefault(): void;
}

interface Point {
  col: number;
  row: number;
}

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

/** Preferred-column sentinel: "stick to end-of-line" on vertical moves (vi `$`). */
const EOL_COL = Number.MAX_SAFE_INTEGER;

/** One-line key hint shown in the COPY MODE overlay (expanded). */
export const COPY_MODE_HINT =
  " · hjkl move · w/b/e word · 0/^/$ line · g/G top/bot · H/M/L screen · ^u/^d ^b/^f page · v select · y yank · esc exit · ? hide";
/** Collapsed hint shown when the help overlay is toggled off. */
export const COPY_MODE_HINT_HIDDEN = " · ? help";

export class CopyModeController {
  private active = false;
  private cursor: Point = { col: 0, row: 0 };
  private anchor: Point | null = null;
  /**
   * vi-style "preferred column" (curswant): the column the cursor wants to be
   * at. Vertical moves clamp the *displayed* column to the target line's content
   * but keep this value, so the cursor returns to it on longer lines. Reaching
   * end-of-line content (via `$` or by arrowing right onto the last cell) parks
   * it at `EOL_COL` so the cursor sticks to end-of-line as it moves vertically.
   */
  private desiredCol = 0;

  constructor(
    private readonly term: CopyModeTerminal,
    private readonly callbacks: CopyModeCallbacks,
  ) {}

  isActive(): boolean {
    return this.active;
  }

  /** Enter copy mode: anchor the cursor at the live prompt and hide the real cursor. */
  enter(): void {
    if (this.active) return;
    const buf = this.term.buffer.active;
    this.cursor = { col: buf.cursorX, row: buf.baseY + buf.cursorY };
    // Keep the entry cursor at the live shell-cursor position (may sit one cell
    // past trimmed content); clamping only kicks in once the user moves.
    this.desiredCol = buf.cursorX;
    this.anchor = null;
    this.active = true;
    this.term.write(HIDE_CURSOR);
    this.render();
    this.callbacks.onChange(true);
  }

  /**
   * Leave copy mode and return to the live view. `refocus` defaults to true; the
   * tab-switch cleanup path passes false so a hidden terminal never steals focus.
   */
  exit(opts?: { refocus?: boolean }): void {
    if (!this.active) return;
    this.active = false;
    this.anchor = null;
    this.term.clearSelection();
    this.term.write(SHOW_CURSOR);
    this.term.scrollToBottom();
    if (opts?.refocus !== false) this.term.focus();
    this.callbacks.onChange(false);
  }

  /** Handle a keydown while in copy mode. Returns true if the key was consumed. */
  handleKeydown(e: KeyEventLike): boolean {
    if (!this.active) return false;

    const buf = this.term.buffer.active;
    const maxRow = Math.max(0, buf.length - 1);

    e.preventDefault();

    if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
      this.exit();
      return true;
    }

    switch (e.key) {
      case "h":
      case "ArrowLeft":
        if (this.cursor.col > 0) {
          this.cursor.col--;
        } else if (this.cursor.row > 0) {
          // At column 0: wrap to the end of the previous line (real tmux
          // cursor-left). At (0,0) there is nowhere to go — leave the cursor put.
          this.cursor.row--;
          this.cursor.col = this.lastColOfRow(this.cursor.row);
        }
        this.desiredCol = this.cursor.col;
        break;
      case "l":
      case "ArrowRight": {
        const maxCol = this.lastColOfRow(this.cursor.row);
        if (this.cursor.col < maxCol) {
          this.cursor.col++;
          // Landing on the last content cell sticks the preferred column to
          // end-of-line (like `$`), so an immediate vertical move follows each
          // line's end (real tmux); a mid-line stop keeps the literal column.
          this.desiredCol = this.cursor.col >= maxCol ? EOL_COL : this.cursor.col;
        } else if (this.cursor.col === maxCol && this.cursor.row < maxRow) {
          // At end-of-line content: wrap to the start of the next line (real
          // tmux cursor-right). A further `l` from EOL is what wraps; merely
          // landing on EOL (the branch above) does not.
          this.cursor.row++;
          this.cursor.col = 0;
          this.desiredCol = 0;
        } else {
          // Entered past trimmed content, or sitting at the last buffer row's
          // end: clamp to end-of-line without wrapping.
          this.cursor.col = maxCol;
          this.desiredCol = EOL_COL;
        }
        break;
      }
      case "k":
      case "ArrowUp":
        this.cursor.row = Math.max(0, this.cursor.row - 1);
        this.cursor.col = this.clampCol(this.desiredCol, this.cursor.row);
        break;
      case "j":
      case "ArrowDown":
        this.cursor.row = Math.min(maxRow, this.cursor.row + 1);
        this.cursor.col = this.clampCol(this.desiredCol, this.cursor.row);
        break;
      case "0":
      case "Home":
        this.cursor.col = 0;
        this.desiredCol = 0;
        break;
      case "$":
      case "End":
        this.cursor.col = this.lastColOfRow(this.cursor.row);
        // Park the preferred column at the sentinel so the cursor sticks to
        // end-of-line as it moves vertically (vi `$` behavior).
        this.desiredCol = EOL_COL;
        break;
      case "g":
        this.cursor = { col: 0, row: 0 };
        this.desiredCol = 0;
        break;
      case "G":
        this.cursor = { col: 0, row: buf.baseY + buf.cursorY };
        this.desiredCol = 0;
        break;
      case "u":
      case "U":
      case "d":
      case "D": {
        // Ctrl+U / Ctrl+D: half-page scroll (tmux halfpage-up / halfpage-down).
        // Plain u/d are unbound in copy mode — swallow them unchanged.
        if (!e.ctrlKey) return true;
        const half = Math.max(1, Math.floor(this.term.rows / 2));
        this.moveByRows(e.key.toLowerCase() === "u" ? -half : half);
        break;
      }
      case "b":
      case "B":
        // Ctrl+B: full page up (tmux page-up). Plain b falls through to the
        // word-motion handler below.
        if (e.ctrlKey) {
          this.moveByRows(-this.term.rows);
          break;
        }
        this.wordBack();
        break;
      case "f":
      case "F":
        // Ctrl+F: full page down (tmux page-down). Plain f/F is find-char in vi,
        // which we don't implement — swallow it.
        if (!e.ctrlKey) return true;
        this.moveByRows(this.term.rows);
        break;
      case "PageUp":
        this.moveByRows(-this.term.rows);
        break;
      case "PageDown":
        this.moveByRows(this.term.rows);
        break;
      case "^":
        this.cursor.col = this.desiredCol = this.firstNonBlankColOfRow(this.cursor.row);
        break;
      case "H":
        // Top of the visible screen.
        this.cursor.row = Math.min(maxRow, buf.viewportY);
        this.cursor.col = this.clampCol(this.desiredCol, this.cursor.row);
        break;
      case "M":
        // Middle of the visible screen.
        this.cursor.row = Math.min(maxRow, buf.viewportY + Math.floor((this.term.rows - 1) / 2));
        this.cursor.col = this.clampCol(this.desiredCol, this.cursor.row);
        break;
      case "L":
        // Bottom of the visible screen.
        this.cursor.row = Math.min(maxRow, buf.viewportY + this.term.rows - 1);
        this.cursor.col = this.clampCol(this.desiredCol, this.cursor.row);
        break;
      case "w":
        this.wordForward();
        break;
      case "e":
        this.wordEnd();
        break;
      case "v":
        // Toggle the visual selection anchor on/off at the current cursor.
        this.anchor = this.anchor ? null : { ...this.cursor };
        break;
      case "y":
      case "Enter": {
        const text = this.term.getSelection();
        this.exit();
        if (text) this.callbacks.onYank(text);
        return true;
      }
      case "q":
      case "Escape":
        this.exit();
        return true;
      case "?":
        this.callbacks.onToggleHelp?.();
        return true;
      default:
        // Unrecognized key — still swallowed so nothing leaks to the shell.
        return true;
    }

    this.ensureVisible();
    this.render();
    return true;
  }

  /** Column of the last non-blank cell on a row (0 when the row is empty). */
  private lastColOfRow(row: number): number {
    const line = this.term.buffer.active.getLine(row);
    if (!line) return 0;
    return Math.max(0, line.translateToString(true).length - 1);
  }

  /** Clamp a column to a row's last content column (0 for empty rows). */
  private clampCol(col: number, row: number): number {
    return Math.min(col, this.lastColOfRow(row));
  }

  /** Column of the first non-blank cell on a row (0 when blank/empty). */
  private firstNonBlankColOfRow(row: number): number {
    const line = this.term.buffer.active.getLine(row);
    if (!line) return 0;
    const i = line.translateToString(false).search(/\S/);
    return i < 0 ? 0 : i;
  }

  /** Move the cursor by delta rows (clamped) and scroll the viewport to match. */
  private moveByRows(delta: number): void {
    const maxRow = Math.max(0, this.term.buffer.active.length - 1);
    const prevRow = this.cursor.row;
    this.cursor.row = Math.min(maxRow, Math.max(0, prevRow + delta));
    this.cursor.col = this.clampCol(this.desiredCol, this.cursor.row);
    // Scroll the viewport with the cursor so it keeps its on-screen row;
    // ensureVisible() (called by the caller) corrects at the buffer edges.
    this.term.scrollLines(this.cursor.row - prevRow);
  }

  /**
   * Word motions use tmux's default word-separator semantics: separators are
   * whitespace, so a "word" is a maximal run of non-whitespace (punctuation
   * included). Motions wrap across lines and clamp at the buffer ends.
   */
  private isWordChar(p: Point): boolean {
    const line = this.term.buffer.active.getLine(p.row);
    const ch = line?.translateToString(false)[p.col];
    return ch !== undefined && ch !== " " && ch !== "\t";
  }

  /** Next cell (line-wrapping), or null at the end of the buffer. */
  private nextCell(p: Point): Point | null {
    const maxRow = Math.max(0, this.term.buffer.active.length - 1);
    if (p.col < this.lastColOfRow(p.row)) return { col: p.col + 1, row: p.row };
    if (p.row < maxRow) return { col: 0, row: p.row + 1 };
    return null;
  }

  /** Previous cell (line-wrapping), or null at the start of the buffer. */
  private prevCell(p: Point): Point | null {
    if (p.col > 0) return { col: p.col - 1, row: p.row };
    if (p.row > 0) {
      const row = p.row - 1;
      return { col: this.lastColOfRow(row), row };
    }
    return null;
  }

  /**
   * vi `w`: to the start of the next word. A line boundary always breaks a word
   * (the end of one line and start of the next are never the same word), so the
   * skip loops stop when the row changes.
   */
  private wordForward(): void {
    let p: Point = this.cursor;
    // Skip to the end of the current word within this row.
    let n = this.nextCell(p);
    while (n && this.isWordChar(p) && n.row === p.row && this.isWordChar(n)) {
      p = n;
      n = this.nextCell(p);
    }
    // Step off it, then skip whitespace / line gaps to the next word start.
    let q = n;
    while (q && !this.isWordChar(q)) q = this.nextCell(q);
    if (q) this.setCursor(q);
  }

  /** vi `e`: to the end of the next word. */
  private wordEnd(): void {
    let p = this.nextCell(this.cursor);
    while (p && !this.isWordChar(p)) p = this.nextCell(p);
    // Advance to the last non-blank of this word (within its row).
    while (p) {
      const n = this.nextCell(p);
      if (!n || n.row !== p.row || !this.isWordChar(n)) break;
      p = n;
    }
    if (p) this.setCursor(p);
  }

  /** vi `b`: to the start of the previous word. */
  private wordBack(): void {
    let p = this.prevCell(this.cursor);
    while (p && !this.isWordChar(p)) p = this.prevCell(p);
    // Back up to the first non-blank of this word (within its row).
    while (p) {
      const pr = this.prevCell(p);
      if (!pr || pr.row !== p.row || !this.isWordChar(pr)) break;
      p = pr;
    }
    if (p) this.setCursor(p);
  }

  /** Set the cursor to a resolved point and sync the preferred column. */
  private setCursor(p: Point): void {
    this.cursor = { ...p };
    this.desiredCol = p.col;
  }

  /** Scroll the viewport so the cursor row stays visible. */
  private ensureVisible(): void {
    const buf = this.term.buffer.active;
    const top = buf.viewportY;
    const bottom = top + this.term.rows - 1;
    if (this.cursor.row < top) {
      this.term.scrollLines(this.cursor.row - top);
    } else if (this.cursor.row > bottom) {
      this.term.scrollLines(this.cursor.row - bottom);
    }
  }

  /** Paint the cursor (1 cell) or the anchor→cursor selection (inclusive). */
  private render(): void {
    const cols = this.term.cols;
    if (!this.anchor) {
      this.term.select(this.cursor.col, this.cursor.row, 1);
      return;
    }
    const a = this.anchor;
    const b = this.cursor;
    const [start, end] = a.row * cols + a.col <= b.row * cols + b.col ? [a, b] : [b, a];
    const length = (end.row - start.row) * cols + (end.col - start.col) + 1;
    this.term.select(start.col, start.row, length);
  }
}
