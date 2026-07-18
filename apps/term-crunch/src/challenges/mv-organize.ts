import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { isDirectory } from "@tt/core/filesystem/types";
import type { Challenge } from "./types";

const MESSY_DIR = "/home/player/downloads";

// Only ONE file needs to move — the .md/.txt files are decoys so the player
// has to pick out the log file from the tree readout.
const SEED_FILES = ["notes.md", "todo.txt", "build.log"];
const LOG_FILE = "build.log";
const LOGS_DIR = `${MESSY_DIR}/logs`;

/**
 * Seed the files flat at the top of ~/downloads. The logs subdir is
 * deliberately NOT created — making it is step 1.
 */
function setup(base: VirtualFS): VirtualFS {
  const mk = base.makeDirectory(MESSY_DIR);
  if (!mk.fs) throw new Error(mk.error ?? `mv-organize: mkdir ${MESSY_DIR} failed`);
  let fs = mk.fs;

  for (const name of SEED_FILES) {
    const wr = fs.writeFile(`${MESSY_DIR}/${name}`, `# ${name}\n`);
    if (!wr.fs) throw new Error(wr.error ?? `mv-organize: write ${name} failed`);
    fs = wr.fs;
  }

  return fs;
}

export const mvOrganize: Challenge = {
  id: "mv-organize",
  title: "Sort the downloads",
  type: "fs",
  fsWatchPath: MESSY_DIR,
  commands: ["mkdir", "mv", "ls", "cd", "pwd"],
  brief:
    "There's a stray log file loose in ~/downloads. Make a logs folder and tuck it away.",
  setup,
  steps: [
    {
      instruction: "Create a logs subfolder in ~/downloads.",
      hint: "List the directory to see what's there, then create a directory named logs.",
      command: "cd ~/downloads\nmkdir logs",
      isComplete: (s) => {
        const node = s.fs.getNode(LOGS_DIR);
        return node !== null && isDirectory(node);
      },
    },
    {
      instruction: "Move the log file into logs/.",
      hint:
        "mv takes a source and a destination; when the destination is a directory " +
        "the file lands inside it.",
      command: `mv ${LOG_FILE} logs/`,
      // Copy-proof: the file must exist at its sorted path AND be gone from the
      // flat top level.
      isComplete: (s) =>
        s.fs.getNode(`${LOGS_DIR}/${LOG_FILE}`) !== null &&
        s.fs.getNode(`${MESSY_DIR}/${LOG_FILE}`) === null,
    },
  ],
};
