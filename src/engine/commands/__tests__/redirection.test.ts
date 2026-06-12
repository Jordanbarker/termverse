import { describe, it, expect } from "vitest";
import { extractStdoutRedirect, precheckRedirects, applyRedirection } from "../redirection";
import { CommandResult } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { DirectoryNode, isDirectory, isFile } from "../../filesystem/types";

function file(name: string, content = "x", permissions = "rw-r--r--") {
  return { type: "file" as const, name, content, permissions, hidden: false };
}

function dir(name: string, children: Record<string, DirectoryNode | ReturnType<typeof file>>): DirectoryNode {
  return { type: "directory", name, children, permissions: "rwxr-xr-x", hidden: false };
}

function makeFs(): VirtualFS {
  const root: DirectoryNode = dir("/", {
    home: dir("home", {
      ren: dir("ren", {
        Documents: dir("Documents", {
          "report.txt": file("report.txt", "quarterly\n"),
        }),
        "notes.txt": file("notes.txt", "line one\n"),
        "no-newline.txt": file("no-newline.txt", "line one"),
      }),
    }),
    tmp: dir("tmp", {}),
  });
  return new VirtualFS(root, "/home/ren", "/home/ren");
}

describe("extractStdoutRedirect", () => {
  it("returns no redirect when none present", () => {
    const r = extractStdoutRedirect("echo hello");
    expect(r).toEqual({ command: "echo hello", redirects: [] });
  });

  it("ignores > inside double quotes", () => {
    const r = extractStdoutRedirect('echo "a > b"');
    expect(r.redirects).toEqual([]);
    expect(r.command).toBe('echo "a > b"');
  });

  it("ignores > inside single quotes", () => {
    const r = extractStdoutRedirect("echo 'a > b'");
    expect(r.redirects).toEqual([]);
    expect(r.command).toBe("echo 'a > b'");
  });

  it("ignores 2>/dev/null embedded inside quotes", () => {
    const r = extractStdoutRedirect('echo "2>/dev/null"');
    expect(r.redirects).toEqual([]);
    expect(r.command).toBe('echo "2>/dev/null"');
  });

  it("extracts simple > redirect", () => {
    const r = extractStdoutRedirect("echo a > out");
    expect(r.redirects).toEqual([{ file: "out", append: false }]);
    expect(r.command).toBe("echo a");
  });

  it("extracts >> append redirect", () => {
    const r = extractStdoutRedirect("echo a >> out");
    expect(r.redirects).toEqual([{ file: "out", append: true }]);
    expect(r.command).toBe("echo a");
  });

  it("strips 2>/dev/null and finds > redirect", () => {
    const r = extractStdoutRedirect("echo a 2>/dev/null > out");
    expect(r.redirects).toEqual([{ file: "out", append: false }]);
    expect(r.command).toBe("echo a");
  });

  it("strips 2>&1 alongside > redirect", () => {
    const r = extractStdoutRedirect("echo a > /dev/null 2>&1");
    expect(r.redirects).toEqual([{ file: "/dev/null", append: false }]);
    expect(r.command).toBe("echo a");
  });

  it("handles redirect target with no surrounding spaces", () => {
    const r = extractStdoutRedirect("echo a >out");
    expect(r.redirects).toEqual([{ file: "out", append: false }]);
    expect(r.command).toBe("echo a");
  });

  it("collects multiple redirects (multios) without leaking into the command", () => {
    const r = extractStdoutRedirect("echo a > f1 > f2");
    expect(r.redirects).toEqual([
      { file: "f1", append: false },
      { file: "f2", append: false },
    ]);
    expect(r.command).toBe("echo a");
    expect(r.parseError).toBeUndefined();
  });

  it("reports a parse error for a trailing > with no target", () => {
    const r = extractStdoutRedirect("echo hi >");
    expect(r.parseError).toBe("zsh: parse error near `\\n'");
    expect(r.redirects).toEqual([]);
  });

  it("reports a parse error for >> with no target", () => {
    const r = extractStdoutRedirect("echo hi >>");
    expect(r.parseError).toBe("zsh: parse error near `\\n'");
  });
});

