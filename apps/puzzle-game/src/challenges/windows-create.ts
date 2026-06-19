import { makeWindow, resetPaneIdCounters, type WindowState } from "@tt/core/terminal/paneTypes";
import { PUZZLE_MACHINE, HOME_DIR } from "../lib/machine";
import type { Challenge } from "./types";

/**
 * Target = three windows, one of them renamed. Built with the same pure
 * `makeWindow` helper the player drives (ids differ but the strip schematic
 * shows count + labels, not ids). `resetPaneIdCounters` between each keeps the
 * constructed windows' ids from colliding.
 */
function buildTargetWindows(): WindowState[] {
  const wins: WindowState[] = [];
  for (let i = 0; i < 3; i++) {
    resetPaneIdCounters();
    const win = makeWindow(PUZZLE_MACHINE, HOME_DIR);
    wins.push(i === 1 ? { ...win, name: "logs" } : win);
  }
  return wins;
}

const targetWindows = buildTargetWindows();

export const windowsCreate: Challenge = {
  id: "windows-create",
  title: "Open more windows",
  type: "pane",
  targetWindows,
  setup: (base) => base,
  steps: [
    {
      instruction: "Open a second tmux window:  prefix then c  (prefix = Ctrl+Space).",
      isComplete: (s) => s.windows.length >= 2,
    },
    {
      instruction: "Open a third window the same way:  prefix then c.",
      isComplete: (s) => s.windows.length >= 3,
    },
    {
      instruction:
        "Give a window a name:  prefix then r, type a name, press Enter. " +
        "(Switch windows with prefix n / p or prefix 1-3.)",
      isComplete: (s) => s.windows.some((w) => !!w.name),
    },
  ],
};
