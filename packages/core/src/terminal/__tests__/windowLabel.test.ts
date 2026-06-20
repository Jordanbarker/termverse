import { describe, it, expect } from "vitest";
import { abbreviateCwd, windowLabel, WindowLabelOpts } from "../windowLabel";
import { PaneLeaf, PaneNode, WindowState } from "../paneTypes";

const opts: WindowLabelOpts = { username: "ada", resolveHost: (l) => `host-${l.computerId}` };

function leaf(id: string, cwd: string, computerId = "home"): PaneLeaf {
  return { kind: "leaf", id, computerId, cwd };
}

function win(root: PaneNode, activePaneId: string, name?: string): WindowState {
  return { id: "w1", root, activePaneId, ...(name ? { name } : {}) };
}

describe("abbreviateCwd", () => {
  it("collapses the home dir to ~", () => {
    expect(abbreviateCwd("/home/ada", "ada")).toBe("~");
  });
  it("shows the last segment of a nested path under home", () => {
    expect(abbreviateCwd("/home/ada/projects/site", "ada")).toBe("site");
  });
  it("shows the last segment of an absolute path outside home", () => {
    expect(abbreviateCwd("/etc/nginx", "ada")).toBe("nginx");
  });
  it("keeps a top-level path as-is", () => {
    expect(abbreviateCwd("/", "ada")).toBe("/");
  });
});

describe("windowLabel", () => {
  it("derives host:dir from the focused pane via resolveHost + username", () => {
    const l = leaf("p1", "/home/ada/work", "nexacorp");
    expect(windowLabel(win(l, "p1"), opts)).toBe("host-nexacorp:work");
  });

  it("uses a custom window name over the derived label", () => {
    const l = leaf("p1", "/home/ada/work");
    expect(windowLabel(win(l, "p1", "logs"), opts)).toBe("logs");
  });

  it("reverts a blank name to the derived label", () => {
    const l = leaf("p1", "/home/ada", "home");
    expect(windowLabel(win(l, "p1", ""), opts)).toBe("host-home:~");
  });

  it("appends a tmux-style pane count when the window is split", () => {
    const root: PaneNode = {
      kind: "split",
      id: "s1",
      direction: "h",
      ratio: 0.5,
      a: leaf("p1", "/home/ada/work"),
      b: leaf("p2", "/home/ada/logs"),
    };
    expect(windowLabel(win(root, "p1"), opts)).toBe("host-home:work (2)");
  });

  it("appends the count to a custom name too", () => {
    const root: PaneNode = {
      kind: "split",
      id: "s1",
      direction: "v",
      ratio: 0.5,
      a: leaf("p1", "/home/ada/work"),
      b: leaf("p2", "/home/ada/logs"),
    };
    expect(windowLabel(win(root, "p1", "dev"), opts)).toBe("dev (2)");
  });
});
