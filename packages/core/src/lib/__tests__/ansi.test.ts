import { describe, it, expect } from "vitest";
import { colorize, ansi } from "../ansi";

describe("ansi constants", () => {
  it("reset is ESC[0m", () => {
    expect(ansi.reset).toBe("\x1b[0m");
  });

  it("bold is ESC[1m", () => {
    expect(ansi.bold).toBe("\x1b[1m");
  });

  it("colors are correct escape sequences", () => {
    expect(ansi.red).toBe("\x1b[31m");
    expect(ansi.green).toBe("\x1b[32m");
    expect(ansi.blue).toBe("\x1b[34m");
    expect(ansi.cyan).toBe("\x1b[36m");
  });

  it("bright colors use 90+ codes", () => {
    expect(ansi.brightRed).toBe("\x1b[91m");
    expect(ansi.brightGreen).toBe("\x1b[92m");
    expect(ansi.brightYellow).toBe("\x1b[93m");
  });
});

describe("colorize", () => {
  it("wraps text with a single code and reset", () => {
    const result = colorize("hello", ansi.red);
    expect(result).toBe(`${ansi.red}hello${ansi.reset}`);
  });

  it("wraps text with multiple codes", () => {
    const result = colorize("hello", ansi.bold, ansi.green);
    expect(result).toBe(`${ansi.bold}${ansi.green}hello${ansi.reset}`);
  });

  it("works with empty text", () => {
    const result = colorize("", ansi.cyan);
    expect(result).toBe(`${ansi.cyan}${ansi.reset}`);
  });

  it("works with no codes", () => {
    const result = colorize("hello");
    expect(result).toBe(`hello${ansi.reset}`);
  });
});
