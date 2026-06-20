import { WindowState, PaneLeaf, allLeaves, findLeaf, firstLeaf } from "./paneTypes";

/** Abbreviate a cwd for the status line: home -> `~`, otherwise the last segment. */
export function abbreviateCwd(cwd: string, username: string): string {
  const homeDir = `/home/${username}`;
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

export interface WindowLabelOpts {
  /** Shell username, used to collapse the home dir to `~`. */
  username: string;
  /** Maps a pane's machine to its status-line host prefix (e.g. promptHostname). */
  resolveHost: (leaf: PaneLeaf) => string;
}

/** A window's status-line label comes from its focused pane; a pane count is
 *  appended (tmux-style) when the window is split. A custom name (tmux
 *  rename-window) replaces the derived `host:dir` but still gets the count. */
export function windowLabel(win: WindowState, opts: WindowLabelOpts): string {
  const count = allLeaves(win.root).length;
  // A blank name (empty string) reverts to the derived label, matching the
  // rename-window behavior, so this is a truthy check rather than `??`.
  const base = win.name
    ? win.name
    : (() => {
        const leaf = findLeaf(win.root, win.activePaneId) ?? firstLeaf(win.root);
        return `${opts.resolveHost(leaf)}:${abbreviateCwd(leaf.cwd, opts.username)}`;
      })();
  return count > 1 ? `${base} (${count})` : base;
}
