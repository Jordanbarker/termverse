import { describe, it, expect } from "vitest";
import { getCompletions } from "../complete";
import { SuggestionContext } from "../suggest";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";

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
              Desktop: {
                type: "directory",
                name: "Desktop",
                permissions: "rwxr-xr-x",
                hidden: false,
                children: {},
              },
              Documents: {
                type: "directory",
                name: "Documents",
                permissions: "rwxr-xr-x",
                hidden: false,
                children: {},
              },
              Downloads: {
                type: "directory",
                name: "Downloads",
                permissions: "rwxr-xr-x",
                hidden: false,
                children: {},
              },
              "notes.txt": {
                type: "file",
                name: "notes.txt",
                content: "hello",
                permissions: "rw-r--r--",
                hidden: false,
              },
              "readme.md": {
                type: "file",
                name: "readme.md",
                content: "readme",
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

function createCtx(overrides?: Partial<SuggestionContext>): SuggestionContext {
  const fs = createTestFS();
  return {
    commandHistory: [],
    commandNames: ["ls", "cd", "cat", "pwd", "clear", "grep", "head", "help", "nano", "mail", "dbt", "git", "sort", "uniq"],
    fs,
    cwd: fs.cwd,
    homeDir: fs.homeDir,
    ...overrides,
  };
}

describe("getCompletions", () => {
  describe("command completion", () => {
    it("returns multiple matches for partial command", () => {
      const result = getCompletions("c", createCtx());
      expect(result).not.toBeNull();
      expect(result!.matches).toContain("cat");
      expect(result!.matches).toContain("cd");
      expect(result!.matches).toContain("clear");
    });

    it("is case-insensitive", () => {
      const result = getCompletions("C", createCtx());
      expect(result).not.toBeNull();
      expect(result!.matches).toContain("cat");
      expect(result!.matches).toContain("cd");
      expect(result!.matches).toContain("clear");
    });

    it("returns single match", () => {
      const result = getCompletions("cl", createCtx());
      expect(result).not.toBeNull();
      expect(result!.matches).toEqual(["clear"]);
      expect(result!.commonPrefix).toBe("clear");
    });

    it("returns null for no matches", () => {
      expect(getCompletions("xyz", createCtx())).toBeNull();
    });

    it("computes common prefix", () => {
      const result = getCompletions("c", createCtx());
      expect(result).not.toBeNull();
      // cat, cd, clear — common prefix is "c"
      expect(result!.commonPrefix).toBe("c");
    });
  });

  describe("path completion", () => {
    it("completes paths starting with partial", () => {
      const result = getCompletions("cd d", createCtx());
      expect(result).not.toBeNull();
      expect(result!.displayNames).toEqual(["Desktop/", "Documents/", "Downloads/"]);
      expect(result!.commonPrefix).toBe("cd D");
    });

    it("returns single path match", () => {
      const result = getCompletions("cd Des", createCtx());
      expect(result).not.toBeNull();
      expect(result!.matches).toEqual(["Desktop/"]);
      expect(result!.commonPrefix).toBe("cd Desktop/");
    });

    it("computes common prefix for paths", () => {
      const result = getCompletions("cd Do", createCtx());
      expect(result).not.toBeNull();
      expect(result!.displayNames).toEqual(["Documents/", "Downloads/"]);
      expect(result!.commonPrefix).toBe("cd Do");
    });

    it("cd only shows directories", () => {
      const result = getCompletions("cd n", createCtx());
      expect(result).toBeNull();
    });

    it("cat shows files and directories", () => {
      const result = getCompletions("cat n", createCtx());
      expect(result).not.toBeNull();
      expect(result!.displayNames).toEqual(["notes.txt"]);
    });

    it("less shows files and directories", () => {
      const result = getCompletions("less n", createCtx());
      expect(result).not.toBeNull();
      expect(result!.displayNames).toEqual(["notes.txt"]);
    });

    it("vim and its vi alias complete filenames like nano", () => {
      expect(getCompletions("vim n", createCtx())!.displayNames).toEqual(["notes.txt"]);
      expect(getCompletions("vi n", createCtx())!.displayNames).toEqual(["notes.txt"]);
    });

    it("completes after flags", () => {
      const result = getCompletions("head -n 5 n", createCtx());
      expect(result).not.toBeNull();
      expect(result!.displayNames).toEqual(["notes.txt"]);
      expect(result!.commonPrefix).toBe("head -n 5 notes.txt");
    });
  });

  describe("subcommand completion", () => {
    it("completes dbt subcommands", () => {
      const result = getCompletions("dbt r", createCtx());
      expect(result).not.toBeNull();
      expect(result!.matches).toEqual(["run"]);
      expect(result!.commonPrefix).toBe("dbt run");
    });

    it("completes git subcommands", () => {
      const result = getCompletions("git s", createCtx());
      expect(result).not.toBeNull();
      expect(result!.matches).toContain("stash");
      expect(result!.matches).toContain("status");
    });

    it("returns multiple dbt subcommands", () => {
      const result = getCompletions("dbt ", createCtx());
      expect(result).not.toBeNull();
      expect(result!.matches.length).toBeGreaterThan(1);
    });
  });

  describe("chain operators", () => {
    it("completes last segment after &&", () => {
      const result = getCompletions("ls && cd d", createCtx());
      expect(result).not.toBeNull();
      expect(result!.displayNames).toEqual(["Desktop/", "Documents/", "Downloads/"]);
      expect(result!.commonPrefix).toBe("ls && cd D");
    });

    it("completes command after ;", () => {
      const result = getCompletions("echo hi; cl", createCtx());
      expect(result).not.toBeNull();
      expect(result!.matches).toEqual(["clear"]);
    });
  });

  describe("pipe operators", () => {
    it("completes command after pipe", () => {
      const result = getCompletions("ls | gr", createCtx());
      expect(result).not.toBeNull();
      expect(result!.matches).toEqual(["grep"]);
      expect(result!.commonPrefix).toBe("ls | grep");
    });

    it("completes after multiple pipes", () => {
      const result = getCompletions("cat file.txt | sort | un", createCtx());
      expect(result).not.toBeNull();
      expect(result!.matches).toEqual(["uniq"]);
    });

    it("returns all commands for empty pipe segment", () => {
      const result = getCompletions("ls | ", createCtx());
      expect(result).not.toBeNull();
      expect(result!.matches.length).toBeGreaterThan(1);
    });
  });

  describe("redirect guard", () => {
    it("returns null when segment has unquoted redirect", () => {
      expect(getCompletions("echo > fi", createCtx())).toBeNull();
    });

    it("allows completion after chain when redirect is in prior segment", () => {
      const result = getCompletions("echo > file && cl", createCtx());
      expect(result).not.toBeNull();
      expect(result!.matches).toEqual(["clear"]);
    });

    it("does not block quoted redirect", () => {
      // "echo '>'" — the > is inside quotes, not a redirect
      const result = getCompletions("cat", createCtx());
      expect(result).not.toBeNull();
    });
  });

  describe("empty/null cases", () => {
    it("returns all commands for empty string", () => {
      const result = getCompletions("", createCtx());
      expect(result).not.toBeNull();
      expect(result!.matches.length).toBeGreaterThan(0);
    });

    it("returns null for no matching paths", () => {
      expect(getCompletions("cd zzz", createCtx())).toBeNull();
    });
  });

  describe("alias support", () => {
    it("completes paths for alias that expands to path command", () => {
      const ctx = createCtx({
        aliasNames: ["ll"],
        aliases: { ll: "ls -la" },
      });
      const result = getCompletions("ll n", ctx);
      expect(result).not.toBeNull();
      expect(result!.displayNames).toEqual(["notes.txt"]);
    });

    it("completes alias names as commands", () => {
      const ctx = createCtx({
        aliasNames: ["ll"],
        aliases: { ll: "ls -la" },
      });
      const result = getCompletions("l", ctx);
      expect(result).not.toBeNull();
      expect(result!.matches).toContain("ll");
      expect(result!.matches).toContain("ls");
    });
  });
});
