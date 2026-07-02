import { describe, it, expect } from "vitest";
import { analyzeIncompleteInput } from "../parser";

describe("analyzeIncompleteInput", () => {
  it("returns null for balanced input", () => {
    expect(analyzeIncompleteInput("ls -la")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(analyzeIncompleteInput("")).toBeNull();
  });

  it("detects an unterminated double quote", () => {
    expect(analyzeIncompleteInput('echo "hello')).toEqual({ kind: "dquote", prompt: "dquote> " });
  });

  it("detects an unterminated single quote", () => {
    expect(analyzeIncompleteInput("echo 'hello")).toEqual({ kind: "quote", prompt: "quote> " });
  });

  it("prioritizes quote continuation over a trailing pipe inside the quote", () => {
    expect(analyzeIncompleteInput('echo "a |')).toEqual({ kind: "dquote", prompt: "dquote> " });
  });

  it("detects a trailing single backslash", () => {
    expect(analyzeIncompleteInput("echo a\\")).toEqual({ kind: "backslash", prompt: "> " });
  });

  it("treats a trailing double backslash as complete", () => {
    expect(analyzeIncompleteInput("echo a\\\\")).toBeNull();
  });

  it("detects a trailing pipe", () => {
    expect(analyzeIncompleteInput("echo hi |")).toEqual({ kind: "pipe", prompt: "pipe> " });
  });

  it("detects a trailing pipe with trailing spaces", () => {
    expect(analyzeIncompleteInput("echo hi |   ")).toEqual({ kind: "pipe", prompt: "pipe> " });
  });

  it("detects a trailing &&", () => {
    expect(analyzeIncompleteInput("echo x &&")).toEqual({ kind: "cmdand", prompt: "cmdand> " });
  });

  it("detects a trailing && with trailing spaces", () => {
    expect(analyzeIncompleteInput("echo x &&   ")).toEqual({ kind: "cmdand", prompt: "cmdand> " });
  });

  it("detects a trailing ||", () => {
    expect(analyzeIncompleteInput("echo x ||")).toEqual({ kind: "cmdor", prompt: "cmdor> " });
  });

  it("detects a trailing || with trailing spaces", () => {
    expect(analyzeIncompleteInput("echo x ||   ")).toEqual({ kind: "cmdor", prompt: "cmdor> " });
  });

  it("does not treat a trailing & as continuation", () => {
    expect(analyzeIncompleteInput("echo x &")).toBeNull();
  });

  it("does not treat a trailing ; as continuation", () => {
    expect(analyzeIncompleteInput("echo x;")).toBeNull();
  });
});
