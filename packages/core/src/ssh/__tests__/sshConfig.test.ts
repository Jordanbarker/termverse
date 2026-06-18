import { describe, it, expect } from "vitest";
import { parseSshConfig, resolveSshTarget } from "../sshConfig";

describe("parseSshConfig", () => {
  it("parses a single host entry", () => {
    const config = `Host nexacorp
  HostName nexacorp-ws01.nexacorp.internal
  User ren`;
    const hosts = parseSshConfig(config);
    expect(hosts.size).toBe(1);
    expect(hosts.get("nexacorp")).toEqual({
      hostname: "nexacorp-ws01.nexacorp.internal",
      user: "ren",
    });
  });

  it("parses multiple host entries", () => {
    const config = `Host nexacorp
  HostName nexacorp-ws01.nexacorp.internal
  User ren

Host github
  HostName github.com
  User git`;
    const hosts = parseSshConfig(config);
    expect(hosts.size).toBe(2);
    expect(hosts.get("nexacorp")?.hostname).toBe("nexacorp-ws01.nexacorp.internal");
    expect(hosts.get("github")?.hostname).toBe("github.com");
  });

  it("ignores comments and blank lines", () => {
    const config = `# SSH config
Host nexacorp
  # work machine
  HostName nexacorp-ws01.nexacorp.internal
  User ren
`;
    const hosts = parseSshConfig(config);
    expect(hosts.size).toBe(1);
    expect(hosts.get("nexacorp")?.user).toBe("ren");
  });

  it("returns empty map for empty config", () => {
    expect(parseSshConfig("").size).toBe(0);
  });

  it("skips entries without HostName", () => {
    const config = `Host broken
  User ren`;
    const hosts = parseSshConfig(config);
    expect(hosts.size).toBe(0);
  });

  it("defaults user to empty string if not specified", () => {
    const config = `Host nexacorp
  HostName nexacorp-ws01.nexacorp.internal`;
    const hosts = parseSshConfig(config);
    expect(hosts.get("nexacorp")?.user).toBe("");
  });
});

describe("resolveSshTarget", () => {
  const config = `Host nexacorp
  HostName nexacorp-ws01.nexacorp.internal
  User ren`;

  it("resolves user@host format", () => {
    const result = resolveSshTarget("ren@nexacorp-ws01.nexacorp.internal", undefined);
    expect(result).toEqual({
      user: "ren",
      host: "nexacorp-ws01.nexacorp.internal",
    });
  });

  it("resolves config alias", () => {
    const result = resolveSshTarget("nexacorp", config);
    expect(result).toEqual({
      user: "ren",
      host: "nexacorp-ws01.nexacorp.internal",
    });
  });

  it("returns bare hostname when no config match", () => {
    const result = resolveSshTarget("unknown-host", config);
    expect(result).toEqual({
      user: "",
      host: "unknown-host",
    });
  });

  it("resolves without config content", () => {
    const result = resolveSshTarget("somehost", undefined);
    expect(result).toEqual({
      user: "",
      host: "somehost",
    });
  });

  it("handles user@host with @ in position", () => {
    const result = resolveSshTarget("admin@server.example.com", undefined);
    expect(result).toEqual({
      user: "admin",
      host: "server.example.com",
    });
  });
});
