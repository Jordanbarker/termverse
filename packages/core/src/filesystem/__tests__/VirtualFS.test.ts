import { describe, it, expect } from "vitest";
import { VirtualFS } from "../VirtualFS";
import { DirectoryNode, isDirectory, isFile } from "../types";

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
                children: {},
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
          "config.txt": {
            type: "file",
            name: "config.txt",
            content: "key=value",
            permissions: "r--r--r--",
            hidden: false,
          },
        },
      },
      srv: {
        type: "directory",
        name: "srv",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {
          locked: {
            type: "directory",
            name: "locked",
            permissions: "rwx------",
            hidden: false,
            children: {
              "secret.txt": {
                type: "file",
                name: "secret.txt",
                content: "top secret",
                permissions: "rw-------",
                hidden: false,
              },
              nested: {
                type: "directory",
                name: "nested",
                permissions: "rwxr-xr-x",
                hidden: false,
                children: {
                  "deep.txt": {
                    type: "file",
                    name: "deep.txt",
                    content: "deep content",
                    permissions: "rw-r--r--",
                    hidden: false,
                  },
                },
              },
            },
          },
          open: {
            type: "directory",
            name: "open",
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {
              "public.txt": {
                type: "file",
                name: "public.txt",
                content: "public info",
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

describe("VirtualFS", () => {
  describe("resolve", () => {
    it("resolves relative paths against cwd", () => {
      const fs = createTestFS();
      expect(fs.resolve("notes.txt")).toBe("/home/player/notes.txt");
    });

    it("resolves ~ to homeDir", () => {
      const fs = createTestFS();
      expect(fs.resolve("~")).toBe("/home/player");
      expect(fs.resolve("~/docs")).toBe("/home/player/docs");
    });

    it("returns absolute paths normalized", () => {
      const fs = createTestFS();
      expect(fs.resolve("/etc/../home")).toBe("/home");
    });
  });

  describe("getNode", () => {
    it("returns root for /", () => {
      const fs = createTestFS();
      const node = fs.getNode("/");
      expect(node).not.toBeNull();
      expect(isDirectory(node!)).toBe(true);
    });

    it("returns file node", () => {
      const fs = createTestFS();
      const node = fs.getNode("/home/player/notes.txt");
      expect(node).not.toBeNull();
      expect(isFile(node!)).toBe(true);
    });

    it("returns directory node", () => {
      const fs = createTestFS();
      const node = fs.getNode("/home/player/docs");
      expect(node).not.toBeNull();
      expect(isDirectory(node!)).toBe(true);
    });

    it("returns null for nonexistent paths", () => {
      const fs = createTestFS();
      expect(fs.getNode("/nonexistent")).toBeNull();
      expect(fs.getNode("/home/player/missing.txt")).toBeNull();
    });

    it("returns null when traversing through a file", () => {
      const fs = createTestFS();
      expect(fs.getNode("/home/player/notes.txt/child")).toBeNull();
    });
  });

  describe("listDirectory", () => {
    it("lists directory contents", () => {
      const fs = createTestFS();
      const result = fs.listDirectory("/home/player");
      expect(result.error).toBeUndefined();
      expect(result.entries.length).toBe(3); // notes.txt, .hidden, docs
    });

    it("returns error for nonexistent path", () => {
      const fs = createTestFS();
      const result = fs.listDirectory("/nonexistent");
      expect(result.error).toContain("No such file or directory");
    });

    it("returns error when listing a file", () => {
      const fs = createTestFS();
      const result = fs.listDirectory("/home/player/notes.txt");
      expect(result.error).toContain("Not a directory");
    });
  });

  describe("readFile", () => {
    it("reads file content", () => {
      const fs = createTestFS();
      const result = fs.readFile("/home/player/notes.txt");
      expect(result.content).toBe("hello world");
      expect(result.error).toBeUndefined();
    });

    it("returns error for nonexistent file", () => {
      const fs = createTestFS();
      const result = fs.readFile("/missing.txt");
      expect(result.error).toContain("No such file or directory");
    });

    it("returns error when reading a directory", () => {
      const fs = createTestFS();
      const result = fs.readFile("/home/player/docs");
      expect(result.error).toContain("Is a directory");
    });
  });

  describe("writeFile", () => {
    it("creates a new file and returns new instance", () => {
      const fs = createTestFS();
      const result = fs.writeFile("/home/player/new.txt", "new content");
      expect(result.error).toBeUndefined();
      expect(result.fs).not.toBe(fs); // new instance

      const node = result.fs!.getNode("/home/player/new.txt");
      expect(isFile(node!)).toBe(true);
      expect(result.fs!.readFile("/home/player/new.txt").content).toBe("new content");
    });

    it("overwrites existing file", () => {
      const fs = createTestFS();
      const result = fs.writeFile("/home/player/notes.txt", "updated");
      expect(result.fs!.readFile("/home/player/notes.txt").content).toBe("updated");
    });

    it("does not mutate original instance", () => {
      const fs = createTestFS();
      fs.writeFile("/home/player/new.txt", "new");
      expect(fs.getNode("/home/player/new.txt")).toBeNull();
    });

    it("returns error when parent does not exist", () => {
      const fs = createTestFS();
      const result = fs.writeFile("/nonexistent/dir/file.txt", "content");
      expect(result.error).toContain("parent directory does not exist");
    });

    it("refuses to overwrite a directory and leaves it intact", () => {
      const fs = createTestFS();
      const result = fs.writeFile("/home/player", "x");
      expect(result.fs).toBeUndefined();
      expect(result.error).toContain("Is a directory");
      const node = fs.getNode("/home/player");
      expect(node?.type).toBe("directory");
      expect(fs.getNode("/home/player/notes.txt")).not.toBeNull();
    });

    it("marks dotfiles as hidden", () => {
      const fs = createTestFS();
      const result = fs.writeFile("/home/player/.env", "SECRET=yes");
      const node = result.fs!.getNode("/home/player/.env");
      expect(node!.hidden).toBe(true);
    });
  });

  describe("makeDirectory", () => {
    it("creates a new directory", () => {
      const fs = createTestFS();
      const result = fs.makeDirectory("/home/player/newdir");
      expect(result.error).toBeUndefined();
      const node = result.fs!.getNode("/home/player/newdir");
      expect(isDirectory(node!)).toBe(true);
    });

    it("returns error if already exists", () => {
      const fs = createTestFS();
      const result = fs.makeDirectory("/home/player/docs");
      expect(result.error).toContain("File exists");
    });

    it("returns error if parent does not exist", () => {
      const fs = createTestFS();
      const result = fs.makeDirectory("/missing/newdir");
      expect(result.error).toContain("No such file or directory");
    });
  });

  describe("removeNode", () => {
    it("removes a file", () => {
      const fs = createTestFS();
      const result = fs.removeNode("/home/player/notes.txt");
      expect(result.error).toBeUndefined();
      expect(result.fs!.getNode("/home/player/notes.txt")).toBeNull();
    });

    it("removes a directory", () => {
      const fs = createTestFS();
      const result = fs.removeNode("/home/player/docs");
      expect(result.error).toBeUndefined();
      expect(result.fs!.getNode("/home/player/docs")).toBeNull();
    });

    it("does not mutate original", () => {
      const fs = createTestFS();
      fs.removeNode("/home/player/notes.txt");
      expect(fs.getNode("/home/player/notes.txt")).not.toBeNull();
    });

    it("returns error for nonexistent path", () => {
      const fs = createTestFS();
      const result = fs.removeNode("/missing");
      expect(result.error).toContain("No such file or directory");
    });

    it("returns error when removing root", () => {
      const fs = createTestFS();
      const result = fs.removeNode("/");
      expect(result.error).toContain("Cannot remove root");
    });
  });

  describe("insertNode", () => {
    it("inserts a subtree at the given path", () => {
      const fs = createTestFS();
      const subtree: DirectoryNode = {
        type: "directory",
        name: "project",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {
          "readme.txt": {
            type: "file",
            name: "readme.txt",
            content: "hello",
            permissions: "rw-r--r--",
            hidden: false,
          },
        },
      };
      const result = fs.insertNode("/home/player/project", subtree);
      expect(result.error).toBeUndefined();
      expect(result.fs!.getNode("/home/player/project")?.type).toBe("directory");
      expect(result.fs!.readFile("/home/player/project/readme.txt").content).toBe("hello");
    });

    it("returns error when parent does not exist", () => {
      const fs = createTestFS();
      const node: DirectoryNode = {
        type: "directory",
        name: "sub",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {},
      };
      const result = fs.insertNode("/nonexistent/sub", node);
      expect(result.error).toContain("parent directory does not exist");
    });

    it("does not mutate original instance", () => {
      const fs = createTestFS();
      const node: DirectoryNode = {
        type: "directory",
        name: "newdir",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {},
      };
      fs.insertNode("/home/player/newdir", node);
      expect(fs.getNode("/home/player/newdir")).toBeNull();
    });
  });

  describe("changeCwd", () => {
    it("changes cwd to a valid directory", () => {
      const fs = createTestFS();
      const result = fs.changeCwd("/etc");
      expect(result.error).toBeUndefined();
      expect(result.fs!.cwd).toBe("/etc");
    });

    it("preserves homeDir after cwd change", () => {
      const fs = createTestFS();
      const result = fs.changeCwd("/etc");
      expect(result.fs!.homeDir).toBe("/home/player");
    });

    it("returns error for nonexistent directory", () => {
      const fs = createTestFS();
      const result = fs.changeCwd("/nonexistent");
      expect(result.error).toContain("No such file or directory");
    });

    it("returns error when changing to a file", () => {
      const fs = createTestFS();
      const result = fs.changeCwd("/home/player/notes.txt");
      expect(result.error).toContain("Not a directory");
    });
  });

  describe("permission enforcement", () => {
    it("listDirectory returns Permission denied for rwx------ dirs", () => {
      const fs = createTestFS();
      const result = fs.listDirectory("/srv/locked");
      expect(result.error).toContain("Permission denied");
      expect(result.entries).toHaveLength(0);
    });

    it("listDirectory works for accessible dirs", () => {
      const fs = createTestFS();
      const result = fs.listDirectory("/srv/open");
      expect(result.error).toBeUndefined();
      expect(result.entries.length).toBe(1);
    });

    it("readFile returns Permission denied for files in locked dirs", () => {
      const fs = createTestFS();
      const result = fs.readFile("/srv/locked/secret.txt");
      expect(result.error).toContain("Permission denied");
    });

    it("readFile works for files in accessible dirs", () => {
      const fs = createTestFS();
      const result = fs.readFile("/srv/open/public.txt");
      expect(result.content).toBe("public info");
    });

    it("changeCwd returns Permission denied for locked dirs", () => {
      const fs = createTestFS();
      const result = fs.changeCwd("/srv/locked");
      expect(result.error).toContain("Permission denied");
    });

    it("changeCwd works for accessible dirs", () => {
      const fs = createTestFS();
      const result = fs.changeCwd("/srv/open");
      expect(result.error).toBeUndefined();
      expect(result.fs!.cwd).toBe("/srv/open");
    });

    it("traversal: nested file in locked parent is denied", () => {
      const fs = createTestFS();
      const result = fs.readFile("/srv/locked/nested/deep.txt");
      expect(result.error).toContain("Permission denied");
    });

    it("writeFile returns Permission denied inside locked dir", () => {
      const fs = createTestFS();
      const result = fs.writeFile("/srv/locked/nested/new.txt", "data");
      expect(result.error).toContain("Permission denied");
    });

    it("makeDirectory returns Permission denied inside locked dir", () => {
      const fs = createTestFS();
      const result = fs.makeDirectory("/srv/locked/nested/newdir");
      expect(result.error).toContain("Permission denied");
    });

    it("removeNode returns Permission denied inside locked dir", () => {
      const fs = createTestFS();
      const result = fs.removeNode("/srv/locked/nested/deep.txt");
      expect(result.error).toContain("Permission denied");
    });
  });
});
