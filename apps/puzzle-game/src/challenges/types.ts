import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import type { WindowState } from "@tt/core/terminal/paneTypes";

/**
 * The slice of game state a challenge validator is allowed to read. Built fresh
 * by the store's `checkCompletion` after every command and pane mutation.
 */
export interface PuzzleSnapshot {
  activeWindow: WindowState;
  windows: WindowState[];
  fs: VirtualFS;
  cwd: string;
}

export interface Step {
  /** Shown to the player as the current objective. */
  instruction: string;
  /** Pure predicate: has this step been satisfied by the current state? */
  isComplete: (s: PuzzleSnapshot) => boolean;
}

export interface Challenge {
  id: string;
  title: string;
  type: "pane" | "git" | "fs";
  steps: Step[];
  /** Seed FS for this challenge, applied on top of buildPuzzleFs(). */
  setup: (base: VirtualFS) => VirtualFS;
  /** Pane challenges: the layout the player must reproduce (RIGHT schematic). */
  targetWindow?: WindowState;
  /** Window challenges: the window strip the player must reproduce (RIGHT schematic). */
  targetWindows?: WindowState[];
  /** Git challenges: the repo path validators + the panel readout point at. */
  gitRepoPath?: string;
  /** Filesystem challenges: the directory the panel readout renders as a tree. */
  fsWatchPath?: string;
}
