import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { gitInit } from "@tt/core/git/repo";
import { GIT_AUTHOR } from "../lib/machine";
import { readGitState } from "../lib/gitState";
import type { Challenge } from "./types";

const PROJECT_DIR = "/home/player/project";

/**
 * Seed an inited repo at ~/project with a single untracked README. The player
 * stages and commits it for real. README stays UNtracked so step 1 (stage) is a
 * genuine action.
 */
function setup(base: VirtualFS): VirtualFS {
  const mk = base.makeDirectory(PROJECT_DIR);
  if (!mk.fs) throw new Error(mk.error ?? "git-first-commit: mkdir failed");

  const wr = mk.fs.writeFile(`${PROJECT_DIR}/README.md`, "# Project\n");
  if (!wr.fs) throw new Error(wr.error ?? "git-first-commit: write README failed");

  return gitInit(wr.fs, PROJECT_DIR, GIT_AUTHOR).fs;
}

export const gitFirstCommit: Challenge = {
  id: "git-first-commit",
  title: "Make your first commit",
  type: "git",
  gitRepoPath: PROJECT_DIR,
  setup,
  steps: [
    {
      instruction: "cd into project, then stage the file:  git add README.md",
      isComplete: (s) => readGitState(s.fs, PROJECT_DIR).staged.includes("README.md"),
    },
    {
      instruction: 'Commit it:  git commit -m "init"',
      isComplete: (s) => {
        const g = readGitState(s.fs, PROJECT_DIR);
        return g.commitCount === 1 && g.latestMessage === "init" && g.clean;
      },
    },
  ],
};
