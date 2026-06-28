import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { gitInit, gitAdd, gitCommit, gitCheckout, createBranch, readStash } from "@tt/core/git/repo";
import { GIT_AUTHOR } from "../lib/machine";
import { readGitState } from "../lib/gitState";
import type { Challenge } from "./types";

const PROJECT_DIR = "/home/player/project";
const APP = `${PROJECT_DIR}/app.js`;

// Three distinct versions of the same file, so the staged WIP edit conflicts with
// hotfix's version → `git checkout hotfix` is blocked until the WIP is stashed.
const BASE_APP = "const VERSION = 1;\nstart();\n";
const HOTFIX_APP = "const VERSION = 1;\nstart(); // hotfix: guard null\n";
const WIP_APP = "const VERSION = 1;\nstart(); // WIP: refactor in progress\n";

// Fixed timestamps keep seeded commit hashes deterministic.
const TS = 1_700_000_000_000;

/** Write a file, throwing on failure (setup must not silently produce a broken repo). */
function write(fs: VirtualFS, path: string, content: string): VirtualFS {
  const r = fs.writeFile(path, content);
  if (!r.fs) throw new Error(r.error ?? `git-stash: write ${path} failed`);
  return r.fs;
}

function commit(fs: VirtualFS, message: string, ts: number): VirtualFS {
  fs = gitAdd(fs, PROJECT_DIR, ["app.js"], false).fs;
  return gitCommit(fs, PROJECT_DIR, message, GIT_AUTHOR, false, false, ts).fs;
}

function checkout(fs: VirtualFS, branch: string): VirtualFS {
  const r = gitCheckout(fs, PROJECT_DIR, branch, false);
  if (r.error) throw new Error(r.error);
  return r.fs;
}

/**
 * Seed ~/project on `main` with a STAGED in-progress edit to app.js, plus a `hotfix`
 * branch whose commit edits the same file. Because the staged change conflicts with
 * hotfix's version, `git checkout hotfix` is refused until the player stashes. Player
 * starts on `main`.
 */
function setup(base: VirtualFS): VirtualFS {
  const mk = base.makeDirectory(PROJECT_DIR);
  if (!mk.fs) throw new Error(mk.error ?? "git-stash: mkdir failed");

  let fs = write(mk.fs, APP, BASE_APP);
  fs = gitInit(fs, PROJECT_DIR, GIT_AUTHOR).fs;
  fs = commit(fs, "Add app", TS);

  // hotfix: branch off, patch the same line, commit
  fs = createBranch(fs, PROJECT_DIR, "hotfix").fs;
  fs = checkout(fs, "hotfix");
  fs = write(fs, APP, HOTFIX_APP);
  fs = commit(fs, "hotfix: patch", TS + 1000);

  // back to main, leave a staged WIP edit (the work the player will stash)
  fs = checkout(fs, "main");
  fs = write(fs, APP, WIP_APP);
  fs = gitAdd(fs, PROJECT_DIR, ["app.js"], false).fs;
  return fs;
}

export const gitStashChallenge: Challenge = {
  id: "git-stash",
  title: "Stash your work to switch branches",
  type: "git",
  gitRepoPath: PROJECT_DIR,
  commands: ["git", "ls", "cat", "cd", "pwd"],
  setup,
  steps: [
    {
      instruction:
        "You have staged WIP in app.js but an urgent fix waits on hotfix.\nShelve your work so the tree is clean:  git stash",
      isComplete: (s) => readGitState(s.fs, PROJECT_DIR).clean && readStash(s.fs, PROJECT_DIR).length > 0,
    },
    {
      instruction: "Tree's clean now — switch to the hotfix branch:  git checkout hotfix",
      isComplete: (s) => readGitState(s.fs, PROJECT_DIR).branch === "hotfix",
    },
    {
      instruction: "Done with hotfix. Head back to your branch:  git checkout main",
      isComplete: (s) =>
        readGitState(s.fs, PROJECT_DIR).branch === "main" && readStash(s.fs, PROJECT_DIR).length > 0,
    },
    {
      instruction: "Bring your shelved work back:  git stash pop",
      isComplete: (s) =>
        readStash(s.fs, PROJECT_DIR).length === 0 && (s.fs.readFile(APP).content ?? "") === WIP_APP,
    },
  ],
};
