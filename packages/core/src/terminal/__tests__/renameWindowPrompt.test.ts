import { describe, it, expect } from "vitest";
import { applyRenameKey } from "../renameWindowPrompt";

/** Feed a sequence of keys, returning the final buffer + the closing action. */
function type(start: string, keys: string[]): { buffer: string; done: string | null } {
  let buffer = start;
  let done: "commit" | "cancel" | null = null;
  for (const k of keys) {
    const r = applyRenameKey(buffer, k);
    buffer = r.buffer;
    done = r.done;
    if (done) break;
  }
  return { buffer, done };
}

describe("applyRenameKey", () => {
  it("appends printable characters", () => {
    expect(type("", ["l", "o", "g", "s"])).toEqual({ buffer: "logs", done: null });
  });

  it("commits on Enter (CR or LF) with the typed buffer", () => {
    expect(type("", ["d", "e", "v", "\r"])).toEqual({ buffer: "dev", done: "commit" });
    expect(applyRenameKey("dev", "\n")).toEqual({ buffer: "dev", done: "commit" });
  });

  it("cancels on Esc and Ctrl+C, preserving the buffer", () => {
    expect(applyRenameKey("dev", "\x1b")).toEqual({ buffer: "dev", done: "cancel" });
    expect(applyRenameKey("dev", "\x03")).toEqual({ buffer: "dev", done: "cancel" });
  });

  it("backspaces with DEL or BS", () => {
    expect(applyRenameKey("devs", "\x7f")).toEqual({ buffer: "dev", done: null });
    expect(applyRenameKey("dev", "\b")).toEqual({ buffer: "de", done: null });
  });

  it("does not underflow when backspacing an empty buffer", () => {
    expect(applyRenameKey("", "\x7f")).toEqual({ buffer: "", done: null });
  });

  it("ignores arrow / CSI escape sequences but stays open", () => {
    expect(applyRenameKey("dev", "\x1b[A")).toEqual({ buffer: "dev", done: null });
    expect(applyRenameKey("dev", "\x1b[C")).toEqual({ buffer: "dev", done: null });
  });

  it("type -> backspace -> commit yields the edited name", () => {
    expect(type("", ["w", "x", "\x7f", "i", "n", "\r"])).toEqual({ buffer: "win", done: "commit" });
  });
});
