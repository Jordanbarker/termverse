import { describe, it, expect } from "vitest";
import { execute, executeAsync } from "../registry";
import { CommandContext } from "@tt/core/commands/types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";
import { HELP_TEXTS } from "../builtins/helpTexts";
import { stripAnsi } from "@tt/core/lib/ansi";
import { createInitialSnowflakeState } from "@/story/data/snowflake/initial_data";
import { createDefaultContext } from "@tt/core/snowflake/session/context";

// Import builtins to trigger registration
import "../builtins/ls";
import "../builtins/cd";
import "../builtins/cat";
import "../builtins/pwd";
import "../builtins/clear";
import "../builtins/help";
import "../builtins/nano";
import "../builtins/save";
import "../builtins/load";
import "../builtins/newgame";
import "../builtins/mail";
import "../builtins/python";
import "../builtins/snow";
import "../builtins/wc";
import "../builtins/df";
import "../builtins/git";
import "../builtins/grep";
import "../builtins/find";
import "../builtins/head";
import "../builtins/less";
import "../builtins/tree";
import "../builtins/mkdir";
import "../builtins/command";

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
                content: "hello world",
                permissions: "rw-r--r--",
                hidden: false,
              },
              "run.sh": {
                type: "file",
                name: "run.sh",
                content: "#!/bin/sh\necho hi\n",
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              ".hidden": {
                type: "file",
                name: ".hidden",
                content: "secret",
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
                    content: "# Docs",
                    permissions: "rw-r--r--",
                    hidden: false,
                  },
                },
              },
            },
          },
        },
      },
      etc: {
        type: "directory",
        name: "etc",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {
          "readonly.txt": {
            type: "file",
            name: "readonly.txt",
            content: "protected",
            permissions: "r--r--r--",
            hidden: false,
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
  devcontainer_visited: true,
};

function ctx(fs?: VirtualFS): CommandContext {
  const f = fs ?? createTestFS();
  return { fs: f, cwd: f.cwd, homeDir: f.homeDir, username: "ren", activeComputer: "nexacorp", storyFlags: ALL_UNLOCKED };
}

describe("ls", () => {
  it("lists current directory", () => {
    const result = execute("ls", [], {}, ctx());
    expect(result.output).toContain("notes.txt");
    expect(result.output).toContain("docs");
  });

  it("hides hidden files by default", () => {
    const result = execute("ls", [], {}, ctx());
    expect(result.output).not.toContain(".hidden");
  });

  it("shows hidden files with -a", () => {
    const result = execute("ls", [], { a: true }, ctx());
    expect(result.output).toContain(".hidden");
  });

  it("shows hidden files with -A", () => {
    const result = execute("ls", [], { A: true }, ctx());
    expect(result.output).toContain(".hidden");
  });

  it("shows long format with -l including sizes", () => {
    const result = execute("ls", [], { l: true }, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("rw-r--r--");
    expect(plain).toContain("rwxr-xr-x");
    // "hello world" = 11 bytes
    expect(result.output).toContain("11");
    // directories = 4096 bytes
    expect(result.output).toContain("4096");
  });

  it("shows human-readable sizes with -lh", () => {
    const result = execute("ls", [], { l: true, h: true }, ctx());
    // directories = 4096 → "4.0K" (coreutils keeps the .0 for single-digit values)
    expect(result.output).toContain("4.0K");
    // 11 bytes stays as "11"
    expect(result.output).toContain("11");
  });

  it("includes total header in long format", () => {
    const result = execute("ls", [], { l: true }, ctx());
    expect(stripAnsi(result.output)).toMatch(/^total \d+/m);
  });

  it("lists a specific directory", () => {
    const result = execute("ls", ["/etc"], {}, ctx());
    expect(result.output).toContain("readonly.txt");
  });

  it("returns error for nonexistent path", () => {
    const result = execute("ls", ["/missing"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("returns empty output for empty directory", () => {
    const fs = createTestFS();
    const c = ctx(fs);
    const result = execute("ls", ["docs"], {}, c);
    expect(result.output).toContain("readme.md");
  });

  it("shows filename when given a single file arg", () => {
    const result = execute("ls", ["notes.txt"], {}, ctx());
    expect(result.output).toContain("notes.txt");
  });

  it("shows long format for a single file arg", () => {
    const result = execute("ls", ["notes.txt"], { l: true }, ctx());
    expect(stripAnsi(result.output)).toContain("rw-r--r--");
    expect(result.output).toContain("11");
    expect(result.output).toContain("notes.txt");
  });

  it("shows file then dir with header for multiple args", () => {
    const result = execute("ls", ["notes.txt", "docs"], {}, ctx());
    expect(result.output).toContain("notes.txt");
    expect(result.output).toContain("docs:");
    expect(result.output).toContain("readme.md");
  });

  it("shows headers for multiple directory args", () => {
    const result = execute("ls", ["docs", "/etc"], {}, ctx());
    expect(result.output).toContain("docs:");
    expect(result.output).toContain("/etc:");
    expect(result.output).toContain("readme.md");
    expect(result.output).toContain("readonly.txt");
  });

  it("shows error and still lists valid target", () => {
    const result = execute("ls", ["/nonexistent", "docs"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
    expect(result.output).toContain("readme.md");
  });

  it("appends / to directories with -F", () => {
    const result = execute("ls", [], { F: true }, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("docs/");
  });

  it("appends * to executable files with -F", () => {
    const result = execute("ls", [], { F: true }, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("run.sh*");
  });

  it("leaves regular files unmarked with -F", () => {
    const result = execute("ls", [], { F: true }, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toMatch(/notes\.txt(?![/*])/);
  });

  it("packs entries side-by-side in column layout with -C", () => {
    const c = ctx();
    const result = execute("ls", [], { C: true }, { ...c, envVars: { COLUMNS: "24" } });
    const plain = stripAnsi(result.output);
    const lines = plain.split("\n");
    const hasSideBySide = lines.some((line) => /\S\s{2,}\S/.test(line));
    expect(hasSideBySide).toBe(true);
  });

  it("falls back to one-per-line with -C when piped", () => {
    const c = ctx();
    const result = execute("ls", [], { C: true }, { ...c, isPiped: true });
    const plain = stripAnsi(result.output);
    const lines = plain.split("\n").filter((l) => l.length > 0);
    for (const line of lines) {
      expect(line.trim().includes(" ")).toBe(false);
    }
  });

  it("combines -CF with classify suffixes in column layout", () => {
    const c = ctx();
    const result = execute("ls", [], { C: true, F: true }, { ...c, envVars: { COLUMNS: "20" } });
    const plain = stripAnsi(result.output);
    expect(plain).toContain("docs/");
    expect(plain).toContain("run.sh*");
  });

  it("ignores -C when -l is also set", () => {
    const result = execute("ls", [], { l: true, C: true }, ctx());
    const plain = stripAnsi(result.output);
    expect(plain).toContain("rw-r--r--");
    expect(plain.split("\n").length).toBeGreaterThanOrEqual(3);
  });

  it("respects COLUMNS env var to narrow column count", () => {
    const c = ctx();
    const wide = execute("ls", [], { C: true }, { ...c, envVars: { COLUMNS: "200" } });
    const narrow = execute("ls", [], { C: true }, { ...c, envVars: { COLUMNS: "10" } });
    const wideLines = stripAnsi(wide.output).split("\n").length;
    const narrowLines = stripAnsi(narrow.output).split("\n").length;
    expect(narrowLines).toBeGreaterThan(wideLines);
  });
});

describe("cd", () => {
  it("changes to absolute path", () => {
    const result = execute("cd", ["/etc"], {}, ctx());
    expect(result.newCwd).toBe("/etc");
  });

  it("changes to relative path", () => {
    const result = execute("cd", ["docs"], {}, ctx());
    expect(result.newCwd).toBe("/home/player/docs");
  });

  it("changes to ~ with no args", () => {
    const fs = createTestFS().changeCwd("/etc").fs!;
    const result = execute("cd", [], {}, ctx(fs));
    expect(result.newCwd).toBe("/home/player");
  });

  it("navigates with ..", () => {
    const result = execute("cd", [".."], {}, ctx());
    expect(result.newCwd).toBe("/home");
  });

  it("returns error for nonexistent directory", () => {
    const result = execute("cd", ["/missing"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("returns error when cd to a file", () => {
    const result = execute("cd", ["notes.txt"], {}, ctx());
    expect(result.output).toContain("Not a directory");
  });

  it("updates OLDPWD on successful cd", () => {
    const envVars: Record<string, string> = { OLDPWD: "/home/player" };
    const setEnvVars = (e: Record<string, string>) => Object.assign(envVars, e);
    const c = { ...ctx(), envVars, setEnvVars };
    execute("cd", ["/etc"], {}, c);
    expect(envVars.OLDPWD).toBe("/home/player");
  });

  it("`cd -` returns to OLDPWD and prints destination", () => {
    const envVars: Record<string, string> = { OLDPWD: "/etc" };
    const setEnvVars = (e: Record<string, string>) => Object.assign(envVars, e);
    const c = { ...ctx(), envVars, setEnvVars };
    const result = execute("cd", ["-"], {}, c);
    expect(result.newCwd).toBe("/etc");
    expect(result.output).toBe("/etc");
    expect(envVars.OLDPWD).toBe("/home/player");
  });

  it("`cd -` errors when OLDPWD is unset", () => {
    const c = { ...ctx(), envVars: {}, setEnvVars: () => {} };
    const result = execute("cd", ["-"], {}, c);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("OLDPWD not set");
  });
});

describe("cat", () => {
  it("reads a file", () => {
    const result = execute("cat", ["notes.txt"], {}, ctx());
    expect(result.output).toBe("hello world");
  });

  it("reads multiple files", () => {
    const result = execute("cat", ["notes.txt", ".hidden"], {}, ctx());
    expect(result.output).toContain("hello world");
    expect(result.output).toContain("secret");
  });

  it("returns error for missing file operand", () => {
    const result = execute("cat", [], {}, ctx());
    expect(result.output).toContain("missing file operand");
  });

  it("returns error for nonexistent file", () => {
    const result = execute("cat", ["missing.txt"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("returns error for directory", () => {
    const result = execute("cat", ["docs"], {}, ctx());
    expect(result.output).toContain("Is a directory");
  });
});

describe("pwd", () => {
  it("returns current working directory", () => {
    const result = execute("pwd", [], {}, ctx());
    expect(result.output).toBe("/home/player");
  });
});

describe("clear", () => {
  it("returns clearScreen flag", () => {
    const result = execute("clear", [], {}, ctx());
    expect(result.clearScreen).toBe(true);
    expect(result.output).toBe("");
  });
});

describe("help", () => {
  it("lists available commands", () => {
    const result = execute("help", [], {}, ctx());
    expect(result.output).toContain("ls");
    expect(result.output).toContain("cd");
    expect(result.output).toContain("cat");
  });

  it("always shows command line and scrollback shortcuts", () => {
    const result = execute("help", [], {}, ctx());
    expect(result.output).toContain("Keyboard shortcuts");
    expect(result.output).toContain("Tab");
    expect(result.output).toContain("Ctrl+C");
    expect(result.output).toContain("Ctrl+W");
    expect(result.output).toContain("Shift+PgUp/Down");
    expect(result.output).toContain("Cmd+Home/End");
    expect(result.output).toContain("Fn+Shift+Up/Down");
    expect(result.output).toContain("Fn+Cmd+Left/Right");
  });

  it("shows tab shortcuts when tabs_unlocked is set", () => {
    const result = execute("help", [], {}, { ...ctx(), storyFlags: { ...ALL_UNLOCKED, tabs_unlocked: true } });
    expect(result.output).toContain("Terminal tabs");
    expect(result.output).toContain("Ctrl+Space, C");
    expect(result.output).toContain("Ctrl+Space, X");
    expect(result.output).toContain("~/.tmux.conf");
  });

  it("reflects a custom tab prefix from ~/.tmux.conf", () => {
    const result = execute("help", [], {}, { ...ctx(), storyFlags: { ...ALL_UNLOCKED, tabs_unlocked: true }, tabPrefixLabel: "Ctrl+B" });
    expect(result.output).toContain("Ctrl+B, C");
  });

  it("shows the copy mode shortcut regardless of tabs_unlocked", () => {
    const locked = execute("help", [], {}, ctx());
    expect(locked.output).toContain("Copy mode");
    expect(locked.output).toContain("Ctrl+Space, [");

    const unlocked = execute("help", [], {}, { ...ctx(), storyFlags: { ...ALL_UNLOCKED, tabs_unlocked: true } });
    expect(unlocked.output).toContain("Copy mode");
  });

  it("hides tab shortcuts when tabs_unlocked is not set", () => {
    const result = execute("help", [], {}, ctx());
    // Copy mode (and thus the bare prefix label) shows unconditionally, so assert
    // the absence of the tab-specific block rather than the prefix label itself.
    expect(result.output).not.toContain("Terminal tabs");
    expect(result.output).not.toContain("Ctrl+Space, C");
  });
});

describe("nano", () => {
  it("opens existing file for editing", () => {
    const result = execute("nano", ["notes.txt"], {}, ctx());
    expect(result.editorSession).toBeDefined();
    expect(result.editorSession!.content).toBe("hello world");
    expect(result.editorSession!.readOnly).toBe(false);
    expect(result.editorSession!.isNewFile).toBe(false);
  });

  it("opens read-only file as read-only", () => {
    const result = execute("nano", ["/etc/readonly.txt"], {}, ctx());
    expect(result.editorSession).toBeDefined();
    expect(result.editorSession!.readOnly).toBe(true);
  });

  it("opens new file in valid directory", () => {
    const result = execute("nano", ["newfile.txt"], {}, ctx());
    expect(result.editorSession).toBeDefined();
    expect(result.editorSession!.isNewFile).toBe(true);
    expect(result.editorSession!.content).toBe("");
  });

  it("rejects directory as target", () => {
    const result = execute("nano", ["docs"], {}, ctx());
    expect(result.output).toContain("Is a directory");
  });

  it("rejects file in nonexistent directory", () => {
    const result = execute("nano", ["/missing/file.txt"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("shows usage with no args", () => {
    const result = execute("nano", [], {}, ctx());
    expect(result.output).toContain("Usage");
  });
});

describe("save", () => {
  it("lists saves with no args", () => {
    const result = execute("save", [], {}, ctx());
    expect(result.gameAction).toEqual({ type: "listSaves" });
  });

  it("saves to valid slot", () => {
    const result = execute("save", ["1"], {}, ctx());
    expect(result.gameAction).toEqual({ type: "save", slotId: "slot-1" });
  });

  it("rejects invalid slot", () => {
    const result = execute("save", ["5"], {}, ctx());
    expect(result.output).toContain("invalid slot");
  });
});

describe("load", () => {
  it("lists saves with no args", () => {
    const result = execute("load", [], {}, ctx());
    expect(result.gameAction).toEqual({ type: "listSaves" });
  });

  it("loads from valid slot", () => {
    const result = execute("load", ["2"], {}, ctx());
    expect(result.gameAction).toEqual({ type: "load", slotId: "slot-2" });
  });

  it("loads auto slot", () => {
    const result = execute("load", ["auto"], {}, ctx());
    expect(result.gameAction).toEqual({ type: "load", slotId: "auto" });
  });

  it("rejects invalid slot", () => {
    const result = execute("load", ["5"], {}, ctx());
    expect(result.output).toContain("invalid slot");
  });
});

describe("newgame", () => {
  it("returns newGame action", () => {
    const result = execute("newgame", [], {}, ctx());
    expect(result.gameAction).toEqual({ type: "newGame" });
  });
});

describe("mail", () => {
  function createMailFS(): VirtualFS {
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
        var: {
          type: "directory",
          name: "var",
          permissions: "rwxr-xr-x",
          hidden: false,
          children: {
            mail: {
              type: "directory",
              name: "mail",
              permissions: "rwxr-xr-x",
              hidden: false,
              children: {
                player: {
                  type: "directory",
                  name: "player",
                  permissions: "rwxr-xr-x",
                  hidden: false,
                  children: {
                    new: {
                      type: "directory",
                      name: "new",
                      permissions: "rwxr-xr-x",
                      hidden: false,
                      children: {
                        "001_welcome": {
                          type: "file",
                          name: "001_welcome",
                          content:
                            "From: Edward <edward@nexacorp.com>\nTo: player@nexacorp.com\nDate: Mon, 23 Feb 2026 07:45:00\nSubject: Welcome!\n\nWelcome aboard!",
                          permissions: "rw-r--r--",
                          hidden: false,
                        },
                      },
                    },
                    cur: {
                      type: "directory",
                      name: "cur",
                      permissions: "rwxr-xr-x",
                      hidden: false,
                      children: {
                        "002_setup": {
                          type: "file",
                          name: "002_setup",
                          content:
                            "From: IT <it@nexacorp.com>\nTo: player@nexacorp.com\nDate: Mon, 23 Feb 2026 08:00:00\nSubject: Setup info\nStatus: R\n\nYour account is ready.",
                          permissions: "rw-r--r--",
                          hidden: false,
                        },
                      },
                    },
                    sent: {
                      type: "directory",
                      name: "sent",
                      permissions: "rwxr-xr-x",
                      hidden: false,
                      children: {},
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    return new VirtualFS(root, "/home/player", "/home/player");
  }

  function mailCtx(fs?: VirtualFS): CommandContext {
    const f = fs ?? createMailFS();
    return { fs: f, cwd: f.cwd, homeDir: f.homeDir, username: "ren", activeComputer: "nexacorp", storyFlags: ALL_UNLOCKED };
  }

  it("shows inbox listing with message count", () => {
    const result = execute("mail", [], {}, mailCtx());
    expect(result.output).toContain("2 messages");
    expect(result.output).toContain("1 unread");
  });

  it("shows sender names in inbox", () => {
    const result = execute("mail", [], {}, mailCtx());
    expect(result.output).toContain("Edward");
    expect(result.output).toContain("IT");
  });

  it("shows 'No mail.' for empty inbox", () => {
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
        var: {
          type: "directory",
          name: "var",
          permissions: "rwxr-xr-x",
          hidden: false,
          children: {
            mail: {
              type: "directory",
              name: "mail",
              permissions: "rwxr-xr-x",
              hidden: false,
              children: {
                player: {
                  type: "directory",
                  name: "player",
                  permissions: "rwxr-xr-x",
                  hidden: false,
                  children: {
                    new: { type: "directory", name: "new", permissions: "rwxr-xr-x", hidden: false, children: {} },
                    cur: { type: "directory", name: "cur", permissions: "rwxr-xr-x", hidden: false, children: {} },
                    sent: { type: "directory", name: "sent", permissions: "rwxr-xr-x", hidden: false, children: {} },
                  },
                },
              },
            },
          },
        },
      },
    };
    const emptyFs = new VirtualFS(root, "/home/player", "/home/player");
    const result = execute("mail", [], {}, mailCtx(emptyFs));
    expect(result.output).toBe("No mail.");
  });

  it("reads a specific message by number", () => {
    const result = execute("mail", ["1"], {}, mailCtx());
    expect(result.output).toContain("Welcome!");
    expect(result.output).toContain("Edward");
    expect(result.output).toContain("Welcome aboard!");
  });

  it("marks unread message as read and returns new FS", () => {
    const result = execute("mail", ["1"], {}, mailCtx());
    // Message 1 is in "new", so reading it should produce a newFs
    expect(result.newFs).toBeDefined();
  });

  it("does not return newFs for already-read message", () => {
    const result = execute("mail", ["2"], {}, mailCtx());
    // Message 2 is in "cur" (already read)
    expect(result.newFs).toBeUndefined();
  });

  it("returns error for invalid message number", () => {
    const result = execute("mail", ["99"], {}, mailCtx());
    expect(result.output).toContain("invalid message number");
  });

  it("returns error for non-numeric message number", () => {
    const result = execute("mail", ["abc"], {}, mailCtx());
    expect(result.output).toContain("invalid message number");
  });

  it("sends mail with -s flag", () => {
    const result = execute("mail", ["Test Subject", "alice@nexacorp.com"], { s: true }, mailCtx());
    expect(result.output).toContain("Message sent to alice@nexacorp.com");
    expect(result.newFs).toBeDefined();
  });

  it("emits triggerEvents with email ID when reading a matching email", () => {
    // Create a FS with an email that matches the welcome_edward definition
    const root: DirectoryNode = {
      type: "directory", name: "/", permissions: "rwxr-xr-x", hidden: false,
      children: {
        home: {
          type: "directory", name: "home", permissions: "rwxr-xr-x", hidden: false,
          children: {
            player: { type: "directory", name: "player", permissions: "rwxr-xr-x", hidden: false, children: {} },
          },
        },
        var: {
          type: "directory", name: "var", permissions: "rwxr-xr-x", hidden: false,
          children: {
            mail: {
              type: "directory", name: "mail", permissions: "rwxr-xr-x", hidden: false,
              children: {
                player: {
                  type: "directory", name: "player", permissions: "rwxr-xr-x", hidden: false,
                  children: {
                    new: {
                      type: "directory", name: "new", permissions: "rwxr-xr-x", hidden: false,
                      children: {
                        "001_welcome": {
                          type: "file", name: "001_welcome", permissions: "rw-r--r--", hidden: false,
                          content: "From: Edward Torres <edward@nexacorp.com>\nTo: player@nexacorp.com\nDate: Mon, 23 Feb 2026 07:45:00\nSubject: Welcome aboard!\n\nWelcome!",
                        },
                      },
                    },
                    cur: { type: "directory", name: "cur", permissions: "rwxr-xr-x", hidden: false, children: {} },
                    sent: { type: "directory", name: "sent", permissions: "rwxr-xr-x", hidden: false, children: {} },
                  },
                },
              },
            },
          },
        },
      },
    };
    const fs = new VirtualFS(root, "/home/player", "/home/player");
    const result = execute("mail", ["1"], {}, { fs, cwd: fs.cwd, homeDir: fs.homeDir, username: "ren", activeComputer: "nexacorp" });
    expect(result.triggerEvents).toBeDefined();
    expect(result.triggerEvents!.length).toBeGreaterThan(0);
    expect(result.triggerEvents![0]).toEqual({ type: "file_read", detail: "welcome_edward" });
  });

  it("does not emit triggerEvents for unknown emails", () => {
    // The existing fixture has "Welcome!" / "Edward <edward@nexacorp.com>"
    // which doesn't match any email definition
    const result = execute("mail", ["1"], {}, mailCtx());
    expect(result.triggerEvents).toBeUndefined();
  });
});

describe("unknown command", () => {
  it("returns command not found", () => {
    const result = execute("foobar", [], {}, ctx());
    expect(result.output).toContain("command not found");
  });
});

describe("wc", () => {
  it("counts lines, words, and chars for a file", () => {
    const result = execute("wc", ["notes.txt"], {}, ctx());
    expect(result.output).toContain("notes.txt");
    // "hello world" = 1 line, 2 words, 11 chars
    expect(result.output).toContain("1");
    expect(result.output).toContain("2");
    expect(result.output).toContain("11");
  });

  it("formats chars with -h flag", () => {
    const result = execute("wc", ["notes.txt"], { c: true, h: true }, ctx());
    // 11 bytes is below 1024, stays as "11"
    expect(result.output).toContain("11");
  });
});

describe("less", () => {
  it("returns a lessSession with file content when given a file path", () => {
    const result = execute("less", ["notes.txt"], {}, ctx());
    expect(result.output).toBe("");
    expect(result.lessSession).toBeDefined();
    expect(result.lessSession?.filename).toBe("notes.txt");
    expect(result.lessSession?.content).toBe("hello world");
  });

  it("uses piped stdin when no file arg is given", () => {
    const c: CommandContext = { ...ctx(), stdin: "line1\nline2\nline3" };
    const result = execute("less", [], {}, c);
    expect(result.lessSession).toBeDefined();
    expect(result.lessSession?.filename).toBeNull();
    expect(result.lessSession?.content).toBe("line1\nline2\nline3");
  });

  it("errors when no file and no stdin", () => {
    const result = execute("less", [], {}, ctx());
    expect(result.output).toContain("missing file operand");
    expect(result.exitCode).toBe(1);
    expect(result.lessSession).toBeUndefined();
  });

  it("errors when the file does not exist", () => {
    const result = execute("less", ["missing.txt"], {}, ctx());
    expect(result.output).toMatch(/less:/);
    expect(result.exitCode).toBe(1);
    expect(result.lessSession).toBeUndefined();
  });

  it("errors when the target is a directory", () => {
    const result = execute("less", ["docs"], {}, ctx());
    expect(stripAnsi(result.output)).toMatch(/Is a directory/);
    expect(result.exitCode).toBe(1);
    expect(result.lessSession).toBeUndefined();
  });
});

describe("df", () => {
  it("shows filesystem usage", () => {
    const result = execute("df", [], {}, ctx());
    expect(result.output).toContain("Filesystem");
    expect(result.output).toContain("/dev/sda1");
    expect(result.output).toContain("Mounted on");
  });

  it("shows human-readable sizes with -h", () => {
    const result = execute("df", [], { h: true }, ctx());
    // NexaCorp = 1T total → "1.0T" (coreutils keeps the .0 for single-digit values)
    expect(result.output).toContain("1.0T");
    expect(result.output).toContain("/dev/sda1");
  });
});

describe("--help", () => {
  const linuxCommands = ["pwd", "cd", "ls", "cat", "clear", "nano", "mail"] as const;

  for (const cmd of linuxCommands) {
    it(`${cmd} --help returns help text`, () => {
      const result = execute(cmd, [], { help: true }, ctx());
      expect(result.output).toBe(HELP_TEXTS[cmd]);
    });
  }

  it("python --help returns help text (async)", async () => {
    const result = await executeAsync("python", [], { help: true }, ctx());
    expect(result.output).toBe(HELP_TEXTS.python);
  });

  it("snow --help returns help text", () => {
    const result = execute("snow", [], { help: true }, { ...ctx(), activeComputer: "devcontainer" });
    expect(result.output).toBe(HELP_TEXTS.snow);
  });

  describe("git commit -am", () => {
    it("stages and commits with combined -am flag", () => {
      let fs = createTestFS();
      // init a repo
      const devCtx = (f: VirtualFS) => ({ ...ctx(f), activeComputer: "devcontainer" as const });
      const init = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["init"] });
      fs = init.newFs ?? fs;
      // stage and commit existing files
      const add = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["add", "-A"] });
      fs = add.newFs ?? fs;
      const c1 = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["commit", "-m", "initial"] });
      fs = c1.newFs ?? fs;
      // modify a tracked file
      const write = fs.writeFile("/home/player/notes.txt", "updated content");
      fs = write.fs ?? fs;
      // commit with combined -am
      const result = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["commit", "-am", "quick fix"] });
      expect(stripAnsi(result.output)).toContain("quick fix");
      expect(result.newFs).toBeDefined();
    });
  });

  describe("git branch / git switch", () => {
    const devCtx = (f: VirtualFS) => ({ ...ctx(f), activeComputer: "devcontainer" as const });

    function initialRepo(): VirtualFS {
      let fs = createTestFS();
      fs = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["init"] }).newFs ?? fs;
      fs = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["add", "-A"] }).newFs ?? fs;
      fs = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["commit", "-m", "initial"] }).newFs ?? fs;
      return fs;
    }

    it("git branch <name> creates a branch silently", () => {
      const fs = initialRepo();
      const result = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["branch", "hi"] });
      expect(stripAnsi(result.output)).toBe("");
      expect(result.newFs).toBeDefined();
      // Verify it appears in the listing
      const list = execute("git", [], {}, { ...devCtx(result.newFs!), rawArgs: ["branch"] });
      expect(stripAnsi(list.output)).toContain("hi");
      expect(stripAnsi(list.output)).toContain("* main");
    });

    it("git branch <name> errors on duplicate", () => {
      const fs = initialRepo();
      const result = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["branch", "main"] });
      expect(result.exitCode).toBe(128);
      expect(stripAnsi(result.output)).toContain("already exists");
    });

    it("git switch <branch> switches to an existing branch", () => {
      let fs = initialRepo();
      fs = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["branch", "hi"] }).newFs ?? fs;
      const result = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["switch", "hi"] });
      expect(stripAnsi(result.output)).toContain("Switched to branch 'hi'");
      expect(result.newFs).toBeDefined();
    });

    it("git switch -c creates and switches, firing git_checkout_b event", () => {
      const fs = initialRepo();
      const result = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["switch", "-c", "feature/x"] });
      expect(stripAnsi(result.output)).toContain("Switched to a new branch 'feature/x'");
      expect(result.triggerEvents).toEqual([{ type: "command_executed", detail: "git_checkout_b" }]);
    });

    it("git switch <nonexistent> errors with 'invalid reference'", () => {
      const fs = initialRepo();
      const result = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["switch", "nonexistent"] });
      expect(result.exitCode).toBe(128);
      expect(stripAnsi(result.output)).toContain("fatal: invalid reference: nonexistent");
    });

    it("git switch with no arg errors", () => {
      const fs = initialRepo();
      const result = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["switch"] });
      expect(result.exitCode).toBe(128);
      expect(stripAnsi(result.output)).toContain("missing branch");
    });

    it("git branch -a lists locals plus remotes/origin/<branch>", () => {
      let fs = initialRepo();
      // Fake a remote-tracking ref the same way clone/push would.
      fs = fs.makeDirectory("/home/player/.git/refs/remotes/origin").fs ?? fs;
      const headHash = fs.readFile("/home/player/.git/refs/heads/main").content?.trim() ?? "";
      fs = fs.writeFile("/home/player/.git/refs/remotes/origin/main", headHash).fs ?? fs;
      const result = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["branch", "-a"] });
      const out = stripAnsi(result.output);
      expect(out).toContain("* main");
      expect(out).toContain("remotes/origin/main");
    });

    it("git branch -r lists only remotes", () => {
      let fs = initialRepo();
      fs = fs.makeDirectory("/home/player/.git/refs/remotes/origin").fs ?? fs;
      const headHash = fs.readFile("/home/player/.git/refs/heads/main").content?.trim() ?? "";
      fs = fs.writeFile("/home/player/.git/refs/remotes/origin/main", headHash).fs ?? fs;
      const result = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["branch", "-r"] });
      const out = stripAnsi(result.output);
      expect(out).toContain("remotes/origin/main");
      expect(out).not.toContain("* main");
    });

    it("git branch -a <name> errors instead of creating a branch", () => {
      const fs = initialRepo();
      const result = execute("git", [], {}, { ...devCtx(fs), rawArgs: ["branch", "-a", "newbranch"] });
      expect(result.exitCode).toBe(128);
      expect(stripAnsi(result.output)).toContain("fatal: branch name required");
    });
  });

  const gameCommands = ["save", "load", "newgame", "help"] as const;

  for (const cmd of gameCommands) {
    it(`${cmd} --help does NOT return help text`, () => {
      const result = execute(cmd, [], { help: true }, ctx());
      expect(result.output).not.toBe(HELP_TEXTS[cmd]);
    });
  }
});

describe("invalid flag rejection", () => {
  it("ls -z returns coreutils-style error and exit code 2", () => {
    const result = execute("ls", [], { z: true }, ctx());
    expect(result.output).toBe(
      "ls: invalid option -- 'z'\nTry 'ls --help' for more information.",
    );
    expect(result.exitCode).toBe(2);
  });

  it("ls --foo returns 'unrecognized option' for long flags", () => {
    const result = execute("ls", [], { foo: true }, ctx());
    expect(result.output).toContain("unrecognized option '--foo'");
    expect(result.exitCode).toBe(2);
  });

  it("ls -la still works (sanity check)", () => {
    const result = execute("ls", [], { l: true, a: true }, ctx());
    expect(result.output).toContain("notes.txt");
  });

  it("cat -z errors (cat has no flags)", () => {
    const result = execute("cat", ["notes.txt"], { z: true }, ctx());
    expect(result.output).toContain("invalid option -- 'z'");
    expect(result.exitCode).toBe(2);
  });

  it("grep -X errors", () => {
    const result = execute("grep", ["foo", "notes.txt"], { X: true }, ctx());
    expect(result.output).toContain("invalid option -- 'X'");
    expect(result.exitCode).toBe(2);
  });

  it("ls --help returns help text (not 'unrecognized option')", () => {
    const result = execute("ls", [], { help: true }, ctx());
    expect(result.output).toBe(HELP_TEXTS.ls);
    expect(result.output).not.toContain("unrecognized option");
  });

  it("tree -a still works (Piper content references this)", () => {
    const result = execute("tree", [], { a: true }, ctx());
    expect(result.output).not.toContain("invalid option");
  });

  it("df -h still works", () => {
    const result = execute("df", [], { h: true }, ctx());
    expect(result.output).not.toContain("invalid option");
  });

  it("mkdir -p a/b/c still works", () => {
    const result = execute("mkdir", ["a/b/c"], { p: true }, ctx());
    expect(result.output).not.toContain("invalid option");
  });

  it("command -v ls still works", () => {
    const result = execute("command", ["ls"], { v: true }, ctx());
    expect(result.output).not.toContain("invalid option");
  });

  it("mail -s 'hi' oscar still works (regression guard)", () => {
    const result = execute("mail", ["hi", "oscar"], { s: true }, ctx());
    expect(result.output).not.toContain("invalid option");
  });

  it("find . -name foo still works (rawArgs opt-out)", () => {
    // Parser splits -name into {n,a,m,e}; the handler reads ctx.rawArgs.
    const fakeCtx = { ...ctx(), rawArgs: [".", "-name", "notes.txt"] };
    const result = execute("find", [".", "notes.txt"], { n: true, a: true, m: true, e: true }, fakeCtx);
    expect(result.output).not.toContain("invalid option");
  });

  it("head -5 f.txt still works (POSIX shorthand, opt-out)", () => {
    const fakeCtx = { ...ctx(), rawArgs: ["-5", "notes.txt"] };
    const result = execute("head", ["notes.txt"], { 5: true }, fakeCtx);
    expect(result.output).not.toContain("invalid option");
  });
});

describe("git invalid flag rejection", () => {
  // git/snow live in the dev container (DEVCONTAINER_ONLY in commandGates).
  const devCtx = (): CommandContext => ({ ...ctx(), activeComputer: "devcontainer" });

  it("git status -z returns git-style error and exit 129", () => {
    const result = execute("git", ["status", "-z"], { z: true }, {
      ...devCtx(),
      rawArgs: ["status", "-z"],
    });
    expect(result.output).toBe("error: unknown switch `z'");
    expect(result.exitCode).toBe(129);
  });

  it("git log --bogus returns git-style error", () => {
    const result = execute("git", ["log", "--bogus"], { bogus: true }, {
      ...devCtx(),
      rawArgs: ["log", "--bogus"],
    });
    expect(result.output).toBe("error: unknown option `bogus'");
    expect(result.exitCode).toBe(129);
  });

  it("git --version still works at top level", () => {
    const result = execute("git", ["--version"], { version: true }, {
      ...devCtx(),
      rawArgs: ["--version"],
    });
    expect(result.output).toBe("git version 2.43.0");
  });

  it("git --help and git status --help return help text", () => {
    const top = execute("git", [], { help: true }, devCtx());
    expect(top.output).toBe(HELP_TEXTS.git);
    const sub = execute("git", ["status"], { help: true }, devCtx());
    expect(sub.output).toBe(HELP_TEXTS.git);
  });
});

describe("snow invalid flag rejection", () => {
  it("snow sql -X uses 'snow sql:' prefix and exit 2", () => {
    const result = execute("snow", ["sql"], { X: true }, { ...ctx(), activeComputer: "devcontainer" });
    expect(result.output).toContain("snow sql: invalid option -- 'X'");
    expect(result.exitCode).toBe(2);
  });
});

describe("snow sql -q exit codes", () => {
  function snowCtx(): CommandContext {
    return {
      ...ctx(),
      activeComputer: "devcontainer",
      snowflakeState: createInitialSnowflakeState(),
      snowflakeContext: createDefaultContext(),
    };
  }

  it("exits 0 on a successful query", () => {
    const result = execute("snow", ["sql", "SELECT 1"], { q: true }, snowCtx());
    expect(result.exitCode).toBe(0);
  });

  it("exits 1 on a SQL error", () => {
    const result = execute("snow", ["sql", "SELECT 1/0"], { q: true }, snowCtx());
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Division by zero");
  });

  it("resolves a derived table end-to-end", () => {
    const result = execute("snow", ["sql", "SELECT a FROM (SELECT 1 AS a)"], { q: true }, snowCtx());
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("1");
  });
});
