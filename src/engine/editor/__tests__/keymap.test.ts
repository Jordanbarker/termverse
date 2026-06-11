import { describe, it, expect } from "vitest";
import { parseEditorInput } from "../keymap";

describe("parseEditorInput", () => {
  describe("escape sequences", () => {
    it("parses arrow keys", () => {
      expect(parseEditorInput("\x1b[A")).toEqual([{ type: "arrowUp" }]);
      expect(parseEditorInput("\x1b[B")).toEqual([{ type: "arrowDown" }]);
      expect(parseEditorInput("\x1b[C")).toEqual([{ type: "arrowRight" }]);
      expect(parseEditorInput("\x1b[D")).toEqual([{ type: "arrowLeft" }]);
    });

    it("parses Home and End", () => {
      expect(parseEditorInput("\x1b[H")).toEqual([{ type: "home" }]);
      expect(parseEditorInput("\x1b[F")).toEqual([{ type: "end" }]);
    });

    it("parses Delete key", () => {
      expect(parseEditorInput("\x1b[3~")).toEqual([{ type: "delete" }]);
    });

    it("parses PageUp and PageDown", () => {
      expect(parseEditorInput("\x1b[5~")).toEqual([{ type: "pageUp" }]);
      expect(parseEditorInput("\x1b[6~")).toEqual([{ type: "pageDown" }]);
    });

    it("skips unknown escape sequences", () => {
      expect(parseEditorInput("\x1b[Z")).toEqual([]);
    });

    it("handles modified arrow keys (Option/Alt+Arrow)", () => {
      // \x1b[1;3A = Alt+Up, \x1b[1;3B = Alt+Down, etc.
      expect(parseEditorInput("\x1b[1;3A")).toEqual([{ type: "arrowUp" }]);
      expect(parseEditorInput("\x1b[1;3B")).toEqual([{ type: "arrowDown" }]);
      expect(parseEditorInput("\x1b[1;3C")).toEqual([{ type: "arrowRight" }]);
      expect(parseEditorInput("\x1b[1;3D")).toEqual([{ type: "arrowLeft" }]);
    });

    it("handles Shift+Arrow and Ctrl+Arrow keys", () => {
      // ;2 = Shift, ;5 = Ctrl
      expect(parseEditorInput("\x1b[1;2C")).toEqual([{ type: "arrowRight" }]);
      expect(parseEditorInput("\x1b[1;5A")).toEqual([{ type: "arrowUp" }]);
    });

    it("Ctrl+Left/Right jump by word like real nano", () => {
      expect(parseEditorInput("\x1b[1;5C")).toEqual([{ type: "wordRight" }]);
      expect(parseEditorInput("\x1b[1;5D")).toEqual([{ type: "wordLeft" }]);
      // Other modifiers stay plain arrows
      expect(parseEditorInput("\x1b[1;2D")).toEqual([{ type: "arrowLeft" }]);
      expect(parseEditorInput("\x1b[1;3D")).toEqual([{ type: "arrowLeft" }]);
    });

    it("handles modified tilde sequences", () => {
      // \x1b[3;3~ = Alt+Delete, \x1b[5;5~ = Ctrl+PageUp
      expect(parseEditorInput("\x1b[3;3~")).toEqual([{ type: "delete" }]);
      expect(parseEditorInput("\x1b[5;5~")).toEqual([{ type: "pageUp" }]);
    });

    it("does not leak modifier params as text", () => {
      // Previously, \x1b[1;3C would insert ";3C" as text
      const actions = parseEditorInput("\x1b[1;3C");
      const inserts = actions.filter((a) => a.type === "insert");
      expect(inserts).toEqual([]);
    });
  });

  describe("Ctrl combinations", () => {
    it("Ctrl+A → home", () => {
      expect(parseEditorInput("\x01")).toEqual([{ type: "home" }]);
    });

    it("Ctrl+C → showPosition", () => {
      expect(parseEditorInput("\x03")).toEqual([{ type: "showPosition" }]);
    });

    it("Ctrl+E → end", () => {
      expect(parseEditorInput("\x05")).toEqual([{ type: "end" }]);
    });

    it("Ctrl+G → help", () => {
      expect(parseEditorInput("\x07")).toEqual([{ type: "help" }]);
    });

    it("Ctrl+J (\\n / code 10) → justify", () => {
      expect(parseEditorInput("\x0a")).toEqual([{ type: "justify" }]);
    });

    it("Tab → insert tab character", () => {
      expect(parseEditorInput("\x09")).toEqual([{ type: "insert", char: "\t" }]);
    });

    it("Ctrl+K → cutLine", () => {
      expect(parseEditorInput("\x0b")).toEqual([{ type: "cutLine" }]);
    });

    it("Ctrl+O → writeOut", () => {
      expect(parseEditorInput("\x0f")).toEqual([{ type: "writeOut" }]);
    });

    it("Ctrl+R → readFile", () => {
      expect(parseEditorInput("\x12")).toEqual([{ type: "readFile" }]);
    });

    it("Ctrl+S → save", () => {
      expect(parseEditorInput("\x13")).toEqual([{ type: "save" }]);
    });

    it("Ctrl+T → execute", () => {
      expect(parseEditorInput("\x14")).toEqual([{ type: "execute" }]);
    });

    it("Ctrl+U → pasteLine", () => {
      expect(parseEditorInput("\x15")).toEqual([{ type: "pasteLine" }]);
    });

    it("Ctrl+V → pageDown", () => {
      expect(parseEditorInput("\x16")).toEqual([{ type: "pageDown" }]);
    });

    it("Ctrl+W → search", () => {
      expect(parseEditorInput("\x17")).toEqual([{ type: "search" }]);
    });

    it("Ctrl+X → exit", () => {
      expect(parseEditorInput("\x18")).toEqual([{ type: "exit" }]);
    });

    it("Ctrl+Y → pageUp", () => {
      expect(parseEditorInput("\x19")).toEqual([{ type: "pageUp" }]);
    });

    it("Ctrl+\\ → replace", () => {
      expect(parseEditorInput("\x1c")).toEqual([{ type: "replace" }]);
    });

    it("Ctrl+_ → gotoLine", () => {
      expect(parseEditorInput("\x1f")).toEqual([{ type: "gotoLine" }]);
    });
  });

  describe("basic keys", () => {
    it("parses Backspace (127 and 8)", () => {
      expect(parseEditorInput("\x7f")).toEqual([{ type: "backspace" }]);
      expect(parseEditorInput("\x08")).toEqual([{ type: "backspace" }]);
    });

    it("parses Enter (\\r)", () => {
      expect(parseEditorInput("\r")).toEqual([{ type: "enter" }]);
    });

    it("\\n maps to justify, not enter", () => {
      expect(parseEditorInput("\n")).toEqual([{ type: "justify" }]);
    });

    it("parses printable characters", () => {
      expect(parseEditorInput("a")).toEqual([{ type: "insert", char: "a" }]);
      expect(parseEditorInput("Z")).toEqual([{ type: "insert", char: "Z" }]);
      expect(parseEditorInput(" ")).toEqual([{ type: "insert", char: " " }]);
    });
  });

  describe("multi-character input", () => {
    it("parses multiple characters into multiple actions", () => {
      const actions = parseEditorInput("abc");
      expect(actions).toEqual([
        { type: "insert", char: "a" },
        { type: "insert", char: "b" },
        { type: "insert", char: "c" },
      ]);
    });

    it("handles mixed input types", () => {
      // "a" + Enter + Ctrl+X
      const actions = parseEditorInput("a\r\x18");
      expect(actions).toEqual([
        { type: "insert", char: "a" },
        { type: "enter" },
        { type: "exit" },
      ]);
    });

    it("handles escape sequence followed by text", () => {
      const actions = parseEditorInput("\x1b[Ahello");
      expect(actions[0]).toEqual({ type: "arrowUp" });
      expect(actions[1]).toEqual({ type: "insert", char: "h" });
      expect(actions).toHaveLength(6); // arrowUp + h,e,l,l,o
    });

    it("handles mixed Enter + text + search", () => {
      const actions = parseEditorInput("\rtest\x17");
      expect(actions).toEqual([
        { type: "enter" },
        { type: "insert", char: "t" },
        { type: "insert", char: "e" },
        { type: "insert", char: "s" },
        { type: "insert", char: "t" },
        { type: "search" },
      ]);
    });
  });

  describe("edge cases", () => {
    it("returns empty array for empty input", () => {
      expect(parseEditorInput("")).toEqual([]);
    });

    it("skips unknown control characters", () => {
      // Ctrl+B (0x02) is not mapped
      expect(parseEditorInput("\x02")).toEqual([]);
    });
  });
});
