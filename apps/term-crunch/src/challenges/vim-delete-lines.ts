import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import type { Challenge } from "./types";

const WORK_DIR = "/home/player/work";
const FILE = `${WORK_DIR}/tasks.txt`;

// Three scratch lines to delete, sitting ABOVE three keepers. Contiguous junk
// at the top is what makes `gg` then a counted `3dd` the natural move.
const SEED = [
  "# scratch note, delete me",
  "# scratch note, delete me",
  "# scratch note, delete me",
  "keep: alpha",
  "keep: beta",
  "keep: gamma",
].join("\n");
const KEEPERS = ["keep: alpha", "keep: beta", "keep: gamma"];

function setup(base: VirtualFS): VirtualFS {
  const mk = base.makeDirectory(WORK_DIR);
  if (!mk.fs) throw new Error(mk.error ?? `vim-delete-lines: mkdir ${WORK_DIR} failed`);
  const wr = mk.fs.writeFile(FILE, SEED + "\n");
  if (!wr.fs) throw new Error(wr.error ?? "vim-delete-lines: seed write failed");
  return wr.fs;
}

function lines(fs: VirtualFS): string[] {
  return (fs.readFile(FILE).content ?? "").replace(/\n+$/, "").split("\n");
}

export const vimDeleteLines: Challenge = {
  id: "vim-delete-lines",
  title: "Delete the scratch lines",
  type: "vim",
  setup,
  startCwd: WORK_DIR,
  fsWatchPath: WORK_DIR,
  commands: ["vim", "cat", "ls"],
  brief:
    "tasks.txt starts with three throwaway scratch-note lines. Clear them out " +
    "so only the keep: lines remain.",
  steps: [
    {
      instruction: "Leave tasks.txt with only its three keep: lines, in order.",
      hint:
        "In normal mode, dd deletes the current line. It takes a count: put the " +
        "cursor on the first junk line (gg jumps to the top) and delete all three " +
        "at once.",
      command: "vim tasks.txt\nthen: gg  3dd  :wq",
      // Exact match: the three keepers, nothing else. Deleting too much (a
      // keeper) or too little (a leftover scratch line) both fail.
      isComplete: (s) => {
        const l = lines(s.fs);
        return l.length === KEEPERS.length && l.every((line, i) => line === KEEPERS[i]);
      },
    },
  ],
};
