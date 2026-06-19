import { WindowState, allLeaves, findLeaf, firstLeaf } from "@tt/core/terminal/paneTypes";
import { USERNAME } from "./machine";

/** Abbreviate a cwd for the status line: home -> `~`, otherwise the last segment. */
export function abbreviateCwd(cwd: string): string {
  const homeDir = `/home/${USERNAME}`;
  let display = cwd;
  if (display === homeDir) return "~";
  if (display.startsWith(homeDir + "/")) {
    display = "~" + display.slice(homeDir.length);
  }
  // Show only the last path segment for brevity.
  const lastSlash = display.lastIndexOf("/");
  if (lastSlash > 0) {
    return display.slice(lastSlash + 1);
  }
  return display;
}

/** A window's status-line label comes from its focused pane; a pane count is
 *  appended (tmux-style) when the window is split. */
export function windowLabel(win: WindowState): string {
  const count = allLeaves(win.root).length;
  const base = win.name
    ? win.name
    : (() => {
        const leaf = findLeaf(win.root, win.activePaneId) ?? firstLeaf(win.root);
        return `puzzle:${abbreviateCwd(leaf.cwd)}`;
      })();
  return count > 1 ? `${base} (${count})` : base;
}
