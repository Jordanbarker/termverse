import { describe, it, expect, vi } from "vitest";
import { CopyModeController, CopyModeTerminal } from "../copyMode";

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

interface FakeOptions {
  cols?: number;
  rows?: number;
  cursorX?: number;
  cursorY?: number;
  baseY?: number;
  viewportY?: number;
  length?: number;
  lines?: Record<number, string>;
  selection?: string;
}

/** Minimal in-memory stand-in for the xterm Terminal copy mode drives. */
class FakeTerminal implements CopyModeTerminal {
  cols: number;
  rows: number;
  cursorX: number;
  cursorY: number;
  baseY: number;
  length: number;
  lines: Record<number, string>;
  selection: string;
  viewportY: number;

  selectCalls: Array<[number, number, number]> = [];
  scrollLinesCalls: number[] = [];
  writes: string[] = [];
  clearSelectionCalls = 0;
  scrollToBottomCalls = 0;
  focusCalls = 0;

  constructor(opts: FakeOptions = {}) {
    this.cols = opts.cols ?? 80;
    this.rows = opts.rows ?? 24;
    this.cursorX = opts.cursorX ?? 0;
    this.cursorY = opts.cursorY ?? 0;
    this.baseY = opts.baseY ?? 0;
    this.length = opts.length ?? this.baseY + this.rows;
    this.lines = opts.lines ?? {};
    this.selection = opts.selection ?? "";
    this.viewportY = opts.viewportY ?? this.baseY;
  }

  get buffer() {
    // Snapshot current values on each access (the controller re-reads
    // buffer.active per method call); arrow getLine captures the instance.
    return {
      active: {
        cursorX: this.cursorX,
        cursorY: this.cursorY,
        baseY: this.baseY,
        viewportY: this.viewportY,
        length: this.length,
        getLine: (y: number) => {
          const text = this.lines[y];
          return text === undefined ? undefined : { translateToString: () => text };
        },
      },
    };
  }

  select(column: number, row: number, length: number): void {
    this.selectCalls.push([column, row, length]);
  }
  clearSelection(): void { this.clearSelectionCalls++; }
  getSelection(): string { return this.selection; }
  scrollLines(amount: number): void {
    this.scrollLinesCalls.push(amount);
    this.viewportY += amount;
  }
  scrollToBottom(): void { this.scrollToBottomCalls++; }
  write(data: string): void { this.writes.push(data); }
  focus(): void { this.focusCalls++; }

  lastSelect(): [number, number, number] | undefined {
    return this.selectCalls[this.selectCalls.length - 1];
  }
}

function key(k: string, ctrlKey = false) {
  return { key: k, ctrlKey, preventDefault: vi.fn() };
}

function setup(opts: FakeOptions = {}) {
  const term = new FakeTerminal(opts);
  const onChange = vi.fn();
  const onYank = vi.fn();
  const onToggleHelp = vi.fn();
  const controller = new CopyModeController(term, { onChange, onYank, onToggleHelp });
  return { term, onChange, onYank, onToggleHelp, controller };
}

