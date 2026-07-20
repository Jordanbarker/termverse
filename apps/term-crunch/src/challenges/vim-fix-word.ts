import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import type { Challenge } from "./types";

const WORK_DIR = "/home/player/work";
const FILE = `${WORK_DIR}/app.conf`;

// One wrong value on line 1; line 2 is a decoy that must stay untouched.
const SEED = ["environment = staging", "debug = true"].join("\n");
const TARGET = ["environment = production", "debug = true"].join("\n");

function setup(base: VirtualFS): VirtualFS {
  const mk = base.makeDirectory(WORK_DIR);
  if (!mk.fs) throw new Error(mk.error ?? `vim-fix-word: mkdir ${WORK_DIR} failed`);
  const wr = mk.fs.writeFile(FILE, SEED + "\n");
  if (!wr.fs) throw new Error(wr.error ?? "vim-fix-word: seed write failed");
  return wr.fs;
}

function read(fs: VirtualFS): string {
  return (fs.readFile(FILE).content ?? "").replace(/\n+$/, "");
}

export const vimFixWord: Challenge = {
  id: "vim-fix-word",
  title: "Fix the config value",
  type: "vim",
  setup,
  startCwd: WORK_DIR,
  fsWatchPath: WORK_DIR,
  commands: ["vim", "cat", "ls"],
  brief:
    "app.conf points at the wrong environment. It should read production, not " +
    "staging. Leave the debug line as it is.",
  steps: [
    {
      instruction: "Change the environment value in app.conf from staging to production.",
      hint:
        "Move onto the start of the word you want to replace (w jumps forward by " +
        "word, or f lands on a character), then cw changes that whole word and " +
        "drops you into insert mode to type the new one.",
      command: "vim app.conf\nthen: move onto 'staging'  cw  production  <Esc>  :wq",
      isComplete: (s) => read(s.fs) === TARGET,
    },
  ],
};