describe("precheckRedirects", () => {
  it("passes for a new file in an existing directory", () => {
    const fs = makeFs();
    expect(precheckRedirects([{ file: "new.txt", append: false }], "/home/ren", "/home/ren", fs)).toBeNull();
  });

  it("passes for /dev/null", () => {
    const fs = makeFs();
    expect(precheckRedirects([{ file: "/dev/null", append: false }], "/home/ren", "/home/ren", fs)).toBeNull();
  });

  it("rejects a directory target with the file as typed", () => {
    const fs = makeFs();
    expect(precheckRedirects([{ file: "Documents", append: false }], "/home/ren", "/home/ren", fs))
      .toBe("zsh: is a directory: Documents");
  });

  it("rejects a missing parent directory", () => {
    const fs = makeFs();
    expect(precheckRedirects([{ file: "/no/such/dir/f.txt", append: false }], "/home/ren", "/home/ren", fs))
      .toBe("zsh: no such file or directory: /no/such/dir/f.txt");
  });

  it("first failing target wins", () => {
    const fs = makeFs();
    const err = precheckRedirects(
      [
        { file: "ok.txt", append: false },
        { file: "Documents", append: false },
        { file: "/no/such/f", append: false },
      ],
      "/home/ren",
      "/home/ren",
      fs,
    );
    expect(err).toBe("zsh: is a directory: Documents");
  });
});

describe("applyRedirection", () => {
  const base: CommandResult = { output: "hello" };

  it("writes output to a new file and emits file_created", () => {
    const fs = makeFs();
    const { result, fs: newFs } = applyRedirection(
      [{ file: "out.txt", append: false }], base, "/home/ren", "/home/ren", fs, "home",
    );
    expect(result.output).toBe("");
    expect(newFs.readFile("/home/ren/out.txt").content).toBe("hello");
    expect(result.triggerEvents).toEqual([{ type: "file_created", detail: "/home/ren/out.txt" }]);
  });

  it("emits file_modified when overwriting", () => {
    const fs = makeFs();
    const { result } = applyRedirection(
      [{ file: "notes.txt", append: false }], base, "/home/ren", "/home/ren", fs, "home",
    );
    expect(result.triggerEvents).toEqual([{ type: "file_modified", detail: "/home/ren/notes.txt" }]);
  });

  it("multios: writes every target and emits one event per target", () => {
    const fs = makeFs();
    const { result, fs: newFs } = applyRedirection(
      [
        { file: "f1.txt", append: false },
        { file: "f2.txt", append: false },
      ],
      base, "/home/ren", "/home/ren", fs, "home",
    );
    expect(newFs.readFile("/home/ren/f1.txt").content).toBe("hello");
    expect(newFs.readFile("/home/ren/f2.txt").content).toBe("hello");
    expect(result.triggerEvents).toHaveLength(2);
  });

  it("append to a file ending in newline does not insert a blank line", () => {
    const fs = makeFs();
    const { fs: newFs } = applyRedirection(
      [{ file: "notes.txt", append: true }], base, "/home/ren", "/home/ren", fs, "home",
    );
    expect(newFs.readFile("/home/ren/notes.txt").content).toBe("line one\nhello");
  });

  it("append to a file without trailing newline inserts a separator", () => {
    const fs = makeFs();
    const { fs: newFs } = applyRedirection(
      [{ file: "no-newline.txt", append: true }], base, "/home/ren", "/home/ren", fs, "home",
    );
    expect(newFs.readFile("/home/ren/no-newline.txt").content).toBe("line one\nhello");
  });

  it("refuses to overwrite a directory: exit 1, fs unchanged, no events", () => {
    const fs = makeFs();
    const { result, fs: newFs } = applyRedirection(
      [{ file: "Documents", append: false }], base, "/home/ren", "/home/ren", fs, "home",
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toBe("zsh: is a directory: Documents");
    expect(result.triggerEvents).toEqual([]);
    expect(result.securityViolation).toBeUndefined();
    const node = newFs.getNode("/home/ren/Documents");
    expect(node && isDirectory(node)).toBe(true);
    const child = newFs.getNode("/home/ren/Documents/report.txt");
    expect(child && isFile(child)).toBe(true);
  });

  it("failed write into a missing directory: exit 1, no file_created event", () => {
    const fs = makeFs();
    const { result, fs: newFs } = applyRedirection(
      [{ file: "/no/such/dir/f.txt", append: false }], base, "/home/ren", "/home/ren", fs, "home",
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toBe("zsh: no such file or directory: /no/such/dir/f.txt");
    expect(result.triggerEvents).toEqual([]);
    expect(newFs.getNode("/no/such/dir/f.txt")).toBeNull();
  });

  it("/dev/null suppresses output without writing", () => {
    const fs = makeFs();
    const { result, fs: newFs } = applyRedirection(
      [{ file: "/dev/null", append: false }], base, "/home/ren", "/home/ren", fs, "home",
    );
    expect(result.output).toBe("");
    expect(result.triggerEvents).toEqual([]);
    expect(newFs).toBe(fs);
  });
});
