import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import type { Challenge } from "./types";

const WORK_DIR = "/home/player/work";
const FILE = `${WORK_DIR}/hosts.conf`;

// Three occurrences of the old value, one per line, so jumping between matches
// with search actually matters (this vim has no :s substitute).
const OLD = "oldhost";
const NEW = "newhost";
const SEED = [`backend = ${OLD}`, `cache = ${OLD}`, `worker = ${OLD}`].join("\n");

function setup(base: VirtualFS): VirtualFS {
  const mk = base.makeDirectory(WORK_DIR);
  if (!mk.fs) throw new Error(mk.error ?? `vim-search-fix: mkdir ${WORK_DIR} failed`);
  const wr = mk.fs.writeFile(FILE, SEED + "\n");
  if (!wr.fs) throw new Error(wr.error ?? "vim-search-fix: seed write failed");
  return wr.fs;
}

function content(fs: VirtualFS): string {
  return fs.readFile(FILE).content ?? "";
}

export const vimSearchFix: Challenge = {
  id: "vim-search-fix",
  title: "Update every occurrence",
  type: "vim",
  setup,
  startCwd: WORK_DIR,
  fsWatchPath: WORK_DIR,
  commands: ["vim", "cat", "ls"],
  brief:
    "hosts.conf still points three services at oldhost. Repoint every one of " +
    "them at newhost.",
  steps: [
    {
      instruction: "Replace all three occurrences of oldhost with newhost in hosts.conf.",
      hint:
        "This vim has no substitute command. Search with /oldhost, then n jumps " +
        "to each next match; change the word under the cursor with cw at every " +
        "one. n keeps finding only the matches you have not fixed yet.",
      command: "vim hosts.conf\nthen: /oldhost <Enter>  cw newhost <Esc>  n  cw newhost <Esc>  n ...  :wq",
      // Technique-agnostic: only the outcome is checked, so cw / r / retyping
      // all pass. >= 3 tolerates the file gaining an extra match by accident.
      isComplete: (s) => {
        const c = content(s.fs);
        return !c.includes(OLD) && (c.match(new RegExp(NEW, "g")) ?? []).length >= 3;
      },
    },
  ],
};
