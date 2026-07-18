import { describe, it, expect } from "vitest";
import { parseExCommand } from "../exCommands";

describe("parseExCommand", () => {
  it("parses write variants", () => {
    expect(parseExCommand("w")).toEqual({ kind: "write", path: undefined, quit: false, onlyIfModified: false });
    expect(parseExCommand("write")).toMatchObject({ kind: "write", quit: false });
    expect(parseExCommand("w notes.txt")).toMatchObject({ kind: "write", path: "notes.txt" });
    expect(parseExCommand("wq")).toMatchObject({ kind: "write", quit: true, onlyIfModified: false });
    expect(parseExCommand("x")).toEqual({ kind: "write", quit: true, onlyIfModified: true });
  });

  it("parses quit variants", () => {
    expect(parseExCommand("q")).toEqual({ kind: "quit", force: false });
    expect(parseExCommand("q!")).toEqual({ kind: "quit", force: true });
    expect(parseExCommand("quit")).toEqual({ kind: "quit", force: false });
  });

  it("parses bare line numbers", () => {
    expect(parseExCommand("42")).toEqual({ kind: "gotoLine", line: 42 });
  });

  it("trims whitespace and treats empty input as none", () => {
    expect(parseExCommand("  ")).toEqual({ kind: "none" });
    expect(parseExCommand(" wq ")).toMatchObject({ kind: "write", quit: true });
  });

  it("rejects unknown commands with E492", () => {
    expect(parseExCommand("nope")).toEqual({ kind: "error", message: "E492: Not an editor command: nope" });
    expect(parseExCommand("q extra")).toMatchObject({ kind: "error" });
    expect(parseExCommand("%s/a/b/")).toMatchObject({ kind: "error" });
  });
});
