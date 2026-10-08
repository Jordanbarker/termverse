import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { mkdirOrThrow, writeOrThrow } from "../lib/seedFs";
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

/**
 * Seed a small tree under ~/work where BOMB.md sits beside a sibling (`q1.md`)
 * inside a nested directory. Deletion granularity matters: only `rm`-ing the
 * single file leaves the survivors intact. WORK_DIR itself is created up front
 * so the panel's tree readout has a root even if every file were removed.
 */
function setup(base: VirtualFS): VirtualFS {
  let fs = mkdirOrThrow(base, WORK_DIR);
  for (const path of [...SURVIVORS, BOMB_PATH]) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    fs = writeOrThrow(fs, path, `# ${name}\n`);
  }
  return fs;
}

export const rmBomb: Challenge = {
  id: "rm-bomb",
  title: "Defuse the BOMB",
  type: "fs",
  fsWatchPath: WORK_DIR,
  fsDangerPath: BOMB_PATH,
  commands: ["find", "rm", "ls", "tree", "cat", "cd", "pwd"],
  brief:
    "BOMB.md is hidden somewhere under ~/work. Delete just that file; " +
    "every other file must survive.",
  setup,
  // rm -rf on a parent takes the survivors with it: the tree readout then LOOKS
  // like a win (BOMB.md is gone), so say plainly that the run is lost.
  failed: (s) => {
    const lost = SURVIVORS.filter((p) => s.fs.getNode(p) === null).map((p) => p.slice(p.lastIndexOf("/") + 1));
    if (lost.length === 0) return null;
    return `${lost.join(", ")} went with it. Only BOMB.md may go; the others had to survive. Run 'restart' to retry.`;
  },
  steps: [
    {
      // The brief states the whole objective — no per-step instruction.
      hint:
        "Search the tree by name, then remove that single file. " +
        "rm -rf on a directory takes the surrounding files with it and fails the challenge.",
      command: "find ~/work -name BOMB.md\nrm ~/work/reports/2024/BOMB.md",
      isComplete: (s) =>
        s.fs.getNode(BOMB_PATH) === null && SURVIVORS.every((p) => s.fs.getNode(p) !== null),
    },
  ],
};