describe("CopyModeController", () => {
  it("enters at the live prompt, hides the cursor, and renders a 1-cell selection", () => {
    const { term, controller, onChange } = setup({ cursorX: 5, cursorY: 2, baseY: 10, length: 34 });
    controller.enter();

    expect(controller.isActive()).toBe(true);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(term.writes).toContain(HIDE_CURSOR);
    // row = baseY + cursorY = 12
    expect(term.lastSelect()).toEqual([5, 12, 1]);
  });

  it("ignores keys when not active", () => {
    const { controller } = setup();
    expect(controller.handleKeydown(key("h"))).toBe(false);
  });

  it("clamps the cursor at the buffer edges", () => {
    const full = "0123456789";
    const { term, controller } = setup({
      cols: 10, rows: 5, cursorX: 0, cursorY: 0, baseY: 0, length: 5,
      lines: { 0: full, 1: full, 2: full, 3: full, 4: full },
    });
    controller.enter();

    // Down stops at the last buffer row (length - 1).
    for (let i = 0; i < 20; i++) controller.handleKeydown(key("j"));
    expect(term.lastSelect()).toEqual([0, 4, 1]);

    // `l` at the last row's end is a no-op (nowhere to wrap), clamped to content.
    for (let i = 0; i < 20; i++) controller.handleKeydown(key("l"));
    expect(term.lastSelect()).toEqual([9, 4, 1]); // last content col (== cols - 1)

    // Up stops at row 0; `h` at (0,0) is a no-op (nowhere to wrap).
    for (let i = 0; i < 20; i++) controller.handleKeydown(key("k"));
    controller.handleKeydown(key("0"));
    for (let i = 0; i < 20; i++) controller.handleKeydown(key("h"));
    expect(term.lastSelect()).toEqual([0, 0, 1]);
  });

  it("wraps h/ArrowLeft at column 0 to the end of the previous line", () => {
    // Cursor on the empty row below "text test" — the reported scenario.
    const { term, controller } = setup({
      cols: 80, rows: 5, cursorX: 0, cursorY: 1, baseY: 0, length: 3,
      lines: { 0: "text test", 2: "another line" },
    });
    controller.enter(); // cursor (0, 1) on the empty middle row
    controller.handleKeydown(key("ArrowLeft"));
    expect(term.lastSelect()).toEqual([8, 0, 1]); // "text test" len 9 -> last col 8

    // From a non-empty line at column 0, `h` also wraps up to the line above.
    const second = setup({
      cols: 80, rows: 5, cursorX: 0, cursorY: 2, baseY: 0, length: 3,
      lines: { 1: "the quick brown fox", 2: "lazy" },
    });
    second.controller.enter(); // cursor (0, 2)
    second.controller.handleKeydown(key("h"));
    expect(second.term.lastSelect()).toEqual([18, 1, 1]); // len 19 -> last col 18
  });

  it("wraps l/ArrowRight at end-of-line to the start of the next line", () => {
    const { term, controller } = setup({
      cols: 80, rows: 5, cursorX: 0, cursorY: 0, baseY: 0, length: 3,
      lines: { 0: "abc", 1: "next line" },
    });
    controller.enter();
    for (let i = 0; i < 2; i++) controller.handleKeydown(key("l"));
    expect(term.lastSelect()).toEqual([2, 0, 1]); // landed on EOL of "abc" (col 2)
    controller.handleKeydown(key("ArrowRight")); // a further press wraps down
    expect(term.lastSelect()).toEqual([0, 1, 1]); // start of "next line"
  });

  it("treats arrow keys as hjkl", () => {
    const { term, controller } = setup({
      cols: 10, rows: 5, cursorX: 4, cursorY: 2, baseY: 0, length: 5,
      lines: { 1: "abcde" }, // row the ArrowUp lands on (len 5 -> last col 4)
    });
    controller.enter();
    controller.handleKeydown(key("ArrowUp"));
    controller.handleKeydown(key("ArrowLeft"));
    expect(term.lastSelect()).toEqual([3, 1, 1]);
  });

  it("computes an inclusive, line-wrapping selection from the anchor", () => {
    // anchor (5,0), cursor (2,1), cols 10 -> select(5, 0, 8)
    const { term, controller } = setup({
      cols: 10, rows: 5, cursorX: 5, cursorY: 0, baseY: 0, length: 5,
      lines: { 1: "0123456789" }, // long enough for `j` to keep col 5
    });
    controller.enter();
    controller.handleKeydown(key("v")); // anchor at (5,0)
    controller.handleKeydown(key("j")); // -> (5,1)
    controller.handleKeydown(key("h")); // (4,1)
    controller.handleKeydown(key("h")); // (3,1)
    controller.handleKeydown(key("h")); // (2,1)
    expect(term.lastSelect()).toEqual([5, 0, 8]);
  });

  it("orders endpoints when the cursor is before the anchor", () => {
    const { term, controller } = setup({ cols: 10, rows: 5, cursorX: 5, cursorY: 0, baseY: 0, length: 5 });
    controller.enter();
    controller.handleKeydown(key("v")); // anchor (5,0)
    controller.handleKeydown(key("h")); // cursor (4,0) — before anchor
    controller.handleKeydown(key("h")); // (3,0)
    // start (3,0), end (5,0), length = 3
    expect(term.lastSelect()).toEqual([3, 0, 3]);
  });

  it("toggling v off returns to a 1-cell cursor", () => {
    const { term, controller } = setup({
      cols: 10, rows: 5, cursorX: 5, cursorY: 0, length: 5,
      lines: { 0: "0123456789" }, // long enough for `l` to advance to col 6
    });
    controller.enter();
    controller.handleKeydown(key("v"));
    controller.handleKeydown(key("l"));
    controller.handleKeydown(key("v")); // toggle off
    expect(term.lastSelect()).toEqual([6, 0, 1]);
  });

  it("supports 0/$ line jumps", () => {
    const { term, controller } = setup({ cols: 80, rows: 5, cursorX: 3, cursorY: 0, baseY: 0, length: 5, lines: { 0: "hello world" } });
    controller.enter();
    controller.handleKeydown(key("$"));
    expect(term.lastSelect()).toEqual([10, 0, 1]); // "hello world" length 11 -> col 10
    controller.handleKeydown(key("0"));
    expect(term.lastSelect()).toEqual([0, 0, 1]);
  });

  it("supports g/G scrollback jumps", () => {
    const { term, controller } = setup({ cols: 80, rows: 5, cursorX: 0, cursorY: 3, baseY: 0, length: 5 });
    controller.enter(); // cursor row = 3
    controller.handleKeydown(key("g"));
    expect(term.lastSelect()).toEqual([0, 0, 1]);
    controller.handleKeydown(key("G"));
    expect(term.lastSelect()).toEqual([0, 3, 1]); // back to baseY + cursorY
  });

  it("scrolls a half page up/down on Ctrl+U / Ctrl+D", () => {
    const { term, controller } = setup({
      cols: 80, rows: 10, cursorX: 0, cursorY: 9, baseY: 20, viewportY: 20, length: 60,
    });
    controller.enter(); // cursor row = baseY + cursorY = 29
    controller.handleKeydown(key("u", true)); // half = 5 -> row 24
    expect(term.lastSelect()).toEqual([0, 24, 1]);
    expect(term.scrollLinesCalls).toContain(-5); // viewport follows the cursor
    controller.handleKeydown(key("d", true)); // -> row 29
    expect(term.lastSelect()).toEqual([0, 29, 1]);
    expect(term.scrollLinesCalls).toContain(5);
  });

  it("clamps half-page scroll at the top of the buffer", () => {
    const { term, controller } = setup({
      cols: 80, rows: 10, cursorX: 0, cursorY: 2, baseY: 0, viewportY: 0, length: 60,
    });
    controller.enter(); // cursor row 2
    controller.handleKeydown(key("u", true)); // half = 5, max(0, 2 - 5) = 0
    expect(term.lastSelect()).toEqual([0, 0, 1]);
  });

  it("ignores u/d without Ctrl (they are unbound in copy mode)", () => {
    const { term, controller } = setup({
      cols: 80, rows: 10, cursorX: 0, cursorY: 5, baseY: 0, length: 60,
    });
    controller.enter();
    const before = term.lastSelect();
    controller.handleKeydown(key("d")); // no ctrl -> no-op
    controller.handleKeydown(key("u")); // no ctrl -> no-op
    expect(term.lastSelect()).toEqual(before);
    expect(term.scrollLinesCalls).toEqual([]);
  });

  it("scrolls a full page up/down on Ctrl+B / Ctrl+F and PageUp/PageDown", () => {
    const { term, controller } = setup({
      cols: 80, rows: 10, cursorX: 0, cursorY: 9, baseY: 40, viewportY: 40, length: 100,
    });
    controller.enter(); // cursor row = 49
    controller.handleKeydown(key("b", true)); // full page = 10 -> row 39
    expect(term.lastSelect()).toEqual([0, 39, 1]);
    expect(term.scrollLinesCalls).toContain(-10);
    controller.handleKeydown(key("f", true)); // -> row 49
    expect(term.lastSelect()).toEqual([0, 49, 1]);
    expect(term.scrollLinesCalls).toContain(10);
    controller.handleKeydown(key("PageUp")); // -> row 39
    expect(term.lastSelect()).toEqual([0, 39, 1]);
    controller.handleKeydown(key("PageDown")); // -> row 49
    expect(term.lastSelect()).toEqual([0, 49, 1]);
  });

  it("treats plain b as a word motion, not a page (only Ctrl+B pages)", () => {
    const { term, controller } = setup({
      cols: 80, rows: 5, cursorX: 8, cursorY: 0, baseY: 0, length: 3,
      lines: { 0: "foo bar baz" },
    });
    controller.enter(); // cursor at 'b' of "baz" (col 8)
    controller.handleKeydown(key("b")); // no ctrl -> back one word to "bar" (col 4)
    expect(term.lastSelect()).toEqual([4, 0, 1]);
    expect(term.scrollLinesCalls).toEqual([]); // did not page
  });

  it("jumps to the first non-blank column on ^", () => {
    const { term, controller } = setup({
      cols: 80, rows: 5, cursorX: 10, cursorY: 0, baseY: 0, length: 1,
      lines: { 0: "    hello" }, // first non-blank at col 4
    });
    controller.enter();
    controller.handleKeydown(key("^"));
    expect(term.lastSelect()).toEqual([4, 0, 1]);
    controller.handleKeydown(key("0")); // 0 still goes to absolute col 0
    expect(term.lastSelect()).toEqual([0, 0, 1]);
  });

  it("jumps to top / middle / bottom of the visible screen on H / M / L", () => {
    const { term, controller } = setup({
      cols: 80, rows: 10, cursorX: 0, cursorY: 5, baseY: 20, viewportY: 20, length: 60,
    });
    controller.enter();
    controller.handleKeydown(key("H")); // top -> viewportY = 20
    expect(term.lastSelect()).toEqual([0, 20, 1]);
    controller.handleKeydown(key("M")); // middle -> 20 + floor(9/2) = 24
    expect(term.lastSelect()).toEqual([0, 24, 1]);
    controller.handleKeydown(key("L")); // bottom -> 20 + 10 - 1 = 29
    expect(term.lastSelect()).toEqual([0, 29, 1]);
  });

  it("hops words with w / b / e (whitespace-delimited, wrapping lines)", () => {
    const mk = () => setup({
      cols: 80, rows: 5, cursorX: 0, cursorY: 0, baseY: 0, length: 3,
      lines: { 0: "foo.bar baz", 1: "next line", 2: "" },
    });

    // w: start of next word; punctuation is part of the word (tmux semantics).
    const fwd = mk();
    fwd.controller.enter(); // (0,0) on "foo.bar"
    fwd.controller.handleKeydown(key("w"));
    expect(fwd.term.lastSelect()).toEqual([8, 0, 1]); // "baz"
    fwd.controller.handleKeydown(key("w")); // wraps to next line -> "next"
    expect(fwd.term.lastSelect()).toEqual([0, 1, 1]);

    // e: end of next word.
    const end = mk();
    end.controller.enter(); // (0,0)
    end.controller.handleKeydown(key("e"));
    expect(end.term.lastSelect()).toEqual([6, 0, 1]); // last char of "foo.bar"

    // b: start of previous word, wrapping back across the line boundary.
    const back = mk();
    back.controller.enter();
    back.controller.handleKeydown(key("j")); // -> row 1 "next line"
    back.controller.handleKeydown(key("b")); // back to "baz" on row 0
    expect(back.term.lastSelect()).toEqual([8, 0, 1]);
  });

  it("fires onToggleHelp on `?` and consumes the key without exiting", () => {
    const { controller, onToggleHelp } = setup();
    controller.enter();
    expect(controller.handleKeydown(key("?"))).toBe(true);
    expect(onToggleHelp).toHaveBeenCalledTimes(1);
    expect(controller.isActive()).toBe(true);
  });

  it("clamps onto short lines and restores the preferred column on longer ones", () => {
    const { term, controller } = setup({
      cols: 80, rows: 5, cursorX: 10, cursorY: 0, baseY: 0, length: 3,
      lines: { 0: "the quick brown fox", 1: "hi", 2: "the lazy dog jumps" },
    });
    controller.enter(); // cursor (10, 0), preferred col 10
    controller.handleKeydown(key("j")); // row 1 "hi" (last col 1) -> clamps the column
    expect(term.lastSelect()).toEqual([1, 1, 1]);
    controller.handleKeydown(key("j")); // row 2 is long -> preferred col 10 restored
    expect(term.lastSelect()).toEqual([10, 2, 1]);
  });

  it("keeps the cursor at end-of-line across vertical moves after $", () => {
    const { term, controller } = setup({
      cols: 80, rows: 5, cursorX: 0, cursorY: 0, baseY: 0, length: 3,
      lines: { 0: "hello", 1: "longer line", 2: "x" },
    });
    controller.enter();
    controller.handleKeydown(key("$")); // "hello" -> col 4, preferred col parked at EOL
    expect(term.lastSelect()).toEqual([4, 0, 1]);
    controller.handleKeydown(key("j")); // "longer line" (last col 10) -> sticks to EOL
    expect(term.lastSelect()).toEqual([10, 1, 1]);
    controller.handleKeydown(key("j")); // "x" (last col 0) -> sticks to EOL
    expect(term.lastSelect()).toEqual([0, 2, 1]);
  });

  it("stops the cursor at end-of-line content on l/ArrowRight", () => {
    // Single-row buffer: no next row to wrap into, so `l` clamps to content.
    const { term, controller } = setup({
      cols: 80, rows: 5, cursorX: 0, cursorY: 0, baseY: 0, length: 1,
      lines: { 0: "abc" },
    });
    controller.enter();
    for (let i = 0; i < 10; i++) controller.handleKeydown(key("l"));
    expect(term.lastSelect()).toEqual([2, 0, 1]); // "abc" last col 2, not cols - 1
  });

  it("follows end-of-line on vertical moves after reaching it via l", () => {
    const { term, controller } = setup({
      cols: 80, rows: 5, cursorX: 0, cursorY: 0, baseY: 0, length: 3,
      lines: { 0: "move the cursor", 1: "jump one screen at a time", 2: "x" },
    });
    controller.enter();
    // Exactly 14 presses land on the last cell of "move the cursor" (len 15 ->
    // col 14) without a further press wrapping down.
    for (let i = 0; i < 14; i++) controller.handleKeydown(key("l"));
    expect(term.lastSelect()).toEqual([14, 0, 1]);
    controller.handleKeydown(key("j")); // longer line -> sticks to EOL, not col 14
    expect(term.lastSelect()).toEqual([24, 1, 1]); // "jump one screen at a time" len 25 -> col 24
    controller.handleKeydown(key("j")); // "x" -> col 0
    expect(term.lastSelect()).toEqual([0, 2, 1]);
  });

  it("keeps the literal column on vertical moves when l stops mid-line", () => {
    const { term, controller } = setup({
      cols: 80, rows: 5, cursorX: 0, cursorY: 0, baseY: 0, length: 2,
      lines: { 0: "abcdefghij", 1: "the lazy dog jumps over" },
    });
    controller.enter();
    for (let i = 0; i < 3; i++) controller.handleKeydown(key("l"));
    expect(term.lastSelect()).toEqual([3, 0, 1]); // mid-line, not at EOL
    controller.handleKeydown(key("j")); // longer line -> stays at col 3, does NOT jump to EOL
    expect(term.lastSelect()).toEqual([3, 1, 1]);
  });

  it("scrolls the viewport to keep the cursor visible", () => {
    const { term, controller } = setup({ cols: 80, rows: 5, cursorX: 0, cursorY: 0, baseY: 10, viewportY: 10, length: 15 });
    controller.enter(); // cursor row 10 == viewport top
    controller.handleKeydown(key("k")); // -> row 9, above viewport
    expect(term.scrollLinesCalls).toContain(-1);
  });

  it("yanks the selection and exits", () => {
    const { term, controller, onYank, onChange } = setup({ selection: "copied text" });
    controller.enter();
    controller.handleKeydown(key("y"));

    expect(onYank).toHaveBeenCalledWith("copied text");
    expect(controller.isActive()).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(term.clearSelectionCalls).toBe(1);
    expect(term.scrollToBottomCalls).toBe(1);
    expect(term.writes).toContain(SHOW_CURSOR);
  });

  it("does not yank an empty selection", () => {
    const { controller, onYank } = setup({ selection: "" });
    controller.enter();
    controller.handleKeydown(key("y"));
    expect(onYank).not.toHaveBeenCalled();
    expect(controller.isActive()).toBe(false);
  });

  it("exits without yanking on q, Escape, and Ctrl+C", () => {
    for (const ev of [key("q"), key("Escape"), key("c", true)]) {
      const { controller, onYank } = setup({ selection: "x" });
      controller.enter();
      controller.handleKeydown(ev);
      expect(onYank).not.toHaveBeenCalled();
      expect(controller.isActive()).toBe(false);
    }
  });

  it("refocuses on a default exit but not when refocus is false", () => {
    const withFocus = setup();
    withFocus.controller.enter();
    withFocus.controller.exit();
    expect(withFocus.term.focusCalls).toBe(1);

    const noFocus = setup();
    noFocus.controller.enter();
    noFocus.controller.exit({ refocus: false });
    expect(noFocus.term.focusCalls).toBe(0);
  });

  it("calls preventDefault on consumed keys", () => {
    const { controller } = setup();
    controller.enter();
    const k = key("h");
    controller.handleKeydown(k);
    expect(k.preventDefault).toHaveBeenCalled();
  });
});
