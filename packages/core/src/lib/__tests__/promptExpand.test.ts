import { describe, it, expect } from "vitest";
import { expandZshPrompt, PromptVars } from "../promptExpand";

const vars: PromptVars = {
  username: "ren",
  hostname: "nexacorp-ws01",
  cwd: "/home/ren/projects",
  homeDir: "/home/ren",
};

describe("expandZshPrompt", () => {
  it("expands %n to username", () => {
    expect(expandZshPrompt("%n", vars)).toBe("ren");
  });

  it("expands %m to short hostname", () => {
    const v = { ...vars, hostname: "nexacorp-ws01.internal.corp" };
    expect(expandZshPrompt("%m", v)).toBe("nexacorp-ws01");
  });

  it("expands %M to full hostname", () => {
    const v = { ...vars, hostname: "nexacorp-ws01.internal.corp" };
    expect(expandZshPrompt("%M", v)).toBe("nexacorp-ws01.internal.corp");
  });

  it("expands %~ with ~ substitution", () => {
    expect(expandZshPrompt("%~", vars)).toBe("~/projects");
  });

  it("expands %~ for home dir exactly", () => {
    const v = { ...vars, cwd: "/home/ren" };
    expect(expandZshPrompt("%~", v)).toBe("~");
  });

  it("expands %~ without substitution when outside home", () => {
    const v = { ...vars, cwd: "/tmp" };
    expect(expandZshPrompt("%~", v)).toBe("/tmp");
  });

  it("expands %d and %/ to full cwd", () => {
    expect(expandZshPrompt("%d", vars)).toBe("/home/ren/projects");
    expect(expandZshPrompt("%/", vars)).toBe("/home/ren/projects");
  });

  it("expands %# to $ for normal user", () => {
    expect(expandZshPrompt("%#", vars)).toBe("$");
  });

  it("expands %% to literal percent", () => {
    expect(expandZshPrompt("%%", vars)).toBe("%");
  });

  it("expands %B/%b to bold on/off", () => {
    const result = expandZshPrompt("%Bhello%b", vars);
    expect(result).toBe("\x1b[1mhello\x1b[22m");
  });

  it("expands %F{color}/%f to color on/off", () => {
    const result = expandZshPrompt("%F{green}hi%f", vars);
    expect(result).toBe("\x1b[32mhi\x1b[39m");
  });

  it("handles unknown color gracefully", () => {
    const result = expandZshPrompt("%F{nope}hi%f", vars);
    expect(result).toBe("\x1b[39mhi\x1b[39m");
  });

  it("handles unclosed %F{ gracefully", () => {
    expect(expandZshPrompt("%F{green", vars)).toBe("%F{green");
  });

  it("expands a full realistic prompt", () => {
    const result = expandZshPrompt("%B%F{green}%n@nexacorp-ws01%f:%F{blue}%~%f%b%# ", vars);
    expect(result).toBe(
      "\x1b[1m\x1b[32mren@nexacorp-ws01\x1b[39m:\x1b[34m~/projects\x1b[39m\x1b[22m$ "
    );
  });

  it("passes through unknown sequences literally", () => {
    expect(expandZshPrompt("%Z", vars)).toBe("%Z");
  });

  it("handles plain text with no sequences", () => {
    expect(expandZshPrompt("hello", vars)).toBe("hello");
  });

  it("handles empty string", () => {
    expect(expandZshPrompt("", vars)).toBe("");
  });
});
