import { WindowState } from "@tt/core/terminal/paneTypes";
import {
  abbreviateCwd as coreAbbreviateCwd,
  windowLabel as coreWindowLabel,
} from "@tt/core/terminal/windowLabel";
import { USERNAME } from "./machine";

// term-crunch is single-machine, so the host prefix is always "crunch".
/** Abbreviate a cwd for the status line: home -> `~`, otherwise the last segment. */
export function abbreviateCwd(cwd: string): string {
  return coreAbbreviateCwd(cwd, USERNAME);
}

/** A window's status-line label comes from its focused pane; a pane count is
 *  appended (tmux-style) when the window is split. */
export function windowLabel(win: WindowState): string {
  return coreWindowLabel(win, { username: USERNAME, resolveHost: () => "crunch" });
}
