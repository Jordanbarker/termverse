import { describe, it, expect } from "vitest";
import { parseInput, splitOnChainOperators, parseChainedPipeline, expandAliases } from "@tt/core/commands/parser";

describe("parseInput", () => {
  it("returns empty command for empty input", () => {
    const result = parseInput("");
    expect(result.command).toBe("");
    expect(result.args).toEqual([]);
    expect(result.flags).toEqual({});
  });

  it("returns empty command for whitespace-only input", () => {
    const result = parseInput("   ");
    expect(result.command).toBe("");
  });

  it("parses a simple command with no args", () => {
    const result = parseInput("ls");
    expect(result.command).toBe("ls");
    expect(result.args).toEqual([]);
    expect(result.flags).toEqual({});
  });

  it("parses command with arguments", () => {
    const result = parseInput("cat file1.txt file2.txt");
    expect(result.command).toBe("cat");
    expect(result.args).toEqual(["file1.txt", "file2.txt"]);
  });

  it("parses long flags (--flag)", () => {
    const result = parseInput("ls --all --long");
    expect(result.flags).toEqual({ all: true, long: true });
    expect(result.args).toEqual([]);
  });

  it("parses short flags (-a)", () => {
    const result = parseInput("ls -a");
    expect(result.flags).toEqual({ a: true });
  });

  it("expands combined short flags (-la → -l -a)", () => {
    const result = parseInput("ls -la");
    expect(result.flags).toEqual({ l: true, a: true });
  });

  it("handles single-quoted strings", () => {
    const result = parseInput("echo 'hello world'");
    expect(result.args).toEqual(["hello world"]);
  });

  it("handles double-quoted strings", () => {
    const result = parseInput('echo "hello world"');
    expect(result.args).toEqual(["hello world"]);
  });

  it("preserves single quotes inside double quotes", () => {
    const result = parseInput(`echo "it's fine"`);
    expect(result.args).toEqual(["it's fine"]);
  });

  it("preserves double quotes inside single quotes", () => {
    const result = parseInput(`echo 'say "hello"'`);
    expect(result.args).toEqual(['say "hello"']);
  });

  it("mixes flags and args", () => {
    const result = parseInput("ls -l /home");
    expect(result.command).toBe("ls");
    expect(result.flags).toEqual({ l: true });
    expect(result.args).toEqual(["/home"]);
  });

  it("preserves raw input (trimmed)", () => {
    const result = parseInput("  ls -la  ");
    expect(result.raw).toBe("ls -la");
  });

  it("returns error for unterminated double quote", () => {
    const result = parseInput('echo "hello');
    expect(result.error).toBe("syntax error: unterminated quote");
    expect(result.command).toBe("");
  });

  it("returns error for unterminated single quote", () => {
    const result = parseInput("echo 'hello");
    expect(result.error).toBe("syntax error: unterminated quote");
    expect(result.command).toBe("");
  });

  it("returns error for trailing unmatched quote", () => {
    const result = parseInput("dbt build'");
    expect(result.error).toBe("syntax error: unterminated quote");
  });

  it("handles multiple spaces between tokens", () => {
    const result = parseInput("ls   -l   /home");
    expect(result.command).toBe("ls");
    expect(result.args).toEqual(["/home"]);
    expect(result.flags).toEqual({ l: true });
  });

  it("does not treat lone - as a flag", () => {
    const result = parseInput("cat -");
    expect(result.flags).toEqual({});
    expect(result.args).toEqual(["-"]);
  });

  it("populates rawArgs with all tokens after command", () => {
    const result = parseInput("find . -name *.txt -type f");
    expect(result.rawArgs).toEqual([".", "-name", "*.txt", "-type", "f"]);
  });

  it("rawArgs preserves -n and its value", () => {
    const result = parseInput("head -n 5 file.txt");
    expect(result.rawArgs).toEqual(["-n", "5", "file.txt"]);
  });

  it("rawArgs is empty for command with no args", () => {
    const result = parseInput("ls");
    expect(result.rawArgs).toEqual([]);
  });

  it("rawArgs is empty for empty input", () => {
    const result = parseInput("");
    expect(result.rawArgs).toEqual([]);
  });

  it("rawArgs preserves quoted strings", () => {
    const result = parseInput('find . -name "*.py"');
    expect(result.rawArgs).toEqual([".", "-name", "*.py"]);
  });
});

