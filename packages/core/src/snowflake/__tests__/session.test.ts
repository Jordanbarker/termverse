import { describe, it, expect, vi } from "vitest";
import { SnowSqlSession } from "../session/SnowSqlSession";
import { SnowflakeState } from "../state";
import type { SnowflakeData } from "../state";
import { createTestContext } from "./testHelpers";

// Minimal mock Terminal — the session only needs write()
function mockTerminal() {
  return {
    write: vi.fn(),
  } as unknown as import("@xterm/xterm").Terminal;
}

function createSession() {
  const term = mockTerminal();
  const state = new SnowflakeState({ databases: {} } as unknown as SnowflakeData);
  const session = new SnowSqlSession(term, state, createTestContext(), vi.fn());
  return { session, term };
}

/** Reflection helpers for the session's private line-editing state. */
function getBuffer(session: SnowSqlSession): string {
  return (session as unknown as { inputBuffer: string }).inputBuffer;
}
function getCursor(session: SnowSqlSession): number {
  return (session as unknown as { cursorPos: number }).cursorPos;
}
function setHistory(session: SnowSqlSession, entries: string[]): void {
  (session as unknown as { history: string[] }).history = entries;
}

describe("SnowSqlSession line editing", () => {
  it("inserts printable characters and tracks the cursor", () => {
    const { session } = createSession();
    session.handleInput("select 1");
    expect(getBuffer(session)).toBe("select 1");
    expect(getCursor(session)).toBe(8);
  });

  it("Home/End (CSI H/F) jump to start/end of line", () => {
    const { session } = createSession();
    session.handleInput("select 1");
    session.handleInput("\x1b[H");
    expect(getCursor(session)).toBe(0);
    session.handleInput("\x1b[F");
    expect(getCursor(session)).toBe(8);
  });

  it("Home/End tilde variants (1~/4~) jump to start/end of line", () => {
    const { session } = createSession();
    session.handleInput("select 1");
    session.handleInput("\x1b[1~");
    expect(getCursor(session)).toBe(0);
    session.handleInput("\x1b[4~");
    expect(getCursor(session)).toBe(8);
  });

  it("Ctrl+A/Ctrl+E jump to start/end of line", () => {
    const { session } = createSession();
    session.handleInput("select 1");
    session.handleInput("\x01"); // Ctrl+A
    expect(getCursor(session)).toBe(0);
    session.handleInput("\x05"); // Ctrl+E
    expect(getCursor(session)).toBe(8);
  });

  it("Ctrl+U kills to start of line (readline unix-line-discard)", () => {
    const { session } = createSession();
    session.handleInput("select 1");
    session.handleInput("\x1b[D\x1b[D"); // left x2 → cursor after "select"
    session.handleInput("\x15"); // Ctrl+U
    expect(getBuffer(session)).toBe(" 1");
    expect(getCursor(session)).toBe(0);
  });

  it("Ctrl+K kills to end of line", () => {
    const { session } = createSession();
    session.handleInput("select 1");
    session.handleInput("\x1b[D\x1b[D"); // left x2
    session.handleInput("\x0b"); // Ctrl+K
    expect(getBuffer(session)).toBe("select");
    expect(getCursor(session)).toBe(6);
  });

  it("Ctrl+W and Ctrl+Backspace delete the previous word", () => {
    const { session } = createSession();
    session.handleInput("select one two");
    session.handleInput("\x17"); // Ctrl+W
    expect(getBuffer(session)).toBe("select one ");
    session.handleInput("\x08"); // Ctrl+Backspace (xterm.js sends 0x08)
    expect(getBuffer(session)).toBe("select ");
  });

  it("Up/Down arrows still navigate history", () => {
    const { session } = createSession();
    setHistory(session, ["select 1;", "select 2;"]);
    session.handleInput("\x1b[A"); // up → most recent
    expect(getBuffer(session)).toBe("select 2;");
    session.handleInput("\x1b[A"); // up → older
    expect(getBuffer(session)).toBe("select 1;");
    session.handleInput("\x1b[B"); // down → back to recent
    expect(getBuffer(session)).toBe("select 2;");
    session.handleInput("\x1b[B"); // down → restores empty input
    expect(getBuffer(session)).toBe("");
  });
});
