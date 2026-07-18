import { describe, it, expect } from "vitest";
import { execute } from "../registry";
import { CommandContext } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { file, dir } from "../../filesystem/builders";
import "../builtins";

const HOME = "/home/player";

function createContext(fs: VirtualFS): CommandContext {
  return {
    fs,
    cwd: HOME,
    homeDir: HOME,
    username: "player",
    activeComputer: "home",
    commandHistory: [],
    envVars: {},
    setEnvVars: () => {},
    aliases: {},
    setAliases: () => {},
  };
}

function git(ctx: CommandContext, rawArgs: string[]) {
  return execute("git", rawArgs, {}, { ...ctx, rawArgs });
}

function setupRepoWithStagedFile(): CommandContext {
  const root = dir("/", {
    home: dir("home", {
      player: dir("player", {
        "notes.txt": file("notes.txt", "alpha\n"),
      }),
    }),
  });
  let ctx = createContext(new VirtualFS(root, HOME, HOME));
  for (const args of [["init"], ["add", "notes.txt"]]) {
    const result = git(ctx, args);
    expect(result.newFs).toBeDefined();
    ctx = { ...ctx, fs: result.newFs! };
  }
  return ctx;
}

describe("git commit message errors", () => {
  it("errors like real git when -m is given with no value", () => {
    const result = git(setupRepoWithStagedFile(), ["commit", "-m"]);
    expect(result.output).toBe("error: switch `m' requires a value");
    expect(result.exitCode).toBe(129);
  });

  it("errors about the missing editor when -m is absent", () => {
    const result = git(setupRepoWithStagedFile(), ["commit"]);
    expect(result.output).toContain("Terminal is dumb, but EDITOR unset");
    expect(result.output).toContain("-m or -F");
    expect(result.exitCode).toBe(1);
  });

  it("aborts on an empty commit message", () => {
    const result = git(setupRepoWithStagedFile(), ["commit", "-m", ""]);
    expect(result.output).toBe("Aborting commit due to empty commit message.");
    expect(result.exitCode).toBe(1);
  });

  it("still commits with a non-empty message", () => {
    const result = git(setupRepoWithStagedFile(), ["commit", "-m", "a"]);
    expect(result.output).toContain("a");
    expect(result.newFs).toBeDefined();
    expect(result.exitCode).toBeUndefined();
  });
});
