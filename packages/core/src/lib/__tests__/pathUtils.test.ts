import { describe, it, expect } from "vitest";
import { normalizePath, resolvePath, parentPath, basename } from "../pathUtils";

describe("normalizePath", () => {
  it("returns / for empty or root input", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("")).toBe("/");
  });

  it("collapses . segments", () => {
    expect(normalizePath("/home/./player")).toBe("/home/player");
    expect(normalizePath("/./home/./player/.")).toBe("/home/player");
  });

  it("resolves .. segments", () => {
    expect(normalizePath("/home/player/..")).toBe("/home");
    expect(normalizePath("/home/player/../other")).toBe("/home/other");
    expect(normalizePath("/a/b/c/../../d")).toBe("/a/d");
  });

  it("does not go above root with ..", () => {
    expect(normalizePath("/..")).toBe("/");
    expect(normalizePath("/../..")).toBe("/");
    expect(normalizePath("/../home")).toBe("/home");
  });

  it("collapses multiple slashes", () => {
    expect(normalizePath("//home///player//")).toBe("/home/player");
  });

  it("strips trailing slashes", () => {
    expect(normalizePath("/home/player/")).toBe("/home/player");
  });

  it("ensures result starts with /", () => {
    expect(normalizePath("home/player")).toBe("/home/player");
  });
});

describe("resolvePath", () => {
  const cwd = "/home/player";
  const homeDir = "/home/player";

  it("resolves ~ to homeDir", () => {
    expect(resolvePath("~", cwd, homeDir)).toBe("/home/player");
    expect(resolvePath("~/docs", cwd, homeDir)).toBe("/home/player/docs");
  });

  it("returns absolute paths as-is (normalized)", () => {
    expect(resolvePath("/etc/config", cwd, homeDir)).toBe("/etc/config");
  });

  it("resolves relative paths against cwd", () => {
    expect(resolvePath("docs", cwd, homeDir)).toBe("/home/player/docs");
    expect(resolvePath("../other", cwd, homeDir)).toBe("/home/other");
  });

  it("resolves . to cwd", () => {
    expect(resolvePath(".", cwd, homeDir)).toBe("/home/player");
  });

  it("resolves .. from cwd", () => {
    expect(resolvePath("..", cwd, homeDir)).toBe("/home");
  });
});

describe("parentPath", () => {
  it("returns / for root children", () => {
    expect(parentPath("/home")).toBe("/");
  });

  it("returns parent directory", () => {
    expect(parentPath("/home/player")).toBe("/home");
    expect(parentPath("/home/player/docs")).toBe("/home/player");
  });

  it("returns / for root", () => {
    expect(parentPath("/")).toBe("/");
  });

  it("normalizes before computing parent", () => {
    expect(parentPath("/home/player/")).toBe("/home");
    expect(parentPath("/home//player")).toBe("/home");
  });
});

describe("basename", () => {
  it("returns last path component", () => {
    expect(basename("/home/player")).toBe("player");
    expect(basename("/home/player/notes.txt")).toBe("notes.txt");
  });

  it("returns / for root", () => {
    expect(basename("/")).toBe("/");
  });

  it("handles trailing slashes", () => {
    expect(basename("/home/player/")).toBe("player");
  });

  it("handles double slashes", () => {
    expect(basename("//home//player")).toBe("player");
  });
});
