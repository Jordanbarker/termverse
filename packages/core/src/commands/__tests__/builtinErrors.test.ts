import { describe, it, expect } from "vitest";
import { execute } from "../registry";
import { CommandContext } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { file, dir } from "../../filesystem/builders";
import "../builtins";

const HOME = "/home/player";

function createContext(): CommandContext {
  const root = dir("/", {
    home: dir("home", {
      player: dir("player", {
        "notes.txt": file("notes.txt", "alpha\nbeta\ngamma\n"),
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
  };
}

function run(name: string, rawArgs: string[]) {
  const ctx = createContext();
  return execute(name, rawArgs, {}, { ...ctx, rawArgs });
}

describe("head/tail -n value handling", () => {
  it("head -n with no value errors instead of treating -n as a file", () => {
    const result = run("head", ["-n"]);
    expect(result.output).toBe("head: option requires an argument -- 'n'");
    expect(result.exitCode).toBe(1);
  });

  it("head -n with a non-numeric value errors instead of defaulting to 10", () => {
    const result = run("head", ["-n", "abc", "notes.txt"]);
    expect(result.output).toBe("head: invalid number of lines: 'abc'");
    expect(result.exitCode).toBe(1);
  });

  it("head -n 2 still works", () => {
    const result = run("head", ["-n", "2", "notes.txt"]);
    expect(result.output).toBe("alpha\nbeta");
  });

  it("tail -n with no value errors", () => {
    const result = run("tail", ["-n"]);
    expect(result.output).toBe("tail: option requires an argument -- 'n'");
    expect(result.exitCode).toBe(1);
  });

  it("tail -n '' errors", () => {
    const result = run("tail", ["-n", "", "notes.txt"]);
    expect(result.output).toBe("tail: invalid number of lines: ''");
    expect(result.exitCode).toBe(1);
  });
});

describe("find expression value handling", () => {
  it("dangling -name errors instead of listing everything", () => {
    const result = run("find", [".", "-name"]);
    expect(result.output).toBe("find: -name: requires additional arguments");
    expect(result.exitCode).toBe(1);
  });

  it("dangling -type errors", () => {
    const result = run("find", [".", "-type"]);
    expect(result.output).toBe("find: -type: requires additional arguments");
    expect(result.exitCode).toBe(1);
  });

  it("invalid -type errors", () => {
    const result = run("find", [".", "-type", "x"]);
    expect(result.output).toBe("find: -type: x: unknown type");
    expect(result.exitCode).toBe(1);
  });

  it("find . -name '*.txt' still works", () => {
    const result = run("find", [".", "-name", "*.txt"]);
    expect(result.output).toContain("notes.txt");
  });
});

describe("missing-operand exit codes", () => {
  it.each(["mkdir", "rm", "mv", "cp", "cat", "file"])("%s with no args exits 1", (cmd) => {
    const result = run(cmd, []);
    expect(result.output).toContain("missing");
    expect(result.exitCode).toBe(1);
  });
});
