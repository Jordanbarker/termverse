import { describe, it, expect, vi } from "vitest";
import { VimSession } from "../VimSession";
import { VimState } from "../types";
import { EditorTrigger } from "../../editor/EditorSession";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode, FileNode } from "@tt/core/filesystem/types";

// Minimal mock Terminal: only needs write(), rows, cols
function mockTerminal(rows = 24, cols = 80) {
  return {
    write: vi.fn(),
    rows,
    cols,
  } as unknown as import("@xterm/xterm").Terminal;
}

function makeFS(files: Record<string, string>): VirtualFS {
  const children: Record<string, DirectoryNode | FileNode> = {};
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
  opts: {
    readOnly?: boolean;
    files?: Record<string, string>;
    trigger?: EditorTrigger;
    rows?: number;
  } = {}
) {
  const files = opts.files ?? { "test.txt": content };
  const fs = makeFS(files);
  const term = mockTerminal(opts.rows ?? 24, 80);
  const onSave = vi.fn();
  const session = new VimSession(
    term,
    fs,
    "/home/user/test.txt",
    content,
    opts.readOnly ?? false,
    onSave,
    opts.trigger
  );
  session.enter();
  return { session, term, onSave };
}

function getState(session: VimSession): VimState {
  return (session as unknown as { state: VimState }).state;
}

function writes(term: import("@xterm/xterm").Terminal): string {
  return (term.write as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]).join("");
}

