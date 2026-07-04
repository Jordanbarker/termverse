import { describe, it, expect } from "vitest";
import { execute } from "../registry";
import { CommandContext, TmuxContext } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { DirectoryNode } from "../../filesystem/types";
import "../builtins";

const CREATED = new Date(2026, 6, 4, 9, 12, 0).getTime();

const root: DirectoryNode = {
  type: "directory",
  name: "/",
  permissions: "rwxr-xr-x",
  hidden: false,
  children: {},
};

function createCtx(tmux: TmuxContext | undefined, rawArgs: string[]): CommandContext {
  return {
    fs: new VirtualFS(root, "/", "/"),
    cwd: "/",
    homeDir: "/",
    username: "ren",
    activeComputer: "home",
    tmux,
    rawArgs,
  };
}

function run(rawArgs: string[], tmux?: TmuxContext) {
  return execute("tmux", rawArgs, {}, createCtx(tmux, rawArgs));
}

const session = (name: string, attached: boolean, windowCount = 1) => ({
  name,
  windowCount,
  createdAt: CREATED,
  attached,
});

const ATTACHED_0: TmuxContext = { attachedSession: "0", sessions: [session("0", true, 2)] };
const BARE_NO_SERVER: TmuxContext = { attachedSession: null, sessions: [] };
const BARE_WITH_DETACHED: TmuxContext = {
  attachedSession: null,
  sessions: [session("0", false, 2), session("work", false)],
};

describe("tmux new", () => {
  it("refuses to nest while attached", () => {
    for (const argv of [[], ["new"], ["new", "-s", "x"]]) {
      const r = run(argv, ATTACHED_0);
      expect(r.output).toBe("sessions should be nested with care, unset $TMUX to force");
      expect(r.exitCode).toBe(1);
      expect(r.tmuxAction).toBeUndefined();
    }
  });

  it("launches with the lowest unused integer name", () => {
    expect(run([], BARE_NO_SERVER).tmuxAction).toEqual({ type: "new-session", name: "0" });
    expect(run(["new"], BARE_WITH_DETACHED).tmuxAction).toEqual({ type: "new-session", name: "1" });
  });

  it("honors -s and rejects duplicates and bad names", () => {
    expect(run(["new", "-s", "dev"], BARE_WITH_DETACHED).tmuxAction).toEqual({
      type: "new-session",
      name: "dev",
    });
    expect(run(["new", "-s", "work"], BARE_WITH_DETACHED)).toMatchObject({
      output: "duplicate session: work",
      exitCode: 1,
    });
    expect(run(["new", "-s", "a:b"], BARE_NO_SERVER).output).toBe("bad session name: a:b");
  });

  it("returns empty output on success (the swap provides the feedback)", () => {
    expect(run([], BARE_NO_SERVER).output).toBe("");
  });
});

describe("tmux ls", () => {
  it("errors when no server is running", () => {
    expect(run(["ls"], BARE_NO_SERVER)).toMatchObject({
      output: "no server running on /tmp/tmux-1000/default",
      exitCode: 1,
    });
  });

  it("lists sessions with the attached marker", () => {
    const r = run(["ls"], ATTACHED_0);
    expect(r.output).toBe("0: 2 windows (created Sat Jul  4 09:12:00 2026) (attached)");
    const r2 = run(["ls"], BARE_WITH_DETACHED);
    expect(r2.output).toContain("work: 1 window (created");
    expect(r2.output).not.toContain("(attached)");
  });
});

describe("tmux attach", () => {
  it("refuses while attached and errors with no server", () => {
    expect(run(["attach"], ATTACHED_0).output).toMatch(/nested with care/);
    expect(run(["attach"], BARE_NO_SERVER).output).toMatch(/no server running/);
  });

  it("bare attach targets the most recently detached session", () => {
    expect(run(["attach"], BARE_WITH_DETACHED).tmuxAction).toEqual({ type: "attach", name: "work" });
    expect(run(["a"], BARE_WITH_DETACHED).tmuxAction).toEqual({ type: "attach", name: "work" });
  });

  it("attach -t validates the target", () => {
    expect(run(["attach", "-t", "0"], BARE_WITH_DETACHED).tmuxAction).toEqual({ type: "attach", name: "0" });
    expect(run(["attach", "-t", "nope"], BARE_WITH_DETACHED)).toMatchObject({
      output: "can't find session: nope",
      exitCode: 1,
    });
  });
});

describe("tmux detach", () => {
  it("detaches the attached client", () => {
    expect(run(["detach"], ATTACHED_0).tmuxAction).toEqual({ type: "detach" });
  });

  it("errors from the bare shell", () => {
    expect(run(["detach"], BARE_NO_SERVER).output).toMatch(/no server running/);
    expect(run(["detach"], BARE_WITH_DETACHED)).toMatchObject({ output: "no current client", exitCode: 1 });
  });
});

describe("tmux kill-session / kill-server", () => {
  it("bare kill-session targets the attached session, else the last detached", () => {
    expect(run(["kill-session"], ATTACHED_0).tmuxAction).toEqual({ type: "kill-session", name: "0" });
    expect(run(["kill-session"], BARE_WITH_DETACHED).tmuxAction).toEqual({
      type: "kill-session",
      name: "work",
    });
  });

  it("kill-session -t validates the target", () => {
    expect(run(["kill-session", "-t", "0"], BARE_WITH_DETACHED).tmuxAction).toEqual({
      type: "kill-session",
      name: "0",
    });
    expect(run(["kill-session", "-t", "zz"], ATTACHED_0).output).toBe("can't find session: zz");
  });

  it("kill-server works attached or from the bare shell with detached sessions", () => {
    expect(run(["kill-server"], ATTACHED_0).tmuxAction).toEqual({ type: "kill-server" });
    expect(run(["kill-server"], BARE_WITH_DETACHED).tmuxAction).toEqual({ type: "kill-server" });
    expect(run(["kill-server"], BARE_NO_SERVER).output).toMatch(/no server running/);
  });
});

describe("edge cases", () => {
  it("rejects unknown subcommands", () => {
    expect(run(["frobnicate"], ATTACHED_0)).toMatchObject({ output: "unknown command: frobnicate", exitCode: 1 });
  });

  it("treats a missing ctx.tmux as permanently attached", () => {
    expect(run([]).output).toMatch(/nested with care/);
  });
});
