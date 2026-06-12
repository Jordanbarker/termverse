import { describe, it, expect } from "vitest";
import { executeAsync, isAsyncCommand } from "../registry";
import { CommandContext } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { DirectoryNode } from "../../filesystem/types";

// Import builtins to trigger registration
import "../builtins";

function createTestFS(): VirtualFS {
  const root: DirectoryNode = {
    type: "directory",
    name: "/",
    permissions: "rwxr-xr-x",
    hidden: false,
    children: {
      home: {
        type: "directory",
        name: "home",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {
          player: {
            type: "directory",
            name: "player",
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {
              "test.sh": {
                type: "file",
                name: "test.sh",
                content: '#!/bin/bash\necho "hello world"\necho "second line"',
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              "no-exec.sh": {
                type: "file",
                name: "no-exec.sh",
                content: 'echo "no exec"',
                permissions: "rw-r--r--",
                hidden: false,
              },
              "with-comments.sh": {
                type: "file",
                name: "with-comments.sh",
                content: '#!/bin/bash\n# This is a comment\necho "after comment"\n\n# Another comment\necho "done"',
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              "pipe-script.sh": {
                type: "file",
                name: "pipe-script.sh",
                content: 'echo "hello world" | wc -w',
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              "fs-chain.sh": {
                type: "file",
                name: "fs-chain.sh",
                content: 'echo "new content" > /home/player/output.txt\ncat /home/player/output.txt',
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              "bad-cmd.sh": {
                type: "file",
                name: "bad-cmd.sh",
                content: 'echo "before"\nfakecmd --whatever\necho "after"',
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              "subst.sh": {
                type: "file",
                name: "subst.sh",
                content: 'echo "user is $(whoami)"',
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              "nano-script.sh": {
                type: "file",
                name: "nano-script.sh",
                content: 'echo "before"\nnano somefile\necho "after"',
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              "exit-script.sh": {
                type: "file",
                name: "exit-script.sh",
                content: 'echo "before"\nexit\necho "after"',
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              "notes.txt": {
                type: "file",
                name: "notes.txt",
                content: "hello world",
                permissions: "rw-r--r--",
                hidden: false,
              },
            },
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/player", "/home/player");
}

function ctx(fs?: VirtualFS, overrides?: Partial<CommandContext>): CommandContext {
  const f = fs ?? createTestFS();
  return {
    fs: f,
    cwd: f.cwd,
    homeDir: f.homeDir,
    username: "ren",
    activeComputer: "nexacorp",
    storyFlags: {},
    ...overrides,
  };
}

describe("bash command", () => {
  it("executes a basic echo script", async () => {
    const result = await executeAsync("bash", ["test.sh"], {}, ctx());
    expect(result.output).toContain("hello world");
    expect(result.output).toContain("second line");
  });

  it("skips shebangs and comments", async () => {
    const result = await executeAsync("bash", ["with-comments.sh"], {}, ctx());
    expect(result.output).toContain("after comment");
    expect(result.output).toContain("done");
    expect(result.output).not.toContain("#");
    expect(result.output).not.toContain("bin/bash");
  });

  it("handles pipes within script lines", async () => {
    const c = ctx(undefined, {
      storyFlags: { inspection_tools_unlocked: true },
    });
    const result = await executeAsync("bash", ["pipe-script.sh"], {}, c);
    expect(result.output.trim()).toBe("2");
  });

  it("chains FS between lines (write then read)", async () => {
    const result = await executeAsync("bash", ["fs-chain.sh"], {}, ctx());
    expect(result.output).toContain("new content");
    expect(result.newFs).toBeDefined();
  });

  it("continues after command errors", async () => {
    const result = await executeAsync("bash", ["bad-cmd.sh"], {}, ctx());
    expect(result.output).toContain("before");
    expect(result.output).toContain("command not found");
    expect(result.output).toContain("after");
  });

  it("expands command substitutions", async () => {
    const c = ctx(undefined, {
      storyFlags: { basic_tools_unlocked: true },
    });
    const result = await executeAsync("bash", ["subst.sh"], {}, c);
    expect(result.output).toContain("user is");
  });

  it("returns file not found error", async () => {
    const result = await executeAsync("bash", ["nonexistent.sh"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
    expect(result.exitCode).toBe(1);
  });

  it("returns usage error with no args", async () => {
    const result = await executeAsync("bash", [], {}, ctx());
    expect(result.output).toContain("interactive mode not supported");
  });

  it("executes inline command with -c", async () => {
    const result = await executeAsync("bash", ["echo hello"], { c: true }, ctx());
    expect(result.output).toContain("hello");
  });

  it("adds file_read trigger event for the script file", async () => {
    const result = await executeAsync("bash", ["test.sh"], {}, ctx());
    expect(result.triggerEvents).toBeDefined();
    const fileReads = result.triggerEvents!.filter((e) => e.type === "file_read");
    expect(fileReads.some((e) => e.detail === "/home/player/test.sh")).toBe(true);
  });

  it("blocks computer transitions in scripts", async () => {
    const c = ctx(undefined, {
      activeComputer: "devcontainer",
    });
    const result = await executeAsync("bash", ["exit-script.sh"], {}, c);
    expect(result.output).toContain("before");
    expect(result.output).toContain("cannot transition computers");
    expect(result.transitionTo).toBeUndefined();
  });

  it("does not propagate cwd changes from script", async () => {
    const fs = createTestFS();
    const root = fs.root;
    // Add a script that cd's
    const cdScript = {
      type: "file" as const,
      name: "cd-script.sh",
      content: "cd /\npwd",
      permissions: "rwxr-xr-x",
      hidden: false,
    };
    const playerDir = (root.children.home as DirectoryNode).children.player as DirectoryNode;
    const newPlayerDir = { ...playerDir, children: { ...playerDir.children, "cd-script.sh": cdScript } };
    const newHome = { ...(root.children.home as DirectoryNode), children: { ...(root.children.home as DirectoryNode).children, player: newPlayerDir } };
    const newRoot = { ...root, children: { ...root.children, home: newHome } };
    const newFs = new VirtualFS(newRoot, "/home/player", "/home/player");

    const result = await executeAsync("bash", ["cd-script.sh"], {}, ctx(newFs));
    expect(result.output).toContain("/");
    expect(result.newCwd).toBeUndefined();
  });
});

describe("path execution (./script.sh)", () => {
  it("identifies path commands as async", () => {
    expect(isAsyncCommand("./test.sh")).toBe(true);
    expect(isAsyncCommand("/home/player/test.sh")).toBe(true);
  });

  it("executes ./script.sh with execute permission", async () => {
    const result = await executeAsync("./test.sh", [], {}, ctx());
    expect(result.output).toContain("hello world");
    expect(result.output).toContain("second line");
  });

  it("returns permission denied without execute bit", async () => {
    const result = await executeAsync("./no-exec.sh", [], {}, ctx());
    expect(result.output).toBe("zsh: permission denied: ./no-exec.sh");
    expect(result.exitCode).toBe(126);
  });

  it("returns not found for nonexistent path", async () => {
    const result = await executeAsync("./missing.sh", [], {}, ctx());
    expect(result.output).toBe("zsh: no such file or directory: ./missing.sh");
    expect(result.exitCode).toBe(127);
  });

  it("executes absolute path scripts", async () => {
    const result = await executeAsync("/home/player/test.sh", [], {}, ctx());
    expect(result.output).toContain("hello world");
  });
});

describe("sh alias", () => {
  it("works as an alias for bash", async () => {
    const result = await executeAsync("sh", ["test.sh"], {}, ctx());
    expect(result.output).toContain("hello world");
  });
});

describe("shell features", () => {
  function scriptCtx(content: string, overrides?: Partial<CommandContext>): CommandContext {
    const base = createTestFS();
    const root = base.root;
    const playerDir = (root.children.home as DirectoryNode).children.player as DirectoryNode;
    const newPlayerDir = {
      ...playerDir,
      children: {
        ...playerDir.children,
        "shell.sh": {
          type: "file" as const,
          name: "shell.sh",
          content,
          permissions: "rwxr-xr-x",
          hidden: false,
        },
      },
    };
    const newHome = {
      ...(root.children.home as DirectoryNode),
      children: { ...(root.children.home as DirectoryNode).children, player: newPlayerDir },
    };
    const newRoot = { ...root, children: { ...root.children, home: newHome } };
    const fs = new VirtualFS(newRoot, "/home/player", "/home/player");
    return ctx(fs, overrides);
  }

  it("assigns and expands variables", async () => {
    const c = scriptCtx('VAR="hello"\necho $VAR');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("hello");
  });

  it("expands ${VAR:-default} when unset", async () => {
    const c = scriptCtx('echo ${MISSING:-fallback}');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("fallback");
  });

  it("expands ${VAR:-default} when set", async () => {
    const c = scriptCtx('MYVAR="actual"\necho ${MYVAR:-fallback}');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("actual");
  });

  it("handles line continuation with backslash", async () => {
    const c = scriptCtx('echo hello \\\nworld');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("hello world");
  });

  it("defines and calls functions", async () => {
    const c = scriptCtx('greet() {\necho "hi"\n}\ngreet');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("hi");
  });

  it("passes positional args to functions", async () => {
    const c = scriptCtx('say() {\necho $1\n}\nsay hello');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("hello");
  });

  it("executes if/then/else with true condition", async () => {
    const c = scriptCtx('if echo test > /dev/null; then\necho "yes"\nelse\necho "no"\nfi');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("yes");
  });

  it("executes if/then/else with false condition", async () => {
    const c = scriptCtx('if fakecmd; then\necho "yes"\nelse\necho "no"\nfi');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("no");
  });

  it("handles command -v for existing command", async () => {
    const c = scriptCtx('command -v echo > /dev/null 2>&1');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    // Should produce no output (redirected to /dev/null) and no error
    expect(result.output.trim()).toBe("");
  });

  it("handles command -v for missing command", async () => {
    const c = scriptCtx('if command -v nonexistent_cmd > /dev/null 2>&1; then\necho "found"\nelse\necho "missing"\nfi');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("missing");
  });

  it("redirects to /dev/null suppressing output", async () => {
    const c = scriptCtx('echo "hidden" > /dev/null\necho "visible"');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output).not.toContain("hidden");
    expect(result.output).toContain("visible");
  });

  it("handles function containing if/then/else (check_env pattern)", async () => {
    const c = scriptCtx(
      'check() {\nif command -v $1 > /dev/null 2>&1; then\necho "[OK]  $1"\nelse\necho "[!!]  $1 not found"\nfi\n}\ncheck echo\ncheck nonexistent_cmd',
    );
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output).toContain("[OK]  echo");
    expect(result.output).toContain("[!!]  nonexistent_cmd not found");
  });

  it("expands variables with command substitution in assignment", async () => {
    const c = scriptCtx('DIR="backup-$(date +%Y-%m-%d)"\necho $DIR');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("backup-2026-02-23");
  });

  it("strips 2>&1 from commands", async () => {
    const c = scriptCtx('echo "test" 2>&1');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("test");
  });

  it("inline assignment then expansion (X=hi; echo $X)", async () => {
    const result = await executeAsync(
      "bash",
      ["X=hi; echo $X"],
      { c: true },
      ctx(),
    );
    expect(result.output.trim()).toBe("hi");
  });

  it("if true; then ... fi runs the then branch", async () => {
    const result = await executeAsync(
      "bash",
      ["if true; then echo yes; fi"],
      { c: true },
      ctx(),
    );
    expect(result.output.trim()).toBe("yes");
  });

  it("if false; then ... else ... fi runs the else branch", async () => {
    const result = await executeAsync(
      "bash",
      ["if false; then echo yes; else echo no; fi"],
      { c: true },
      ctx(),
    );
    expect(result.output.trim()).toBe("no");
  });

  it("propagates script exit code so `false || cmd` recovers", async () => {
    const result = await executeAsync(
      "bash",
      ["false || echo recovered"],
      { c: true },
      ctx(),
    );
    expect(result.output.trim()).toBe("recovered");
  });
});

describe("bash -c quote-aware redirection", () => {
  it("preserves > inside double-quoted bash -c argument", async () => {
    const result = await executeAsync(
      "bash",
      ['echo hi > /home/player/x.txt'],
      { c: true },
      ctx(),
    );
    expect(result.output).toBe("");
    expect(result.newFs).toBeDefined();
    const read = result.newFs!.readFile("/home/player/x.txt");
    expect(read.content?.trim()).toBe("hi");
  });

  it("recognises 2>/dev/null inside bash -c", async () => {
    const result = await executeAsync(
      "bash",
      ['command -v echo > /dev/null 2>&1 && echo found'],
      { c: true },
      ctx(),
    );
    expect(result.output.trim()).toBe("found");
  });

  it("multios: writes output to every redirect target", async () => {
    const result = await executeAsync(
      "bash",
      ['echo hi > /home/player/a.txt > /home/player/b.txt'],
      { c: true },
      ctx(),
    );
    expect(result.newFs!.readFile("/home/player/a.txt").content?.trim()).toBe("hi");
    expect(result.newFs!.readFile("/home/player/b.txt").content?.trim()).toBe("hi");
  });

  it("failed redirect target: command does not run, exit 1", async () => {
    const result = await executeAsync(
      "bash",
      ['echo hi > /no/such/dir/f.txt && echo ran'],
      { c: true },
      ctx(),
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("no such file or directory");
    expect(result.output).not.toContain("ran");
  });

  it("|| runs after a failed redirect", async () => {
    const result = await executeAsync(
      "bash",
      ['echo hi > /no/such/dir/f.txt || echo fallback'],
      { c: true },
      ctx(),
    );
    expect(result.output).toContain("fallback");
  });

  it("redirect onto a directory refuses and leaves the directory intact", async () => {
    const result = await executeAsync(
      "bash",
      ['echo hi > /home/player'],
      { c: true },
      ctx(),
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("is a directory");
    expect(result.newFs ?? undefined).toBeUndefined();
  });
});

describe("bash positional args", () => {
  function withScript(content: string): VirtualFS {
    const base = createTestFS();
    const root = base.root;
    const playerDir = (root.children.home as DirectoryNode).children.player as DirectoryNode;
    const newPlayerDir = {
      ...playerDir,
      children: {
        ...playerDir.children,
        "args.sh": {
          type: "file" as const,
          name: "args.sh",
          content,
          permissions: "rwxr-xr-x",
          hidden: false,
        },
      },
    };
    const newHome = {
      ...(root.children.home as DirectoryNode),
      children: { ...(root.children.home as DirectoryNode).children, player: newPlayerDir },
    };
    const newRoot = { ...root, children: { ...root.children, home: newHome } };
    return new VirtualFS(newRoot, "/home/player", "/home/player");
  }

  it("forwards positional args via `bash script.sh a b`", async () => {
    const fs = withScript("echo $1-$2");
    const result = await executeAsync("bash", ["args.sh", "one", "two"], {}, ctx(fs));
    expect(result.output.trim()).toBe("one-two");
  });

  it("forwards positional args via `./script.sh a b`", async () => {
    const fs = withScript("echo $1");
    // For path commands, executePathCommand reads positional args from
    // ctx.rawArgs (parseInput strips the command token in the real entry
    // path); manually mirror that here.
    const result = await executeAsync(
      "/home/player/args.sh",
      ["foo"],
      {},
      ctx(fs, { rawArgs: ["foo"] }),
    );
    expect(result.output.trim()).toBe("foo");
  });
});

describe("true / false builtins", () => {
  it("true returns exit code 0", async () => {
    const result = await executeAsync("bash", ["true"], { c: true }, ctx());
    // executeScript now propagates exit code
    expect(result.exitCode).toBe(0);
  });

  it("false returns exit code 1", async () => {
    const result = await executeAsync("bash", ["false"], { c: true }, ctx());
    expect(result.exitCode).toBe(1);
  });
});

describe("command chaining in scripts", () => {
  function scriptCtx(content: string, overrides?: Partial<CommandContext>): CommandContext {
    const base = createTestFS();
    const root = base.root;
    const playerDir = (root.children.home as DirectoryNode).children.player as DirectoryNode;
    const newPlayerDir = {
      ...playerDir,
      children: {
        ...playerDir.children,
        "chain.sh": {
          type: "file" as const,
          name: "chain.sh",
          content,
          permissions: "rwxr-xr-x",
          hidden: false,
        },
      },
    };
    const newHome = {
      ...(root.children.home as DirectoryNode),
      children: { ...(root.children.home as DirectoryNode).children, player: newPlayerDir },
    };
    const newRoot = { ...root, children: { ...root.children, home: newHome } };
    const fs = new VirtualFS(newRoot, "/home/player", "/home/player");
    return ctx(fs, overrides);
  }

  it("executes both commands with &&", async () => {
    const c = scriptCtx('echo hello && echo world');
    const result = await executeAsync("bash", ["chain.sh"], {}, c);
    expect(result.output).toContain("hello");
    expect(result.output).toContain("world");
  });

  it("skips second command when first fails with &&", async () => {
    const c = scriptCtx('fakecmd && echo skipped');
    const result = await executeAsync("bash", ["chain.sh"], {}, c);
    expect(result.output).not.toContain("skipped");
  });

  it("runs fallback with || when first fails", async () => {
    const c = scriptCtx('fakecmd || echo fallback');
    const result = await executeAsync("bash", ["chain.sh"], {}, c);
    expect(result.output).toContain("fallback");
  });

  it("skips || branch when first succeeds", async () => {
    const c = scriptCtx('echo ok || echo skipped');
    const result = await executeAsync("bash", ["chain.sh"], {}, c);
    expect(result.output).toContain("ok");
    expect(result.output).not.toContain("skipped");
  });

  it("always runs both with ;", async () => {
    const c = scriptCtx('echo a; echo b');
    const result = await executeAsync("bash", ["chain.sh"], {}, c);
    expect(result.output).toContain("a");
    expect(result.output).toContain("b");
  });

  it("runs after ; even when first fails", async () => {
    const c = scriptCtx('fakecmd; echo still');
    const result = await executeAsync("bash", ["chain.sh"], {}, c);
    expect(result.output).toContain("still");
  });

  it("handles mixed && and ||", async () => {
    const c = scriptCtx('fakecmd && echo nope || echo yes');
    const result = await executeAsync("bash", ["chain.sh"], {}, c);
    expect(result.output).not.toContain("nope");
    expect(result.output).toContain("yes");
  });

  it("handles pipes within chains", async () => {
    const c = scriptCtx('echo "hello world" | wc -w && echo done', {
      storyFlags: { inspection_tools_unlocked: true },
    });
    const result = await executeAsync("bash", ["chain.sh"], {}, c);
    expect(result.output).toContain("2");
    expect(result.output).toContain("done");
  });

  it("does not pass stdin between chain segments", async () => {
    // "echo hello && cat" — cat with no stdin should produce nothing (or error)
    const c = scriptCtx('echo hello && cat');
    const result = await executeAsync("bash", ["chain.sh"], {}, c);
    expect(result.output).toContain("hello");
    // cat with no file/stdin should not echo "hello" again
    const lines = result.output.split("\n").filter((l: string) => l.trim() === "hello");
    expect(lines).toHaveLength(1);
  });
});

describe("date format strings", () => {
  it("formats +%Y-%m-%d", async () => {
    const result = await executeAsync("date", ["+%Y-%m-%d"], {}, ctx());
    expect(result.output).toBe("2026-02-23");
  });

  it("formats +%H:%M:%S (base time with no deliveries)", async () => {
    const result = await executeAsync("date", ["+%H:%M:%S"], {}, ctx());
    expect(result.output).toBe("08:30:00");
  });

  it("returns default output without format", async () => {
    const result = await executeAsync("date", [], {}, ctx());
    expect(result.output).toBe("Mon Feb 23 08:30:00 UTC 2026");
  });

  it("shows home computer base time", async () => {
    const result = await executeAsync("date", [], {}, ctx(undefined, {
      activeComputer: "home",
      storyFlags: { basic_tools_unlocked: true },
    }));
    expect(result.output).toBe("Sat Feb 21 14:00:00 UTC 2026");
  });
});
