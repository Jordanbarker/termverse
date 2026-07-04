import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { isDirectory } from "@tt/core/filesystem/types";
import type { Challenge } from "./types";

const MESSY_DIR = "/home/player/downloads";

/**
 * Seed manifest: extension → filenames dumped flat in MESSY_DIR. Kept small
 * (6 files) because the engine's `mv` only reads args[0]/args[1] — a glob like
 * `mv *.log log/` would silently move just the first match, so per-file moves
 * are the intended solution and the revealed commands show them explicitly.
 */
const FILES: Record<string, string[]> = {
  md: ["notes.md", "ideas.md"],
  txt: ["todo.txt", "draft.txt"],
  log: ["build.log", "error.log"],
};

const EXTS = Object.keys(FILES);

/**
 * Seed every file flat at the top of ~/downloads. The extension subdirs are
 * deliberately NOT created — making them is step 1.
 */
function setup(base: VirtualFS): VirtualFS {
  const mk = base.makeDirectory(MESSY_DIR);
  if (!mk.fs) throw new Error(mk.error ?? `mv-organize: mkdir ${MESSY_DIR} failed`);
  let fs = mk.fs;

  for (const names of Object.values(FILES)) {
    for (const name of names) {
      const wr = fs.writeFile(`${MESSY_DIR}/${name}`, `# ${name}\n`);
      if (!wr.fs) throw new Error(wr.error ?? `mv-organize: write ${name} failed`);
      fs = wr.fs;
    }
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
    "Your ~/downloads folder is a mess. Sort every file into a subfolder named " +
    "after its extension (notes.md belongs in ~/downloads/md, and so on).",
  setup,
  steps: [
    {
      instruction: "Create a subfolder in ~/downloads for each file extension: md, txt, and log.",
      hint:
        "List the directory to see which extensions are present, then create a " +
        "directory for each one. mkdir can take several names at once.",
      command: "cd ~/downloads\nmkdir md txt log",
      isComplete: (s) =>
        EXTS.every((ext) => {
          const node = s.fs.getNode(`${MESSY_DIR}/${ext}`);
          return node !== null && isDirectory(node);
        }),
    },
    {
      instruction: "Move each file into the subfolder matching its extension.",
      hint:
        "mv takes a source and a destination; when the destination is a directory " +
        "the file lands inside it. Move the files one at a time.",
      command: EXTS.flatMap((ext) => FILES[ext].map((name) => `mv ${name} ${ext}/`)).join("\n"),
      // Copy-proof: each file must exist at its sorted path AND be gone from the
      // flat top level.
      isComplete: (s) =>
        EXTS.every((ext) =>
          FILES[ext].every(
            (name) =>
              s.fs.getNode(`${MESSY_DIR}/${ext}/${name}`) !== null &&
              s.fs.getNode(`${MESSY_DIR}/${name}`) === null,
          ),
        ),
    },
  ],
};
