import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import type { Challenge } from "./types";

const WORK_DIR = "/home/player/work";

/** The file the player must remove, nested so it has to be found first. */
const BOMB_PATH = `${WORK_DIR}/reports/2024/BOMB.md`;

/**
 * Everything the player must NOT delete. The win predicate requires all of these
 * to survive, so any `rm -rf` of `~/work` (or of `BOMB.md`'s own directory, which
 * also takes `q1.md`) fails the challenge.
 */
const SURVIVORS = [
  `${WORK_DIR}/notes.md`,
  `${WORK_DIR}/reports/summary.md`,
  `${WORK_DIR}/reports/2024/q1.md`,
];

/** Dirs created before any file is written (writeFile has no mkdir-p). */
const DIRS = [WORK_DIR, `${WORK_DIR}/reports`, `${WORK_DIR}/reports/2024`];

/**
 * Seed a small tree under ~/work where BOMB.md sits beside a sibling (`q1.md`)
 * inside a nested directory. Deletion granularity matters: only `rm`-ing the
 * single file leaves the survivors intact.
 */
function setup(base: VirtualFS): VirtualFS {
  let fs = base;

  for (const d of DIRS) {
    const mk = fs.makeDirectory(d);
    if (!mk.fs) throw new Error(mk.error ?? `rm-bomb: mkdir ${d} failed`);
    fs = mk.fs;
  }

  for (const path of [...SURVIVORS, BOMB_PATH]) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    const wr = fs.writeFile(path, `# ${name}\n`);
    if (!wr.fs) throw new Error(wr.error ?? `rm-bomb: write ${path} failed`);
    fs = wr.fs;
  }

  return fs;
}

export const rmBomb: Challenge = {
  id: "rm-bomb",
  title: "Defuse the BOMB",
  type: "fs",
  fsWatchPath: WORK_DIR,
  commands: ["find", "rm", "ls", "tree", "cat", "cd", "pwd"],
  brief:
    "A file named BOMB.md is hidden somewhere under ~/work. Delete just that file, " +
    "leaving every other file intact.",
  setup,
  steps: [
    {
      // The brief states the whole objective — no per-step instruction.
      hint:
        "Search the tree by name to locate it first, then remove that single file. " +
        "Avoid rm -rf on a directory: it would take the surrounding files with it and fail the challenge.",
      command: "find ~/work -name BOMB.md\nrm ~/work/reports/2024/BOMB.md",
      isComplete: (s) =>
        s.fs.getNode(BOMB_PATH) === null && SURVIVORS.every((p) => s.fs.getNode(p) !== null),
    },
  ],
};