describe("splitOnChainOperators", () => {
  it("splits on &&", () => {
    const result = splitOnChainOperators("ls && echo done");
    expect(result).toEqual([
      { text: "ls ", operator: null },
      { text: " echo done", operator: "&&" },
    ]);
  });

  it("splits on ||", () => {
    const result = splitOnChainOperators("ls || echo fallback");
    expect(result).toEqual([
      { text: "ls ", operator: null },
      { text: " echo fallback", operator: "||" },
    ]);
  });

  it("splits on ;", () => {
    const result = splitOnChainOperators("ls; echo done");
    expect(result).toEqual([
      { text: "ls", operator: null },
      { text: " echo done", operator: ";" },
    ]);
  });

  it("preserves single-quoted operators", () => {
    const result = splitOnChainOperators("echo 'a && b'");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("echo 'a && b'");
  });

  it("preserves double-quoted operators", () => {
    const result = splitOnChainOperators('echo "a || b"');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('echo "a || b"');
  });

  it("handles mixed operators", () => {
    const result = splitOnChainOperators("cmd1 && cmd2 || cmd3; cmd4");
    expect(result).toHaveLength(4);
    expect(result[0].operator).toBeNull();
    expect(result[1].operator).toBe("&&");
    expect(result[2].operator).toBe("||");
    expect(result[3].operator).toBe(";");
  });

  it("does NOT split on single |", () => {
    const result = splitOnChainOperators("cmd1 | cmd2");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("cmd1 | cmd2");
  });

  it("does NOT split on single &", () => {
    const result = splitOnChainOperators("cmd1 & cmd2");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("cmd1 & cmd2");
  });
});

describe("parseChainedPipeline", () => {
  it("parses simple && chain", () => {
    const result = parseChainedPipeline("ls && echo done");
    expect(result).toHaveLength(2);
    expect(result[0].operator).toBeNull();
    expect(result[0].pipeline[0].command).toBe("ls");
    expect(result[1].operator).toBe("&&");
    expect(result[1].pipeline[0].command).toBe("echo");
  });

  it("parses || chain", () => {
    const result = parseChainedPipeline("ls || echo fallback");
    expect(result).toHaveLength(2);
    expect(result[1].operator).toBe("||");
    expect(result[1].pipeline[0].command).toBe("echo");
  });

  it("parses ; chain", () => {
    const result = parseChainedPipeline("ls; echo done");
    expect(result).toHaveLength(2);
    expect(result[1].operator).toBe(";");
  });

  it("parses three-segment chain with mixed operators", () => {
    const result = parseChainedPipeline("cmd1 && cmd2 || cmd3");
    expect(result).toHaveLength(3);
    expect(result[0].operator).toBeNull();
    expect(result[1].operator).toBe("&&");
    expect(result[2].operator).toBe("||");
  });

  it("ignores operators inside single quotes", () => {
    const result = parseChainedPipeline("echo 'a && b'");
    expect(result).toHaveLength(1);
    expect(result[0].pipeline[0].command).toBe("echo");
  });

  it("ignores operators inside double quotes", () => {
    const result = parseChainedPipeline('echo "a || b"');
    expect(result).toHaveLength(1);
  });

  it("handles pipes within chain segments", () => {
    const result = parseChainedPipeline("cmd1 | cmd2 && cmd3 | cmd4");
    expect(result).toHaveLength(2);
    expect(result[0].pipeline).toHaveLength(2);
    expect(result[0].pipeline[0].command).toBe("cmd1");
    expect(result[0].pipeline[1].command).toBe("cmd2");
    expect(result[1].pipeline).toHaveLength(2);
    expect(result[1].pipeline[0].command).toBe("cmd3");
    expect(result[1].pipeline[1].command).toBe("cmd4");
  });

  it("handles simple command (backward compat)", () => {
    const result = parseChainedPipeline("ls");
    expect(result).toHaveLength(1);
    expect(result[0].operator).toBeNull();
    expect(result[0].pipeline[0].command).toBe("ls");
  });

  it("handles empty input", () => {
    const result = parseChainedPipeline("");
    expect(result).toHaveLength(1);
    expect(result[0].pipeline[0].command).toBe("");
  });

  it("returns zsh parse error for trailing &&", () => {
    const result = parseChainedPipeline("cmd1 &&");
    expect(result).toHaveLength(1);
    expect(result[0].pipeline[0].error).toBe("zsh: parse error near `&&'");
  });

  it("returns zsh parse error for leading &&", () => {
    const result = parseChainedPipeline("&& cmd1");
    expect(result).toHaveLength(1);
    expect(result[0].pipeline[0].error).toBe("zsh: parse error near `&&'");
  });

  it("returns zsh parse error for consecutive operators", () => {
    const result = parseChainedPipeline("cmd1 && && cmd2");
    expect(result).toHaveLength(1);
    expect(result[0].pipeline[0].error).toBe("zsh: parse error near `&&'");
  });

  it("uses bash wording in bash mode (scripts)", () => {
    const result = parseChainedPipeline("cmd1 &&", "bash");
    expect(result[0].pipeline[0].error).toBe("bash: syntax error near unexpected token `&&'");
  });

  it("correctly splits || as chain, not pipe", () => {
    const result = parseChainedPipeline("cmd1 || cmd2");
    expect(result).toHaveLength(2);
    expect(result[0].pipeline).toHaveLength(1);
    expect(result[1].pipeline).toHaveLength(1);
    expect(result[1].operator).toBe("||");
  });
});

