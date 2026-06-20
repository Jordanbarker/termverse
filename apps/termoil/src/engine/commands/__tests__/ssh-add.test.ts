import { describe, it, expect } from "vitest";
import { execute } from "@tt/core/commands/registry";
import { parseInput } from "@tt/core/commands/parser";
import { CommandContext } from "@tt/core/commands/types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";
import { dir, file } from "@tt/core/filesystem/builders";
import "../builtins";

function createTestFS(opts: { socketDir?: string; markerOwner?: string } = {}): VirtualFS {
  const sockDirChildren: Record<string, ReturnType<typeof file>> = {
    "agent.18472": file("agent.18472", ""),
  };
  if (opts.markerOwner) {
    sockDirChildren[`.user-${opts.markerOwner}`] = file(
      `.user-${opts.markerOwner}`,
      `${opts.markerOwner}\nsession: 2026-05-08T22:14:18Z\nforwarded: yes\n`
    );
  }

  const root: DirectoryNode = dir("/", {
    home: dir("home", { ren: dir("ren", {}) }),
    tmp: dir("tmp", opts.socketDir ? { [opts.socketDir]: dir(opts.socketDir, sockDirChildren) } : {}),
  });
  return new VirtualFS(root, "/home/ren", "/home/ren");
}

function createCtx(overrides?: Partial<CommandContext>): CommandContext {
  return {
    fs: createTestFS(),
    cwd: "/home/ren",
    homeDir: "/home/ren",
    username: "ren",
    activeComputer: "chipinfra",
    storyFlags: {},
    envVars: {},
    ...overrides,
  };
}

describe("ssh-add command", () => {
  it("errors when SSH_AUTH_SOCK is unset", () => {
    const result = execute("ssh-add", [], { l: true }, createCtx());
    expect(result.output).toContain("Could not open a connection to your authentication agent");
    expect(result.exitCode).toBe(2);
  });

  it("errors when SSH_AUTH_SOCK points to a non-existent path", () => {
    const result = execute(
      "ssh-add",
      [],
      { l: true },
      createCtx({ envVars: { SSH_AUTH_SOCK: "/tmp/no-such-dir/agent.0" } })
    );
    expect(result.output).toContain("No such file or directory");
    expect(result.exitCode).toBe(2);
  });

  it("lists Erik's keys when the marker says erik", () => {
    const fs = createTestFS({ socketDir: "ssh-mZ4xPq", markerOwner: "erik" });
    const result = execute(
      "ssh-add",
      [],
      { l: true },
      createCtx({ fs, envVars: { SSH_AUTH_SOCK: "/tmp/ssh-mZ4xPq/agent.18472" } })
    );
    expect(result.output).toContain("erik@nexacorp-lt05");
    expect(result.output).toContain("ED25519");
    expect(result.output).toContain("RSA");
    expect(result.triggerEvents).toContainEqual({
      type: "command_executed",
      detail: "ran_ssh_add_erik",
    });
  });

  it("prints full pubkeys with -L", () => {
    const fs = createTestFS({ socketDir: "ssh-mZ4xPq", markerOwner: "erik" });
    const result = execute(
      "ssh-add",
      [],
      { L: true },
      createCtx({ fs, envVars: { SSH_AUTH_SOCK: "/tmp/ssh-mZ4xPq/agent.18472" } })
    );
    expect(result.output).toContain("ssh-ed25519 ");
    expect(result.output).toContain("ssh-rsa ");
    expect(result.output).toContain("erik@nexacorp-lt05");
  });

  it("does not list keys for non-erik markers", () => {
    const fs = createTestFS({ socketDir: "ssh-Yt9pLz", markerOwner: "oscar" });
    const result = execute(
      "ssh-add",
      [],
      { l: true },
      createCtx({ fs, envVars: { SSH_AUTH_SOCK: "/tmp/ssh-Yt9pLz/agent.18472" } })
    );
    expect(result.output).toContain("no identities");
  });

  it("accepts -l after going through the parser (regression: registry was rejecting it)", () => {
    const fs = createTestFS({ socketDir: "ssh-mZ4xPq", markerOwner: "erik" });
    const parsed = parseInput("ssh-add -l");
    const result = execute(
      parsed.command,
      parsed.args,
      parsed.flags,
      createCtx({ fs, envVars: { SSH_AUTH_SOCK: "/tmp/ssh-mZ4xPq/agent.18472" } })
    );
    expect(result.output).toContain("erik@nexacorp-lt05");
    expect(result.output).not.toContain("invalid option");
  });

  it("treats no-args as -l", () => {
    const fs = createTestFS({ socketDir: "ssh-mZ4xPq", markerOwner: "erik" });
    const result = execute(
      "ssh-add",
      [],
      {},
      createCtx({ fs, envVars: { SSH_AUTH_SOCK: "/tmp/ssh-mZ4xPq/agent.18472" } })
    );
    expect(result.output).toContain("SHA256:");
    expect(result.output).toContain("erik@nexacorp-lt05");
  });

  it("resolves a bare relative SSH_AUTH_SOCK against cwd", () => {
    const fs = createTestFS({ socketDir: "ssh-mZ4xPq", markerOwner: "erik" });
    const result = execute(
      "ssh-add",
      [],
      { l: true },
      createCtx({
        fs,
        cwd: "/tmp/ssh-mZ4xPq",
        envVars: { SSH_AUTH_SOCK: "agent.18472" },
      })
    );
    expect(result.output).toContain("erik@nexacorp-lt05");
    expect(result.exitCode).toBeUndefined();
  });

  it("resolves ./agent.18472 against cwd", () => {
    const fs = createTestFS({ socketDir: "ssh-mZ4xPq", markerOwner: "erik" });
    const result = execute(
      "ssh-add",
      [],
      { l: true },
      createCtx({
        fs,
        cwd: "/tmp/ssh-mZ4xPq",
        envVars: { SSH_AUTH_SOCK: "./agent.18472" },
      })
    );
    expect(result.output).toContain("erik@nexacorp-lt05");
  });

  it("a relative SSH_AUTH_SOCK that looks like an absolute path no longer accidentally resolves", () => {
    // Before the fix, `tmp/ssh-mZ4xPq/agent.18472` from any cwd would hit
    // `/tmp/ssh-mZ4xPq/agent.18472` because normalizePath just prepended `/`.
    // Now it resolves against cwd, so from `/tmp/ssh-mZ4xPq` it expands to
    // `/tmp/ssh-mZ4xPq/tmp/ssh-mZ4xPq/agent.18472` — which doesn't exist.
    const fs = createTestFS({ socketDir: "ssh-mZ4xPq", markerOwner: "erik" });
    const result = execute(
      "ssh-add",
      [],
      { l: true },
      createCtx({
        fs,
        cwd: "/tmp/ssh-mZ4xPq",
        envVars: { SSH_AUTH_SOCK: "tmp/ssh-mZ4xPq/agent.18472" },
      })
    );
    expect(result.output).toContain("No such file or directory");
    expect(result.exitCode).toBe(2);
  });
});

