import { describe, it, expect, vi } from "vitest";
import { EditorSession } from "../EditorSession";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";

// Minimal mock Terminal — only needs write(), rows, cols
function mockTerminal(rows = 24, cols = 80) {
  return {
    write: vi.fn(),
    rows,
    cols,
  } as unknown as import("@xterm/xterm").Terminal;
}

function makeFS(files: Record<string, string>): VirtualFS {
  const children: Record<string, DirectoryNode | import("@tt/core/filesystem/types").FileNode> = {};
  for (const [name, content] of Object.entries(files)) {
    children[name] = {
      type: "file" as const,
      name,
      content,
      permissions: "rw-r--r--",
      hidden: name.startsWith("."),
    };
  }
  const root: DirectoryNode = {
    type: "directory",
    name: "/",
    permissions: "rwxr-xr-x",
    hidden: false,
    children: {
      home: {
        type: "directory",
        name: "home",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {
          user: {
            type: "directory",
            name: "user",
            permissions: "rwxr-xr-x",
            hidden: false,
            children,
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/user", "/home/user");
}

function createSession(
  content: string,
  opts: { readOnly?: boolean; files?: Record<string, string>; cols?: number } = {}
) {
  const files = opts.files ?? {};
  const fs = makeFS(files);
  const term = mockTerminal(24, opts.cols ?? 80);
  const onSave = vi.fn();
  const session = new EditorSession(
    term,
    fs,
    "/home/user/test.txt",
    content,
    opts.readOnly ?? false,
    onSave
  );
  session.enter();
  return { session, term, onSave };
}

/** Helper: get the promptState via reflection */
function getState(session: EditorSession) {
  // Access private state for assertions
  return (session as unknown as { state: import("../types").EditorState }).state;
}

describe("EditorSession", () => {
  describe("^C Show Position", () => {
    it("shows position at start of 3-line file", () => {
      const { session } = createSession("line1\nline2\nline3");
      session.handleInput("\x03"); // ^C
      const state = getState(session);
      expect(state.message).toContain("line 1/3");
      expect(state.message).toContain("col 1/");
      expect(state.message).toContain("char 0/");
    });

    it("shows position at mid-file", () => {
      const { session } = createSession("hello\nworld\nfoo");
      // Move down 1 row, right 3 cols
      session.handleInput("\x1b[B"); // down
      session.handleInput("\x1b[C\x1b[C\x1b[C"); // right x3
      session.handleInput("\x03"); // ^C
      const state = getState(session);
      expect(state.message).toContain("line 2/3");
      expect(state.message).toContain("col 4/");
    });

    it("shows position for single-line file", () => {
      const { session } = createSession("hello");
      session.handleInput("\x03"); // ^C
      const state = getState(session);
      expect(state.message).toContain("line 1/1 (100%)");
      expect(state.message).toContain("col 1/6");
    });
  });

  describe("^W Search", () => {
    it("finds a basic match", () => {
      const { session } = createSession("hello world\nfoo bar\nhello again");
      session.handleInput("\x17"); // ^W opens search
      const state = getState(session);
      expect(state.promptState).toEqual({ type: "search", input: "" });

      session.handleInput("bar"); // type "bar"
      expect(getState(session).promptState).toEqual({ type: "search", input: "bar" });

      session.handleInput("\r"); // Enter to submit
      expect(state.cursor.row).toBe(1);
      expect(state.cursor.col).toBe(4);
    });

    it("shows not found for no match", () => {
      const { session } = createSession("hello world");
      session.handleInput("\x17"); // ^W
      session.handleInput("xyz\r");
      const state = getState(session);
      expect(state.message).toContain('"xyz" not found');
      expect(state.cursor.row).toBe(0);
      expect(state.cursor.col).toBe(0);
    });

    it("wraps around when searching past end", () => {
      const { session } = createSession("aaa\nbbb\naaa");
      // Move to last line
      session.handleInput("\x1b[B\x1b[B"); // down x2
      expect(getState(session).cursor.row).toBe(2);

      session.handleInput("\x17aaa\r"); // ^W "aaa" Enter
      const state = getState(session);
      // Should wrap to (0, 0) since cursor was at (2, 0) and searching forward wraps
      expect(state.cursor.row).toBe(0);
      expect(state.cursor.col).toBe(0);
    });

    it("repeats last search with empty input", () => {
      const { session } = createSession("hello world\nfoo bar\nhello again");
      // First search for "hello" — cursor at (0,0), search starts from col 1, finds at (2,0)
      session.handleInput("\x17hello\r"); // ^W "hello" Enter
      const state = getState(session);
      expect(state.cursor.row).toBe(2);
      expect(state.cursor.col).toBe(0);

      // Repeat search with empty input — wraps to (0,0)
      session.handleInput("\x17\r"); // ^W Enter
      expect(state.cursor.row).toBe(0);
      expect(state.cursor.col).toBe(0);
    });

    it("cancels search with ^C", () => {
      const { session } = createSession("hello");
      session.handleInput("\x17"); // ^W
      session.handleInput("hel");
      session.handleInput("\x03"); // ^C
      const state = getState(session);
      expect(state.promptState).toEqual({ type: "none" });
      expect(state.cursor.row).toBe(0);
      expect(state.cursor.col).toBe(0);
    });

    it("searches case-insensitively", () => {
      const { session } = createSession("Hello World");
      session.handleInput("\x17hello\r"); // ^W "hello" Enter
      const state = getState(session);
      expect(state.cursor.row).toBe(0);
      expect(state.cursor.col).toBe(0);
    });

    it("searches from mid-line position", () => {
      const { session } = createSession("abcabc");
      // Move to col 2
      session.handleInput("\x1b[C\x1b[C"); // right x2
      session.handleInput("\x17abc\r"); // ^W "abc" Enter
      const state = getState(session);
      expect(state.cursor.row).toBe(0);
      expect(state.cursor.col).toBe(3); // second "abc"
    });
  });

  describe("^_ Go to Line", () => {
    it("goes to a valid line", () => {
      const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
      const { session } = createSession(lines.join("\n"));
      session.handleInput("\x1f5\r"); // ^_ "5" Enter
      const state = getState(session);
      expect(state.cursor.row).toBe(4); // 1-indexed → 0-indexed
      expect(state.cursor.col).toBe(0);
    });

    it("goes to line and column", () => {
      const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}pad`);
      const { session } = createSession(lines.join("\n"));
      session.handleInput("\x1f5,4\r"); // ^_ "5,4" Enter
      const state = getState(session);
      expect(state.cursor.row).toBe(4);
      expect(state.cursor.col).toBe(3); // 1-indexed → 0-indexed
    });

    it("clamps out-of-range high", () => {
      const { session } = createSession("a\nb\nc\nd\ne");
      session.handleInput("\x1f100\r"); // ^_ "100" Enter
      const state = getState(session);
      expect(state.cursor.row).toBe(4); // last line
    });

    it("clamps line 0 to first line", () => {
      const { session } = createSession("a\nb\nc\nd\ne");
      session.handleInput("\x1f0\r"); // ^_ "0" Enter
      const state = getState(session);
      expect(state.cursor.row).toBe(0);
    });

    it("handles negative line (count from end)", () => {
      const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
      const { session } = createSession(lines.join("\n"));
      session.handleInput("\x1f"); // ^_
      session.handleInput("-1\r");
      const state = getState(session);
      expect(state.cursor.row).toBe(9); // last line
    });

    it("shows error for non-numeric input", () => {
      const { session } = createSession("hello");
      session.handleInput("\x1fabc\r"); // ^_ "abc" Enter
      const state = getState(session);
      expect(state.message).toContain("Invalid line number");
      expect(state.cursor.row).toBe(0);
    });

    it("cancels with ^C", () => {
      const { session } = createSession("hello");
      session.handleInput("\x1f"); // ^_
      session.handleInput("5");
      session.handleInput("\x03"); // ^C
      const state = getState(session);
      expect(state.promptState).toEqual({ type: "none" });
    });

    it("does nothing on empty input", () => {
      const { session } = createSession("hello\nworld");
      session.handleInput("\x1f\r"); // ^_ Enter (empty)
      const state = getState(session);
      expect(state.cursor.row).toBe(0);
    });
  });

  describe("^\\ Replace", () => {
    it("replaces one occurrence with Y", () => {
      const { session } = createSession("foo bar foo");
      session.handleInput("\x1c"); // ^\
      session.handleInput("foo\r"); // search term
      session.handleInput("baz\r"); // replacement
      const state = getState(session);
      expect(state.promptState.type).toBe("replaceConfirm");

      session.handleInput("y"); // Y to replace
      expect(state.lines[0]).toBe("baz bar foo");
    });

    it("skips occurrence with N", () => {
      const { session } = createSession("foo bar foo");
      session.handleInput("\x1c"); // ^\
      session.handleInput("foo\r"); // search
      session.handleInput("baz\r"); // replace
      session.handleInput("n"); // N to skip
      const state = getState(session);
      expect(state.lines[0]).toBe("foo bar foo"); // unchanged
      // Cursor should have moved to second occurrence
      expect(state.cursor.col).toBe(8);
    });

    it("replaces all with A", () => {
      const { session } = createSession("foo bar foo");
      session.handleInput("\x1c"); // ^\
      session.handleInput("foo\r");
      session.handleInput("baz\r");
      session.handleInput("a"); // A to replace all
      const state = getState(session);
      expect(state.lines[0]).toBe("baz bar baz");
      expect(state.message).toContain("Replaced 2 occurrence");
    });

    it("cancels during search input with ^C", () => {
      const { session } = createSession("foo bar foo");
      session.handleInput("\x1c"); // ^\
      session.handleInput("foo");
      session.handleInput("\x03"); // ^C
      const state = getState(session);
      expect(state.promptState).toEqual({ type: "none" });
      expect(state.lines[0]).toBe("foo bar foo");
    });

    it("cancels during confirm with ^C", () => {
      const { session } = createSession("foo bar foo");
      session.handleInput("\x1c");
      session.handleInput("foo\r");
      session.handleInput("baz\r");
      session.handleInput("\x03"); // ^C cancel at confirm
      const state = getState(session);
      expect(state.promptState).toEqual({ type: "none" });
      expect(state.lines[0]).toBe("foo bar foo"); // unchanged
    });

    it("shows not found when no matches", () => {
      const { session } = createSession("hello world");
      session.handleInput("\x1c");
      session.handleInput("xyz\r");
      session.handleInput("abc\r");
      const state = getState(session);
      expect(state.message).toContain('"xyz" not found');
      expect(state.promptState).toEqual({ type: "none" });
    });

    it("replaces across multiple lines with A", () => {
      const { session } = createSession("foo\nbar foo\nfoo");
      session.handleInput("\x1c");
      session.handleInput("foo\r");
      session.handleInput("x\r");
      session.handleInput("a");
      const state = getState(session);
      expect(state.lines).toEqual(["x", "bar x", "x"]);
      expect(state.message).toContain("Replaced 3 occurrence");
    });
  });

  describe("^R Read File", () => {
    it("inserts file content after cursor", () => {
      const { session } = createSession("line1\nline2\nline3", {
        files: { "data.txt": "inserted1\ninserted2" },
      });
      // Move to line 2
      session.handleInput("\x1b[B"); // down
      session.handleInput("\x12"); // ^R
      session.handleInput("/home/user/data.txt\r");
      const state = getState(session);
      expect(state.lines).toEqual(["line1", "line2", "inserted1", "inserted2", "line3"]);
      expect(state.message).toContain("Read 2 lines");
      expect(state.modified).toBe(true);
    });

    it("shows error for missing file", () => {
      const { session } = createSession("hello");
      session.handleInput("\x12"); // ^R
      session.handleInput("/no/such/file\r");
      const state = getState(session);
      expect(state.message).toBeDefined();
      expect(state.lines).toEqual(["hello"]); // unchanged
    });

    it("blocks read file in read-only mode", () => {
      const { session } = createSession("hello", { readOnly: true });
      session.handleInput("\x12"); // ^R
      const state = getState(session);
      expect(state.message).toBe("[ File is read-only ]");
      expect(state.promptState).toEqual({ type: "none" });
    });

    it("cancels with ^C", () => {
      const { session } = createSession("hello", {
        files: { "data.txt": "content" },
      });
      session.handleInput("\x12"); // ^R
      session.handleInput("/home/user/data.txt");
      session.handleInput("\x03"); // ^C
      const state = getState(session);
      expect(state.promptState).toEqual({ type: "none" });
      expect(state.lines).toEqual(["hello"]);
    });
  });

  describe("^O Write Out", () => {
    it("saves to default path on Enter", () => {
      const { session, onSave } = createSession("hello world");
      // Modify the file first
      session.handleInput("x");
      session.handleInput("\x0f"); // ^O
      const state = getState(session);
      expect(state.promptState).toEqual({ type: "writeOut", input: "/home/user/test.txt" });

      session.handleInput("\r"); // Enter to save
      expect(state.promptState).toEqual({ type: "none" });
      expect(state.message).toContain("Wrote");
      expect(onSave).toHaveBeenCalled();
    });

    it("cancels with ^C", () => {
      const { session, onSave } = createSession("hello");
      session.handleInput("x");
      session.handleInput("\x0f"); // ^O
      session.handleInput("\x03"); // ^C
      const state = getState(session);
      expect(state.promptState).toEqual({ type: "none" });
      expect(onSave).not.toHaveBeenCalled();
    });

    it("^S saves directly without prompt", () => {
      const { session, onSave } = createSession("hello");
      session.handleInput("x");
      session.handleInput("\x13"); // ^S
      const state = getState(session);
      expect(state.promptState).toEqual({ type: "none" });
      expect(state.message).toContain("Wrote");
      expect(onSave).toHaveBeenCalled();
    });

    it("blocks write out in read-only mode", () => {
      const { session } = createSession("hello", { readOnly: true });
      session.handleInput("\x0f"); // ^O
      const state = getState(session);
      expect(state.message).toBe("[ File is read-only ]");
      expect(state.promptState).toEqual({ type: "none" });
    });
  });

  describe("^J Justify", () => {
    it("reflows a single paragraph", () => {
      const { session } = createSession("This is a\nvery long paragraph\nwith many words", {
        cols: 30,
      });
      session.handleInput("\x0a"); // ^J (code 10)
      const state = getState(session);
      // All words should be reflowed into lines <= 30 cols
      for (const line of state.lines) {
        expect(line.length).toBeLessThanOrEqual(30);
      }
      // Content should be preserved
      const allWords = state.lines.join(" ").split(/\s+/);
      expect(allWords).toContain("This");
      expect(allWords).toContain("words");
      expect(state.modified).toBe(true);
    });

    it("preserves paragraph breaks", () => {
      const { session } = createSession("para one\n\npara two");
      session.handleInput("\x0a"); // ^J
      const state = getState(session);
      // Empty line and "para two" should be untouched
      expect(state.lines).toContain("");
      expect(state.lines).toContain("para two");
    });

    it("blocks justify in read-only mode", () => {
      const { session } = createSession("hello world", { readOnly: true });
      session.handleInput("\x0a"); // ^J
      const state = getState(session);
      expect(state.message).toBe("[ File is read-only ]");
    });

    it("keeps single long word intact", () => {
      const { session } = createSession("superlongword", { cols: 5 });
      session.handleInput("\x0a"); // ^J
      const state = getState(session);
      expect(state.lines).toContain("superlongword");
    });
  });

  describe("^T Execute", () => {
    it("shows not supported message", () => {
      const { session } = createSession("hello");
      session.handleInput("\x14"); // ^T
      const state = getState(session);
      expect(state.message).toBe("[ Not supported ]");
    });
  });

  describe("Prompt text input (shared behavior)", () => {
    it("appends typed characters to prompt input", () => {
      const { session } = createSession("hello");
      session.handleInput("\x17"); // ^W search
      session.handleInput("abc");
      const state = getState(session);
      expect(state.promptState).toEqual({ type: "search", input: "abc" });
    });

    it("backspace removes last character", () => {
      const { session } = createSession("hello");
      session.handleInput("\x17"); // ^W search
      session.handleInput("abc");
      session.handleInput("\x7f"); // backspace
      const state = getState(session);
      expect(state.promptState).toEqual({ type: "search", input: "ab" });
    });

    it("backspace on empty input does nothing", () => {
      const { session } = createSession("hello");
      session.handleInput("\x17"); // ^W search
      session.handleInput("\x7f"); // backspace on empty
      const state = getState(session);
      expect(state.promptState).toEqual({ type: "search", input: "" });
    });

    it("^C cancels any text prompt", () => {
      const { session } = createSession("hello");
      session.handleInput("\x17"); // ^W search
      session.handleInput("abc");
      session.handleInput("\x03"); // ^C
      const state = getState(session);
      expect(state.promptState).toEqual({ type: "none" });
    });
  });

  describe("Basic text editing", () => {
    it("inserts characters at cursor position", () => {
      const { session } = createSession("hello");
      session.handleInput("X");
      const state = getState(session);
      expect(state.lines[0]).toBe("Xhello");
      expect(state.cursor.col).toBe(1);
      expect(state.modified).toBe(true);
    });

    it("inserts in the middle of a line", () => {
      const { session } = createSession("hello");
      session.handleInput("\x1b[C\x1b[C"); // right x2
      session.handleInput("X");
      const state = getState(session);
      expect(state.lines[0]).toBe("heXllo");
      expect(state.cursor.col).toBe(3);
    });

    it("Enter splits line at cursor", () => {
      const { session } = createSession("hello world");
      session.handleInput("\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C"); // right x5 (to space)
      session.handleInput("\r"); // Enter
      const state = getState(session);
      expect(state.lines).toEqual(["hello", " world"]);
      expect(state.cursor).toEqual({ row: 1, col: 0 });
    });

    it("Enter at end of line creates empty line below", () => {
      const { session } = createSession("hello");
      session.handleInput("\x1b[F"); // End
      session.handleInput("\r");
      const state = getState(session);
      expect(state.lines).toEqual(["hello", ""]);
      expect(state.cursor).toEqual({ row: 1, col: 0 });
    });

    it("Enter at start of line creates empty line above", () => {
      const { session } = createSession("hello");
      session.handleInput("\r");
      const state = getState(session);
      expect(state.lines).toEqual(["", "hello"]);
      expect(state.cursor).toEqual({ row: 1, col: 0 });
    });

    it("Backspace deletes character before cursor", () => {
      const { session } = createSession("hello");
      session.handleInput("\x1b[C\x1b[C\x1b[C"); // right x3
      session.handleInput("\x7f"); // Backspace
      const state = getState(session);
      expect(state.lines[0]).toBe("helo");
      expect(state.cursor.col).toBe(2);
    });

    it("Backspace at start of line joins with previous", () => {
      const { session } = createSession("hello\nworld");
      session.handleInput("\x1b[B"); // down to line 2
      session.handleInput("\x7f"); // Backspace
      const state = getState(session);
      expect(state.lines).toEqual(["helloworld"]);
      expect(state.cursor).toEqual({ row: 0, col: 5 });
    });

    it("Backspace at start of first line does nothing", () => {
      const { session } = createSession("hello");
      session.handleInput("\x7f"); // Backspace
      const state = getState(session);
      expect(state.lines[0]).toBe("hello");
      expect(state.cursor.col).toBe(0);
    });

    it("Delete removes character at cursor", () => {
      const { session } = createSession("hello");
      session.handleInput("\x1b[3~"); // Delete
      const state = getState(session);
      expect(state.lines[0]).toBe("ello");
      expect(state.cursor.col).toBe(0);
    });

    it("Delete at end of line joins with next", () => {
      const { session } = createSession("hello\nworld");
      session.handleInput("\x1b[F"); // End
      session.handleInput("\x1b[3~"); // Delete
      const state = getState(session);
      expect(state.lines).toEqual(["helloworld"]);
      expect(state.cursor).toEqual({ row: 0, col: 5 });
    });

    it("Delete at end of last line does nothing", () => {
      const { session } = createSession("hello");
      session.handleInput("\x1b[F"); // End (col=5)
      session.handleInput("\x1b[3~"); // Delete
      const state = getState(session);
      expect(state.lines).toEqual(["hello"]);
      expect(state.cursor.col).toBe(5);
    });

    it("Tab key inserts a tab character", () => {
      const { session } = createSession("hello");
      session.handleInput("\t"); // Tab
      const state = getState(session);
      expect(state.lines[0]).toBe("\thello");
      expect(state.cursor.col).toBe(1);
    });
  });

  describe("Cursor movement", () => {
    it("arrow keys move cursor", () => {
      const { session } = createSession("hello\nworld");
      session.handleInput("\x1b[B"); // down
      expect(getState(session).cursor.row).toBe(1);
      session.handleInput("\x1b[C"); // right
      expect(getState(session).cursor.col).toBe(1);
    });

    it("up arrow at first line does nothing", () => {
      const { session } = createSession("hello\nworld");
      session.handleInput("\x1b[A"); // up
      expect(getState(session).cursor).toEqual({ row: 0, col: 0 });
    });

    it("down arrow at last line does nothing", () => {
      const { session } = createSession("hello\nworld");
      session.handleInput("\x1b[B\x1b[B\x1b[B"); // down x3
      expect(getState(session).cursor.row).toBe(1); // clamped to last line
    });

    it("left arrow wraps to end of previous line", () => {
      const { session } = createSession("hello\nworld");
      session.handleInput("\x1b[B"); // down to "world"
      session.handleInput("\x1b[D"); // left at col 0
      const state = getState(session);
      expect(state.cursor).toEqual({ row: 0, col: 5 });
    });

    it("right arrow wraps to start of next line", () => {
      const { session } = createSession("hello\nworld");
      session.handleInput("\x1b[F"); // End (col=5)
      session.handleInput("\x1b[C"); // right past end
      const state = getState(session);
      expect(state.cursor).toEqual({ row: 1, col: 0 });
    });

    it("left arrow at start of first line does nothing", () => {
      const { session } = createSession("hello");
      session.handleInput("\x1b[D"); // left
      expect(getState(session).cursor).toEqual({ row: 0, col: 0 });
    });

    it("right arrow at end of last line does nothing", () => {
      const { session } = createSession("hello");
      session.handleInput("\x1b[F"); // End
      session.handleInput("\x1b[C"); // right
      expect(getState(session).cursor).toEqual({ row: 0, col: 5 });
    });

    it("Ctrl+Right moves to next word start", () => {
      const { session } = createSession("hello world foo");
      session.handleInput("\x1b[1;5C"); // wordRight
      expect(getState(session).cursor.col).toBe(6); // start of "world"
      session.handleInput("\x1b[1;5C");
      expect(getState(session).cursor.col).toBe(12); // start of "foo"
    });

    it("Ctrl+Left moves to previous word start", () => {
      const { session } = createSession("hello world");
      session.handleInput("\x1b[F"); // End (col=11)
      session.handleInput("\x1b[1;5D"); // wordLeft
      expect(getState(session).cursor.col).toBe(6); // start of "world"
      session.handleInput("\x1b[1;5D");
      expect(getState(session).cursor.col).toBe(0);
    });

    it("Ctrl+Left at start of line crosses to end of previous line", () => {
      const { session } = createSession("hello\nworld");
      session.handleInput("\x1b[B"); // down to "world", col 0
      session.handleInput("\x1b[1;5D"); // wordLeft
      expect(getState(session).cursor).toEqual({ row: 0, col: 5 });
    });

    it("Ctrl+Right at end of line crosses to start of next line", () => {
      const { session } = createSession("hello\nworld");
      session.handleInput("\x1b[F"); // End of "hello"
      session.handleInput("\x1b[1;5C"); // wordRight
      expect(getState(session).cursor).toEqual({ row: 1, col: 0 });
    });

    it("Ctrl+Left/Right at document edges do nothing", () => {
      const { session } = createSession("hello");
      session.handleInput("\x1b[1;5D"); // wordLeft at (0,0)
      expect(getState(session).cursor).toEqual({ row: 0, col: 0 });
      session.handleInput("\x1b[F"); // End
      session.handleInput("\x1b[1;5C"); // wordRight at end of last line
      expect(getState(session).cursor).toEqual({ row: 0, col: 5 });
    });

    it("Home moves to start of line", () => {
      const { session } = createSession("hello");
      session.handleInput("\x1b[C\x1b[C\x1b[C"); // right x3
      session.handleInput("\x1b[H"); // Home
      expect(getState(session).cursor.col).toBe(0);
    });

    it("End moves to end of line", () => {
      const { session } = createSession("hello");
      session.handleInput("\x1b[F"); // End
      expect(getState(session).cursor.col).toBe(5);
    });

    it("^A moves to start of line", () => {
      const { session } = createSession("hello");
      session.handleInput("\x1b[C\x1b[C"); // right x2
      session.handleInput("\x01"); // ^A
      expect(getState(session).cursor.col).toBe(0);
    });

    it("^E moves to end of line", () => {
      const { session } = createSession("hello");
      session.handleInput("\x05"); // ^E
      expect(getState(session).cursor.col).toBe(5);
    });

    it("moving up/down clamps column to shorter line", () => {
      const { session } = createSession("hello world\nhi\nhello world");
      session.handleInput("\x1b[F"); // End (col=11)
      session.handleInput("\x1b[B"); // down to "hi" (col clamps to 2)
      expect(getState(session).cursor).toEqual({ row: 1, col: 2 });
    });

    it("page down moves by content area height", () => {
      const lines = Array.from({ length: 50 }, (_, i) => `line${i}`);
      const { session } = createSession(lines.join("\n"));
      session.handleInput("\x1b[6~"); // PageDown
      const state = getState(session);
      // contentRows = 24 - 4 = 20
      expect(state.cursor.row).toBe(20);
    });

    it("page up moves up by content area height", () => {
      const lines = Array.from({ length: 50 }, (_, i) => `line${i}`);
      const { session } = createSession(lines.join("\n"));
      // Go to line 30
      session.handleInput("\x1f30\r"); // ^_ goto line 30
      session.handleInput("\x1b[5~"); // PageUp
      const state = getState(session);
      // From row 29, up 20 = row 9
      expect(state.cursor.row).toBe(9);
    });

    it("page down at bottom clamps to last line", () => {
      const { session } = createSession("a\nb\nc");
      session.handleInput("\x1b[6~"); // PageDown
      expect(getState(session).cursor.row).toBe(2);
    });

    it("page up at top clamps to first line", () => {
      const { session } = createSession("a\nb\nc");
      session.handleInput("\x1b[5~"); // PageUp
      expect(getState(session).cursor.row).toBe(0);
    });
  });

  describe("^K Cut / ^U Paste", () => {
    it("cuts the first line and cursor stays on first line", () => {
      const { session } = createSession("line1\nline2\nline3");
      session.handleInput("\x0b"); // ^K
      const state = getState(session);
      expect(state.lines).toEqual(["line2", "line3"]);
      expect(state.cutBuffer).toBe("line1");
      expect(state.cursor.row).toBe(0);
    });

    it("cuts middle line", () => {
      const { session } = createSession("line1\nline2\nline3");
      session.handleInput("\x1b[B"); // down to line2
      session.handleInput("\x0b"); // ^K
      const state = getState(session);
      expect(state.lines).toEqual(["line1", "line3"]);
      expect(state.cutBuffer).toBe("line2");
      expect(state.cursor.row).toBe(1); // stays at same row index
    });

    it("cuts last line leaves empty line", () => {
      const { session } = createSession("only line");
      session.handleInput("\x0b"); // ^K
      const state = getState(session);
      expect(state.lines).toEqual([""]);
      expect(state.cutBuffer).toBe("only line");
      expect(state.cursor.row).toBe(0);
    });

    it("paste inserts below current line", () => {
      const { session } = createSession("line1\nline2\nline3");
      session.handleInput("\x0b"); // ^K cut line1
      session.handleInput("\x1b[B"); // down to line3
      session.handleInput("\x15"); // ^U paste
      const state = getState(session);
      // After cut: ["line2", "line3"], cursor at line2
      // After down: cursor at line3
      // After paste: inserts after line3
      expect(state.lines).toEqual(["line2", "line3", "line1"]);
    });

    it("paste with nothing cut does nothing", () => {
      const { session } = createSession("hello");
      session.handleInput("\x15"); // ^U paste (nothing cut)
      const state = getState(session);
      expect(state.lines).toEqual(["hello"]);
    });

    it("cut + paste restores the line", () => {
      const { session } = createSession("line1\nline2\nline3");
      session.handleInput("\x0b"); // ^K cut
      session.handleInput("\x15"); // ^U paste
      const state = getState(session);
      // Cut "line1" → ["line2", "line3"], paste inserts after current (line2)
      expect(state.lines).toEqual(["line2", "line1", "line3"]);
    });

    it("consecutive cuts replace buffer (differs from real nano)", () => {
      const { session } = createSession("line1\nline2\nline3");
      session.handleInput("\x0b"); // ^K cut line1
      session.handleInput("\x0b"); // ^K cut line2 (was line2, now first)
      const state = getState(session);
      expect(state.cutBuffer).toBe("line2");
      expect(state.lines).toEqual(["line3"]);
    });
  });

  describe("Exit behavior", () => {
    it("^X exit on unmodified file exits immediately", () => {
      const { session } = createSession("hello");
      const result = session.handleInput("\x18"); // ^X
      expect(result.type).toBe("exit");
    });

    it("^X exit with unsaved → Y saves and exits", () => {
      const { session, onSave } = createSession("hello");
      session.handleInput("x"); // modify
      const result1 = session.handleInput("\x18"); // ^X
      expect(result1.type).toBe("continue");
      expect(getState(session).promptState).toEqual({ type: "saveExit" });

      const result2 = session.handleInput("y");
      expect(result2.type).toBe("exit");
      expect(onSave).toHaveBeenCalled();
    });

    it("^X exit with unsaved → N exits without saving", () => {
      const { session, onSave } = createSession("hello");
      session.handleInput("x"); // modify
      session.handleInput("\x18"); // ^X
      const result = session.handleInput("n");
      expect(result.type).toBe("exit");
      expect(onSave).not.toHaveBeenCalled();
    });

    it("^X exit with unsaved → ^C cancels back to editing", () => {
      const { session } = createSession("hello");
      session.handleInput("x"); // modify
      session.handleInput("\x18"); // ^X
      const result = session.handleInput("\x03"); // ^C
      expect(result.type).toBe("continue");
      const state = getState(session);
      expect(state.promptState).toEqual({ type: "none" });
      expect(state.modified).toBe(true); // still modified
    });

    it("^X exit after saving exits without prompt", () => {
      const { session, onSave } = createSession("hello");
      session.handleInput("x"); // modify
      session.handleInput("\x13"); // ^S save
      expect(onSave).toHaveBeenCalled();
      const result = session.handleInput("\x18"); // ^X
      expect(result.type).toBe("exit"); // no prompt needed
    });

    it("unrecognized key at save-exit prompt does nothing", () => {
      const { session } = createSession("hello");
      session.handleInput("x"); // modify
      session.handleInput("\x18"); // ^X
      const result = session.handleInput("z"); // not Y/N/^C
      expect(result.type).toBe("continue");
      expect(getState(session).promptState).toEqual({ type: "saveExit" });
    });
  });

  describe("Help overlay", () => {
    it("^G toggles help", () => {
      const { session } = createSession("hello");
      session.handleInput("\x07"); // ^G
      expect(getState(session).showHelp).toBe(true);
      session.handleInput("\x07"); // ^G again
      expect(getState(session).showHelp).toBe(false);
    });

    it("any non-^G key dismisses help without action", () => {
      const { session } = createSession("hello");
      session.handleInput("\x07"); // ^G show help
      session.handleInput("x"); // any key dismisses
      const state = getState(session);
      expect(state.showHelp).toBe(false);
      expect(state.lines[0]).toBe("hello"); // 'x' was NOT inserted
    });
  });

  describe("Read-only mode", () => {
    it("blocks all editing operations", () => {
      const { session } = createSession("hello", { readOnly: true });

      session.handleInput("x"); // insert
      expect(getState(session).lines[0]).toBe("hello");

      session.handleInput("\r"); // enter
      expect(getState(session).lines.length).toBe(1);

      session.handleInput("\x7f"); // backspace
      expect(getState(session).lines[0]).toBe("hello");

      session.handleInput("\x1b[3~"); // delete
      expect(getState(session).lines[0]).toBe("hello");

      session.handleInput("\x0b"); // ^K cut
      expect(getState(session).lines[0]).toBe("hello");

      session.handleInput("\x0a"); // ^J justify
      expect(getState(session).lines[0]).toBe("hello");
    });

    it("allows navigation in read-only mode", () => {
      const { session } = createSession("hello\nworld", { readOnly: true });
      session.handleInput("\x1b[B"); // down
      expect(getState(session).cursor.row).toBe(1);
      session.handleInput("\x1b[C"); // right
      expect(getState(session).cursor.col).toBe(1);
    });

    it("allows search in read-only mode", () => {
      const { session } = createSession("hello world", { readOnly: true });
      session.handleInput("\x17world\r"); // ^W "world" Enter
      expect(getState(session).cursor.col).toBe(6);
    });

    it("blocks ^S save in read-only", () => {
      const { session, onSave } = createSession("hello", { readOnly: true });
      session.handleInput("\x13"); // ^S
      expect(onSave).not.toHaveBeenCalled();
      expect(getState(session).message).toBe("[ File is read-only ]");
    });
  });

  describe("Scrolling", () => {
    it("scrolls down when cursor goes below viewport", () => {
      const lines = Array.from({ length: 50 }, (_, i) => `line${i}`);
      const { session } = createSession(lines.join("\n"));
      // Content rows = 24 - 4 = 20, so after moving down 20 times, should scroll
      for (let i = 0; i < 25; i++) {
        session.handleInput("\x1b[B"); // down
      }
      const state = getState(session);
      expect(state.cursor.row).toBe(25);
      expect(state.scrollOffset).toBeGreaterThan(0);
      expect(state.scrollOffset).toBeLessThanOrEqual(state.cursor.row);
    });

    it("scrolls up when cursor goes above viewport", () => {
      const lines = Array.from({ length: 50 }, (_, i) => `line${i}`);
      const { session } = createSession(lines.join("\n"));
      // Go to line 30, then page up
      session.handleInput("\x1f30\r"); // goto line 30
      session.handleInput("\x1b[5~"); // PageUp
      const state = getState(session);
      expect(state.scrollOffset).toBeLessThanOrEqual(state.cursor.row);
    });
  });

  describe("Edge cases", () => {
    it("empty file has one empty line", () => {
      const { session } = createSession("");
      const state = getState(session);
      expect(state.lines).toEqual([""]);
      expect(state.cursor).toEqual({ row: 0, col: 0 });
    });

    it("typing into empty file works", () => {
      const { session } = createSession("");
      session.handleInput("hello");
      expect(getState(session).lines).toEqual(["hello"]);
    });

    it("search in empty file shows not found", () => {
      const { session } = createSession("");
      session.handleInput("\x17abc\r"); // ^W "abc" Enter
      expect(getState(session).message).toContain('"abc" not found');
    });

    it("saving clears modified flag", () => {
      const { session } = createSession("hello");
      session.handleInput("x");
      expect(getState(session).modified).toBe(true);
      session.handleInput("\x13"); // ^S save
      expect(getState(session).modified).toBe(false);
    });

    it("message clears on next edit", () => {
      const { session } = createSession("hello");
      session.handleInput("\x03"); // ^C show position
      expect(getState(session).message).not.toBeNull();
      session.handleInput("x"); // insert clears message
      expect(getState(session).message).toBeNull();
    });

    it("handles multi-line paste through writeFile correctly", () => {
      // This tests that lines containing newlines are properly split
      const { session } = createSession("a\n\n\nb");
      const state = getState(session);
      expect(state.lines).toEqual(["a", "", "", "b"]);
    });
  });
});
