import { describe, it, expect } from "vitest";
import { execute, getPrimaryName } from "../registry";
import { CommandContext } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { file, dir } from "../../filesystem/builders";
import "../builtins";

const HOME = "/home/player";

function createContext(overrides: Partial<CommandContext> = {}): CommandContext {
  const root = dir("/", {
    home: dir("home", {
      player: dir("player", {
        "notes.txt": file("notes.txt", "alpha\nbeta\n"),
        "locked.txt": file("locked.txt", "secret", "r--r--r--"),
        docs: dir("docs", {}),
        scripts: dir("scripts", {
          "backup.sh": file("backup.sh", "#!/bin/bash\n"),
        }),
      }),
    }),
  });
  return {
    fs: new VirtualFS(root, HOME, HOME),
    cwd: HOME,
    homeDir: HOME,
    username: "player",
    activeComputer: "home",
    commandHistory: [],
    envVars: {},
    setEnvVars: () => {},
    aliases: {},
    setAliases: () => {},
    ...overrides,
  };
}

function run(name: string, rawArgs: string[], overrides: Partial<CommandContext> = {}) {
  const ctx = createContext(overrides);
  return execute(name, rawArgs, {}, { ...ctx, rawArgs });
}

describe("vim builtin (shared editorOpen paths)", () => {
  it("opens an existing file with the vim discriminator", () => {
    const result = run("vim", ["notes.txt"]);
    expect(result.editorSession).toMatchObject({
      filePath: `${HOME}/notes.txt`,
      content: "alpha\nbeta\n",
      readOnly: false,
      isNewFile: false,
      editor: "vim",
    });
  });

  it("resolves the vi alias to the same handler", () => {
    expect(getPrimaryName("vi")).toBe("vim");
    const result = run("vi", ["notes.txt"]);
    expect(result.editorSession?.editor).toBe("vim");
  });

  it("detects read-only files from permissions", () => {
    const result = run("vim", ["locked.txt"]);
    expect(result.editorSession?.readOnly).toBe(true);
  });

  it("rejects directories", () => {
    expect(run("vim", ["docs"]).output).toBe('vim: "docs": Is a directory');
  });

  it("requires a filename", () => {
    expect(run("vim", []).output).toBe("Usage: vim <filename>");
  });

  it("opens a new file when the parent directory exists", () => {
    const result = run("vim", ["fresh.txt"]);
    expect(result.editorSession).toMatchObject({
      filePath: `${HOME}/fresh.txt`,
      content: "",
      isNewFile: true,
      editor: "vim",
    });
  });

  it("rejects a new file in a missing directory", () => {
    expect(run("vim", ["nowhere/f.txt"]).output).toBe('vim: "nowhere/f.txt": No such file or directory');
  });

  it("constructs the backup.sh trigger on the home computer", () => {
    const result = run("vim", ["scripts/backup.sh"]);
    expect(result.editorSession).toMatchObject({
      triggerRow: 0,
      requireSave: true,
      triggerEvents: [{ type: "file_read", detail: "fixed_backup_script" }],
    });
  });
});

describe("nano builtin (unchanged after the editorOpen extraction)", () => {
  it("opens an existing file without an editor discriminator", () => {
    const result = run("nano", ["notes.txt"]);
    expect(result.editorSession).toMatchObject({
      filePath: `${HOME}/notes.txt`,
      readOnly: false,
      isNewFile: false,
    });
    expect(result.editorSession?.editor).toBeUndefined();
  });

  it("keeps nano-prefixed error messages", () => {
    expect(run("nano", ["docs"]).output).toBe('nano: "docs": Is a directory');
    expect(run("nano", []).output).toBe("Usage: nano <filename>");
  });

  it("still constructs the backup.sh trigger", () => {
    const result = run("nano", ["scripts/backup.sh"]);
    expect(result.editorSession).toMatchObject({ triggerRow: 0, requireSave: true });
  });
});