describe("expandAliases", () => {
  it("expands a simple alias", () => {
    expect(expandAliases("deploy", { deploy: "dbt run && snow sql" })).toBe("dbt run && snow sql");
  });

  it("appends trailing args after expansion", () => {
    expect(expandAliases("deploy --full-refresh", { deploy: "dbt run" })).toBe("dbt run --full-refresh");
  });

  it("expands alias after &&", () => {
    expect(expandAliases("echo hi && deploy", { deploy: "dbt run" })).toBe("echo hi && dbt run");
  });

  it("expands alias after ;", () => {
    expect(expandAliases("echo hi; deploy", { deploy: "dbt run" })).toBe("echo hi; dbt run");
  });

  it("expands alias after ||", () => {
    expect(expandAliases("false || deploy", { deploy: "dbt run" })).toBe("false || dbt run");
  });

  it("does not expand in argument position", () => {
    expect(expandAliases("echo deploy", { deploy: "dbt run" })).toBe("echo deploy");
  });

  it("does not expand quoted command", () => {
    expect(expandAliases("'deploy'", { deploy: "dbt run" })).toBe("'deploy'");
  });

  it("returns input unchanged when no alias matches", () => {
    expect(expandAliases("unknown", { deploy: "dbt run" })).toBe("unknown");
  });

  it("returns input unchanged with empty aliases", () => {
    expect(expandAliases("ls", {})).toBe("ls");
  });

  it("expands multiple aliases in a chain", () => {
    expect(expandAliases("d1 && d2", { d1: "echo a", d2: "echo b" })).toBe("echo a && echo b");
  });

  it("alias expands to chain operators", () => {
    const result = expandAliases("deploy", { deploy: "cmd1 && cmd2" });
    expect(result).toBe("cmd1 && cmd2");
    // Verify re-parsing produces two chain segments
    const chain = parseChainedPipeline(result);
    expect(chain).toHaveLength(2);
    expect(chain[0].pipeline[0].command).toBe("cmd1");
    expect(chain[1].pipeline[0].command).toBe("cmd2");
  });
});
