import { describe, it, expect } from "vitest";
import { ansi } from "../ansi";
import { highlightPython } from "../pythonHighlight";

/** Strip ANSI codes for plain-text comparison. */
function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Check that a substring appears wrapped in the expected ANSI color. */
function expectColored(result: string, text: string, color: string): void {
  expect(result).toContain(`${color}${text}${ansi.reset}`);
}

describe("highlightPython", () => {
  it("colorizes keywords cyan", () => {
    const result = highlightPython("def foo():");
    expectColored(result, "def", ansi.cyan);
    expect(strip(result)).toBe("def foo():");
  });

  it("colorizes multiple keywords", () => {
    const result = highlightPython("if x and y:");
    expectColored(result, "if", ansi.cyan);
    expectColored(result, "and", ansi.cyan);
  });

  it("colorizes True, False, None as keywords", () => {
    const result = highlightPython("True False None");
    expectColored(result, "True", ansi.cyan);
    expectColored(result, "False", ansi.cyan);
    expectColored(result, "None", ansi.cyan);
  });

  it("colorizes builtins blue", () => {
    const result = highlightPython("print(len(x))");
    expectColored(result, "print", ansi.blue);
    expectColored(result, "len", ansi.blue);
  });

  it("colorizes self blue", () => {
    const result = highlightPython("self.x = 1");
    expectColored(result, "self", ansi.blue);
  });

  it("dims comments", () => {
    const result = highlightPython("x = 1 # comment");
    expectColored(result, "# comment", ansi.dim);
  });

  it("dims shebang line", () => {
    const result = highlightPython("#!/usr/bin/env python3\nimport os");
    expectColored(result, "#!/usr/bin/env python3", ansi.dim);
    expectColored(result, "import", ansi.cyan);
  });

  it("colorizes single-quoted strings green", () => {
    const result = highlightPython("x = 'hello'");
    expectColored(result, "'hello'", ansi.green);
  });

  it("colorizes double-quoted strings green", () => {
    const result = highlightPython('x = "hello"');
    expectColored(result, '"hello"', ansi.green);
  });

  it("colorizes triple-quoted strings green", () => {
    const result = highlightPython('"""docstring"""');
    expectColored(result, '"""docstring"""', ansi.green);
  });

  it("handles multiline triple-quoted strings", () => {
    const code = '"""\nline1\nline2\n"""';
    const result = highlightPython(code);
    expectColored(result, code, ansi.green);
  });

  it("colorizes f-strings green (including prefix)", () => {
    const result = highlightPython("f'hello {x}'");
    expectColored(result, "f'hello {x}'", ansi.green);
  });

  it("colorizes r-strings green (including prefix)", () => {
    const result = highlightPython("r'\\n'");
    expectColored(result, "r'\\n'", ansi.green);
  });

  it("colorizes b-strings green", () => {
    const result = highlightPython("b'bytes'");
    expectColored(result, "b'bytes'", ansi.green);
  });

  it("handles rb prefix strings", () => {
    const result = highlightPython("rb'raw bytes'");
    expectColored(result, "rb'raw bytes'", ansi.green);
  });

  it("handles escape sequences in strings", () => {
    const result = highlightPython("'it\\'s'");
    expectColored(result, "'it\\'s'", ansi.green);
  });

  it("does not treat f as string prefix without following quote", () => {
    const result = highlightPython("f = 1");
    // f should not be green — it's just a variable
    expect(result).not.toContain(ansi.green);
  });

  it("colorizes numbers magenta", () => {
    const result = highlightPython("x = 42");
    expectColored(result, "42", ansi.magenta);
  });

  it("colorizes float numbers", () => {
    const result = highlightPython("x = 3.14");
    expectColored(result, "3.14", ansi.magenta);
  });

  it("colorizes hex numbers", () => {
    const result = highlightPython("x = 0xFF");
    expectColored(result, "0xFF", ansi.magenta);
  });

  it("does not color numbers in identifiers", () => {
    const result = highlightPython("var2");
    expect(result).not.toContain(ansi.magenta);
  });

  it("colorizes decorators yellow", () => {
    const result = highlightPython("@property");
    expectColored(result, "@property", ansi.yellow);
  });

  it("colorizes dotted decorators yellow", () => {
    const result = highlightPython("@app.route");
    expectColored(result, "@app.route", ansi.yellow);
  });

  it("leaves plain identifiers uncolored", () => {
    const result = highlightPython("my_var");
    expect(result).toBe("my_var");
  });

  it("returns empty string for empty input", () => {
    expect(highlightPython("")).toBe("");
  });

  it("preserves whitespace-only input", () => {
    expect(highlightPython("   \n  ")).toBe("   \n  ");
  });

  it("handles mixed tokens correctly", () => {
    const code = "def greet(name):\n    print(f'Hello {name}')";
    const result = highlightPython(code);
    expectColored(result, "def", ansi.cyan);
    expectColored(result, "print", ansi.blue);
    expectColored(result, "f'Hello {name}'", ansi.green);
    expect(strip(result)).toBe(code);
  });

  it("colorizes exception types blue", () => {
    const result = highlightPython("except ValueError as e:");
    expectColored(result, "except", ansi.cyan);
    expectColored(result, "ValueError", ansi.blue);
    expectColored(result, "as", ansi.cyan);
  });
});
