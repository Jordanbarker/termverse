import { describe, it, expect, vi } from "vitest";
import { LessSession } from "../LessSession";

function mockTerminal(rows = 24, cols = 80) {
  const term: { write: ReturnType<typeof vi.fn>; rows: number; cols: number } = {
    write: vi.fn(),
    rows,
    cols,
  };
  return term as unknown as import("@xterm/xterm").Terminal & { rows: number; cols: number };
}

interface PrivateState {
  lines: string[];
  topLine: number;
  mode: "view" | "search" | "help";
  searchInputBuffer: string;
  searchDirection: "fwd" | "back";
  searchPattern: string;
  searchHits: number[];
  currentHitIdx: number;
}

function getState(session: LessSession): PrivateState {
  return (session as unknown as { state: PrivateState }).state;
}

function makeLines(n: number): string {
  return Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");
}

function makeSession(content: string, rows = 10, cols = 80, filename: string | null = "test.txt") {
  const term = mockTerminal(rows, cols);
  const session = new LessSession(term, { filename, content });
  session.enter();
  return { session, term };
}

describe("LessSession", () => {
  describe("lifecycle", () => {
    it("enters the alt screen and hides the cursor on enter", () => {
      const { term } = makeSession("hello");
      const allOutput = (term.write as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]).join("");
      expect(allOutput).toContain("\x1b[?1049h");
      expect(allOutput).toContain("\x1b[?25l");
    });

    it("returns an exit result and restores the cursor on q", () => {
      const { session, term } = makeSession("hello");
      const result = session.handleInput("q");
      expect(result.type).toBe("exit");
      const allOutput = (term.write as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]).join("");
      expect(allOutput).toContain("\x1b[?1049l");
      expect(allOutput).toContain("\x1b[?25h");
    });

    it("returns an exit result on Ctrl+C", () => {
      const { session } = makeSession("hello");
      const result = session.handleInput("\x03");
      expect(result.type).toBe("exit");
    });

    it("canClose() is always true", () => {
      const { session } = makeSession("hello");
      expect(session.canClose()).toBe(true);
    });
  });

  describe("scrolling", () => {
    it("scrolls down one line on j", () => {
      const { session } = makeSession(makeLines(50));
      session.handleInput("j");
      expect(getState(session).topLine).toBe(1);
    });

    it("scrolls up one line on k", () => {
      const { session } = makeSession(makeLines(50));
      session.handleInput("jjj");
      expect(getState(session).topLine).toBe(3);
      session.handleInput("k");
      expect(getState(session).topLine).toBe(2);
    });

    it("scrolls one page on space (viewport = rows - 1)", () => {
      const { session } = makeSession(makeLines(50), 10);
      session.handleInput(" ");
      expect(getState(session).topLine).toBe(9);
    });

    it("scrolls one page back on b", () => {
      const { session } = makeSession(makeLines(50), 10);
      session.handleInput("  ");
      expect(getState(session).topLine).toBe(18);
      session.handleInput("b");
      expect(getState(session).topLine).toBe(9);
    });

    it("g jumps to top, G jumps to bottom", () => {
      const { session } = makeSession(makeLines(50), 10);
      session.handleInput("G");
      // max topLine = 50 - 9 = 41
      expect(getState(session).topLine).toBe(41);
      session.handleInput("g");
      expect(getState(session).topLine).toBe(0);
    });

    it("treats Enter as scroll-down-1 in view mode", () => {
      const { session } = makeSession(makeLines(50));
      session.handleInput("\r");
      expect(getState(session).topLine).toBe(1);
    });

    it("arrow keys scroll like j/k", () => {
      const { session } = makeSession(makeLines(50));
      session.handleInput("\x1b[B");
      expect(getState(session).topLine).toBe(1);
      session.handleInput("\x1b[A");
      expect(getState(session).topLine).toBe(0);
    });

    it("PgDn and PgUp page the viewport", () => {
      const { session } = makeSession(makeLines(50), 10);
      session.handleInput("\x1b[6~");
      expect(getState(session).topLine).toBe(9);
      session.handleInput("\x1b[5~");
      expect(getState(session).topLine).toBe(0);
    });

    it("clamps topLine at the bottom", () => {
      const { session } = makeSession(makeLines(5), 10);
      session.handleInput("G");
      expect(getState(session).topLine).toBe(0);
    });
  });

  describe("resize clamping", () => {
    it("clamps topLine when terminal shrinks past last-line constraint", () => {
      const term = mockTerminal(5, 80);
      const session = new LessSession(term, { filename: "x", content: makeLines(20) });
      session.enter();
      session.handleInput("G");
      // viewportRows = 4, max = 20 - 4 = 16
      expect(getState(session).topLine).toBe(16);
      (term as unknown as { rows: number }).rows = 10;
      session.resize();
      // viewportRows = 9, max = 20 - 9 = 11
      expect(getState(session).topLine).toBe(11);
    });
  });

  describe("search", () => {
    it("/ enters search mode and types are echoed to the buffer", () => {
      const { session } = makeSession(makeLines(50));
      session.handleInput("/");
      expect(getState(session).mode).toBe("search");
      session.handleInput("line");
      expect(getState(session).searchInputBuffer).toBe("line");
    });

    it("Enter commits the search and builds hits", () => {
      const content = "alpha\nbeta\ngamma\nalpha-2\ndelta";
      const { session } = makeSession(content, 10);
      session.handleInput("/alpha\r");
      const state = getState(session);
      expect(state.mode).toBe("view");
      expect(state.searchPattern).toBe("alpha");
      expect(state.searchHits).toEqual([0, 3]);
      expect(state.currentHitIdx).toBe(0);
    });

    it("n advances to next hit, wrapping at end", () => {
      const content = "alpha\nbeta\nalpha\ngamma\nalpha";
      const { session } = makeSession(content, 4);
      session.handleInput("/alpha\r");
      expect(getState(session).currentHitIdx).toBe(0);
      session.handleInput("n");
      expect(getState(session).currentHitIdx).toBe(1);
      session.handleInput("n");
      expect(getState(session).currentHitIdx).toBe(2);
      session.handleInput("n");
      expect(getState(session).currentHitIdx).toBe(0);
    });

    it("N moves backward, wrapping at start", () => {
      const content = "alpha\nbeta\nalpha\ngamma\nalpha";
      const { session } = makeSession(content, 4);
      session.handleInput("/alpha\r");
      session.handleInput("N");
      expect(getState(session).currentHitIdx).toBe(2);
    });

    it("? sets backward direction; n then advances backward through hits", () => {
      const content = "alpha\nbeta\nalpha\ngamma\nalpha";
      const { session } = makeSession(content, 4);
      session.handleInput("G");
      session.handleInput("?alpha\r");
      const state = getState(session);
      expect(state.searchDirection).toBe("back");
      const startIdx = state.currentHitIdx;
      session.handleInput("n");
      const nextIdx = getState(session).currentHitIdx;
      const expected = (startIdx - 1 + state.searchHits.length) % state.searchHits.length;
      expect(nextIdx).toBe(expected);
    });

    it("Esc cancels search input and keeps prior pattern", () => {
      const { session } = makeSession(makeLines(20));
      session.handleInput("/line\r");
      expect(getState(session).searchPattern).toBe("line");
      session.handleInput("/abc");
      session.handleInput("\x1b");
      const state = getState(session);
      expect(state.mode).toBe("view");
      expect(state.searchPattern).toBe("line");
    });

    it("backspace edits the search buffer", () => {
      const { session } = makeSession(makeLines(20));
      session.handleInput("/lien");
      session.handleInput("\x7f\x7f");
      expect(getState(session).searchInputBuffer).toBe("li");
    });
  });

  describe("help overlay", () => {
    it("h enters help mode; any key returns to view", () => {
      const { session } = makeSession("hello");
      session.handleInput("h");
      expect(getState(session).mode).toBe("help");
      session.handleInput("x");
      expect(getState(session).mode).toBe("view");
    });
  });

  describe("redraw", () => {
    it("Ctrl+L triggers a fresh draw", () => {
      const { session, term } = makeSession("hello");
      (term.write as ReturnType<typeof vi.fn>).mockClear();
      session.handleInput("\x0c");
      expect((term.write as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe("stdin content", () => {
    it("renders (stdin) in the status line when filename is null", () => {
      const { term } = makeSession("hello\nworld", 5, 80, null);
      const out = (term.write as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]).join("");
      expect(out).toContain("(stdin)");
    });
  });
});
