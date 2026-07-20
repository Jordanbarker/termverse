import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import type { Challenge } from "./types";

// All vim challenges share one scratch dir so the player just runs `vim <file>`
// (startCwd drops them here) and the panel tree readout stays focused.
const WORK_DIR = "/home/player/work";
const FILE = `${WORK_DIR}/notes.txt`;
const TARGET = "Hello, Vim!";

/**
 * Seed an EMPTY notes.txt. The whole challenge is "type one line and save", so
 * there's nothing to seed but the file itself (an empty buffer opens fine in
 * vim). VirtualFS.writeFile has no mkdir-p, so WORK_DIR is created first.
 */
function setup(base: VirtualFS): VirtualFS {
  const mk = base.makeDirectory(WORK_DIR);
  if (!mk.fs) throw new Error(mk.error ?? `vim-first-edit: mkdir ${WORK_DIR} failed`);
  const wr = mk.fs.writeFile(FILE, "");
  if (!wr.fs) throw new Error(wr.error ?? "vim-first-edit: seed write failed");
  return wr.fs;
}

/** Saved buffer with any trailing newline stripped (vim adds one if you press
 * Enter after the text; the outcome is the same either way). */
function read(fs: VirtualFS): string {
  return (fs.readFile(FILE).content ?? "").replace(/\n+$/, "");
}

export const vimFirstEdit: Challenge = {
  id: "vim-first-edit",
  title: "Your first vim edit",
  type: "vim",
  setup,
  startCwd: WORK_DIR,
  fsWatchPath: WORK_DIR,
  commands: ["vim", "cat", "ls"],
  brief:
    "vim is a modal editor: it opens in NORMAL mode, where the letters are " +
    "commands, not text. To type you switch to INSERT mode, and to save you " +
    "run an ex command from normal mode.",
  steps: [
    {
      // The predicate only sees the SAVED file (keystrokes inside the editor
      // are invisible, and completion fires on editor exit), so state the goal
      // as the file's final contents, not the keys that get there.
      instruction: "Make notes.txt contain exactly the line: Hello, Vim!",
      hint:
        "Press i to enter insert mode and type the line, then Esc to return to " +
        "normal mode. Commands beginning with : write the file and quit.",
      command: "vim notes.txt\nthen: i  Hello, Vim!  <Esc>  :wq",
      isComplete: (s) => read(s.fs) === TARGET,
    },
  ],
};
