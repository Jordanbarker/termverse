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

function setupCommittedRepo(): CommandContext {
  const ctx = setupRepoWithStagedFile();
  const result = git(ctx, ["commit", "-m", "init"]);
  expect(result.newFs).toBeDefined();
  return { ...ctx, fs: result.newFs! };
}

describe("git value-flag and exit-code fidelity", () => {
  it("checkout -b with no value errors instead of creating branch 'true'", () => {
    const result = git(setupCommittedRepo(), ["checkout", "-b"]);
    expect(result.output).toBe("error: switch `b' requires a value");
    expect(result.exitCode).toBe(129);
  });

  it("checkout -b '' rejects the empty branch name", () => {
    const result = git(setupCommittedRepo(), ["checkout", "-b", ""]);
    expect(result.output).toBe("fatal: '' is not a valid branch name");
    expect(result.exitCode).toBe(128);
  });

  it("checkout -b feature main creates 'feature', not 'main'", () => {
    const result = git(setupCommittedRepo(), ["checkout", "-b", "feature", "main"]);
    expect(result.output).toContain("feature");
    expect(result.newFs).toBeDefined();
  });

  it("switch -c with no value errors", () => {
    const result = git(setupCommittedRepo(), ["switch", "-c"]);
    expect(result.output).toBe("error: switch `c' requires a value");
    expect(result.exitCode).toBe(129);
  });

  it("clone -b with no value errors instead of being ignored", () => {
    const result = git(setupCommittedRepo(), ["clone", "-b"]);
    expect(result.exitCode).toBe(129);
  });

  it("usage errors report nonzero exit codes", () => {
    const ctx = setupCommittedRepo();
    expect(git(ctx, ["rm"]).exitCode).toBe(129);
    expect(git(ctx, ["add"]).exitCode).toBe(1);
    expect(git(ctx, ["branch", "-d"]).exitCode).toBe(128);
    expect(git(ctx, ["branch", "-d"]).output).toBe("fatal: branch name required");
    expect(git(ctx, ["checkout"]).exitCode).toBe(1);
    expect(git(ctx, ["stash", "bogus"]).exitCode).toBe(129);
  });
});

describe("git commit happy path", () => {
  it("commits with a non-empty message", () => {
    const result = git(setupRepoWithStagedFile(), ["commit", "-m", "a"]);
    expect(result.output).toContain("a");
    expect(result.newFs).toBeDefined();
    expect(result.exitCode).toBeUndefined();
  });
});
