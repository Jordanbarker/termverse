import { describe, it, expect } from "vitest";
import { getDefaultEnv, parseEnvAssignments, initEnvForComputer } from "../../../story/env";

// Import builtins to register commands
import "../builtins";
import { execute } from "../registry";
import { CommandContext } from "../types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";

function createMinimalFS(zshrcContent?: string): VirtualFS {
  const children: Record<string, import("@tt/core/filesystem/types").FSNode> = {};
  if (zshrcContent !== undefined) {
    children[".zshrc"] = {
      type: "file",
      name: ".zshrc",
      content: zshrcContent,
      permissions: "rw-r--r--",
      hidden: true,
    };
  }
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
            children,
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/ren", "/home/ren");
}

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    fs: createMinimalFS(),
    cwd: "/home/ren",
    homeDir: "/home/ren",
    username: "ren",
    activeComputer: "home",
    envVars: getDefaultEnv("home", "ren"),
    ...overrides,
  };
}

describe("getDefaultEnv", () => {
  it("returns home env with DISPLAY and XDG vars", () => {
    const env = getDefaultEnv("home", "ren");
    expect(env.USER).toBe("ren");
    expect(env.HOME).toBe("/home/ren");
    expect(env.DISPLAY).toBe(":0");
    expect(env.XDG_SESSION_TYPE).toBe("tty");
    expect(env.SNOWFLAKE_ACCOUNT).toBeUndefined();
  });

  it("returns nexacorp env with Snowflake/dbt vars", () => {
    const env = getDefaultEnv("nexacorp", "ren");
    expect(env.SNOWFLAKE_ACCOUNT).toBe("nexacorp.us-east-1");
    expect(env.DBT_PROFILES_DIR).toBe("/home/ren/.dbt");
    expect(env.NEXACORP_ENV).toBe("production");
    expect(env.DISPLAY).toBeUndefined();
  });

  it("returns devcontainer env with Docker vars", () => {
    const env = getDefaultEnv("devcontainer", "ren");
    expect(env.container).toBe("docker");
    expect(env.HOSTNAME).toBe("a1b2c3d4e5f6");
    expect(env.CODER_WORKSPACE).toBe("ai");
    expect(env.SNOWFLAKE_ACCOUNT).toBe("nexacorp.us-east-1");
    expect(env.DISPLAY).toBeUndefined();
  });
});

describe("parseEnvAssignments", () => {
  it("parses export VAR=VALUE", () => {
    expect(parseEnvAssignments('export FOO=bar')).toEqual({ FOO: "bar" });
  });

  it("parses export with double quotes", () => {
    expect(parseEnvAssignments('export FOO="hello world"')).toEqual({ FOO: "hello world" });
  });

  it("parses export with single quotes", () => {
    expect(parseEnvAssignments("export FOO='hello'")).toEqual({ FOO: "hello" });
  });

  it("parses plain VAR=VALUE", () => {
    expect(parseEnvAssignments("MY_VAR=123")).toEqual({ MY_VAR: "123" });
  });

  it("skips comments", () => {
    expect(parseEnvAssignments("# export FOO=bar")).toEqual({});
  });

  it("skips aliases", () => {
    expect(parseEnvAssignments("alias ll='ls -la'")).toEqual({});
  });

  it("skips setopt, bindkey, autoload", () => {
    const content = "setopt autocd\nbindkey -e\nautoload -Uz compinit";
    expect(parseEnvAssignments(content)).toEqual({});
  });

  it("skips source and . lines", () => {
    expect(parseEnvAssignments("source ~/.profile\n. ~/.env")).toEqual({});
  });

  it("handles mixed content", () => {
    const content = [
      "# My config",
      "export EDITOR=nano",
      "alias g=git",
      "setopt autocd",
      "PATH=/usr/bin",
    ].join("\n");
    expect(parseEnvAssignments(content)).toEqual({ EDITOR: "nano", PATH: "/usr/bin" });
  });
});

