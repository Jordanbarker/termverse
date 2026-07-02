import { describe, it, expect, beforeEach } from "vitest";
import { Terminal } from "@xterm/xterm";
import { LineEditor, LineEditorResult } from "../lineEditor";
import { SuggestionContext } from "../../suggestions/suggest";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";

/**
 * Minimal xterm stub: captures every `write()` and models the cursor geometry the
 * completion-menu renderer reads (cursorX/cursorY/rows/cols). Buffer/cursor *state*
 * is verified indirectly via the submitted input string and emitted ANSI.
 */
class FakeTerminal {
  cols = 80;
  rows = 24;
  output = "";
  buffer = { active: { cursorX: 0, cursorY: 0 } };
  write(s: string): void {
    this.output += s;
  }
  clear(): void {
    this.output = "";
  }
}

function makeTerm(): { term: Terminal; fake: FakeTerminal } {
  const fake = new FakeTerminal();
  return { term: fake as unknown as Terminal, fake };
}

function createTestFS(): VirtualFS {
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
          player: {
            type: "directory",
            name: "player",
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {},
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/player", "/home/player");
}

function makeCtx(history: string[] = []): SuggestionContext {
  const fs = createTestFS();
  return {
    commandHistory: history,
    commandNames: ["ls", "cd", "cat", "clear", "help"],
    fs,
    cwd: fs.cwd,
    homeDir: fs.homeDir,
  };
}

const PROMPT = "$ ";

function makeEditor(opts?: { history?: string[]; context?: SuggestionContext | null }) {
  const history = opts?.history ?? [];
  const context = opts?.context === undefined ? makeCtx(history) : opts.context;
  return new LineEditor({
    getContext: () => context,
    getHistory: () => history,
    getPrompt: () => PROMPT,
  });
}

/** Feed each chunk; return the submit result if one fired (else null). */
function feed(editor: LineEditor, term: Terminal, ...chunks: string[]): LineEditorResult | null {
  let result: LineEditorResult | null = null;
  for (const chunk of chunks) {
    const r = editor.handleData(term, chunk);
    if (r) result = r;
  }
  return result;
}

const LEFT = "\x1b[D";
const RIGHT = "\x1b[C";
const UP = "\x1b[A";
const DOWN = "\x1b[B";
const ENTER = "\r";
const BACKSPACE = "\x7f";
const DELETE = "\x1b[3~";
const HOME = "\x1b[H";
const END = "\x1b[F";
const OPT_LEFT = "\x1b[1;3D";
const OPT_RIGHT = "\x1b[1;3C";
const CTRL_A = "\x01";
const CTRL_C = "\x03";
const CTRL_D = "\x04";
const CTRL_E = "\x05";
const CTRL_U = "\x15";
const CTRL_W = "\x17";
const CTRL_L = "\x0c";

describe("LineEditor", () => {
  let term: Terminal;
  let fake: FakeTerminal;

  beforeEach(() => {
    ({ term, fake } = makeTerm());
  });

  describe("basic typing + submit", () => {
    it("submits the typed line on Enter", () => {
      const ed = makeEditor();
      const res = feed(ed, term, "l", "s", " ", "-", "a", ENTER);
      expect(res).toEqual({ type: "submit", input: "ls -a" });
    });

    it("echoes printable characters", () => {
      const ed = makeEditor();
      feed(ed, term, "h", "i");
      expect(fake.output).toContain("h");
      expect(fake.output).toContain("i");
    });

    it("empty Enter does not submit and reprints the prompt", () => {
      const ed = makeEditor();
      const res = feed(ed, term, ENTER);
      expect(res).toBeNull();
      expect(fake.output).toContain(PROMPT);
    });

    it("clears its line state after submit", () => {
      const ed = makeEditor();
      feed(ed, term, "a", "b", ENTER);
      const res = feed(ed, term, "x", ENTER);
      expect(res).toEqual({ type: "submit", input: "x" });
    });
  });

  describe("cursor-aware mid-line editing", () => {
    it("inserts at the cursor after moving left", () => {
      const ed = makeEditor();
      const res = feed(ed, term, "a", "b", "c", LEFT, LEFT, "X", ENTER);
      expect(res?.input).toBe("aXbc");
    });

    it("emits a left-move escape on left arrow", () => {
      const ed = makeEditor();
      feed(ed, term, "a", "b");
      fake.clear();
      feed(ed, term, LEFT);
      expect(fake.output).toContain("\x1b[D");
    });

    it("backspaces the char before the cursor mid-line", () => {
      const ed = makeEditor();
      const res = feed(ed, term, "a", "b", "c", LEFT, BACKSPACE, ENTER);
      expect(res?.input).toBe("ac");
    });

    it("right arrow moves the cursor back into the line", () => {
      const ed = makeEditor();
      const res = feed(ed, term, "a", "b", "c", LEFT, LEFT, RIGHT, "X", ENTER);
      expect(res?.input).toBe("abXc");
    });

    it("Delete removes the char at the cursor", () => {
      const ed = makeEditor();
      const res = feed(ed, term, "a", "b", "c", HOME, DELETE, ENTER);
      expect(res?.input).toBe("bc");
    });
  });

  describe("Home / End", () => {
    it("Home jumps to start, End jumps to end", () => {
      const ed = makeEditor();
      const res = feed(ed, term, "a", "b", "c", HOME, "X", END, "Y", ENTER);
      expect(res?.input).toBe("XabcY");
    });

    it("Ctrl+A behaves as Home, Ctrl+E as End", () => {
      const ed = makeEditor();
      const res = feed(ed, term, "a", "b", "c", CTRL_A, "X", CTRL_E, "Y", ENTER);
      expect(res?.input).toBe("XabcY");
    });
  });

  describe("word-skip", () => {
    it("Option+Left jumps back one word", () => {
      const ed = makeEditor();
      const res = feed(ed, term, ..."foo bar".split(""), OPT_LEFT, "X", ENTER);
      expect(res?.input).toBe("foo Xbar");
    });

    it("Option+Right jumps forward to the start of the next word", () => {
      const ed = makeEditor();
      const res = feed(ed, term, ..."foo bar".split(""), HOME, OPT_RIGHT, "X", ENTER);
      expect(res?.input).toBe("foo Xbar");
    });

    it("Ctrl+W deletes the previous word", () => {
      const ed = makeEditor();
      const res = feed(ed, term, ..."foo bar".split(""), CTRL_W, ENTER);
      expect(res?.input).toBe("foo ");
    });
  });

  describe("kill", () => {
    it("Ctrl+U clears the whole line", () => {
      const ed = makeEditor();
      const res = feed(ed, term, "a", "b", "c", CTRL_U, "x", ENTER);
      expect(res?.input).toBe("x");
    });
  });

  describe("history navigation", () => {
    it("Up recalls the most recent entry", () => {
      const ed = makeEditor({ history: ["ls -la", "cd /etc"] });
      const res = feed(ed, term, UP, ENTER);
      expect(res?.input).toBe("cd /etc");
    });

    it("Up twice recalls the older entry", () => {
      const ed = makeEditor({ history: ["ls -la", "cd /etc"] });
      const res = feed(ed, term, UP, UP, ENTER);
      expect(res?.input).toBe("ls -la");
    });

    it("Down after Up returns toward the live line", () => {
      const ed = makeEditor({ history: ["ls -la", "cd /etc"] });
      const res = feed(ed, term, UP, UP, DOWN, ENTER);
      expect(res?.input).toBe("cd /etc");
    });

    it("history index resets after submit", () => {
      const ed = makeEditor({ history: ["ls -la"] });
      feed(ed, term, UP, ENTER);
      // Fresh line: a plain Up should still recall, not stay stuck.
      const res = feed(ed, term, UP, ENTER);
      expect(res?.input).toBe("ls -la");
    });
  });

  describe("ghost suggestion accept", () => {
    it("right arrow at end-of-line accepts the ghost", () => {
      // "c" → ghost completes to first alphabetical command match "cat".
      const ed = makeEditor();
      const res = feed(ed, term, "c", RIGHT, ENTER);
      expect(res?.input).toBe("cat");
    });
  });

  describe("Ctrl+C / Ctrl+D", () => {
    it("Ctrl+C clears the buffer and writes ^C", () => {
      const ed = makeEditor();
      feed(ed, term, "a", "b");
      fake.clear();
      feed(ed, term, CTRL_C);
      expect(fake.output).toContain("^C");
      const res = feed(ed, term, "x", ENTER);
      expect(res?.input).toBe("x");
    });

    it("Ctrl+D on an empty line submits exit with skipHistory", () => {
      const ed = makeEditor();
      const res = feed(ed, term, CTRL_D);
      expect(res).toEqual({ type: "submit", input: "exit", skipHistory: true });
    });

    it("Ctrl+D mid-line deletes forward instead of exiting", () => {
      const ed = makeEditor();
      const res = feed(ed, term, "a", "b", "c", HOME, CTRL_D, ENTER);
      expect(res?.input).toBe("bc");
    });
  });

  describe("shell input continuation", () => {
    it("opens dquote> on an unterminated double quote, then submits the joined line", () => {
      const ed = makeEditor();
      const first = feed(ed, term, ..."ls \"".split(""), ENTER);
      expect(first).toBeNull();
      expect(fake.output).toContain("dquote> ");

      const second = feed(ed, term, "\"", ENTER);
      expect(second).toEqual({ type: "submit", input: 'ls "\n"' });
    });

    it("opens quote> on an unterminated single quote", () => {
      const ed = makeEditor();
      const first = feed(ed, term, ..."echo 'foo".split(""), ENTER);
      expect(first).toBeNull();
      expect(fake.output).toContain("quote> ");

      const second = feed(ed, term, "'", ENTER);
      expect(second).toEqual({ type: "submit", input: "echo 'foo\n'" });
    });

    it("joins a trailing backslash continuation without a separator", () => {
      const ed = makeEditor();
      const first = feed(ed, term, ..."echo a\\".split(""), ENTER);
      expect(first).toBeNull();
      expect(fake.output).toContain("> ");

      const second = feed(ed, term, "b", ENTER);
      expect(second).toEqual({ type: "submit", input: "echo ab" });
    });

    it("joins a trailing pipe continuation with a space", () => {
      const ed = makeEditor();
      const first = feed(ed, term, ..."echo hi |".split(""), ENTER);
      expect(first).toBeNull();
      expect(fake.output).toContain("pipe> ");

      const second = feed(ed, term, ..."cat".split(""), ENTER);
      expect(second).toEqual({ type: "submit", input: "echo hi | cat" });
    });

    it("Ctrl+C aborts a multi-line continuation back to the primary prompt", () => {
      const ed = makeEditor();
      feed(ed, term, ..."ls \"".split(""), ENTER);
      fake.clear();
      feed(ed, term, CTRL_C);
      expect(fake.output).toContain(PROMPT);

      const res = feed(ed, term, "x", ENTER);
      expect(res?.input).toBe("x");
    });

    it("Ctrl+D on an empty line mid-continuation does not submit exit", () => {
      const ed = makeEditor();
      feed(ed, term, ..."ls \"".split(""), ENTER);
      const res = feed(ed, term, CTRL_D);
      expect(res).toBeNull();
    });

    it("Ctrl+L during continuation redraws the secondary prompt, not the primary one", () => {
      const ed = makeEditor();
      feed(ed, term, ..."ls \"".split(""), ENTER);
      fake.clear();
      feed(ed, term, CTRL_L);
      expect(fake.output).toContain("dquote> ");
      expect(fake.output).not.toContain(PROMPT);
    });

    it("Up-arrow during continuation leaves the buffer unchanged", () => {
      const ed = makeEditor({ history: ["ls -la"] });
      feed(ed, term, ..."ls \"".split(""), ENTER);
      fake.clear();
      feed(ed, term, UP);
      expect(fake.output).toBe("");

      const res = feed(ed, term, "\"", ENTER);
      expect(res).toEqual({ type: "submit", input: 'ls "\n"' });
    });
  });
});
