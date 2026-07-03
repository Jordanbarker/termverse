import { describe, it, expect } from "vitest";
import { runPipeline, isChainEarlyReturn, RunPipelineOptions } from "../runPipeline";
import { parseChainedPipeline } from "../parser";
import { CommandContext, CommandResult, ParsedCommand } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { file, dir } from "../../filesystem/builders";
import { stripAnsi } from "../../lib/ansi";
import "../builtins";

const HOME = "/home/player";

function createTestFS(): VirtualFS {
  const root = dir("/", {
    home: dir("home", {
      player: dir("player", {
        "notes.txt": file("notes.txt", "alpha\nbeta\ngamma\n"),
        docs: dir("docs", {}),
      }),
    }),
  });
  return new VirtualFS(root, HOME, HOME);
}

function baseOpts(input: string, overrides?: Partial<RunPipelineOptions>): RunPipelineOptions {
  const fs = createTestFS();
  let envVars: Record<string, string> = {};
  let aliases: Record<string, string> = {};
  return {
    chain: parseChainedPipeline(input),
    fs,
    cwd: HOME,
    homeDir: HOME,
    buildContext: ({ fs, cwd, stdin, rawArgs, isPiped }): CommandContext => ({
      fs,
      cwd,
      homeDir: HOME,
      username: "player",
      activeComputer: "home",
      stdin,
      rawArgs,
      isPiped,
      commandHistory: [],
      envVars,
      setEnvVars: (e) => { envVars = e; },
      aliases,
      setAliases: (a) => { aliases = a; },
    }),
    write: () => {},
    applySegment: () => ({}),
    ...overrides,
  };
}

describe("runPipeline", () => {
  it("pipes stdout to the next command's stdin, ANSI-stripped", async () => {
    const applied: CommandResult[] = [];
    await runPipeline(baseOpts("ls | grep notes", {
      applySegment: (r) => { applied.push(r); return {}; },
    }));
    expect(applied).toHaveLength(1);
    // grep re-colorizes its match, so compare the stripped text; the piped
    // stdin must itself have been ANSI-stripped for the plain match to work.
    expect(stripAnsi(applied[0].output)).toContain("notes.txt");
    expect(applied[0].output).not.toContain("docs");
  });

  it("short-circuits && on failure and || on success", async () => {
    const outputs: string[] = [];
    const result = await runPipeline(baseOpts(
      "cat missing.txt && echo yes || echo no",
      { applySegment: (r) => { outputs.push(r.output); return {}; } },
    ));
    expect(outputs).toEqual(expect.arrayContaining([expect.stringContaining("no")]));
    expect(outputs.join("")).not.toContain("yes");
    expect(result.lastExitCode).toBe(0);
  });

  it("runs every segment with ;", async () => {
    const outputs: string[] = [];
    await runPipeline(baseOpts("echo one; echo two", {
      applySegment: (r) => { outputs.push(r.output); return {}; },
    }));
    expect(outputs.join("")).toContain("one");
    expect(outputs.join("")).toContain("two");
  });

  it("threads newCwd from applySegment into later segments", async () => {
    const cwds: string[] = [];
    const result = await runPipeline(baseOpts("cd docs; pwd", {
      applySegment: (r, _p, state) => {
        cwds.push(state.cwd);
        return { newCwd: r.newCwd };
      },
    }));
    expect(result.cwd).toBe(`${HOME}/docs`);
    // pwd ran with the updated cwd
    expect(cwds[1]).toBe(`${HOME}/docs`);
  });

  it("stops the chain when applySegment returns stopChain", async () => {
    const outputs: string[] = [];
    await runPipeline(baseOpts("echo one; echo two", {
      applySegment: (r) => { outputs.push(r.output); return { stopChain: true }; },
    }));
    expect(outputs).toHaveLength(1);
  });

  it("accumulates newFs across pipeline commands and segments", async () => {
    const result = await runPipeline(baseOpts("touch a.txt; touch b.txt"));
    expect(result.fs.getNode(`${HOME}/a.txt`)).toBeTruthy();
    expect(result.fs.getNode(`${HOME}/b.txt`)).toBeTruthy();
  });

  it("marks the last executed segment as final", async () => {
    const finals: boolean[] = [];
    await runPipeline(baseOpts("echo one; echo two", {
      applySegment: (_r, _p, _s, isFinal) => { finals.push(isFinal); return {}; },
    }));
    expect(finals).toEqual([false, true]);
  });

  describe("redirection (opt-in)", () => {
    it("is inert without the redirection option: > is not interpreted", async () => {
      const result = await runPipeline(baseOpts("echo hi > out.txt"));
      expect(result.fs.getNode(`${HOME}/out.txt`)).toBeNull();
    });

    it("writes stdout to the target and clears output", async () => {
      const applied: CommandResult[] = [];
      const result = await runPipeline(baseOpts("echo hi > out.txt", {
        redirection: { computerId: "home" },
        applySegment: (r) => { applied.push(r); return {}; },
      }));
      expect(result.fs.readFile(`${HOME}/out.txt`).content).toContain("hi");
      expect(applied[0].output).toBe("");
    });

    it("precheck failure skips execution and continues the chain with exit 1", async () => {
      const writes: string[] = [];
      const outputs: string[] = [];
      const result = await runPipeline(baseOpts(
        "echo hi > missing/out.txt || echo fallback",
        {
          redirection: { computerId: "home" },
          write: (t) => writes.push(t),
          applySegment: (r) => { outputs.push(r.output); return {}; },
        },
      ));
      expect(writes.join("")).toContain("zsh: no such file or directory");
      expect(outputs.join("")).toContain("fallback");
      expect(result.fs.getNode(`${HOME}/out.txt`)).toBeNull();
      expect(result.lastExitCode).toBe(0); // fallback ran
    });
  });

  it("earlyReturn from applySegment is surfaced and stops the chain", async () => {
    const outputs: string[] = [];
    const result = await runPipeline(baseOpts("echo one && echo two", {
      applySegment: (r) => { outputs.push(r.output); return { earlyReturn: true }; },
    }));
    expect(outputs).toHaveLength(1);
    expect(result.earlyReturn).toBe(true);
  });
});

describe("isChainEarlyReturn", () => {
  it("detects session/transition results", () => {
    expect(isChainEarlyReturn({ output: "" })).toBe(false);
    expect(isChainEarlyReturn({ output: "", transitionTo: "home" })).toBe(true);
    expect(isChainEarlyReturn({ output: "", editorSession: {} as never })).toBe(true);
  });
});