describe("initEnvForComputer", () => {
  it("merges .zshrc exports into defaults", () => {
    const fs = createMinimalFS("export CUSTOM_VAR=hello\nexport EDITOR=vim");
    const env = initEnvForComputer("home", "ren", fs);
    expect(env.CUSTOM_VAR).toBe("hello");
    expect(env.EDITOR).toBe("vim"); // overridden
    expect(env.USER).toBe("ren"); // default preserved
  });

  it("uses defaults when no .zshrc exists", () => {
    const fs = createMinimalFS();
    const env = initEnvForComputer("home", "ren", fs);
    expect(env.EDITOR).toBe("nano");
  });
});

describe("printenv command", () => {
  it("outputs all vars sorted", () => {
    const ctx = makeCtx();
    const result = execute("printenv", [], {}, ctx);
    const lines = result.output.split("\n");
    // Should be sorted by key (using localeCompare, same as the command)
    const keys = lines.map((l) => l.split("=")[0]);
    const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b));
    expect(keys).toEqual(sortedKeys);
    expect(result.output).toContain("USER=ren");
    expect(result.output).toContain("HOME=/home/ren");
  });

  it("includes PWD from ctx.cwd", () => {
    const ctx = makeCtx({ cwd: "/home/ren/Documents" });
    const result = execute("printenv", [], {}, ctx);
    expect(result.output).toContain("PWD=/home/ren/Documents");
  });

  it("looks up a single var", () => {
    const ctx = makeCtx();
    const result = execute("printenv", ["HOME"], {}, ctx);
    expect(result.output).toBe("/home/ren");
    expect(result.exitCode ?? 0).toBe(0);
  });

  it("returns exit code 1 for unknown var", () => {
    const ctx = makeCtx();
    const result = execute("printenv", ["NONEXISTENT"], {}, ctx);
    expect(result.output).toBe("");
    expect(result.exitCode).toBe(1);
  });

  it("handles multiple var lookups", () => {
    const ctx = makeCtx();
    const result = execute("printenv", ["USER", "SHELL"], {}, ctx);
    expect(result.output).toBe("ren\n/bin/zsh");
  });

  it("shows Snowflake vars on nexacorp", () => {
    const ctx = makeCtx({
      activeComputer: "nexacorp",
      envVars: getDefaultEnv("nexacorp", "ren"),
      storyFlags: { printenv_unlocked: true },
    });
    const result = execute("printenv", ["SNOWFLAKE_ACCOUNT"], {}, ctx);
    expect(result.output).toBe("nexacorp.us-east-1");
  });

  it("shows docker var on devcontainer", () => {
    const ctx = makeCtx({
      activeComputer: "devcontainer",
      envVars: getDefaultEnv("devcontainer", "ren"),
    });
    const result = execute("printenv", ["container"], {}, ctx);
    expect(result.output).toBe("docker");
  });
});

describe("env alias", () => {
  it("works as alias for printenv", () => {
    const ctx = makeCtx();
    const result = execute("env", [], {}, ctx);
    expect(result.output).toContain("USER=ren");
  });
});

