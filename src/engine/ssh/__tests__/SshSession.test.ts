import { describe, it, expect, vi, beforeEach } from "vitest";
import { SshSession } from "../SshSession";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { DirectoryNode } from "../../filesystem/types";

function createTestFS(knownHostsContent = ""): VirtualFS {
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
                  known_hosts: {
                    type: "file",
                    name: "known_hosts",
                    content: knownHostsContent,
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

function createMockTerminal() {
  return {
    write: vi.fn(),
    writeln: vi.fn(),
  } as unknown as import("@xterm/xterm").Terminal;
}

describe("SshSession", () => {
  let term: ReturnType<typeof createMockTerminal>;

  beforeEach(() => {
    term = createMockTerminal();
  });

  describe("host key verification", () => {
    it("shows fingerprint prompt on enter when host not in known_hosts", () => {
      const fs = createTestFS();
      const session = new SshSession(term, fs, "nexacorp-ws01.nexacorp.internal", "ren", "/home/ren", "nexacorp");
      session.enter();

      expect(term.write).toHaveBeenCalledWith(
        expect.stringContaining("authenticity of host")
      );
      expect(term.write).toHaveBeenCalledWith(
        expect.stringContaining("yes/no")
      );
    });

    it("typing 'yes' adds host to known_hosts and triggers ssh_connect", () => {
      const fs = createTestFS();
      const session = new SshSession(term, fs, "nexacorp-ws01.nexacorp.internal", "ren", "/home/ren", "nexacorp");
      session.enter();

      const result = session.handleInput("yes\r");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("exit");
      expect(result!.newFs).toBeDefined();
      expect(result!.triggerEvents).toContainEqual({
        type: "objective_completed",
        detail: "ssh_connect",
      });

      // Verify known_hosts was updated
      const knownHosts = result!.newFs!.readFile("/home/ren/.ssh/known_hosts");
      expect(knownHosts.content).toContain("nexacorp-ws01.nexacorp.internal");
    });

    it("typing 'no' exits with error message", () => {
      const fs = createTestFS();
      const session = new SshSession(term, fs, "nexacorp-ws01.nexacorp.internal", "ren", "/home/ren", "nexacorp");
      session.enter();

      const result = session.handleInput("no\r");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("exit");
      expect(result!.newFs).toBeUndefined();
      expect(result!.triggerEvents).toBeUndefined();
      expect(term.write).toHaveBeenCalledWith(
        expect.stringContaining("verification failed")
      );
    });

    it("typing invalid input re-prompts", () => {
      const fs = createTestFS();
      const session = new SshSession(term, fs, "nexacorp-ws01.nexacorp.internal", "ren", "/home/ren", "nexacorp");
      session.enter();

      const result = session.handleInput("maybe\r");
      expect(result).toBeNull();
      expect(term.write).toHaveBeenCalledWith(
        expect.stringContaining("'yes' or 'no'")
      );
    });

    it("Ctrl+C cancels the session", () => {
      const fs = createTestFS();
      const session = new SshSession(term, fs, "nexacorp-ws01.nexacorp.internal", "ren", "/home/ren", "nexacorp");
      session.enter();

      const result = session.handleInput("\x03");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("exit");
      expect(result!.triggerEvents).toBeUndefined();
    });
  });

  describe("known host skipping", () => {
    it("skips verification when host is already in known_hosts", () => {
      const fs = createTestFS("nexacorp-ws01.nexacorp.internal ssh-ed25519 AAAAC3");
      const session = new SshSession(term, fs, "nexacorp-ws01.nexacorp.internal", "ren", "/home/ren", "nexacorp");
      const result = session.enter();

      // enter() should not write the fingerprint prompt
      expect(term.write).not.toHaveBeenCalledWith(
        expect.stringContaining("authenticity")
      );

      // enter() should return the exit result directly for known hosts
      expect(result).toBeDefined();
      expect(result!.type).toBe("exit");
      expect(result!.triggerEvents).toContainEqual({
        type: "objective_completed",
        detail: "ssh_connect",
      });
    });
  });
});
