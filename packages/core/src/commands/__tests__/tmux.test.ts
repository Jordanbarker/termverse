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
      expect(r.stderr).toBe("sessions should be nested with care, unset $TMUX to force");
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
      stderr: "duplicate session: work",
      exitCode: 1,
    });
    expect(run(["new", "-s", "a:b"], BARE_NO_SERVER).stderr).toBe("bad session name: a:b");
  });

  it("returns empty output on success (the swap provides the feedback)", () => {
    expect(run([], BARE_NO_SERVER).output).toBe("");
  });
});

describe("tmux ls", () => {
  it("errors when no server is running", () => {
    expect(run(["ls"], BARE_NO_SERVER)).toMatchObject({
      stderr: "no server running on /tmp/tmux-1000/default",
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
    expect(run(["attach"], ATTACHED_0).stderr).toMatch(/nested with care/);
    expect(run(["attach"], BARE_NO_SERVER).stderr).toMatch(/no server running/);
  });

  it("bare attach targets the most recently detached session", () => {
    expect(run(["attach"], BARE_WITH_DETACHED).tmuxAction).toEqual({ type: "attach", name: "work" });
    expect(run(["a"], BARE_WITH_DETACHED).tmuxAction).toEqual({ type: "attach", name: "work" });
  });

  it("attach -t validates the target", () => {
    expect(run(["attach", "-t", "0"], BARE_WITH_DETACHED).tmuxAction).toEqual({ type: "attach", name: "0" });
    expect(run(["attach", "-t", "nope"], BARE_WITH_DETACHED)).toMatchObject({
      stderr: "can't find session: nope",
      exitCode: 1,
    });
  });
});

describe("tmux detach", () => {
  it("detaches the attached client", () => {
    expect(run(["detach"], ATTACHED_0).tmuxAction).toEqual({ type: "detach" });
  });

  it("errors from the bare shell", () => {
    expect(run(["detach"], BARE_NO_SERVER).stderr).toMatch(/no server running/);
    expect(run(["detach"], BARE_WITH_DETACHED)).toMatchObject({ stderr: "no current client", exitCode: 1 });
  });
});

describe("tmux rename-session", () => {
  it("renames the current session when -t is omitted", () => {
    expect(run(["rename-session", "dev"], ATTACHED_0).tmuxAction).toEqual({
      type: "rename-session",
      target: "0",
      name: "dev",
    });
    expect(run(["rename", "dev"], ATTACHED_0).tmuxAction).toEqual({
      type: "rename-session",
      target: "0",
      name: "dev",
    });
  });

  it("needs -t from the bare shell (no current client)", () => {
    expect(run(["rename-session", "old"], BARE_WITH_DETACHED)).toMatchObject({
      stderr: "no current client",
      exitCode: 1,
    });
    expect(run(["rename-session", "-t", "0", "old"], BARE_WITH_DETACHED).tmuxAction).toEqual({
      type: "rename-session",
      target: "0",
      name: "old",
    });
  });

  it("validates target, new name, and the server", () => {
    expect(run(["rename-session", "-t", "zz", "old"], ATTACHED_0).stderr).toBe("can't find session: zz");
    expect(run(["rename-session"], ATTACHED_0)).toMatchObject({
      stderr: "usage: rename-session [-t target-session] new-name",
      exitCode: 1,
    });
    expect(run(["rename-session", "a:b"], ATTACHED_0).stderr).toBe("bad session name: a:b");
    expect(run(["rename-session", "-t", "0", "work"], BARE_WITH_DETACHED).stderr).toBe(
      "duplicate session: work",
    );
    expect(run(["rename-session", "old"], BARE_NO_SERVER).stderr).toMatch(/no server running/);
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
    expect(run(["kill-session", "-t", "zz"], ATTACHED_0).stderr).toBe("can't find session: zz");
  });

  it("rejects malformed kill-session arguments without killing a session", () => {
    for (const args of [
      ["session-name"],
      ["0"],
      ["-s", "0"],
      ["-t"],
      ["-t", "-s"],
      ["-t", "0", "extra"],
      ["-t", "0", "-t", "work"],
      ["--unknown"],
    ]) {
      for (const state of [ATTACHED_0, BARE_WITH_DETACHED, BARE_NO_SERVER]) {
        const result = run(["kill-session", ...args], state);
        expect(result.stderr).toBe("usage: kill-session [-t target-session]");
        expect(result.exitCode).toBe(1);
        expect(result.tmuxAction).toBeUndefined();
      }
    }
  });

  it("kill-server works attached or from the bare shell with detached sessions", () => {
    expect(run(["kill-server"], ATTACHED_0).tmuxAction).toEqual({ type: "kill-server" });
    expect(run(["kill-server"], BARE_WITH_DETACHED).tmuxAction).toEqual({ type: "kill-server" });
    expect(run(["kill-server"], BARE_NO_SERVER).stderr).toMatch(/no server running/);
  });
});

describe("window verbs", () => {
  // Three windows, the second one active and custom-named.
  const WINDOWED: TmuxContext = {
    attachedSession: "0",
    sessions: [session("0", true, 3)],
    windows: [
      { id: "w1", index: 1, name: null, active: false },
      { id: "w2", index: 2, name: "logs", active: true },
      { id: "w3", index: 3, name: null, active: false },
    ],
  };

  it("all window verbs need an attached client", () => {
    for (const argv of [["new-window"], ["rename-window", "x"], ["kill-window"], ["select-window", "-t", "1"]]) {
      expect(run(argv, BARE_WITH_DETACHED)).toMatchObject({ stderr: "no current client", exitCode: 1 });
    }
  });

  it("new-window takes no target", () => {
    expect(run(["new-window"], WINDOWED).tmuxAction).toEqual({ type: "new-window" });
    expect(run(["neww"], WINDOWED).tmuxAction).toEqual({ type: "new-window" });
  });

  it("rename-window defaults to the current window", () => {
    expect(run(["rename-window", "build"], WINDOWED).tmuxAction).toEqual({
      type: "rename-window",
      windowId: "w2",
      name: "build",
    });
    expect(run(["renamew", "build"], WINDOWED).tmuxAction).toMatchObject({ windowId: "w2" });
  });

  it("rename-window resolves -t by name then by 1-based index", () => {
    expect(run(["rename-window", "-t", "logs", "build"], WINDOWED).tmuxAction).toMatchObject({ windowId: "w2" });
    expect(run(["rename-window", "-t", "3", "build"], WINDOWED).tmuxAction).toMatchObject({ windowId: "w3" });
  });

  it("rename-window rejects a missing name and bad targets", () => {
    expect(run(["rename-window"], WINDOWED).stderr).toBe("usage: rename-window [-t target-window] new-name");
    expect(run(["rename-window", "-t", "nope", "x"], WINDOWED).stderr).toBe("can't find window: nope");
    expect(run(["rename-window", "-t", "9", "x"], WINDOWED).stderr).toBe("can't find window: 9");
    // No session:window.pane grammar.
    expect(run(["rename-window", "-t", "0:2", "x"], WINDOWED).stderr).toBe("can't find window: 0:2");
  });

  it("kill-window defaults to the current window", () => {
    expect(run(["kill-window"], WINDOWED).tmuxAction).toEqual({ type: "kill-window", windowId: "w2" });
    expect(run(["killw", "-t", "1"], WINDOWED).tmuxAction).toEqual({ type: "kill-window", windowId: "w1" });
    expect(run(["kill-window", "-t", "nope"], WINDOWED).stderr).toBe("can't find window: nope");
  });

  it("select-window requires -t", () => {
    expect(run(["select-window", "-t", "logs"], WINDOWED).tmuxAction).toEqual({
      type: "select-window",
      windowId: "w2",
    });
    expect(run(["selectw", "-t", "3"], WINDOWED).tmuxAction).toEqual({ type: "select-window", windowId: "w3" });
    expect(run(["select-window"], WINDOWED).stderr).toBe("usage: select-window -t target-window");
  });

  it("window verbs can't resolve a target without a windows snapshot", () => {
    expect(run(["kill-window"], ATTACHED_0).stderr).toBe("can't find window: ");
    // ...but new-window needs no target, so it still works.
    expect(run(["new-window"], ATTACHED_0).tmuxAction).toEqual({ type: "new-window" });
  });
});

describe("pane verbs", () => {
  it("all pane verbs need an attached client", () => {
    for (const argv of [["split-window"], ["kill-pane"], ["select-pane", "-L"], ["resize-pane", "-D"]]) {
      expect(run(argv, BARE_WITH_DETACHED)).toMatchObject({ stderr: "no current client", exitCode: 1 });
    }
  });

  it("split-window stacks by default and splits side-by-side with -h", () => {
    expect(run(["split-window"], ATTACHED_0).tmuxAction).toEqual({ type: "split-window", direction: "v" });
    expect(run(["split-window", "-v"], ATTACHED_0).tmuxAction).toEqual({ type: "split-window", direction: "v" });
    expect(run(["split-window", "-h"], ATTACHED_0).tmuxAction).toEqual({ type: "split-window", direction: "h" });
    expect(run(["splitw", "-h"], ATTACHED_0).tmuxAction).toEqual({ type: "split-window", direction: "h" });
  });

  it("kill-pane targets the current pane only", () => {
    expect(run(["kill-pane"], ATTACHED_0).tmuxAction).toEqual({ type: "kill-pane" });
    expect(run(["killp"], ATTACHED_0).tmuxAction).toEqual({ type: "kill-pane" });
    expect(run(["kill-pane", "-t", "1"], ATTACHED_0).stderr).toBe("can't find pane: 1");
  });

  it("select-pane needs a direction", () => {
    expect(run(["select-pane", "-R"], ATTACHED_0).tmuxAction).toEqual({ type: "select-pane", dir: "R" });
    expect(run(["selectp", "-U"], ATTACHED_0).tmuxAction).toEqual({ type: "select-pane", dir: "U" });
    expect(run(["select-pane"], ATTACHED_0).stderr).toBe("usage: select-pane [-LRUD]");
    expect(run(["select-pane", "-t", "2"], ATTACHED_0).stderr).toBe("can't find pane: 2");
  });

  it("resize-pane parses the direction and optional cell count", () => {
    expect(run(["resize-pane", "-D"], ATTACHED_0).tmuxAction).toEqual({
      type: "resize-pane",
      dir: "D",
      cells: 5, // DEFAULT_RESIZE_CELLS
    });
    expect(run(["resize-pane", "-L", "12"], ATTACHED_0).tmuxAction).toEqual({
      type: "resize-pane",
      dir: "L",
      cells: 12,
    });
    expect(run(["resizep", "-U", "3"], ATTACHED_0).tmuxAction).toEqual({
      type: "resize-pane",
      dir: "U",
      cells: 3,
    });
  });

  it("resize-pane rejects a missing direction and a non-numeric adjustment", () => {
    const usage = "usage: resize-pane [-LRUD] [adjustment]";
    expect(run(["resize-pane"], ATTACHED_0).stderr).toBe(usage);
    expect(run(["resize-pane", "5"], ATTACHED_0).stderr).toBe(usage);
    expect(run(["resize-pane", "-D", "lots"], ATTACHED_0).stderr).toBe(usage);
    expect(run(["resize-pane", "-D", "0"], ATTACHED_0).stderr).toBe(usage);
    expect(run(["resize-pane", "-D", "-t", "1"], ATTACHED_0).stderr).toBe("can't find pane: 1");
  });
});

describe("edge cases", () => {
  it("rejects unknown subcommands", () => {
    expect(run(["frobnicate"], ATTACHED_0)).toMatchObject({ stderr: "unknown command: frobnicate", exitCode: 1 });
  });

  it("treats a missing ctx.tmux as permanently attached", () => {
    expect(run([]).stderr).toMatch(/nested with care/);
  });
});