describe("export command", () => {
  it("sets a new env var", () => {
    let captured: Record<string, string> | undefined;
    const ctx = makeCtx({
      envVars: getDefaultEnv("home", "ren"),
      setEnvVars: (env) => { captured = env; },
    });
    const result = execute("export", ["FOO=bar"], {}, ctx);
    expect(result.output).toBe("");
    expect(captured).toBeDefined();
    expect(captured!.FOO).toBe("bar");
  });

  it("lists vars with no args", () => {
    const ctx = makeCtx();
    const result = execute("export", [], {}, ctx);
    expect(result.output).toContain('declare -x USER="ren"');
  });

  it("silently succeeds for export VAR without value", () => {
    const ctx = makeCtx();
    const result = execute("export", ["FOO"], {}, ctx);
    expect(result.output).toBe("");
  });

  it("emits exported_chip_api_key event for the correct key/value", () => {
    const ctx = makeCtx({
      envVars: getDefaultEnv("nexacorp", "ren"),
      setEnvVars: () => {},
    });
    const result = execute("export", ["CHIP_API_KEY=nxa_live_7f3k9m2x"], {}, ctx);
    expect(result.triggerEvents).toEqual([
      { type: "command_executed", detail: "exported_chip_api_key" },
    ]);
  });

  it("does not emit the event for a wrong CHIP_API_KEY value", () => {
    const ctx = makeCtx({
      envVars: getDefaultEnv("nexacorp", "ren"),
      setEnvVars: () => {},
    });
    const result = execute("export", ["CHIP_API_KEY=wrong_value"], {}, ctx);
    expect(result.triggerEvents).toBeUndefined();
  });

  it("does not emit the event for unrelated env vars", () => {
    const ctx = makeCtx({
      envVars: getDefaultEnv("nexacorp", "ren"),
      setEnvVars: () => {},
    });
    const result = execute("export", ["FOO=bar"], {}, ctx);
    expect(result.triggerEvents).toBeUndefined();
  });

  it("emits exported_erik_ssh_auth_sock for the canonical absolute socket path", () => {
    const ctx = makeCtx({
      activeComputer: "chipinfra",
      envVars: {},
      setEnvVars: () => {},
    });
    const result = execute(
      "export",
      ["SSH_AUTH_SOCK=/tmp/ssh-mZ4xPq/agent.18472"],
      {},
      ctx
    );
    expect(result.triggerEvents).toEqual([
      { type: "command_executed", detail: "exported_erik_ssh_auth_sock" },
    ]);
  });

  it("emits exported_erik_ssh_auth_sock for a relative socket path resolved from cwd", () => {
    const ctx = makeCtx({
      activeComputer: "chipinfra",
      cwd: "/tmp/ssh-mZ4xPq",
      envVars: {},
      setEnvVars: () => {},
    });
    const result = execute("export", ["SSH_AUTH_SOCK=agent.18472"], {}, ctx);
    expect(result.triggerEvents).toEqual([
      { type: "command_executed", detail: "exported_erik_ssh_auth_sock" },
    ]);
  });

  it("does not emit the SSH_AUTH_SOCK event when relative path resolves elsewhere", () => {
    const ctx = makeCtx({
      activeComputer: "chipinfra",
      cwd: "/home/ren",
      envVars: {},
      setEnvVars: () => {},
    });
    const result = execute("export", ["SSH_AUTH_SOCK=agent.18472"], {}, ctx);
    expect(result.triggerEvents).toBeUndefined();
  });

  it("stores SSH_AUTH_SOCK as the raw user-typed value, not the resolved form", () => {
    let captured: Record<string, string> | undefined;
    const ctx = makeCtx({
      activeComputer: "chipinfra",
      cwd: "/tmp/ssh-mZ4xPq",
      envVars: {},
      setEnvVars: (env) => { captured = env; },
    });
    execute("export", ["SSH_AUTH_SOCK=agent.18472"], {}, ctx);
    expect(captured?.SSH_AUTH_SOCK).toBe("agent.18472");
  });
});

describe("source updates env", () => {
  it("merges exports from sourced file into env", () => {
    let captured: Record<string, string> | undefined;
    const fs = createMinimalFS("export MY_VAR=hello\nexport EDITOR=vim");
    const ctx: CommandContext = {
      fs,
      cwd: "/home/ren",
      homeDir: "/home/ren",
      username: "ren",
      activeComputer: "home",
      envVars: getDefaultEnv("home", "ren"),
      setEnvVars: (env) => { captured = env; },
    };
    const result = execute("source", [".zshrc"], {}, ctx);
    expect(result.output).toBe("");
    expect(captured).toBeDefined();
    expect(captured!.MY_VAR).toBe("hello");
    expect(captured!.EDITOR).toBe("vim");
    // Original vars preserved
    expect(captured!.USER).toBe("ren");
  });
});
