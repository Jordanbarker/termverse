import { makeWindow, resetPaneIdCounters, type WindowState } from "@tt/core/terminal/paneTypes";
import { CRUNCH_MACHINE, HOME_DIR } from "../lib/machine";
import type { Challenge } from "./types";

/**
 * Target = three windows, one of them renamed. Built with the same pure
 * `makeWindow` helper the player drives (ids differ but the strip schematic
 * shows count + labels, not ids). `resetPaneIdCounters` once before the loop
 * gives the constructed windows sequential, non-colliding ids.
 */
function buildTargetWindows(): WindowState[] {
  resetPaneIdCounters();
  const wins: WindowState[] = [];
  for (let i = 0; i < 3; i++) {
    const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
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
  // Pure keyboard-chord challenge — no shell commands needed.
  commands: [],
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
