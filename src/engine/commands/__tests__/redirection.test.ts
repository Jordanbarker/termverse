import { describe, it, expect } from "vitest";
import { extractStdoutRedirect } from "../redirection";

describe("extractStdoutRedirect", () => {
  it("returns no redirect when none present", () => {
    const r = extractStdoutRedirect("echo hello");
    expect(r).toEqual({ command: "echo hello", redirectFile: null, redirectAppend: false });
  });

  it("ignores > inside double quotes", () => {
    const r = extractStdoutRedirect('echo "a > b"');
    expect(r.redirectFile).toBeNull();
    expect(r.command).toBe('echo "a > b"');
  });

  it("ignores > inside single quotes", () => {
    const r = extractStdoutRedirect("echo 'a > b'");
    expect(r.redirectFile).toBeNull();
    expect(r.command).toBe("echo 'a > b'");
  });

  it("ignores 2>/dev/null embedded inside quotes", () => {
    const r = extractStdoutRedirect('echo "2>/dev/null"');
    expect(r.redirectFile).toBeNull();
    expect(r.command).toBe('echo "2>/dev/null"');
  });

  it("extracts simple > redirect", () => {
    const r = extractStdoutRedirect("echo a > out");
    expect(r.redirectFile).toBe("out");
    expect(r.redirectAppend).toBe(false);
    expect(r.command).toBe("echo a");
  });

  it("extracts >> append redirect", () => {
    const r = extractStdoutRedirect("echo a >> out");
    expect(r.redirectFile).toBe("out");
    expect(r.redirectAppend).toBe(true);
    expect(r.command).toBe("echo a");
  });

  it("strips 2>/dev/null and finds > redirect", () => {
    const r = extractStdoutRedirect("echo a 2>/dev/null > out");
    expect(r.redirectFile).toBe("out");
    expect(r.command).toBe("echo a");
  });

  it("strips 2>&1 alongside > redirect", () => {
    const r = extractStdoutRedirect("echo a > /dev/null 2>&1");
    expect(r.redirectFile).toBe("/dev/null");
    expect(r.command).toBe("echo a");
  });

  it("handles redirect target with no surrounding spaces", () => {
    const r = extractStdoutRedirect("echo a >out");
    expect(r.redirectFile).toBe("out");
    expect(r.command).toBe("echo a");
  });
});
