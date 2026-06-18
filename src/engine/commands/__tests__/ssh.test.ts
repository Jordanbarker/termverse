import { describe, it, expect } from "vitest";
import { execute } from "../registry";
import { CommandContext } from "../types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";
import "../builtins";

function createTestFS(configContent = ""): VirtualFS {
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
          ren: {
            type: "directory",
            name: "ren",
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {
              ".ssh": {
                type: "directory",
                name: ".ssh",
                permissions: "rwx--xr-x",
                hidden: true,
                children: {
                  config: {
                    type: "file",
                    name: "config",
                    content: configContent,
                    permissions: "rw-r--r--",
                    hidden: false,
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/ren", "/home/ren");
}

function createCtx(overrides?: Partial<CommandContext>): CommandContext {
  return {
    fs: createTestFS(),
    cwd: "/home/ren",
    homeDir: "/home/ren",
    username: "ren",
    activeComputer: "home",
    storyFlags: { ssh_unlocked: true },
    ...overrides,
  };
}

describe("ssh command", () => {
  it("returns usage with no args", () => {
    const result = execute("ssh", [], {}, createCtx());
    expect(result.output).toContain("usage");
    expect(result.sshSession).toBeUndefined();
  });

  it("returns DNS error from a computer with no SSH routes", () => {
    // nexacorp has no SSH_ROUTES entry — every target should resolve to
    // "name or service not known" rather than connecting.
    const result = execute("ssh", ["nexacorp"], {}, createCtx({ activeComputer: "nexacorp" }));
    expect(result.output).toContain("Name or service not known");
    expect(result.sshSession).toBeUndefined();
  });

  it("returns DNS error for unknown host", () => {
    const result = execute("ssh", ["ren@badhost.example.com"], {}, createCtx());
    expect(result.output).toContain("Name or service not known");
    expect(result.sshSession).toBeUndefined();
  });

  it("connects with user@host format to valid target", () => {
    const result = execute(
      "ssh",
      ["ren@nexacorp-ws01.nexacorp.internal"],
      {},
      createCtx()
    );
    expect(result.sshSession).toEqual({
      host: "nexacorp-ws01.nexacorp.internal",
      username: "ren",
      targetComputer: "nexacorp",
    });
    expect(result.output).toBe("");
  });

  it("resolves config alias", () => {
    const config = `Host nexacorp
  HostName nexacorp-ws01.nexacorp.internal
  User ren`;
    const fs = createTestFS(config);
    const result = execute("ssh", ["nexacorp"], {}, createCtx({ fs }));
    expect(result.sshSession).toEqual({
      host: "nexacorp-ws01.nexacorp.internal",
      username: "ren",
      targetComputer: "nexacorp",
    });
  });

  it("falls back to route's expected user when alias omits User", () => {
    // Without a User directive, the route's `user` field is used as a default
    // (matching real OpenSSH which falls back to $USER). For the home→nexacorp
    // route the expected user is "ren", so the connection succeeds.
    const config = `Host nexacorp
  HostName nexacorp-ws01.nexacorp.internal`;
    const fs = createTestFS(config);
    const result = execute("ssh", ["nexacorp"], {}, createCtx({ fs }));
    expect(result.sshSession).toEqual({
      host: "nexacorp-ws01.nexacorp.internal",
      username: "ren",
      targetComputer: "nexacorp",
    });
  });

  it("returns DNS error for bare unknown host", () => {
    const result = execute("ssh", ["randomhost"], {}, createCtx());
    expect(result.output).toContain("Name or service not known");
    expect(result.sshSession).toBeUndefined();
  });

  it("rejects wrong user with publickey error", () => {
    const result = execute(
      "ssh",
      ["mallory@nexacorp-ws01.nexacorp.internal"],
      {},
      createCtx()
    );
    expect(result.output).toContain("Permission denied (publickey)");
    expect(result.sshSession).toBeUndefined();
  });
});
