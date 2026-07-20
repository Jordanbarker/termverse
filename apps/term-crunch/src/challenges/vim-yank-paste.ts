import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import type { Challenge } from "./types";

const WORK_DIR = "/home/player/work";
const FILE = `${WORK_DIR}/rules.conf`;

const SEED = ["allow 10.0.0.1", "allow 10.0.0.2"].join("\n");
const DUP_LINE = "allow 10.0.0.2";
const KEEP_LINE = "allow 10.0.0.1";

function setup(base: VirtualFS): VirtualFS {
  const mk = base.makeDirectory(WORK_DIR);
  if (!mk.fs) throw new Error(mk.error ?? `vim-yank-paste: mkdir ${WORK_DIR} failed`);
  const wr = mk.fs.writeFile(FILE, SEED + "\n");
  if (!wr.fs) throw new Error(wr.error ?? "vim-yank-paste: seed write failed");
  return wr.fs;
}

function lines(fs: VirtualFS): string[] {
  return (fs.readFile(FILE).content ?? "").replace(/\n+$/, "").split("\n");
}

export const vimYankPaste: Challenge = {
  id: "vim-yank-paste",
  title: "Duplicate a line",
  type: "vim",
  setup,
  startCwd: WORK_DIR,
  fsWatchPath: WORK_DIR,
  commands: ["vim", "cat", "ls"],
  brief:
    "The allow rule for 10.0.0.2 needs to appear twice in rules.conf. Copy the " +
    "line rather than retyping it.",
  steps: [
    {
      instruction: "Make the allow 10.0.0.2 line appear twice, keeping the 10.0.0.1 rule.",
      hint:
        "yy yanks (copies) the whole current line; p puts it back on the line " +
        "below. Land on the 10.0.0.2 line first.",
      command: "vim rules.conf\nthen: move onto the 10.0.0.2 line  yy  p  :wq",
      // >= 2 tolerates an overshoot (pasting a third time still counts), per the
      // count convention; the 10.0.0.1 rule must survive.
      isComplete: (s) => {
        const l = lines(s.fs);
        return l.filter((line) => line === DUP_LINE).length >= 2 && l.includes(KEEP_LINE);
      },
    },
  ],
};