describe("ssh chipinfra → erik-pc pivot", () => {
  function chipinfraFs(): VirtualFS {
    const root: DirectoryNode = dir("/", {
      home: dir("home", {
        ren: dir("ren", {
          ".ssh": dir(".ssh", {
            config: file("config", ""),
          }),
        }),
      }),
      tmp: dir("tmp", {
        "ssh-mZ4xPq": dir("ssh-mZ4xPq", {
          "agent.18472": file("agent.18472", ""),
          ".user-erik": file(".user-erik", "erik\nsession: ...\nforwarded: yes\n"),
        }),
      }),
    });
    return new VirtualFS(root, "/home/ren", "/home/ren");
  }

  function chipinfraCtx(envVars: Record<string, string> = {}): CommandContext {
    return {
      fs: chipinfraFs(),
      cwd: "/home/ren",
      homeDir: "/home/ren",
      username: "ren",
      activeComputer: "chipinfra",
      storyFlags: {},
      envVars,
    };
  }

  it("rejects with publickey error when SSH_AUTH_SOCK is unset", () => {
    const result = execute("ssh", ["erik@nexacorp-lt05"], {}, chipinfraCtx());
    expect(result.output).toContain("Permission denied (publickey)");
    expect(result.sshSession).toBeUndefined();
  });

  it("rejects wrong user even with valid agent", () => {
    const result = execute(
      "ssh",
      ["mallory@nexacorp-lt05"],
      {},
      chipinfraCtx({ SSH_AUTH_SOCK: "/tmp/ssh-mZ4xPq/agent.18472" })
    );
    expect(result.output).toContain("Permission denied (publickey)");
    expect(result.sshSession).toBeUndefined();
  });

  it("connects to erik-pc with valid agent + correct user", () => {
    const result = execute(
      "ssh",
      ["erik@nexacorp-lt05"],
      {},
      chipinfraCtx({ SSH_AUTH_SOCK: "/tmp/ssh-mZ4xPq/agent.18472" })
    );
    expect(result.sshSession).toEqual({
      host: "nexacorp-lt05",
      username: "erik",
      targetComputer: "erik-pc",
    });
  });

  it("accepts FQDN form too", () => {
    const result = execute(
      "ssh",
      ["erik@nexacorp-lt05.nexa.internal"],
      {},
      chipinfraCtx({ SSH_AUTH_SOCK: "/tmp/ssh-mZ4xPq/agent.18472" })
    );
    expect(result.sshSession?.targetComputer).toBe("erik-pc");
  });

  it("accepts a relative SSH_AUTH_SOCK resolved against cwd", () => {
    const result = execute(
      "ssh",
      ["erik@nexacorp-lt05"],
      {},
      {
        fs: chipinfraFs(),
        cwd: "/tmp/ssh-mZ4xPq",
        homeDir: "/home/ren",
        username: "ren",
        activeComputer: "chipinfra",
        storyFlags: {},
        envVars: { SSH_AUTH_SOCK: "agent.18472" },
      }
    );
    expect(result.sshSession?.targetComputer).toBe("erik-pc");
  });

  it("rejects from home (route only valid from chipinfra)", () => {
    const result = execute(
      "ssh",
      ["erik@nexacorp-lt05"],
      {},
      {
        fs: chipinfraFs(),
        cwd: "/home/ren",
        homeDir: "/home/ren",
        username: "ren",
        activeComputer: "home",
        storyFlags: { ssh_unlocked: true },
        envVars: { SSH_AUTH_SOCK: "/tmp/ssh-mZ4xPq/agent.18472" },
      }
    );
    expect(result.output).toContain("Name or service not known");
    expect(result.sshSession).toBeUndefined();
  });
});
