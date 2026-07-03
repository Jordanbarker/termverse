import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import type { WindowState } from "@tt/core/terminal/paneTypes";

/**
 * The slice of game state a challenge validator is allowed to read. Built fresh
 * by the store's `checkCompletion` after every command and pane mutation.
 */
export interface ChallengeSnapshot {
  activeWindow: WindowState;
  windows: WindowState[];
  fs: VirtualFS;
  cwd: string;
}

export interface Step {
  /**
   * The current sub-goal, stated as an objective the player must accomplish —
   * NOT the command that does it. Keep it command-free; the answer lives in
   * `command`, revealed only on request via the hint control. May be omitted on
   * a single-step challenge whose `brief` already states the whole objective —
   * the panel then shows just the brief (hint/command still work).
   */
  instruction?: string;
  /**
   * Progressive hint level 1: a conceptual nudge (which concept/flag matters and
   * why) that stops short of the literal command. Hidden by default.
   */
  hint?: string;
  /** Progressive hint level 2: the exact command. Hidden until asked for. */
  command?: string;
  /** Pure predicate: has this step been satisfied by the current state? */
  isComplete: (s: ChallengeSnapshot) => boolean;
}

export interface Challenge {
  id: string;
  title: string;
  type: "tmux" | "git" | "fs";
  /**
   * The persistent scenario + overall objective, shown above the current step so
   * the player always sees the whole task. Command-free. Omitted = the panel just
   * shows the current step's instruction (pane/fs challenges).
   */
  brief?: string;
  steps: Step[];
  /** Seed FS for this challenge, applied on top of buildBaseFs(). */
  setup: (base: VirtualFS) => VirtualFS;
  /** Pane challenges: the layout the player must reproduce (RIGHT schematic). */
  targetWindow?: WindowState;
  /**
   * Pane cleanup/resize challenges: a builder for the messy STARTING layout.
   * Each invocation mints fresh, never-reused pane ids (loadChallenge must NOT
   * reset the counters — TabManager relies on new ids to tear down the previous
   * challenge's terminals). A function (not data) because pane chords can mint
   * new ids mid-challenge; omitted = start from a single pane (makeWindow).
   */
  initialWindow?: () => WindowState;
  /** Window challenges: the window strip the player must reproduce (RIGHT schematic). */
  targetWindows?: WindowState[];
  /** Git challenges: the repo path validators + the panel readout point at. */
  gitRepoPath?: string;
  /** Filesystem challenges: the directory the panel readout renders as a tree. */
  fsWatchPath?: string;
  /**
   * Commands the player may use in this challenge (primary names; aliases resolve
   * automatically). Omitted = every registered command is available. `help` and
   * `clear` are always available regardless of this list.
   */
  commands?: string[];
}