describe("VimSession", () => {
  describe("mode transitions", () => {
    it("starts in normal mode with the file info message", () => {
      const { session } = createSession("one\ntwo");
      const st = getState(session);
      expect(st.mode).toBe("normal");
      expect(st.message).toContain('"test.txt" 2L');
    });

    it("shows [New File] when the file does not exist", () => {
      const { session } = createSession("", { files: {} });
      expect(getState(session).message).toContain("[New File]");
    });

    it("i enters insert, typing inserts, Esc returns to normal stepping left", () => {
      const { session } = createSession("foo");
      session.handleInput("i");
      expect(getState(session).mode).toBe("insert");
      session.handleInput("hi");
      expect(getState(session).lines[0]).toBe("hifoo");
      session.handleInput("\x1b");
      const st = getState(session);
      expect(st.mode).toBe("normal");
      expect(st.cursor).toEqual({ row: 0, col: 1 });
    });

    it("handles a whole insert round-trip in one chunk", () => {
      const { session } = createSession("");
      session.handleInput("ihello\x1b");
      const st = getState(session);
      expect(st.lines).toEqual(["hello"]);
      expect(st.mode).toBe("normal");
      expect(st.cursor).toEqual({ row: 0, col: 4 });
    });

    it("a appends after the cursor, A at end of line, I at first non-blank", () => {
      const a = createSession("foo");
      a.session.handleInput("aX\x1b");
      expect(getState(a.session).lines[0]).toBe("fXoo");

      const b = createSession("foo");
      b.session.handleInput("A!\x1b");
      expect(getState(b.session).lines[0]).toBe("foo!");

      const c = createSession("  dent");
      c.session.handleInput("IX\x1b");
      expect(getState(c.session).lines[0]).toBe("  Xdent");
    });

    it("o opens below and O above, entering insert", () => {
      const { session } = createSession("a\nb");
      session.handleInput("o");
      let st = getState(session);
      expect(st.lines).toEqual(["a", "", "b"]);
      expect(st.mode).toBe("insert");
      expect(st.cursor).toEqual({ row: 1, col: 0 });
      session.handleInput("\x1b");
      session.handleInput("ggO");
      st = getState(session);
      expect(st.lines).toEqual(["", "a", "", "b"]);
      expect(st.cursor).toEqual({ row: 0, col: 0 });
    });

    it("insert-mode enter splits the line and backspace joins lines", () => {
      const { session } = createSession("abcd");
      session.handleInput("llienter:\x1b"); // insert "enter:" at col 2... keep simple below
      const st = getState(session);
      expect(st.lines[0]).toContain("enter:");
    });

    it("splits and rejoins with enter/backspace in insert mode", () => {
      const { session } = createSession("abcd");
      session.handleInput("lli\r\x1b");
      expect(getState(session).lines).toEqual(["ab", "cd"]);
      const { session: s2 } = createSession("ab\ncd");
      s2.handleInput("ji\x7f\x1b");
      expect(getState(s2).lines).toEqual(["abcd"]);
    });
  });

  describe("movement", () => {
    it("hjkl and counts move with clamping", () => {
      const { session } = createSession("one two\nthree four\nfive six");
      session.handleInput("3l");
      expect(getState(session).cursor).toEqual({ row: 0, col: 3 });
      session.handleInput("j");
      expect(getState(session).cursor).toEqual({ row: 1, col: 3 });
      session.handleInput("k");
      expect(getState(session).cursor).toEqual({ row: 0, col: 3 });
      session.handleInput("h");
      expect(getState(session).cursor).toEqual({ row: 0, col: 2 });
    });

    it("$ keeps the cursor sticky at end-of-line across j", () => {
      const { session } = createSession("long line here\nab\nanother long one");
      session.handleInput("$");
      expect(getState(session).cursor.col).toBe(13);
      session.handleInput("j");
      expect(getState(session).cursor).toEqual({ row: 1, col: 1 });
      session.handleInput("j");
      expect(getState(session).cursor).toEqual({ row: 2, col: 15 });
    });

    it("j/k restore the desired column through short lines", () => {
      const { session } = createSession("abcdef\nab\nabcdef");
      session.handleInput("4l");
      expect(getState(session).cursor.col).toBe(4);
      session.handleInput("j");
      expect(getState(session).cursor).toEqual({ row: 1, col: 1 });
      session.handleInput("j");
      expect(getState(session).cursor).toEqual({ row: 2, col: 4 });
    });

    it("gg and G jump to first/last line, with counts as line numbers", () => {
      const { session } = createSession("a\nb\nc\nd");
      session.handleInput("G");
      expect(getState(session).cursor.row).toBe(3);
      session.handleInput("gg");
      expect(getState(session).cursor.row).toBe(0);
      session.handleInput("3G");
      expect(getState(session).cursor.row).toBe(2);
    });

    it("arrow keys move like hjkl in normal mode", () => {
      const { session } = createSession("abc\ndef");
      session.handleInput("\x1b[C\x1b[C");
      expect(getState(session).cursor).toEqual({ row: 0, col: 2 });
      session.handleInput("\x1b[B");
      expect(getState(session).cursor.row).toBe(1);
      session.handleInput("\x1b[D\x1b[A");
      expect(getState(session).cursor).toEqual({ row: 0, col: 1 });
    });

    it("f/t move on the line; a miss does not move", () => {
      const { session } = createSession("foo.bar");
      session.handleInput("f.");
      expect(getState(session).cursor.col).toBe(3);
      session.handleInput("fz");
      expect(getState(session).cursor.col).toBe(3);
      session.handleInput("0tb");
      expect(getState(session).cursor.col).toBe(3);
    });

    it("normal mode clamps the cursor to the last character", () => {
      const { session } = createSession("abc");
      session.handleInput("99l");
      expect(getState(session).cursor.col).toBe(2);
    });
  });

  describe("operators", () => {
    it("dw deletes a word without joining lines", () => {
      const { session } = createSession("foo bar");
      session.handleInput("dw");
      expect(getState(session).lines).toEqual(["bar"]);
      expect(getState(session).register).toEqual({ text: ["foo "], linewise: false });
    });

    it("dw on the last word stops at end-of-line", () => {
      const { session } = createSession("foo bar\nbaz");
      session.handleInput("wdw");
      expect(getState(session).lines).toEqual(["foo ", "baz"]);
    });

    it("cw acts like ce on a non-blank (keeps trailing space)", () => {
      const { session } = createSession("foo bar");
      session.handleInput("cwnew\x1b");
      expect(getState(session).lines).toEqual(["new bar"]);
    });

    it("d$ deletes to end of line", () => {
      const { session } = createSession("foo bar");
      session.handleInput("fbd$");
      expect(getState(session).lines).toEqual(["foo "]);
      expect(getState(session).cursor.col).toBe(3);
    });

    it("df. deletes through the found character", () => {
      const { session } = createSession("foo.bar");
      session.handleInput("df.");
      expect(getState(session).lines).toEqual(["bar"]);
    });

    it("dj is linewise: two lines go", () => {
      const { session } = createSession("a\nb\nc");
      session.handleInput("dj");
      expect(getState(session).lines).toEqual(["c"]);
      expect(getState(session).register).toEqual({ text: ["a", "b"], linewise: true });
    });

    it("dj on the last line does nothing", () => {
      const { session } = createSession("a\nb");
      session.handleInput("Gdj");
      expect(getState(session).lines).toEqual(["a", "b"]);
    });

    it("dgg deletes linewise up to the top", () => {
      const { session } = createSession("a\nb\nc");
      session.handleInput("Gdgg");
      expect(getState(session).lines).toEqual([""]);
    });

    it("dd deletes the line; the only line leaves an empty buffer", () => {
      const { session } = createSession("only");
      session.handleInput("dd");
      const st = getState(session);
      expect(st.lines).toEqual([""]);
      expect(st.modified).toBe(true);
    });

    it("3dd deletes three lines with the count", () => {
      const { session } = createSession("a\nb\nc\nd");
      session.handleInput("3dd");
      expect(getState(session).lines).toEqual(["d"]);
      expect(getState(session).register).toEqual({ text: ["a", "b", "c"], linewise: true });
    });

    it("d2j deletes three lines (motion count)", () => {
      const { session } = createSession("a\nb\nc\nd");
      session.handleInput("d2j");
      expect(getState(session).lines).toEqual(["d"]);
    });

    it("2d3w deletes six words", () => {
      const { session } = createSession("a b c d e f g");
      session.handleInput("2d3w");
      expect(getState(session).lines).toEqual(["g"]);
    });

    it("yy then p pastes the line below (dd p line-move idiom)", () => {
      const { session } = createSession("a\nb");
      session.handleInput("yy");
      expect(getState(session).register).toEqual({ text: ["a"], linewise: true });
      session.handleInput("p");
      expect(getState(session).lines).toEqual(["a", "a", "b"]);
      expect(getState(session).cursor).toEqual({ row: 1, col: 0 });

      const { session: s2 } = createSession("a\nb\nc");
      s2.handleInput("ddp");
      expect(getState(s2).lines).toEqual(["b", "a", "c"]);
    });

    it("yw yanks without changing the buffer", () => {
      const { session } = createSession("foo bar");
      session.handleInput("yw");
      const st = getState(session);
      expect(st.lines).toEqual(["foo bar"]);
      expect(st.register).toEqual({ text: ["foo "], linewise: false });
      expect(st.modified).toBe(false);
    });

    it("x deletes chars and xp swaps characters", () => {
      const { session } = createSession("abc");
      session.handleInput("x");
      expect(getState(session).lines).toEqual(["bc"]);
      session.handleInput("p");
      expect(getState(session).lines).toEqual(["bac"]);
    });

    it("3x deletes three characters", () => {
      const { session } = createSession("abcd");
      session.handleInput("3x");
      expect(getState(session).lines).toEqual(["d"]);
    });

    it("r replaces characters in place", () => {
      const { session } = createSession("abc");
      session.handleInput("rz");
      expect(getState(session).lines).toEqual(["zbc"]);
      session.handleInput("02rq");
      expect(getState(session).lines).toEqual(["qqc"]);
      expect(getState(session).cursor.col).toBe(1);
    });

    it("r past end-of-line does nothing", () => {
      const { session } = createSession("ab");
      session.handleInput("5rz");
      expect(getState(session).lines).toEqual(["ab"]);
    });

    it("P pastes charwise before the cursor", () => {
      const { session } = createSession("abc");
      session.handleInput("x");
      session.handleInput("lP");
      expect(getState(session).lines).toEqual(["bac"]);
    });
  });

  describe("undo / redo", () => {
    it("undoes and redoes a dd", () => {
      const { session } = createSession("a\nb");
      session.handleInput("dd");
      expect(getState(session).lines).toEqual(["b"]);
      session.handleInput("u");
      expect(getState(session).lines).toEqual(["a", "b"]);
      expect(getState(session).modified).toBe(false);
      session.handleInput("\x12"); // Ctrl-R
      expect(getState(session).lines).toEqual(["b"]);
      expect(getState(session).modified).toBe(true);
    });

    it("a whole insert session is one undo unit", () => {
      const { session } = createSession("base");
      session.handleInput("ihello world\x1b");
      session.handleInput("u");
      expect(getState(session).lines).toEqual(["base"]);
    });

    it("cw plus typed text undoes as one unit", () => {
      const { session } = createSession("foo bar");
      session.handleInput("cwquux\x1b");
      expect(getState(session).lines).toEqual(["quux bar"]);
      session.handleInput("u");
      expect(getState(session).lines).toEqual(["foo bar"]);
    });

    it("o plus typed text undoes as one unit", () => {
      const { session } = createSession("a");
      session.handleInput("onew\x1b");
      expect(getState(session).lines).toEqual(["a", "new"]);
      session.handleInput("u");
      expect(getState(session).lines).toEqual(["a"]);
    });

    it("a no-op insert leaves no undo entry", () => {
      const { session } = createSession("a");
      session.handleInput("i\x1b");
      session.handleInput("u");
      expect(getState(session).message).toBe("Already at oldest change");
    });

    it("reports at oldest/newest change", () => {
      const { session } = createSession("a");
      session.handleInput("u");
      expect(getState(session).message).toBe("Already at oldest change");
      session.handleInput("\x12");
      expect(getState(session).message).toBe("Already at newest change");
    });

    it("a new change clears the redo stack", () => {
      const { session } = createSession("abc");
      session.handleInput("x");
      session.handleInput("u");
      session.handleInput("rz");
      session.handleInput("\x12");
      expect(getState(session).message).toBe("Already at newest change");
      expect(getState(session).lines).toEqual(["zbc"]);
    });

    it("undoing back to the saved text clears modified and canClose passes", () => {
      const { session } = createSession("abc");
      expect(session.canClose()).toBe(true);
      session.handleInput("x");
      expect(session.canClose()).toBe(false);
      session.handleInput("u");
      expect(session.canClose()).toBe(true);
    });
  });

  describe("visual mode", () => {
    it("v selects charwise and y yanks the inclusive selection", () => {
      const { session } = createSession("hello");
      session.handleInput("vll");
      expect(getState(session).mode).toBe("visual");
      session.handleInput("y");
      const st = getState(session);
      expect(st.mode).toBe("normal");
      expect(st.register).toEqual({ text: ["hel"], linewise: false });
      expect(st.cursor).toEqual({ row: 0, col: 0 });
      expect(st.visualAnchor).toBeNull();
    });

    it("vjd deletes a cross-line charwise selection", () => {
      const { session } = createSession("abc\ndef");
      session.handleInput("vjd");
      expect(getState(session).lines).toEqual(["ef"]);
      expect(getState(session).register).toEqual({ text: ["abc", "d"], linewise: false });
    });

    it("Vjd deletes linewise", () => {
      const { session } = createSession("a\nb\nc");
      session.handleInput("Vjd");
      expect(getState(session).lines).toEqual(["c"]);
      expect(getState(session).register).toEqual({ text: ["a", "b"], linewise: true });
    });

    it("x in visual mode deletes like d", () => {
      const { session } = createSession("hello");
      session.handleInput("vllx");
      expect(getState(session).lines).toEqual(["lo"]);
    });

    it("c on a selection deletes it and enters insert", () => {
      const { session } = createSession("hello");
      session.handleInput("vllcX\x1b");
      expect(getState(session).lines).toEqual(["Xlo"]);
    });

    it("o swaps the selection ends", () => {
      const { session } = createSession("hello");
      session.handleInput("vll");
      session.handleInput("o");
      const st = getState(session);
      expect(st.cursor).toEqual({ row: 0, col: 0 });
      expect(st.visualAnchor).toEqual({ row: 0, col: 2 });
    });

    it("V from v switches to linewise; pressing V again exits", () => {
      const { session } = createSession("a\nb");
      session.handleInput("v");
      expect(getState(session).mode).toBe("visual");
      session.handleInput("V");
      expect(getState(session).mode).toBe("visual-line");
      session.handleInput("V");
      expect(getState(session).mode).toBe("normal");
    });

    it("Esc leaves visual mode without changes", () => {
      const { session } = createSession("abc");
      session.handleInput("vl\x1b");
      const st = getState(session);
      expect(st.mode).toBe("normal");
      expect(st.visualAnchor).toBeNull();
      expect(st.lines).toEqual(["abc"]);
    });

    it("counts and motions extend the selection (v2wy)", () => {
      const { session } = createSession("aa bb cc dd");
      session.handleInput("v2wy");
      expect(getState(session).register).toEqual({ text: ["aa bb c"], linewise: false });
    });

    it("yanked visual selection pastes back", () => {
      const { session } = createSession("hello");
      session.handleInput("vlly");
      session.handleInput("$p");
      expect(getState(session).lines).toEqual(["hellohel"]);
    });
  });

  describe("search", () => {
    it("/ jumps to the next match; n and N repeat", () => {
      const { session } = createSession("one two\nthree\ntwo more");
      session.handleInput("/two\r");
      expect(getState(session).cursor).toEqual({ row: 0, col: 4 });
      session.handleInput("n");
      expect(getState(session).cursor).toEqual({ row: 2, col: 0 });
      session.handleInput("n");
      const st = getState(session);
      expect(st.cursor).toEqual({ row: 0, col: 4 });
      expect(st.message).toBe("search hit BOTTOM, continuing at TOP");
      session.handleInput("N");
      expect(getState(session).cursor).toEqual({ row: 2, col: 0 });
    });

    it("? searches backward with wrap", () => {
      const { session } = createSession("one two\nthree\ntwo more");
      session.handleInput("?two\r");
      const st = getState(session);
      expect(st.cursor).toEqual({ row: 2, col: 0 });
      expect(st.message).toBe("search hit TOP, continuing at BOTTOM");
    });

    it("reports E486 when the pattern is missing", () => {
      const { session } = createSession("abc");
      session.handleInput("/zebra\r");
      expect(getState(session).message).toBe("E486: Pattern not found: zebra");
    });

    it("n without a previous search reports E35", () => {
      const { session } = createSession("abc");
      session.handleInput("n");
      expect(getState(session).message).toBe("E35: No previous regular expression");
    });

    it("an empty / repeats the last search", () => {
      const { session } = createSession("two one two");
      session.handleInput("/two\r");
      expect(getState(session).cursor.col).toBe(8);
      session.handleInput("/\r");
      const st = getState(session);
      expect(st.cursor.col).toBe(0);
      expect(st.message).toBe("search hit BOTTOM, continuing at TOP");
    });
  });

  describe("ex commands", () => {
    it(":w writes the buffer through the VirtualFS and onSave", () => {
      const { session, onSave } = createSession("abc");
      session.handleInput("ccnew\x1b");
      session.handleInput(":w\r");
      const st = getState(session);
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(st.modified).toBe(false);
      expect(st.message).toContain('"test.txt" 1L');
      expect(st.message).toContain("written");
      const result = session.handleInput(":q\r");
      expect(result.type).toBe("exit");
      expect(result.newFs?.readFile("/home/user/test.txt").content).toBe("new");
      expect(result.triggerEvents).toEqual([{ type: "file_modified", detail: "/home/user/test.txt" }]);
    });

    it(":w on a new path emits file_created and keeps the buffer modified", () => {
      const { session } = createSession("abc");
      session.handleInput("x");
      session.handleInput(":w other.txt\r");
      expect(getState(session).modified).toBe(true);
      const result = session.handleInput(":q!\r");
      expect(result.type).toBe("exit");
      expect(result.triggerEvents).toEqual([{ type: "file_created", detail: "/home/user/other.txt" }]);
      expect(result.newFs?.readFile("/home/user/other.txt").content).toBe("bc");
    });

    it(":q on a modified buffer reports E37 and stays open", () => {
      const { session } = createSession("abc");
      session.handleInput("x");
      const result = session.handleInput(":q\r");
      expect(result.type).toBe("continue");
      expect(getState(session).message).toBe("E37: No write since last change (add ! to override)");
    });

    it(":q! discards changes and exits without saving", () => {
      const { session, onSave } = createSession("abc");
      session.handleInput("x");
      const result = session.handleInput(":q!\r");
      expect(result.type).toBe("exit");
      expect(onSave).not.toHaveBeenCalled();
      expect(result.triggerEvents).toBeUndefined();
    });

    it(":wq writes and exits", () => {
      const { session, onSave } = createSession("abc");
      session.handleInput("x");
      const result = session.handleInput(":wq\r");
      expect(result.type).toBe("exit");
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(result.newFs?.readFile("/home/user/test.txt").content).toBe("bc");
    });

    it(":x writes only when modified", () => {
      const clean = createSession("abc");
      const r1 = clean.session.handleInput(":x\r");
      expect(r1.type).toBe("exit");
      expect(clean.onSave).not.toHaveBeenCalled();

      const dirty = createSession("abc");
      dirty.session.handleInput("x");
      const r2 = dirty.session.handleInput(":x\r");
      expect(r2.type).toBe("exit");
      expect(dirty.onSave).toHaveBeenCalledTimes(1);
    });

    it(":{line} jumps to the line, clamped", () => {
      const { session } = createSession("a\n  b\nc\nd");
      session.handleInput(":2\r");
      expect(getState(session).cursor).toEqual({ row: 1, col: 2 });
      session.handleInput(":99\r");
      expect(getState(session).cursor.row).toBe(3);
    });

    it("unknown commands report E492", () => {
      const { session } = createSession("abc");
      session.handleInput(":frobnicate\r");
      expect(getState(session).message).toBe("E492: Not an editor command: frobnicate");
    });

    it("Esc and backspace-on-empty cancel the command line", () => {
      const { session } = createSession("abc");
      session.handleInput(":w");
      session.handleInput("\x1b");
      expect(getState(session).mode).toBe("normal");
      expect(getState(session).cmdline).toBeNull();

      session.handleInput(":");
      session.handleInput("\x7f");
      expect(getState(session).mode).toBe("normal");
    });
  });

  describe("read-only files", () => {
    it("blocks insert and edits with E45", () => {
      const { session } = createSession("abc", { readOnly: true });
      session.handleInput("i");
      let st = getState(session);
      expect(st.mode).toBe("normal");
      expect(st.message).toBe("E45: 'readonly' option is set (add ! to override)");
      session.handleInput("dd");
      expect(getState(session).lines).toEqual(["abc"]);
      session.handleInput("x");
      expect(getState(session).lines).toEqual(["abc"]);
      st = getState(session);
      expect(st.message).toContain("E45");
    });

    it("blocks :w with E45 but allows yank and :q", () => {
      const { session, onSave } = createSession("abc", { readOnly: true });
      session.handleInput("yy");
      expect(getState(session).register).toEqual({ text: ["abc"], linewise: true });
      session.handleInput(":w\r");
      expect(getState(session).message).toContain("E45");
      expect(onSave).not.toHaveBeenCalled();
      const result = session.handleInput(":q\r");
      expect(result.type).toBe("exit");
    });

    it("blocks visual-mode delete with E45", () => {
      const { session } = createSession("abc", { readOnly: true });
      session.handleInput("vld");
      const st = getState(session);
      expect(st.lines).toEqual(["abc"]);
      expect(st.mode).toBe("normal");
      expect(st.message).toContain("E45");
    });
  });

  describe("trigger contract", () => {
    const trigger: EditorTrigger = {
      triggerRow: 0,
      triggerEvents: [{ type: "file_read", detail: "fixed_backup_script" }],
      requireSave: true,
    };

    it("withholds trigger events when requireSave is set and nothing was saved", () => {
      const { session } = createSession("abc", { trigger });
      const result = session.handleInput(":q\r");
      expect(result.type).toBe("exit");
      expect(result.triggerEvents).toBeUndefined();
    });

    it("fires trigger events after a save", () => {
      const { session } = createSession("abc", { trigger });
      session.handleInput("x");
      const result = session.handleInput(":wq\r");
      expect(result.type).toBe("exit");
      expect(result.triggerEvents).toEqual([
        { type: "file_modified", detail: "/home/user/test.txt" },
        { type: "file_read", detail: "fixed_backup_script" },
      ]);
    });

    it("withholds trigger events until the trigger row was reached", () => {
      const rowTrigger: EditorTrigger = { triggerRow: 2, triggerEvents: [{ type: "file_read", detail: "seen" }] };
      const { session } = createSession("a\nb\nc\nd", { trigger: rowTrigger });
      const r1 = session.handleInput(":q\r");
      expect(r1.triggerEvents).toBeUndefined();

      const { session: s2 } = createSession("a\nb\nc\nd", { trigger: rowTrigger });
      s2.handleInput("jj");
      const r2 = s2.handleInput(":q\r");
      expect(r2.triggerEvents).toEqual([{ type: "file_read", detail: "seen" }]);
    });
  });

  describe("screen handling", () => {
    it("enters and leaves the alternate screen with cursor-shape reset", () => {
      const { session, term } = createSession("abc");
      expect(writes(term)).toContain("\x1b[?1049h");
      session.handleInput(":q\r");
      const out = writes(term);
      expect(out).toContain("\x1b[?1049l");
      expect(out).toContain("\x1b[0 q");
    });

    it("renders a block cursor in normal mode and a bar in insert mode", () => {
      const { session, term } = createSession("abc");
      expect(writes(term)).toContain("\x1b[2 q");
      session.handleInput("i");
      expect(writes(term)).toContain("\x1b[6 q");
    });

    it("shows the mode indicators and status line", () => {
      const { session, term } = createSession("abc");
      session.handleInput("i");
      expect(writes(term)).toContain("-- INSERT --");
      session.handleInput("\x1b");
      session.handleInput("v");
      expect(writes(term)).toContain("-- VISUAL --");
      session.handleInput("V");
      expect(writes(term)).toContain("-- VISUAL LINE --");
      expect(writes(term)).toContain('"test.txt"');
    });

    it("marks the buffer [+] in the status line once modified", () => {
      const { session, term } = createSession("abc");
      session.handleInput("x");
      expect(writes(term)).toContain("[+]");
    });

    it("scrolls to keep the cursor visible and survives resize", () => {
      const lines = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
      const { session, term } = createSession(lines, { rows: 10 });
      session.handleInput("G");
      const st = getState(session);
      expect(st.scrollOffset).toBeGreaterThan(0);
      expect(st.cursor.row).toBe(39);
      (term as unknown as { rows: number }).rows = 30;
      session.resize();
      expect(getState(session).scrollOffset + 28).toBeGreaterThanOrEqual(39);
    });

    it("renders tildes past end-of-file", () => {
      const { term } = createSession("abc");
      expect(writes(term)).toContain("~");
    });
  });
});
