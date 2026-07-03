import { describe, it, expect } from "vitest";
import { execute } from "@tt/core/commands/registry";
import { CommandContext } from "@tt/core/commands/types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";
// Registers the termoil gating policy (side effect) so unavailable commands
// produce the not-found / colleague-hint behavior these tests assert.
import "../../../story/availabilityPolicy";
import { createGameClock } from "../../../story/clock";
import { HELP_TEXTS } from "@tt/core/commands/builtins/helpTexts";
import { parsePipeline, parseChainedPipeline } from "@tt/core/commands/parser";

/** Strip ANSI escape codes for easier assertion */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// Import builtins to trigger registration
import "../builtins";

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
            children: {
              "notes.txt": {
                type: "file",
                name: "notes.txt",
                content: "hello world\nfoo bar\nhello foo\ntest line",
                permissions: "rw-r--r--",
                hidden: false,
              },
              ".hidden": {
                type: "file",
                name: ".hidden",
                content: "secret stuff\nhidden data",
                permissions: "rw-r--r--",
                hidden: true,
              },
              docs: {
                type: "directory",
                name: "docs",
                permissions: "rwxr-xr-x",
                hidden: false,
                children: {
                  "readme.md": {
                    type: "file",
                    name: "readme.md",
                    content: "# Docs\n\nSome documentation\nhello from docs",
                    permissions: "rw-r--r--",
                    hidden: false,
                  },
                  "notes.txt": {
                    type: "file",
                    name: "notes.txt",
                    content: "doc notes\nhello again",
                    permissions: "rw-r--r--",
                    hidden: false,
                  },
                },
              },
              "log.txt": {
                type: "file",
                name: "log.txt",
                content: "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12",
                permissions: "rw-r--r--",
                hidden: false,
              },
              "old.txt": {
                type: "file",
                name: "old.txt",
                content: "line A\ncommon line\nline C",
                permissions: "rw-r--r--",
                hidden: false,
              },
              "new.txt": {
                type: "file",
                name: "new.txt",
                content: "line A\ncommon line\nline D\nline E",
                permissions: "rw-r--r--",
                hidden: false,
              },
              "data.txt": {
                type: "file",
                name: "data.txt",
                content: "banana\napple\ncherry\napple\nbanana\nbanana",
                permissions: "rw-r--r--",
                hidden: false,
              },
              "empty.txt": {
                type: "file",
                name: "empty.txt",
                content: "",
                permissions: "rw-r--r--",
                hidden: false,
              },
              "script.py": {
                type: "file",
                name: "script.py",
                content: "#!/usr/bin/env python3\nprint('hello')",
                permissions: "rwxr-xr-x",
                hidden: false,
              },
            },
          },
        },
      },
      var: {
        type: "directory",
        name: "var",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {
          log: {
            type: "directory",
            name: "log",
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {
              "system.log": {
                type: "file",
                name: "system.log",
                content: "boot ok\nchip started\nuser login",
                permissions: "rw-r--r--",
                hidden: false,
              },
              "system.log.bak": {
                type: "file",
                name: "system.log.bak",
                content: "boot ok\nchip started\nchip-daemon: cleanup\nuser login",
                permissions: "rw-r--r--",
                hidden: false,
              },
            },
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/player", "/home/player");
}

const ALL_UNLOCKED = {
  search_tools_unlocked: true,
  inspection_tools_unlocked: true,
  processing_tools_unlocked: true,
  chip_unlocked: true,
  chmod_unlocked: true,
  devcontainer_visited: true,
};

function ctx(fs?: VirtualFS, overrides?: Partial<CommandContext>): CommandContext {
  const f = fs ?? createTestFS();
  const merged: CommandContext = { fs: f, cwd: f.cwd, homeDir: f.homeDir, username: "ren", activeComputer: "nexacorp", storyFlags: ALL_UNLOCKED, ...overrides };
  // Mirror the runtime: inject the in-game clock so `date` is deterministic.
  return { clock: createGameClock(merged.deliveredPiperIds ?? [], merged.username, merged.activeComputer), ...merged };
}

// --- grep ---
describe("grep", () => {
  it("finds matching lines in a file", () => {
    const result = execute("grep", ["hello", "notes.txt"], {}, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("hello world");
    expect(plain).toContain("hello foo");
  });

  it("highlights every match on a line, not just the first", () => {
    const fs = createTestFS().writeFile("/home/player/multi.txt", "foo bar foo baz foo\n").fs!;
    const result = execute("grep", ["foo", "multi.txt"], {}, ctx(fs));
    // each occurrence is wrapped in its own color escape
    expect(result.output.split("\x1b[31m").length - 1).toBe(3);
  });

  it("returns exit code 1 when no matches", () => {
    const result = execute("grep", ["zzzzz", "notes.txt"], {}, ctx());
    expect(result.exitCode).toBe(1);
    expect(result.output).toBe("");
  });

  it("supports -i for case insensitive", () => {
    const result = execute("grep", ["HELLO", "notes.txt"], { i: true }, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("hello world");
  });

  it("supports -n for line numbers", () => {
    const result = execute("grep", ["foo", "notes.txt"], { n: true }, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("2:");
    expect(plain).toContain("3:");
  });

  it("supports -l for filenames only", () => {
    const result = execute("grep", ["hello", "notes.txt", "docs/readme.md"], { l: true }, ctx());
    expect(result.output).toContain("/home/player/notes.txt");
    expect(result.output).toContain("/home/player/docs/readme.md");
  });

  it("supports -c for count", () => {
    const result = execute("grep", ["hello", "notes.txt"], { c: true }, ctx());
    expect(result.output).toBe("2");
  });

  it("-v does not match a phantom empty line from a trailing newline", () => {
    const fs = createTestFS().writeFile("/home/player/nl.txt", "alpha\nbeta\n").fs!;
    const result = execute("grep", ["alpha", "nl.txt"], { v: true }, ctx(fs));
    expect(stripAnsi(result.output)).toBe("beta");
  });

  it("supports -v for invert match", () => {
    const result = execute("grep", ["hello", "notes.txt"], { v: true }, ctx());
    expect(result.output).toContain("foo bar");
    expect(result.output).toContain("test line");
    expect(stripAnsi(result.output)).not.toContain("hello world");
  });

  it("supports -r for recursive search", () => {
    const result = execute("grep", ["hello", "."], { r: true }, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("hello world");
    expect(plain).toContain("hello from docs");
  });

  it("reads from stdin when no file given", () => {
    const result = execute("grep", ["bar"], {}, ctx(undefined, { stdin: "foo bar\nbaz qux\nbar again" }));
    const plain = stripAnsi(result.output);
    expect(plain).toContain("foo bar");
    expect(plain).toContain("bar again");
  });

  it("returns error for nonexistent file", () => {
    const result = execute("grep", ["test", "missing.txt"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("returns error for missing pattern", () => {
    const result = execute("grep", [], {}, ctx());
    expect(result.output).toContain("missing pattern");
  });
});

// --- find ---
describe("find", () => {
  it("finds all files and dirs from cwd", () => {
    const result = execute("find", ["."], {}, ctx());
    expect(result.output).toContain("/home/player");
    expect(result.output).toContain("notes.txt");
    expect(result.output).toContain("docs");
  });

  it("finds by name pattern", () => {
    const result = execute("find", [".", "-name", "*.txt"], {}, ctx());
    expect(result.output).toContain("notes.txt");
    expect(result.output).toContain("log.txt");
    expect(result.output).not.toContain("readme.md");
  });

  it("finds by type file", () => {
    const result = execute("find", [".", "-type", "f"], {}, ctx());
    expect(result.output).toContain("notes.txt");
    expect(result.output).not.toContain("/home/player/docs\n");
  });

  it("finds by type directory", () => {
    const result = execute("find", [".", "-type", "d"], {}, ctx());
    expect(result.output).toContain("docs");
    expect(result.output).not.toContain("notes.txt");
  });

  it("finds .bak files", () => {
    const result = execute("find", ["/var/log", "-name", "*.bak"], {}, ctx());
    expect(result.output).toContain("system.log.bak");
  });

  it("returns error for nonexistent path", () => {
    const result = execute("find", ["/missing"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });
});

// --- head ---
describe("head", () => {
  it("shows first 10 lines by default", () => {
    const result = execute("head", ["log.txt"], {}, ctx());
    const lines = result.output.split("\n");
    expect(lines.length).toBe(10);
    expect(lines[0]).toBe("line1");
    expect(lines[9]).toBe("line10");
  });

  it("supports -n to control line count", () => {
    const result = execute("head", ["-n", "3", "log.txt"], {}, ctx());
    const lines = result.output.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe("line1");
  });

  it("reads from stdin", () => {
    const result = execute("head", ["-n", "2"], {}, ctx(undefined, { stdin: "a\nb\nc\nd" }));
    expect(result.output).toBe("a\nb");
  });

  it("returns error for missing file", () => {
    const result = execute("head", ["missing.txt"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("does not print a phantom empty line for a short file with a trailing newline", () => {
    const fs = createTestFS().writeFile("/home/player/nl.txt", "one\ntwo\n").fs!;
    const result = execute("head", ["nl.txt"], {}, ctx(fs));
    expect(result.output).toBe("one\ntwo");
  });
});

// --- tail ---
describe("tail", () => {
  it("shows last 10 lines by default", () => {
    const result = execute("tail", ["log.txt"], {}, ctx());
    const lines = result.output.split("\n");
    expect(lines.length).toBe(10);
    expect(lines[lines.length - 1]).toBe("line12");
  });

  it("supports -n to control line count", () => {
    const result = execute("tail", ["-n", "3", "log.txt"], {}, ctx());
    const lines = result.output.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[lines.length - 1]).toBe("line12");
  });

  it("reads from stdin", () => {
    const result = execute("tail", ["-n", "2"], {}, ctx(undefined, { stdin: "a\nb\nc\nd" }));
    expect(result.output).toBe("c\nd");
  });
});

// --- diff ---
describe("diff", () => {
  it("shows no output for identical files", () => {
    const result = execute("diff", ["notes.txt", "notes.txt"], {}, ctx());
    expect(result.output).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("shows differences between files", () => {
    const result = execute("diff", ["old.txt", "new.txt"], {}, ctx());
    expect(result.output).toContain("--- old.txt");
    expect(result.output).toContain("+++ new.txt");
    expect(result.exitCode).toBe(1);
  });

  it("returns error for missing file", () => {
    const result = execute("diff", ["notes.txt", "missing.txt"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("returns error with fewer than 2 args", () => {
    const result = execute("diff", ["notes.txt"], {}, ctx());
    expect(result.output).toContain("missing operand");
  });
});

// --- wc ---
describe("wc", () => {
  it("counts lines words and chars", () => {
    const result = execute("wc", ["notes.txt"], {}, ctx());
    expect(result.output).toContain("notes.txt");
  });

  it("supports -l for lines only", () => {
    const result = execute("wc", ["notes.txt"], { l: true }, ctx());
    expect(result.output).toContain("4");
    expect(result.output).toContain("notes.txt");
  });

  it("reads from stdin", () => {
    const result = execute("wc", [], { l: true }, ctx(undefined, { stdin: "a\nb\nc" }));
    expect(result.output).toContain("3");
  });

  it("shows totals for multiple files", () => {
    const result = execute("wc", ["notes.txt", "old.txt"], { l: true }, ctx());
    expect(result.output).toContain("total");
  });
});

// --- echo ---
describe("echo", () => {
  it("prints text", () => {
    const result = execute("echo", ["hello", "world"], {}, ctx());
    expect(result.output).toBe("hello world");
  });

  it("prints blank line with no args", () => {
    const result = execute("echo", [], {}, ctx());
    expect(result.output).toBe("\n");
  });

  it("appends trailing newline when piped", () => {
    const result = execute("echo", ["hello"], {}, ctx(undefined, { isPiped: true }));
    expect(result.output).toBe("hello\n");
  });

  it("suppresses trailing newline with -n when piped", () => {
    const result = execute("echo", ["hello"], { n: true }, ctx(undefined, { isPiped: true }));
    expect(result.output).toBe("hello");
  });
});

// --- chmod ---
describe("chmod", () => {
  it("changes file permissions", () => {
    const result = execute("chmod", ["755", "notes.txt"], {}, ctx());
    expect(result.newFs).toBeDefined();
    const node = result.newFs!.getNode("/home/player/notes.txt");
    expect(node!.permissions).toBe("rwxr-xr-x");
  });

  it("returns error for invalid mode", () => {
    const result = execute("chmod", ["999", "notes.txt"], {}, ctx());
    expect(result.output).toContain("invalid mode");
  });

  it("returns error for nonexistent file", () => {
    const result = execute("chmod", ["644", "missing.txt"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });
});

// --- mkdir ---
describe("mkdir", () => {
  it("creates a directory", () => {
    const result = execute("mkdir", ["newdir"], {}, ctx());
    expect(result.newFs).toBeDefined();
    const node = result.newFs!.getNode("/home/player/newdir");
    expect(node).toBeDefined();
    expect(node!.type).toBe("directory");
  });

  it("creates nested dirs with -p", () => {
    const result = execute("mkdir", ["a/b/c"], { p: true }, ctx());
    expect(result.newFs).toBeDefined();
    const node = result.newFs!.getNode("/home/player/a/b/c");
    expect(node).toBeDefined();
  });

  it("returns error for existing dir", () => {
    const result = execute("mkdir", ["docs"], {}, ctx());
    expect(result.output).toContain("File exists");
  });
});

// --- rm ---
describe("rm", () => {
  it("removes a file", () => {
    const result = execute("rm", ["notes.txt"], {}, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/notes.txt")).toBeNull();
  });

  it("refuses to remove directory without -r", () => {
    const result = execute("rm", ["docs"], {}, ctx());
    expect(result.output).toContain("Is a directory");
  });

  it("removes directory with -r", () => {
    const result = execute("rm", ["docs"], { r: true }, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/docs")).toBeNull();
  });

  it("emits file_removed when removing a file", () => {
    const result = execute("rm", ["notes.txt"], {}, ctx());
    const types = (result.triggerEvents ?? []).map((e) => `${e.type}:${e.detail}`);
    expect(types).toEqual(["file_removed:/home/player/notes.txt"]);
  });

  it("emits directory_removed and file_removed for every node in a recursive remove", () => {
    const result = execute("rm", ["docs"], { r: true }, ctx());
    const types = (result.triggerEvents ?? []).map((e) => `${e.type}:${e.detail}`);
    expect(types).toContain("directory_removed:/home/player/docs");
    expect(types).toContain("file_removed:/home/player/docs/readme.md");
    expect(types).toContain("file_removed:/home/player/docs/notes.txt");
  });

  it("emits no events when -f silently skips missing files", () => {
    const result = execute("rm", ["missing.txt", "also-missing.txt"], { f: true }, ctx());
    expect(result.exitCode ?? 0).toBe(0);
    expect(result.triggerEvents ?? []).toEqual([]);
  });

  it("accumulates events across multiple args in order", () => {
    const result = execute("rm", ["notes.txt", "log.txt"], {}, ctx());
    const types = (result.triggerEvents ?? []).map((e) => `${e.type}:${e.detail}`);
    expect(types).toEqual([
      "file_removed:/home/player/notes.txt",
      "file_removed:/home/player/log.txt",
    ]);
  });
});

// --- mv ---
describe("mv", () => {
  it("moves a file", () => {
    const result = execute("mv", ["notes.txt", "moved.txt"], {}, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/notes.txt")).toBeNull();
    expect(result.newFs!.getNode("/home/player/moved.txt")).not.toBeNull();
  });

  it("returns error for nonexistent source", () => {
    const result = execute("mv", ["missing.txt", "dest.txt"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("fires file_created and file_removed when moving a file", () => {
    const result = execute("mv", ["notes.txt", "moved.txt"], {}, ctx());
    const types = (result.triggerEvents ?? []).map((e) => `${e.type}:${e.detail}`);
    expect(types).toContain("file_created:/home/player/moved.txt");
    expect(types).toContain("file_removed:/home/player/notes.txt");
  });

  it("renames a directory", () => {
    const result = execute("mv", ["docs", "papers"], {}, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/docs")).toBeNull();
    expect(result.newFs!.getNode("/home/player/papers")).not.toBeNull();
    expect(result.newFs!.getNode("/home/player/papers/readme.md")).not.toBeNull();
    expect(result.newFs!.getNode("/home/player/papers/notes.txt")).not.toBeNull();
    // The renamed directory's top-level name field must match its new basename
    const node = result.newFs!.getNode("/home/player/papers");
    expect(node!.name).toBe("papers");
  });

  it("moves a directory into an existing directory", () => {
    let fs = createTestFS();
    fs = fs.makeDirectory("/home/player/archive").fs!;
    const result = execute("mv", ["docs", "archive"], {}, ctx(fs));
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/docs")).toBeNull();
    expect(result.newFs!.getNode("/home/player/archive/docs")).not.toBeNull();
    expect(result.newFs!.getNode("/home/player/archive/docs/readme.md")).not.toBeNull();
  });

  it("fires directory_created + file_created events with corresponding removals", () => {
    const result = execute("mv", ["docs", "papers"], {}, ctx());
    const types = (result.triggerEvents ?? []).map((e) => `${e.type}:${e.detail}`);
    expect(types).toContain("directory_created:/home/player/papers");
    expect(types).toContain("file_created:/home/player/papers/readme.md");
    expect(types).toContain("file_created:/home/player/papers/notes.txt");
    expect(types).toContain("directory_removed:/home/player/docs");
    expect(types).toContain("file_removed:/home/player/docs/readme.md");
    expect(types).toContain("file_removed:/home/player/docs/notes.txt");
  });

  it("refuses to move a directory into itself", () => {
    const result = execute("mv", ["docs", "docs/inner"], {}, ctx());
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("subdirectory of itself");
    expect(result.newFs).toBeUndefined();
  });

  it("refuses to overwrite a file with a directory", () => {
    const result = execute("mv", ["docs", "notes.txt"], {}, ctx());
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("cannot overwrite non-directory");
    expect(result.newFs).toBeUndefined();
  });

  it("refuses to move when destination directory already contains a same-named subdir", () => {
    let fs = createTestFS();
    fs = fs.makeDirectory("/home/player/archive").fs!;
    fs = fs.makeDirectory("/home/player/archive/docs").fs!;
    const result = execute("mv", ["docs", "archive"], {}, ctx(fs));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("already exists");
    expect(result.newFs).toBeUndefined();
  });

  it("refuses a no-op self-move", () => {
    const result = execute("mv", ["notes.txt", "notes.txt"], {}, ctx());
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("are the same file");
  });
});

// --- cp ---
describe("cp", () => {
  it("copies a file", () => {
    const result = execute("cp", ["notes.txt", "copy.txt"], {}, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/notes.txt")).not.toBeNull();
    expect(result.newFs!.getNode("/home/player/copy.txt")).not.toBeNull();
  });

  it("copies into directory", () => {
    const result = execute("cp", ["notes.txt", "docs"], {}, ctx());
    expect(result.newFs).toBeDefined();
    // There's already a notes.txt in docs, this overwrites it
    const node = result.newFs!.readFile("/home/player/docs/notes.txt");
    expect(node.content).toContain("hello world");
  });
});

// --- touch ---
describe("touch", () => {
  it("creates new empty file", () => {
    const result = execute("touch", ["new.file"], {}, ctx());
    expect(result.newFs).toBeDefined();
    const node = result.newFs!.readFile("/home/player/new.file");
    expect(node.content).toBe("");
  });

  it("no-ops on existing file", () => {
    const result = execute("touch", ["notes.txt"], {}, ctx());
    // Should return newFs unchanged (or not set, depending on implementation)
    // The key is it doesn't error
    expect(result.output).toBe("");
  });
});

// --- history ---
describe("history", () => {
  it("shows command history", () => {
    const result = execute("history", [], {}, ctx(undefined, { commandHistory: ["ls", "cd /tmp", "cat file.txt"] }));
    expect(result.output).toContain("ls");
    expect(result.output).toContain("cd /tmp");
    expect(result.output).toContain("cat file.txt");
  });

  it("shows empty for no history", () => {
    const result = execute("history", [], {}, ctx(undefined, { commandHistory: [] }));
    expect(result.output).toBe("");
  });
});

// --- whoami ---
describe("whoami", () => {
  it("returns username from homeDir", () => {
    const result = execute("whoami", [], {}, ctx());
    expect(result.output).toBe("player");
  });
});

// --- hostname ---
describe("hostname", () => {
  it("returns nexacorp hostname", () => {
    const result = execute("hostname", [], {}, ctx());
    expect(result.output).toBe("nexacorp-ws01");
  });

  it("is blocked on home computer", () => {
    const result = execute("hostname", [], {}, ctx(undefined, { activeComputer: "home" }));
    expect(result.output).toContain("command not found");
  });
});

// --- file ---
describe("file", () => {
  it("identifies text files", () => {
    const result = execute("file", ["notes.txt"], {}, ctx());
    expect(result.output).toContain("ASCII text");
  });

  it("identifies Python scripts", () => {
    const result = execute("file", ["script.py"], {}, ctx());
    expect(result.output).toContain("Python");
  });

  it("identifies directories", () => {
    const result = execute("file", ["docs"], {}, ctx());
    expect(result.output).toContain("directory");
  });

  it("identifies markdown", () => {
    const result = execute("file", ["docs/readme.md"], {}, ctx());
    expect(result.output).toContain("Markdown");
  });
});

// --- tree ---
describe("tree", () => {
  it("shows tree structure", () => {
    const result = execute("tree", ["docs"], {}, ctx());
    expect(result.output).toContain("readme.md");
    expect(result.output).toContain("notes.txt");
    expect(result.output).toContain("directories");
    expect(result.output).toContain("files");
  });
});

// --- sort ---
describe("sort", () => {
  it("sorts lines alphabetically", () => {
    const result = execute("sort", ["data.txt"], {}, ctx());
    const lines = result.output.split("\n");
    expect(lines[0]).toBe("apple");
    expect(lines[1]).toBe("apple");
    expect(lines[2]).toBe("banana");
  });

  it("sorts in reverse with -r", () => {
    const result = execute("sort", ["data.txt"], { r: true }, ctx());
    const lines = result.output.split("\n");
    expect(lines[0]).toBe("cherry");
  });

  it("reads from stdin", () => {
    const result = execute("sort", [], {}, ctx(undefined, { stdin: "c\na\nb" }));
    expect(result.output).toBe("a\nb\nc");
  });

  it("concatenates and sorts multiple files", () => {
    const result = execute("sort", ["data.txt", "notes.txt"], {}, ctx());
    const lines = result.output.split("\n");
    // Should contain lines from both files, sorted
    expect(lines).toContain("apple");
    expect(lines).toContain("hello world");
    expect(lines).toContain("foo bar");
    // First line alphabetically should be apple
    expect(lines[0]).toBe("apple");
  });

  it("returns error when a file is missing in multi-file list", () => {
    const result = execute("sort", ["data.txt", "missing.txt"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("does not invent an empty line for content with a trailing newline", () => {
    const result = execute("sort", [], {}, ctx(undefined, { stdin: "c\na\nb\n" }));
    expect(result.output).toBe("a\nb\nc");
  });

  it("multi-file sort with trailing newlines has no phantom blank lines", () => {
    const base = createTestFS();
    const withFiles = base
      .writeFile("/home/player/n1.txt", "banana\napple\n").fs!
      .writeFile("/home/player/n2.txt", "cherry\n").fs!;
    const result = execute("sort", ["n1.txt", "n2.txt"], {}, ctx(withFiles));
    expect(result.output).toBe("apple\nbanana\ncherry");
  });
});

// --- uniq ---
describe("uniq", () => {
  it("removes adjacent duplicates", () => {
    const result = execute("uniq", [], {}, ctx(undefined, { stdin: "a\na\nb\nb\na" }));
    expect(result.output).toBe("a\nb\na");
  });

  it("counts with -c", () => {
    const result = execute("uniq", [], { c: true }, ctx(undefined, { stdin: "a\na\nb" }));
    expect(result.output).toContain("2 a");
    expect(result.output).toContain("1 b");
  });

  it("shows only duplicates with -d", () => {
    const result = execute("uniq", [], { d: true }, ctx(undefined, { stdin: "a\na\nb\nc\nc" }));
    expect(result.output).toContain("a");
    expect(result.output).toContain("c");
    expect(result.output).not.toContain("b");
  });

  it("does not count a phantom empty line for content with a trailing newline", () => {
    const result = execute("uniq", [], { c: true }, ctx(undefined, { stdin: "a\na\n" }));
    expect(result.output.trim()).toBe("2 a");
    expect(result.output.split("\n")).toHaveLength(1);
  });
});

// --- date ---
describe("date", () => {
  it("returns in-game date", () => {
    const result = execute("date", [], {}, ctx());
    expect(result.output).toContain("2026");
  });
});

// --- which ---
describe("which", () => {
  it("returns path for known command", () => {
    const result = execute("which", ["grep"], {}, ctx());
    expect(result.output).toBe("/usr/bin/grep");
  });

  it("returns chip path", () => {
    const result = execute("which", ["chip"], {}, ctx(undefined, { storyFlags: { chip_unlocked: true } }));
    expect(result.output).toBe("/opt/chip/bin/chip");
  });

  it("returns not found for unknown", () => {
    const result = execute("which", ["foobar"], {}, ctx());
    expect(result.output).toContain("not found");
  });
});

// --- man ---
describe("man", () => {
  it("shows manual for known command", () => {
    const result = execute("man", ["grep"], {}, ctx());
    expect(result.output).toContain("GREP");
    expect(result.output).toContain("NAME");
    expect(result.output).toContain("DESCRIPTION");
  });

  it("returns error for unknown command", () => {
    const result = execute("man", ["foobar"], {}, ctx());
    expect(result.output).toContain("No manual entry");
  });
});

// --- pipeline parser ---
describe("parsePipeline", () => {
  it("parses single command", () => {
    const pipeline = parsePipeline("ls -la");
    expect(pipeline).toHaveLength(1);
    expect(pipeline[0].command).toBe("ls");
  });

  it("parses pipe chain", () => {
    const pipeline = parsePipeline("cat file.txt | grep hello | wc -l");
    expect(pipeline).toHaveLength(3);
    expect(pipeline[0].command).toBe("cat");
    expect(pipeline[1].command).toBe("grep");
    expect(pipeline[2].command).toBe("wc");
  });

  it("respects quotes around pipes", () => {
    const pipeline = parsePipeline("echo 'hello | world'");
    expect(pipeline).toHaveLength(1);
    expect(pipeline[0].args).toContain("hello | world");
  });
});

// ==================== NEW TESTS ====================

// --- grep (additional) ---
describe("grep (additional)", () => {
  it("supports regex patterns", () => {
    const result = execute("grep", ["hel.*ld", "notes.txt"], {}, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("hello world");
    expect(plain).not.toContain("hello foo");
  });

  it("falls back to literal match on invalid regex", () => {
    const result = execute("grep", ["[invalid", "notes.txt"], {}, ctx());
    // Should not crash — treats "[invalid" as literal
    expect(result.exitCode).toBe(1); // no match expected
  });

  it("shows filename prefix for multiple files without -l", () => {
    const result = execute("grep", ["hello", "notes.txt", "docs/readme.md"], {}, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("/home/player/notes.txt:");
    expect(plain).toContain("/home/player/docs/readme.md:");
  });

  it("shows filename:count for -c with multiple files", () => {
    const result = execute("grep", ["hello", "notes.txt", "docs/readme.md"], { c: true }, ctx());
    expect(result.output).toContain("/home/player/notes.txt:2");
    expect(result.output).toContain("/home/player/docs/readme.md:1");
  });

  it("-v with -c counts non-matching lines", () => {
    const result = execute("grep", ["hello", "notes.txt"], { v: true, c: true }, ctx());
    expect(result.output).toBe("2"); // "foo bar" and "test line"
  });

  it("-r with explicit directory arg searches recursively", () => {
    const result = execute("grep", ["hello", "docs"], { r: true }, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("hello from docs");
    expect(plain).toContain("hello again");
  });

  it("returns 'Is a directory' error without -r on directory", () => {
    const result = execute("grep", ["hello", "docs"], {}, ctx());
    expect(result.output).toContain("Is a directory");
    expect(result.exitCode).toBe(2);
  });

  it("-n with -i combined shows line numbers case-insensitively", () => {
    const result = execute("grep", ["HELLO", "notes.txt"], { n: true, i: true }, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("1:");
    expect(plain).toContain("3:");
    expect(plain).toContain("hello world");
    expect(plain).toContain("hello foo");
  });

  it("returns exit code 1 with no output for empty file", () => {
    const result = execute("grep", ["pattern", "empty.txt"], {}, ctx());
    expect(result.exitCode).toBe(1);
    expect(result.output).toBe("");
  });

  it("returns exit code 1 when stdin has no matches", () => {
    const result = execute("grep", ["zzz"], {}, ctx(undefined, { stdin: "aaa\nbbb" }));
    expect(result.exitCode).toBe(1);
    expect(result.output).toBe("");
  });
});

// --- find (additional) ---
describe("find (additional)", () => {
  it("-name and -type combined narrows results", () => {
    const result = execute("find", [".", "-name", "*.txt", "-type", "f"], {}, ctx());
    expect(result.output).toContain("notes.txt");
    expect(result.output).toContain("log.txt");
    // Should not include directory-only entries (dirs don't match -type f)
    expect(result.output).not.toContain("readme.md");
  });

  it("-name with ? single-char wildcard", () => {
    // "?.txt" should not match notes.txt (5 chars before .txt)
    // It should not match anything in our FS
    const result = execute("find", [".", "-name", "?.py"], {}, ctx());
    expect(result.output).not.toContain("script.py");
  });

  it("shows usage when no arguments given", () => {
    const result = execute("find", [], {}, ctx());
    expect(result.output).toContain("Usage: find");
    expect(result.exitCode).toBe(1);
  });

  it("returns the file path when given a single file", () => {
    const result = execute("find", ["/home/player/notes.txt"], {}, ctx());
    expect(result.output).toBe("/home/player/notes.txt");
  });

  it("returns empty for a file when -type d is specified", () => {
    const result = execute("find", ["/home/player/notes.txt", "-type", "d"], {}, ctx());
    expect(result.output).toBe("");
  });

  it("works with absolute path", () => {
    const result = execute("find", ["/var/log", "-name", "*.log"], {}, ctx());
    expect(result.output).toContain("system.log");
  });
});

// --- head (additional) ---
describe("head (additional)", () => {
  it("returns all lines for file shorter than 10 lines", () => {
    // notes.txt has 4 lines
    const result = execute("head", ["notes.txt"], {}, ctx());
    const lines = result.output.split("\n");
    expect(lines.length).toBe(4);
    expect(lines[0]).toBe("hello world");
  });

  it("returns empty string for empty file", () => {
    const result = execute("head", ["empty.txt"], {}, ctx());
    expect(result.output).toBe("");
  });

  it("shows headers for multiple files", () => {
    const result = execute("head", ["-n", "2", "notes.txt", "old.txt"], {}, ctx());
    expect(result.output).toContain("==> notes.txt <==");
    expect(result.output).toContain("==> old.txt <==");
  });

  it("falls back to 10 for invalid -n value", () => {
    const result = execute("head", ["-n", "abc", "log.txt"], {}, ctx());
    const lines = result.output.split("\n");
    expect(lines.length).toBe(10);
  });

  it("returns error when no file and no stdin", () => {
    const result = execute("head", [], {}, ctx());
    expect(result.output).toContain("missing file operand");
  });

  it("-n 0 returns empty output", () => {
    const result = execute("head", ["-n", "0", "log.txt"], {}, ctx());
    expect(result.output).toBe("");
  });
});

// --- tail (additional) ---
describe("tail (additional)", () => {
  it("returns all lines for file shorter than 10 lines", () => {
    // notes.txt has 4 lines
    const result = execute("tail", ["notes.txt"], {}, ctx());
    const lines = result.output.split("\n");
    expect(lines.length).toBe(4);
    expect(lines[3]).toBe("test line");
  });

  it("returns empty string for empty file", () => {
    const result = execute("tail", ["empty.txt"], {}, ctx());
    expect(result.output).toBe("");
  });

  it("shows headers for multiple files", () => {
    const result = execute("tail", ["-n", "2", "notes.txt", "old.txt"], {}, ctx());
    expect(result.output).toContain("==> notes.txt <==");
    expect(result.output).toContain("==> old.txt <==");
  });

  it("falls back to 10 for invalid -n value", () => {
    const result = execute("tail", ["-n", "abc", "log.txt"], {}, ctx());
    const lines = result.output.split("\n");
    expect(lines.length).toBe(10);
  });

  it("returns error when no file and no stdin", () => {
    const result = execute("tail", [], {}, ctx());
    expect(result.output).toContain("missing file operand");
  });

  it("-n 0 returns empty output", () => {
    const result = execute("tail", ["-n", "0", "log.txt"], {}, ctx());
    expect(result.output).toBe("");
  });
});

// --- diff (additional) ---
describe("diff (additional)", () => {
  it("shows all lines as removed/added for completely different files", () => {
    const result = execute("diff", ["notes.txt", "old.txt"], {}, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("--- notes.txt");
    expect(plain).toContain("+++ old.txt");
    expect(result.exitCode).toBe(1);
  });

  it("shows no diff for both empty files", () => {
    // Create two empty files by using the existing empty.txt against itself
    const result = execute("diff", ["empty.txt", "empty.txt"], {}, ctx());
    expect(result.output).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("shows all lines as added when first file is empty", () => {
    const result = execute("diff", ["empty.txt", "notes.txt"], {}, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("+hello world");
    expect(plain).toContain("+foo bar");
    expect(result.exitCode).toBe(1);
  });

  it("includes context lines with space prefix for unchanged lines", () => {
    const result = execute("diff", ["old.txt", "new.txt"], {}, ctx());
    const plain = stripAnsi(result.output);
    // "line A" and "common line" are shared
    expect(plain).toContain(" line A");
    expect(plain).toContain(" common line");
  });

  it("includes ANSI color codes in removed/added lines", () => {
    const result = execute("diff", ["old.txt", "new.txt"], {}, ctx());
    // Raw output should contain ANSI escape codes
    expect(result.output).toContain("\x1b[");
  });
});

// --- wc (additional) ---
describe("wc (additional)", () => {
  it("-w counts words only", () => {
    // notes.txt: "hello world\nfoo bar\nhello foo\ntest line" -> 8 words
    const result = execute("wc", ["notes.txt"], { w: true }, ctx());
    expect(result.output).toContain("8");
    expect(result.output).toContain("notes.txt");
  });

  it("-c counts chars only", () => {
    const result = execute("wc", ["notes.txt"], { c: true }, ctx());
    expect(result.output).toContain("notes.txt");
    // Should have some char count
    const num = parseInt(stripAnsi(result.output).trim());
    expect(num).toBeGreaterThan(0);
  });

  it("shows all counts by default (lines + words + chars)", () => {
    const result = execute("wc", ["notes.txt"], {}, ctx());
    const plain = stripAnsi(result.output).trim();
    // Format: "    lines    words    chars filename"
    const parts = plain.split(/\s+/);
    expect(parts.length).toBeGreaterThanOrEqual(4); // lines, words, chars, filename
  });

  it("returns zeros for empty file", () => {
    const result = execute("wc", ["empty.txt"], {}, ctx());
    expect(result.output).toContain("0");
    expect(result.output).toContain("empty.txt");
  });

  it("shows totals for multiple files with -l", () => {
    const result = execute("wc", ["notes.txt", "old.txt"], { l: true }, ctx());
    const lines = result.output.split("\n");
    expect(lines.length).toBe(3); // notes.txt, old.txt, total
    expect(lines[2]).toContain("total");
  });

  it("returns error for nonexistent file", () => {
    const result = execute("wc", ["missing.txt"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("stdin with -w and -c shows word and char counts", () => {
    const result = execute("wc", [], { w: true, c: true }, ctx(undefined, { stdin: "hello world" }));
    expect(result.output).toContain("2"); // 2 words
    expect(result.output).toContain("11"); // 11 chars
  });
});

// --- echo (additional) ---
describe("echo (additional)", () => {
  it("handles special characters after quote stripping", () => {
    const result = execute("echo", ["hello", "world"], {}, ctx());
    expect(result.output).toBe("hello world");
  });

  it("joins multiple args with single space", () => {
    const result = execute("echo", ["a", "b", "c", "d"], {}, ctx());
    expect(result.output).toBe("a b c d");
  });
});

// --- chmod (additional) ---
describe("chmod (additional)", () => {
  it("sets mode 644", () => {
    const result = execute("chmod", ["644", "notes.txt"], {}, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/notes.txt")!.permissions).toBe("rw-r--r--");
  });

  it("sets mode 600", () => {
    const result = execute("chmod", ["600", "notes.txt"], {}, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/notes.txt")!.permissions).toBe("rw-------");
  });

  it("sets mode 777", () => {
    const result = execute("chmod", ["777", "notes.txt"], {}, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/notes.txt")!.permissions).toBe("rwxrwxrwx");
  });

  it("returns error for missing operand (no args)", () => {
    const result = execute("chmod", [], {}, ctx());
    expect(result.output).toContain("missing operand");
  });

  it("returns error for 2-digit mode", () => {
    const result = execute("chmod", ["75", "notes.txt"], {}, ctx());
    expect(result.output).toContain("invalid mode");
  });

  it("works on directories", () => {
    const result = execute("chmod", ["700", "docs"], {}, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/docs")!.permissions).toBe("rwx------");
  });
});

// --- mkdir (additional) ---
describe("mkdir (additional)", () => {
  it("returns error for missing operand", () => {
    const result = execute("mkdir", [], {}, ctx());
    expect(result.output).toContain("missing operand");
  });

  it("returns error for nested path without -p", () => {
    const result = execute("mkdir", ["a/b/c"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("-p on existing path is no-op", () => {
    const result = execute("mkdir", ["docs"], { p: true }, ctx());
    expect(result.output).toBe("");
  });

  it("creates multiple directories in one command", () => {
    const result = execute("mkdir", ["dir1", "dir2"], {}, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/dir1")).toBeDefined();
    expect(result.newFs!.getNode("/home/player/dir2")).toBeDefined();
  });
});

// --- rm (additional) ---
describe("rm (additional)", () => {
  it("returns error for missing operand", () => {
    const result = execute("rm", [], {}, ctx());
    expect(result.output).toContain("missing operand");
  });

  it("removes multiple files", () => {
    const result = execute("rm", ["notes.txt", "old.txt"], {}, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/notes.txt")).toBeNull();
    expect(result.newFs!.getNode("/home/player/old.txt")).toBeNull();
  });

  it("-R flag (uppercase) works like -r", () => {
    const result = execute("rm", ["docs"], { R: true }, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/docs")).toBeNull();
  });

  it("returns error for nonexistent file", () => {
    const result = execute("rm", ["nonexistent.txt"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("-f suppresses error for nonexistent file", () => {
    const result = execute("rm", ["nonexistent.txt"], { f: true }, ctx());
    expect(result.output).toBe("");
  });

  it("-r on deeply nested directory removes all children", () => {
    // docs has children readme.md and notes.txt
    const result = execute("rm", ["docs"], { r: true }, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/docs")).toBeNull();
    expect(result.newFs!.getNode("/home/player/docs/readme.md")).toBeNull();
  });
});

// --- mv (additional) ---
describe("mv (additional)", () => {
  it("returns error for missing operand", () => {
    const result = execute("mv", [], {}, ctx());
    expect(result.output).toContain("missing operand");
  });

  it("renames file in same directory", () => {
    const result = execute("mv", ["notes.txt", "renamed.txt"], {}, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/notes.txt")).toBeNull();
    const node = result.newFs!.readFile("/home/player/renamed.txt");
    expect(node.content).toContain("hello world");
  });

  it("moves file into directory", () => {
    const result = execute("mv", ["old.txt", "docs"], {}, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/old.txt")).toBeNull();
    const node = result.newFs!.readFile("/home/player/docs/old.txt");
    expect(node.content).toContain("line A");
  });

  it("moves a directory to a new name", () => {
    const result = execute("mv", ["docs", "docs2"], {}, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/docs")).toBeNull();
    expect(result.newFs!.getNode("/home/player/docs2")).not.toBeNull();
    expect(result.newFs!.readFile("/home/player/docs2/readme.md").content).toContain("# Docs");
  });

  it("overwrites existing file at destination", () => {
    // Move notes.txt to old.txt — old.txt should get notes.txt content
    const result = execute("mv", ["notes.txt", "old.txt"], {}, ctx());
    expect(result.newFs).toBeDefined();
    const node = result.newFs!.readFile("/home/player/old.txt");
    expect(node.content).toContain("hello world");
  });
});

// --- cp (additional) ---
describe("cp (additional)", () => {
  it("returns error for missing operand", () => {
    const result = execute("cp", [], {}, ctx());
    expect(result.output).toContain("missing operand");
  });

  it("returns error for nonexistent source", () => {
    const result = execute("cp", ["missing.txt", "dest.txt"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("returns error when copying directory without -r", () => {
    const result = execute("cp", ["docs", "docs2"], {}, ctx());
    expect(result.output).toContain("omitting directory");
  });

  it("preserves content in copied file", () => {
    const result = execute("cp", ["notes.txt", "copy.txt"], {}, ctx());
    expect(result.newFs).toBeDefined();
    const original = result.newFs!.readFile("/home/player/notes.txt");
    const copy = result.newFs!.readFile("/home/player/copy.txt");
    expect(copy.content).toBe(original.content);
  });

  it("returns error for nonexistent parent directory", () => {
    const result = execute("cp", ["notes.txt", "nonexistent/copy.txt"], {}, ctx());
    expect(result.output).not.toBe("");
  });

  it("copies a directory recursively to a new destination", () => {
    const result = execute("cp", ["docs", "docs2"], { r: true }, ctx());
    expect(result.output).toBe("");
    expect(result.newFs).toBeDefined();
    const dest = result.newFs!.getNode("/home/player/docs2");
    expect(dest).not.toBeNull();
    expect(dest!.type).toBe("directory");
    const copied = result.newFs!.readFile("/home/player/docs2/readme.md");
    const original = result.newFs!.readFile("/home/player/docs/readme.md");
    expect(copied.content).toBe(original.content);
    const dirEvents = (result.triggerEvents ?? []).filter((e) => e.type === "directory_created");
    expect(dirEvents.map((e) => e.detail)).toContain("/home/player/docs2");
    const fileEvents = (result.triggerEvents ?? []).filter((e) => e.type === "file_created");
    expect(fileEvents.map((e) => e.detail)).toContain("/home/player/docs2/readme.md");
  });

  it("copies a directory into an existing directory", () => {
    let fs = createTestFS();
    const mk = fs.makeDirectory("/home/player/existing");
    fs = mk.fs!;
    const result = execute("cp", ["docs", "existing"], { r: true }, ctx(fs));
    expect(result.output).toBe("");
    expect(result.newFs).toBeDefined();
    const nested = result.newFs!.getNode("/home/player/existing/docs");
    expect(nested).not.toBeNull();
    expect(nested!.type).toBe("directory");
    const copied = result.newFs!.readFile("/home/player/existing/docs/readme.md");
    expect(copied.content).toContain("# Docs");
  });

  it("recursive copy fails when destination's grandparent does not exist", () => {
    const result = execute("cp", ["docs", "missing/dest"], { r: true }, ctx());
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("cp:");
    expect(result.output).toContain("No such file or directory");
  });

  it("recursive copy fails when destination exists as a file", () => {
    const result = execute("cp", ["docs", "notes.txt"], { r: true }, ctx());
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("cannot overwrite non-directory");
  });
});

// --- touch (additional) ---
describe("touch (additional)", () => {
  it("uses coreutils wording when the parent directory is missing", () => {
    const result = execute("touch", ["/no/such/dir/x.txt"], {}, ctx());
    expect(result.output).toBe("touch: cannot touch '/no/such/dir/x.txt': No such file or directory");
    expect(result.exitCode).toBe(1);
  });

  it("returns error for missing operand", () => {
    const result = execute("touch", [], {}, ctx());
    expect(result.output).toContain("missing file operand");
  });

  it("creates multiple files", () => {
    const result = execute("touch", ["file1.txt", "file2.txt"], {}, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/file1.txt")).not.toBeNull();
    expect(result.newFs!.getNode("/home/player/file2.txt")).not.toBeNull();
  });

  it("returns error for nonexistent parent directory", () => {
    const result = execute("touch", ["nonexistent/file.txt"], {}, ctx());
    expect(result.output).not.toBe("");
  });
});

// --- history (additional) ---
describe("history (additional)", () => {
  it("formats entries with padded line numbers", () => {
    const result = execute("history", [], {}, ctx(undefined, { commandHistory: ["ls"] }));
    // Should be "     1  ls"
    expect(result.output).toMatch(/\s+1\s+ls/);
  });

  it("handles large history", () => {
    const entries = Array.from({ length: 100 }, (_, i) => `cmd${i}`);
    const result = execute("history", [], {}, ctx(undefined, { commandHistory: entries }));
    expect(result.output).toContain("cmd0");
    expect(result.output).toContain("cmd99");
    expect(result.output.split("\n").length).toBe(100);
  });
});

// --- whoami (additional) ---
describe("whoami (additional)", () => {
  it("returns ren for home computer homeDir", () => {
    const result = execute("whoami", [], {}, ctx(undefined, { homeDir: "/home/ren" }));
    expect(result.output).toBe("ren");
  });
});

// --- file (additional) ---
describe("file (additional)", () => {
  it("returns error for missing operand", () => {
    const result = execute("file", [], {}, ctx());
    expect(result.output).toContain("missing file operand");
  });

  it("returns error for nonexistent file", () => {
    const result = execute("file", ["missing.txt"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("reports empty for empty file", () => {
    const result = execute("file", ["empty.txt"], {}, ctx());
    expect(result.output).toContain("empty");
  });

  it("reports script for shebang file", () => {
    const result = execute("file", ["script.py"], {}, ctx());
    // script.py starts with #!/usr/bin/env python3, so it matches .py extension first
    expect(result.output).toContain("Python");
  });

  it("shows type for multiple files", () => {
    const result = execute("file", ["notes.txt", "docs", "script.py"], {}, ctx());
    const lines = result.output.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain("ASCII text");
    expect(lines[1]).toContain("directory");
    expect(lines[2]).toContain("Python");
  });

  it("identifies TypeScript files", () => {
    const fs = createTestFS();
    const { fs: newFs } = fs.writeFile("/home/player/app.ts", "const x = 1;");
    const result = execute("file", ["app.ts"], {}, ctx(newFs!));
    expect(result.output).toContain("TypeScript");
  });

  it("identifies JavaScript files", () => {
    const fs = createTestFS();
    const { fs: newFs } = fs.writeFile("/home/player/app.js", "const x = 1;");
    const result = execute("file", ["app.js"], {}, ctx(newFs!));
    expect(result.output).toContain("JavaScript");
  });
});

// --- tree (additional) ---
describe("tree (additional)", () => {
  it("returns error for nonexistent path", () => {
    const result = execute("tree", ["/nonexistent"], {}, ctx());
    expect(result.output).toContain("error opening dir");
  });

  it("defaults to cwd with no args", () => {
    const result = execute("tree", [], {}, ctx());
    expect(result.output).toContain("notes.txt");
    expect(result.output).toContain("docs");
    expect(result.output).toContain("directories");
    expect(result.output).toContain("files");
  });

  it("returns just the filename for a single file", () => {
    const result = execute("tree", ["notes.txt"], {}, ctx());
    expect(stripAnsi(result.output)).toBe("notes.txt");
  });

  it("excludes hidden files", () => {
    const result = execute("tree", ["."], {}, ctx());
    expect(stripAnsi(result.output)).not.toContain(".hidden");
  });

  it("shows hidden files with -a flag", () => {
    const result = execute("tree", ["."], { a: true }, ctx());
    expect(stripAnsi(result.output)).toContain(".hidden");
  });
});

// --- sort (additional) ---
describe("sort (additional)", () => {
  it("-n sorts numerically", () => {
    const result = execute("sort", [], { n: true }, ctx(undefined, { stdin: "10\n2\n1\n20" }));
    expect(result.output).toBe("1\n2\n10\n20");
  });

  it("-n -r combined reverses numeric sort", () => {
    const result = execute("sort", [], { n: true, r: true }, ctx(undefined, { stdin: "10\n2\n1\n20" }));
    expect(result.output).toBe("20\n10\n2\n1");
  });

  it("returns error for missing file operand", () => {
    const result = execute("sort", [], {}, ctx());
    expect(result.output).toContain("missing file operand");
  });

  it("returns empty for empty file", () => {
    const result = execute("sort", ["empty.txt"], {}, ctx());
    expect(result.output).toBe("");
  });

  it("-u removes duplicates after sorting", () => {
    const result = execute("sort", ["data.txt"], { u: true }, ctx());
    const lines = result.output.split("\n");
    expect(lines).toEqual(["apple", "banana", "cherry"]);
  });

  it("-n -u dedupes by numeric key, keeping the first occurrence", () => {
    const result = execute("sort", [], { n: true, u: true }, ctx(undefined, { stdin: "1.0\n2\n1\n02" }));
    expect(result.output).toBe("1.0\n2");
  });
});

// --- uniq (additional) ---
describe("uniq (additional)", () => {
  it("-c and -d combined counts only duplicates", () => {
    const result = execute("uniq", [], { c: true, d: true }, ctx(undefined, { stdin: "a\na\nb\nc\nc" }));
    expect(result.output).toContain("2 a");
    expect(result.output).toContain("2 c");
    expect(result.output).not.toContain("b");
  });

  it("reads from file argument", () => {
    // data.txt has adjacent dupes after sort: banana apple cherry apple banana banana
    // But uniq works on adjacent lines, so raw data.txt:
    // banana, apple, cherry, apple, banana, banana -> banana, apple, cherry, apple, banana (removes 1 adjacent dup)
    const result = execute("uniq", ["data.txt"], {}, ctx());
    const lines = result.output.split("\n");
    expect(lines).toEqual(["banana", "apple", "cherry", "apple", "banana"]);
  });

  it("returns all lines when all are unique", () => {
    const result = execute("uniq", [], {}, ctx(undefined, { stdin: "a\nb\nc" }));
    expect(result.output).toBe("a\nb\nc");
  });

  it("returns single line unchanged", () => {
    const result = execute("uniq", [], {}, ctx(undefined, { stdin: "hello" }));
    expect(result.output).toBe("hello");
  });

  it("returns empty for empty input", () => {
    const result = execute("uniq", [], {}, ctx(undefined, { stdin: "" }));
    expect(result.output).toBe("");
  });

  it("-i flag deduplicates case-insensitively", () => {
    const result = execute("uniq", [], { i: true }, ctx(undefined, { stdin: "Hello\nhello\nHELLO\nworld" }));
    const lines = result.output.split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe("Hello"); // keeps first occurrence
    expect(lines[1]).toBe("world");
  });
});

// --- date (additional) ---
describe("date (additional)", () => {
  it("returns exact in-game date string", () => {
    const result = execute("date", [], {}, ctx());
    expect(result.output).toBe("Mon Feb 23 08:30:00 UTC 2026");
  });
});

// --- which (additional) ---
describe("which (additional)", () => {
  it("returns error for missing argument", () => {
    const result = execute("which", [], {}, ctx());
    expect(result.output).toContain("missing command argument");
  });

  it("shows path for multiple commands", () => {
    const result = execute("which", ["grep", "cat", "sort"], {}, ctx());
    const lines = result.output.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe("/usr/bin/grep");
    expect(lines[1]).toBe("/usr/bin/cat");
    expect(lines[2]).toBe("/usr/bin/sort");
  });

  it("resolves builtin commands to /usr/bin/ paths", () => {
    const result = execute("which", ["cd"], {}, ctx());
    expect(result.output).toBe("/usr/bin/cd");
  });
});

// --- man (additional) ---
describe("man (additional)", () => {
  it("returns usage message with no args", () => {
    const result = execute("man", [], {}, ctx());
    expect(result.output).toContain("What manual page do you want?");
  });

  it("only uses first argument", () => {
    const result = execute("man", ["grep", "sort"], {}, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("GREP");
    expect(plain).not.toContain("SORT(1)");
  });
});

// --- pipeline parser (additional) ---
describe("parsePipeline (additional)", () => {
  it("returns single empty command for empty input", () => {
    const pipeline = parsePipeline("");
    expect(pipeline).toHaveLength(1);
    expect(pipeline[0].command).toBe("");
  });

  it("parses multiple pipes into correct number of segments", () => {
    const pipeline = parsePipeline("a | b | c | d");
    expect(pipeline).toHaveLength(4);
    expect(pipeline[0].command).toBe("a");
    expect(pipeline[3].command).toBe("d");
  });

  it("double quotes around pipe yields single segment", () => {
    const pipeline = parsePipeline('echo "a | b"');
    expect(pipeline).toHaveLength(1);
    expect(pipeline[0].args).toContain("a | b");
  });

  it("handles pipe with no spaces", () => {
    const pipeline = parsePipeline("a|b");
    expect(pipeline).toHaveLength(2);
    expect(pipeline[0].command).toBe("a");
    expect(pipeline[1].command).toBe("b");
  });

  it("handles pipe with extra spaces", () => {
    const pipeline = parsePipeline("a  |  b");
    expect(pipeline).toHaveLength(2);
    expect(pipeline[0].command).toBe("a");
    expect(pipeline[1].command).toBe("b");
  });

  it("returns error for unterminated quote in pipeline segment", () => {
    const pipeline = parsePipeline('ls | cat "foo');
    expect(pipeline.some((p) => p.error)).toBe(true);
    expect(pipeline.find((p) => p.error)?.error).toBe("syntax error: unterminated quote");
  });
});

// --- end-to-end pipe tests ---
describe("end-to-end pipe simulation", () => {
  it("cat | grep: reads file then filters", () => {
    const catResult = execute("cat", ["notes.txt"], {}, ctx());
    const grepResult = execute("grep", ["hello"], {}, ctx(undefined, { stdin: catResult.output }));
    const plain = stripAnsi(grepResult.output);
    expect(plain).toContain("hello world");
    expect(plain).toContain("hello foo");
    expect(plain).not.toContain("foo bar");
  });

  it("cat | head: reads file then limits lines", () => {
    const catResult = execute("cat", ["log.txt"], {}, ctx());
    const headResult = execute("head", ["-n", "3"], {}, ctx(undefined, { stdin: catResult.output }));
    expect(headResult.output).toBe("line1\nline2\nline3");
  });

  it("cat | wc -l: reads file then counts lines", () => {
    const catResult = execute("cat", ["notes.txt"], {}, ctx());
    const wcResult = execute("wc", [], { l: true }, ctx(undefined, { stdin: catResult.output }));
    expect(wcResult.output).toContain("4");
  });

  it("grep | wc -l: filters then counts matches", () => {
    const grepResult = execute("grep", ["hello", "notes.txt"], {}, ctx());
    const wcResult = execute("wc", [], { l: true }, ctx(undefined, { stdin: stripAnsi(grepResult.output) }));
    expect(wcResult.output).toContain("2");
  });

  it("sort | uniq: sorts then deduplicates", () => {
    const sortResult = execute("sort", ["data.txt"], {}, ctx());
    const uniqResult = execute("uniq", [], {}, ctx(undefined, { stdin: sortResult.output }));
    const lines = uniqResult.output.split("\n");
    expect(lines).toEqual(["apple", "banana", "cherry"]);
  });

  it("cat | sort | uniq -c: three-stage pipeline", () => {
    const catResult = execute("cat", ["data.txt"], {}, ctx());
    const sortResult = execute("sort", [], {}, ctx(undefined, { stdin: catResult.output }));
    const uniqResult = execute("uniq", [], { c: true }, ctx(undefined, { stdin: sortResult.output }));
    expect(uniqResult.output).toContain("2 apple");
    expect(uniqResult.output).toContain("3 banana");
    expect(uniqResult.output).toContain("1 cherry");
  });

  it("echo | grep: echo output piped to grep", () => {
    const echoResult = execute("echo", ["hello", "world", "foo"], {}, ctx());
    const grepResult = execute("grep", ["world"], {}, ctx(undefined, { stdin: echoResult.output }));
    const plain = stripAnsi(grepResult.output);
    expect(plain).toContain("hello world foo");
  });

  it("cat | head | wc: three-stage pipeline", () => {
    const catResult = execute("cat", ["log.txt"], {}, ctx());
    const headResult = execute("head", ["-n", "5"], {}, ctx(undefined, { stdin: catResult.output }));
    const wcResult = execute("wc", [], { l: true }, ctx(undefined, { stdin: headResult.output }));
    expect(wcResult.output).toContain("5");
  });
});

// --- --help for new commands ---
describe("find with rawArgs", () => {
  it("finds by -name when passed via rawArgs", () => {
    const result = execute("find", [], {}, ctx(undefined, { rawArgs: [".", "-name", "*.txt"] }));
    expect(result.output).toContain("notes.txt");
    expect(result.output).toContain("log.txt");
    expect(result.output).not.toContain("readme.md");
  });

  it("finds by -type f when passed via rawArgs", () => {
    const result = execute("find", [], {}, ctx(undefined, { rawArgs: [".", "-type", "f"] }));
    expect(result.output).toContain("notes.txt");
  });

  it("finds .py files by -name via rawArgs", () => {
    const result = execute("find", [], {}, ctx(undefined, { rawArgs: [".", "-name", "*.py"] }));
    expect(result.output).toContain("script.py");
    expect(result.output).not.toContain("notes.txt");
  });
});

describe("head with rawArgs", () => {
  it("supports -n via rawArgs", () => {
    const result = execute("head", [], {}, ctx(undefined, { rawArgs: ["-n", "3", "log.txt"] }));
    const lines = result.output.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe("line1");
  });

  it("supports -N shorthand via rawArgs", () => {
    const result = execute("head", [], {}, ctx(undefined, { rawArgs: ["-3", "log.txt"] }));
    const lines = result.output.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe("line1");
  });
});

describe("tail with rawArgs", () => {
  it("supports -n via rawArgs", () => {
    const result = execute("tail", [], {}, ctx(undefined, { rawArgs: ["-n", "3", "log.txt"] }));
    const lines = result.output.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[lines.length - 1]).toBe("line12");
  });

  it("supports -N shorthand via rawArgs", () => {
    const result = execute("tail", [], {}, ctx(undefined, { rawArgs: ["-3", "log.txt"] }));
    const lines = result.output.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[lines.length - 1]).toBe("line12");
  });
});

describe("ls piped output", () => {
  it("joins with two spaces by default", () => {
    const result = execute("ls", [], {}, ctx());
    expect(result.output).toContain("  ");
    expect(result.output).not.toMatch(/\n/);
  });

  it("outputs one per line when isPiped is true", () => {
    const result = execute("ls", [], {}, ctx(undefined, { isPiped: true }));
    const lines = stripAnsi(result.output).split("\n");
    expect(lines.length).toBeGreaterThan(1);
    // Each line should be a single entry (no double spaces)
    for (const line of lines) {
      expect(line).not.toContain("  ");
    }
  });

  it("ls | grep finds individual entries when piped", () => {
    const lsResult = execute("ls", [], {}, ctx(undefined, { isPiped: true }));
    const grepResult = execute("grep", ["docs"], {}, ctx(undefined, { stdin: stripAnsi(lsResult.output) }));
    const plain = stripAnsi(grepResult.output);
    expect(plain).toContain("docs");
    expect(plain).not.toContain("notes.txt");
  });
});

// --- coder ---
describe("coder", () => {
  it("transitions to devcontainer with 'coder ssh ai' from nexacorp", () => {
    const result = execute("coder", ["ssh", "ai"], {}, ctx(undefined, { activeComputer: "nexacorp", storyFlags: { coder_unlocked: true } }));
    expect(result.transitionTo).toBe("devcontainer");
    expect(result.output).toBe("");
  });

  it("rejects unknown workspace", () => {
    const result = execute("coder", ["ssh", "unknown"], {}, ctx(undefined, { activeComputer: "nexacorp", storyFlags: { coder_unlocked: true } }));
    expect(result.transitionTo).toBeUndefined();
    expect(result.output).toContain("not found");
  });

  it("shows usage with no args", () => {
    const result = execute("coder", [], {}, ctx(undefined, { activeComputer: "nexacorp", storyFlags: { coder_unlocked: true } }));
    expect(result.output).toContain("USAGE:");
    expect(result.output).toContain("SUBCOMMANDS:");
  });

  it("lists workspaces", () => {
    const result = execute("coder", ["list"], {}, ctx(undefined, { activeComputer: "nexacorp", storyFlags: { coder_unlocked: true } }));
    expect(result.output).toContain("ai");
    expect(result.output).toContain("Running");
  });

  it("lists workspaces with ls alias", () => {
    const result = execute("coder", ["ls"], {}, ctx(undefined, { activeComputer: "nexacorp", storyFlags: { coder_unlocked: true } }));
    expect(result.output).toContain("ai");
  });

  it("shows stopped status after stop flag is set", () => {
    const result = execute("coder", ["list"], {}, ctx(undefined, { activeComputer: "nexacorp", storyFlags: { coder_unlocked: true, coder_workspace_stopped: true } }));
    expect(result.output).toContain("Stopped");
  });

  it("stops a running workspace", () => {
    const result = execute("coder", ["stop", "ai"], {}, ctx(undefined, { activeComputer: "nexacorp", storyFlags: { coder_unlocked: true } }));
    expect(result.output).toContain("Stopping");
    expect(result.triggerEvents).toContainEqual({ type: "command_executed", detail: "coder_stop" });
    expect(result.closeTabsForComputer).toBe("devcontainer");
  });

  it("stop when already stopped", () => {
    const result = execute("coder", ["stop", "ai"], {}, ctx(undefined, { activeComputer: "nexacorp", storyFlags: { coder_unlocked: true, coder_workspace_stopped: true } }));
    expect(result.output).toContain("already stopped");
  });

  it("starts a stopped workspace with incremental lines", () => {
    const result = execute("coder", ["start", "ai"], {}, ctx(undefined, { activeComputer: "nexacorp", storyFlags: { coder_unlocked: true, coder_workspace_stopped: true } }));
    expect(result.incrementalLines).toBeDefined();
    expect(result.incrementalLines!.length).toBeGreaterThan(0);
    expect(result.triggerEvents).toContainEqual({ type: "command_executed", detail: "coder_start" });
  });

  it("start when already running", () => {
    const result = execute("coder", ["start", "ai"], {}, ctx(undefined, { activeComputer: "nexacorp", storyFlags: { coder_unlocked: true } }));
    expect(result.output).toContain("already running");
  });

  it("ssh fails when workspace is stopped", () => {
    const result = execute("coder", ["ssh", "ai"], {}, ctx(undefined, { activeComputer: "nexacorp", storyFlags: { coder_unlocked: true, coder_workspace_stopped: true } }));
    expect(result.transitionTo).toBeUndefined();
    expect(result.output).toContain("stopped");
    expect(result.exitCode).toBe(1);
  });

  it("shows build logs", () => {
    const result = execute("coder", ["logs", "ai"], {}, ctx(undefined, { activeComputer: "nexacorp", storyFlags: { coder_unlocked: true } }));
    expect(result.output).toContain("Build logs");
    expect(result.output).toContain("completed successfully");
  });

  it("create is permission denied", () => {
    const result = execute("coder", ["create", "test"], {}, ctx(undefined, { activeComputer: "nexacorp", storyFlags: { coder_unlocked: true } }));
    expect(result.output).toContain("permission");
    expect(result.exitCode).toBe(1);
  });

  it("delete is permission denied", () => {
    const result = execute("coder", ["delete", "ai"], {}, ctx(undefined, { activeComputer: "nexacorp", storyFlags: { coder_unlocked: true } }));
    expect(result.output).toContain("permission");
    expect(result.exitCode).toBe(1);
  });

  it("rejects unknown subcommand", () => {
    const result = execute("coder", ["foo"], {}, ctx(undefined, { activeComputer: "nexacorp", storyFlags: { coder_unlocked: true } }));
    expect(result.output).toContain("unknown subcommand");
    expect(result.exitCode).toBe(1);
  });

  it("rejects from non-nexacorp computer", () => {
    const result = execute("coder", ["ssh", "ai"], {}, ctx(undefined, { activeComputer: "home" }));
    expect(result.output).toContain("command not found");
  });
});

// --- exit ---
describe("exit", () => {
  it("transitions to nexacorp from devcontainer", () => {
    const result = execute("exit", [], {}, ctx(undefined, { activeComputer: "devcontainer" }));
    expect(result.transitionTo).toBe("nexacorp");
    expect(result.output).toBe("");
  });

  it("logs off NexaCorp to home before the day's work is done (reversible)", () => {
    // No read_end_of_day: mid-shift logoff. exit returns home like a real shell;
    // the day cannot advance because shutdown stays gated on returned_home_day1,
    // which runExitToHome only sets on an end-of-day exit.
    const result = execute("exit", [], {}, ctx(undefined, { activeComputer: "nexacorp" }));
    expect(result.transitionTo).toBe("home");
    expect(result.output).toBe("");
  });

  it("logs off NexaCorp to home after the day's work is done", () => {
    const result = execute(
      "exit",
      [],
      {},
      ctx(undefined, { activeComputer: "nexacorp", storyFlags: { read_end_of_day: true } })
    );
    expect(result.transitionTo).toBe("home");
    expect(result.output).toBe("");
  });

  it("shows error on home computer", () => {
    const result = execute("exit", [], {}, ctx(undefined, { activeComputer: "home" }));
    expect(result.output).toContain("command not found");
  });

  it("day 2 wrap: paced logoff + home transition + returned_home_day2 trigger", () => {
    const result = execute(
      "exit",
      [],
      {},
      ctx(undefined, {
        activeComputer: "nexacorp",
        storyFlags: { ...ALL_UNLOCKED, accusation_made: true, accused_erik: true },
      })
    );
    expect(result.transitionTo).toBe("home");
    expect(result.incrementalLines).toBeDefined();
    expect(result.incrementalLines!.length).toBeGreaterThan(0);
    expect(result.lessSession).toBeUndefined();
    expect(result.triggerEvents).toContainEqual({
      type: "command_executed",
      detail: "exit_day2_logoff",
    });
  });
});

// --- Quest trigger events ---
describe("echo pipe trigger", () => {
  it("emits echo_pipe event when isPiped", () => {
    const result = execute("echo", ["hello"], {}, ctx(undefined, { isPiped: true }));
    expect(result.triggerEvents).toBeDefined();
    expect(result.triggerEvents).toContainEqual({ type: "command_executed", detail: "echo_pipe" });
  });

  it("does not emit echo_pipe when not piped", () => {
    const result = execute("echo", ["hello"], {}, ctx());
    expect(result.triggerEvents).toBeUndefined();
  });
});

describe("result-oriented quest trigger events", () => {
  it("grep emits text_filtered", () => {
    const result = execute("grep", ["hello", "notes.txt"], {}, ctx());
    expect(result.triggerEvents).toContainEqual({ type: "command_executed", detail: "text_filtered" });
  });

  it("uniq emits data_deduped", () => {
    const result = execute("uniq", ["notes.txt"], {}, ctx());
    expect(result.triggerEvents).toContainEqual({ type: "command_executed", detail: "data_deduped" });
  });

  it("sort -u emits data_deduped (alternate path)", () => {
    const result = execute("sort", ["notes.txt"], { u: true }, ctx());
    expect(result.triggerEvents).toContainEqual({ type: "command_executed", detail: "data_deduped" });
  });

  it("plain sort (no -u) does NOT emit data_deduped", () => {
    const result = execute("sort", ["notes.txt"], {}, ctx());
    expect(result.triggerEvents).toBeUndefined();
  });

  it("find emits files_searched", () => {
    const result = execute("find", [".", "-name", "*.txt"], {}, ctx(undefined, { rawArgs: [".", "-name", "*.txt"] }));
    expect(result.triggerEvents).toContainEqual({ type: "command_executed", detail: "files_searched" });
  });

  it("tree emits files_searched (alternate path)", () => {
    const result = execute("tree", ["."], {}, ctx());
    expect(result.triggerEvents).toContainEqual({ type: "command_executed", detail: "files_searched" });
  });
});

describe("file .deb and .db detection", () => {
  it("identifies .deb files as Debian binary package", () => {
    const fs = createTestFS();
    const { fs: newFs } = fs.writeFile("/home/player/test.deb", "debian-binary");
    const result = execute("file", ["test.deb"], {}, ctx(newFs!));
    expect(result.output).toContain("Debian binary package (format 2.0)");
  });

  it("identifies .db files as SQLite database", () => {
    const fs = createTestFS();
    const { fs: newFs } = fs.writeFile("/home/player/cache.db", "SQLite format 3");
    const result = execute("file", ["cache.db"], {}, ctx(newFs!));
    expect(result.output).toContain("SQLite 3.x database");
  });
});

describe("--help for new commands", () => {
  const commands = [
    "grep", "find", "head", "tail", "diff", "wc", "echo",
    "chmod", "mkdir", "rm", "mv", "cp", "touch", "history",
    "whoami", "hostname", "file", "tree", "sort",
    "uniq", "date", "which", "man",
  ] as const;

  for (const cmd of commands) {
    it(`${cmd} --help returns help text`, () => {
      const result = execute(cmd, [], { help: true }, ctx());
      expect(result.output).toBe(HELP_TEXTS[cmd]);
    });
  }
});

// --- alias / unalias ---
describe("alias", () => {
  it("lists all aliases when called with no args", () => {
    const result = execute("alias", [], {}, ctx(undefined, {
      rawArgs: [],
      aliases: { ll: "ls -la", la: "ls -A" },
    }));
    expect(result.output).toContain("la='ls -A'");
    expect(result.output).toContain("ll='ls -la'");
  });

  it("returns empty output when no aliases defined", () => {
    const result = execute("alias", [], {}, ctx(undefined, {
      rawArgs: [],
      aliases: {},
    }));
    expect(result.output).toBe("");
  });

  it("shows a single alias definition", () => {
    const result = execute("alias", ["ll"], {}, ctx(undefined, {
      rawArgs: ["ll"],
      aliases: { ll: "ls -la" },
    }));
    expect(result.output).toBe("ll='ls -la'");
  });

  it("returns error for unknown alias name", () => {
    const result = execute("alias", ["nope"], {}, ctx(undefined, {
      rawArgs: ["nope"],
      aliases: {},
    }));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("not found");
  });

  it("defines a new alias", () => {
    let saved: Record<string, string> = {};
    const result = execute("alias", ["ll=ls -la"], {}, ctx(undefined, {
      rawArgs: ["ll='ls -la'"],
      aliases: {},
      setAliases: (a) => { saved = a; },
    }));
    expect(result.output).toBe("");
    expect(saved).toEqual({ ll: "ls -la" });
  });
});

describe("unalias", () => {
  it("removes an alias", () => {
    let saved: Record<string, string> = {};
    const result = execute("unalias", ["ll"], {}, ctx(undefined, {
      aliases: { ll: "ls -la", la: "ls -A" },
      setAliases: (a) => { saved = a; },
    }));
    expect(result.output).toBe("");
    expect(saved).toEqual({ la: "ls -A" });
  });

  it("returns error for unknown alias", () => {
    const result = execute("unalias", ["nope"], {}, ctx(undefined, {
      aliases: {},
    }));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("no such hash table element");
  });

  it("removes all aliases with -a", () => {
    let saved: Record<string, string> = {};
    const result = execute("unalias", [], { a: true }, ctx(undefined, {
      aliases: { ll: "ls -la", la: "ls -A" },
      setAliases: (a) => { saved = a; },
    }));
    expect(result.output).toBe("");
    expect(saved).toEqual({});
  });

  it("returns error with no arguments", () => {
    const result = execute("unalias", [], {}, ctx(undefined, { aliases: {} }));
    expect(result.exitCode).toBe(1);
  });
});

describe("command chaining (interactive-style)", () => {
  /** Execute a chained command line using the registry directly. */
  function executeChain(input: string, overrides?: Partial<CommandContext>) {
    const chain = parseChainedPipeline(input);
    const c = ctx(undefined, overrides);
    let fs = c.fs;
    let cwd = c.cwd;
    let lastExitCode = 0;
    const outputs: string[] = [];

    for (const seg of chain) {
      if (seg.operator === "&&" && lastExitCode !== 0) continue;
      if (seg.operator === "||" && lastExitCode === 0) continue;

      const pipeline = seg.pipeline;
      let stdin: string | undefined;
      let lastResult: import("@tt/core/commands/types").CommandResult = { output: "" };

      for (let pi = 0; pi < pipeline.length; pi++) {
        const p = pipeline[pi];
        if (!p.command) continue;
        lastResult = execute(p.command, p.args, p.flags, {
          ...c,
          fs,
          cwd,
          stdin,
          isPiped: pi < pipeline.length - 1,
        });
        if (lastResult.newFs) fs = lastResult.newFs;
        if (lastResult.newCwd) cwd = lastResult.newCwd;
        stdin = stripAnsi(lastResult.output);
      }

      if (lastResult.output) outputs.push(lastResult.output);
      lastExitCode = lastResult.exitCode ?? 0;
    }

    return { output: outputs.join("\n"), fs, cwd, exitCode: lastExitCode };
  }

  it("cd /tmp && pwd propagates cwd", () => {
    const result = executeChain("cd / && pwd");
    expect(stripAnsi(result.output)).toContain("/");
    expect(result.cwd).toBe("/");
  });

  it("cd /nonexistent && pwd does not run pwd", () => {
    const result = executeChain("cd /nonexistent && pwd");
    expect(result.exitCode).not.toBe(0);
    expect(stripAnsi(result.output)).not.toContain("/home");
  });

  it("cd /nonexistent || echo failed runs fallback", () => {
    const result = executeChain('cd /nonexistent || echo "failed"');
    expect(stripAnsi(result.output)).toContain("failed");
  });

  it("mkdir && ls shows new directory", () => {
    const result = executeChain("mkdir /home/player/testdir && ls /home/player");
    expect(stripAnsi(result.output)).toContain("testdir");
  });

  it("FS mutations propagate across chain segments", () => {
    const result = executeChain("touch /home/player/new.txt && cat /home/player/new.txt");
    // touch creates an empty file, cat reads it (empty output is ok, no error)
    expect(result.exitCode).toBe(0);
  });
});

// --- cat -n ---
describe("cat -n", () => {
  it("numbers a single file's lines starting at 1", () => {
    const result = execute("cat", ["log.txt"], { n: true }, ctx());
    const lines = stripAnsi(result.output).split("\n");
    expect(lines[0]).toBe("     1\tline1");
    expect(lines[11]).toBe("    12\tline12");
  });

  it("continues numbering across multiple files", () => {
    const result = execute("cat", ["old.txt", "new.txt"], { n: true }, ctx());
    const lines = stripAnsi(result.output).split("\n");
    expect(lines[0]).toBe("     1\tline A");
    expect(lines[2]).toBe("     3\tline C");
    expect(lines[3]).toBe("     4\tline A");
    expect(lines[6]).toBe("     7\tline E");
  });

  it("numbers stdin input", () => {
    const result = execute("cat", [], { n: true }, ctx(undefined, { stdin: "alpha\nbeta" }));
    expect(stripAnsi(result.output)).toBe("     1\talpha\n     2\tbeta");
  });
});

// --- chmod (symbolic + -R) ---
describe("chmod symbolic and -R", () => {
  it("invalid mode now exits 1 instead of silently succeeding", () => {
    const result = execute("chmod", ["+z", "notes.txt"], {}, ctx());
    expect(result.output).toContain("invalid mode");
    expect(result.exitCode).toBe(1);
  });

  it("+x adds execute bits for all classes", () => {
    const result = execute("chmod", ["+x", "notes.txt"], {}, ctx());
    expect(result.newFs).toBeDefined();
    const node = result.newFs!.getNode("/home/player/notes.txt");
    expect(node!.permissions).toBe("rwxr-xr-x");
  });

  it("u+w only affects the owner triplet", () => {
    // start from rw-r--r-- (notes.txt baseline)
    const result = execute("chmod", ["u+x", "notes.txt"], {}, ctx());
    expect(result.newFs!.getNode("/home/player/notes.txt")!.permissions).toBe("rwxr--r--");
  });

  it("go-r strips read bits from group and other only", () => {
    const result = execute("chmod", ["go-r", "notes.txt"], {}, ctx());
    expect(result.newFs!.getNode("/home/player/notes.txt")!.permissions).toBe("rw-------");
  });

  it("a=rx clears then sets exact bits across all classes", () => {
    const result = execute("chmod", ["a=rx", "notes.txt"], {}, ctx());
    expect(result.newFs!.getNode("/home/player/notes.txt")!.permissions).toBe("r-xr-xr-x");
  });

  it("comma-separated clauses combine", () => {
    const result = execute("chmod", ["u+w,go-r", "notes.txt"], {}, ctx());
    // baseline rw-r--r--; u+w no-op (already w); go-r strips
    expect(result.newFs!.getNode("/home/player/notes.txt")!.permissions).toBe("rw-------");
  });

  it("-R recurses into directories", () => {
    const result = execute("chmod", ["750", "docs"], { R: true }, ctx());
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/docs")!.permissions).toBe("rwxr-x---");
    expect(result.newFs!.getNode("/home/player/docs/readme.md")!.permissions).toBe("rwxr-x---");
    expect(result.newFs!.getNode("/home/player/docs/notes.txt")!.permissions).toBe("rwxr-x---");
  });

  it("-R descends into directories the player can't read (regression)", () => {
    // Lock docs/ down to rwx------ so listDirectory() would refuse to open it.
    // chmod -R should still walk in and flip children.
    const locked = createTestFS().setPermissions("/home/player/docs", "rwx------").fs!;
    const result = execute("chmod", ["777", "docs"], { R: true }, ctx(locked));
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode("/home/player/docs")!.permissions).toBe("rwxrwxrwx");
    expect(result.newFs!.getNode("/home/player/docs/readme.md")!.permissions).toBe("rwxrwxrwx");
    expect(result.newFs!.getNode("/home/player/docs/notes.txt")!.permissions).toBe("rwxrwxrwx");
  });

  it("octal mode still works (regression)", () => {
    const result = execute("chmod", ["644", "notes.txt"], {}, ctx());
    expect(result.newFs!.getNode("/home/player/notes.txt")!.permissions).toBe("rw-r--r--");
  });
});

// --- diff -u and -r ---
describe("diff -u and -r", () => {
  it("-u emits @@ hunk headers", () => {
    const result = execute("diff", ["old.txt", "new.txt"], { u: true }, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("--- old.txt");
    expect(plain).toContain("+++ new.txt");
    expect(plain).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
  });

  it("default (no -u) keeps existing context-style output without @@", () => {
    const result = execute("diff", ["old.txt", "new.txt"], {}, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("--- old.txt");
    expect(plain).not.toMatch(/@@/);
  });

  it("-r reports files only in one side", () => {
    let { fs } = createTestFS().makeDirectory("/home/player/left");
    ({ fs } = fs!.makeDirectory("/home/player/right"));
    ({ fs } = fs!.writeFile("/home/player/left/only-left.txt", "x"));
    ({ fs } = fs!.writeFile("/home/player/right/only-right.txt", "y"));
    ({ fs } = fs!.writeFile("/home/player/left/shared.txt", "same"));
    ({ fs } = fs!.writeFile("/home/player/right/shared.txt", "same"));
    const result = execute("diff", ["left", "right"], { r: true }, ctx(fs));
    expect(result.output).toContain("Only in left: only-left.txt");
    expect(result.output).toContain("Only in right: only-right.txt");
  });

  it("-r diffs same-name files in both dirs", () => {
    let { fs } = createTestFS().makeDirectory("/home/player/a");
    ({ fs } = fs!.makeDirectory("/home/player/b"));
    ({ fs } = fs!.writeFile("/home/player/a/f.txt", "one\ntwo"));
    ({ fs } = fs!.writeFile("/home/player/b/f.txt", "one\nTWO"));
    const result = execute("diff", ["a", "b"], { r: true }, ctx(fs));
    const plain = stripAnsi(result.output);
    expect(plain).toContain("diff -r a/f.txt b/f.txt");
    expect(plain).toContain("-two");
    expect(plain).toContain("+TWO");
  });

  it("preserves discovered_log_tampering trigger when comparing .bak and system.log", () => {
    const result = execute("diff", ["/var/log/system.log.bak", "/var/log/system.log"], {}, ctx());
    expect(result.triggerEvents).toEqual([{ type: "file_read", detail: "discovered_log_tampering" }]);
  });
});

// --- tail -f ---
describe("tail -f", () => {
  it("rejects -f with a clear message and exit 2", () => {
    const result = execute("tail", ["-f", "log.txt"], {}, ctx(undefined, { rawArgs: ["-f", "log.txt"] }));
    expect(result.output).toContain("follow not supported");
    expect(result.exitCode).toBe(2);
  });

  it("rejects --follow long form too", () => {
    const result = execute("tail", ["--follow", "log.txt"], {}, ctx(undefined, { rawArgs: ["--follow", "log.txt"] }));
    expect(result.output).toContain("follow not supported");
    expect(result.exitCode).toBe(2);
  });
});

// --- tree -L ---
describe("tree -L", () => {
  it("-L 1 shows top-level only (no recursion into subdirs)", () => {
    const result = execute("tree", [], {}, ctx(undefined, { rawArgs: ["-L", "1"] }));
    const plain = stripAnsi(result.output);
    expect(plain).toContain("docs");
    // docs/readme.md should be hidden by depth cap
    expect(plain).not.toContain("readme.md");
  });

  it("-L without value errors", () => {
    const result = execute("tree", [], {}, ctx(undefined, { rawArgs: ["-L"] }));
    expect(result.output).toContain("requires an argument");
    expect(result.exitCode).toBe(1);
  });

  it("-L with non-numeric value errors", () => {
    const result = execute("tree", [], {}, ctx(undefined, { rawArgs: ["-L", "abc"] }));
    expect(result.output).toContain("Invalid level");
    expect(result.exitCode).toBe(1);
  });

  it("-L 2 lets subdir contents through", () => {
    const result = execute("tree", [], {}, ctx(undefined, { rawArgs: ["-L", "2"] }));
    const plain = stripAnsi(result.output);
    expect(plain).toContain("docs");
    expect(plain).toContain("readme.md");
  });
});

// --- hostname -I ---
describe("hostname -I", () => {
  it("prints the configured IP for nexacorp", () => {
    const result = execute("hostname", [], { I: true }, ctx());
    expect(result.output).toBe("10.20.5.17 ");
  });

  it("prints home IP when on home computer", () => {
    const result = execute("hostname", [], { I: true }, ctx(undefined, {
      activeComputer: "home",
      storyFlags: { ...ALL_UNLOCKED, basic_tools_unlocked: true },
    }));
    expect(result.output).toBe("192.168.1.42 ");
  });
});

// --- type -a ---
describe("type -a", () => {
  it("shows shell builtin when -a applied to a builtin-only word", () => {
    const result = execute("type", ["cd"], { a: true }, ctx());
    expect(result.output).toContain("cd is a shell builtin");
  });

  it("shows both builtin and PATH location for echo", () => {
    const result = execute("type", ["echo"], { a: true }, ctx());
    const lines = result.output.split("\n");
    expect(lines).toContain("echo is a shell builtin");
    expect(lines).toContain("echo is /usr/bin/echo");
  });

  it("without -a, builtin still shadows PATH (regression)", () => {
    const result = execute("type", ["echo"], {}, ctx());
    expect(result.output).toBe("echo is a shell builtin");
  });

  it("missing command exits 1 even with -a", () => {
    const result = execute("type", ["nonexistent_cmd_xyz"], { a: true }, ctx());
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("not found");
  });
});
