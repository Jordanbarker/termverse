import type { MachineId } from "@tt/core/machine";

/**
 * The puzzle game is single-machine. Every pane/leaf carries this id, and the
 * command pipeline runs every command against this one machine.
 */
export const PUZZLE_MACHINE: MachineId = "puzzle";

/** The player's home directory and shell identity. */
export const HOME_DIR = "/home/player";
export const USERNAME = "player";

/** Stable commit author so seeded + player commits are deterministic. */
export const GIT_AUTHOR = "player <player@puzzle.local>";

/** Max panes per window, matching the live game's tmux model. */
export const MAX_PANES_PER_WINDOW = 6;

/** Max windows (status-line tabs), matching the live game's tmux model. */
export const MAX_WINDOWS = 5;
