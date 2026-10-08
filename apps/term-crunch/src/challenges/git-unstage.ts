import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { gitInit, gitAdd, gitCommit } from "@tt/core/git/repo";
import { GIT_AUTHOR } from "../lib/machine";
import { readGitState } from "../lib/gitState";
import { writeOrThrow } from "../lib/seedFs";
import type { Challenge } from "./types";

const PROJECT_DIR = "/home/player/project";
const APP = `${PROJECT_DIR}/app.js`;
const ENV = `${PROJECT_DIR}/.env`;

const BASE_APP = "const VERSION = 1;\nstart();\n";
const EDITED_APP = "const VERSION = 1;\nstart(); // retry on transient errors\n";
// .env is never committed, so after unstaging it shows up as *untracked*
// (not "unstaged"/modified) — the predicates below check the untracked list.
const ENV_CONTENT = "API_KEY=sk-live-4f2a9c81d7e3\nDB_PASSWORD=hunter2\n";

// Fixed timestamp keeps the seeded commit hash deterministic.
const TS = 1_700_000_000_000;

/**
 * Seed ~/project with one commit (app.js), then replay the "accident": edit
 * app.js, drop a secrets .env next to it, and stage both with `git add .`.
 * Starting index: { app.js (edited), .env (staged-new) }.
 */
function setup(base: VirtualFS): VirtualFS {
  let fs = writeOrThrow(base, APP, BASE_APP);
  fs = gitInit(fs, PROJECT_DIR, GIT_AUTHOR).fs;
  fs = gitAdd(fs, PROJECT_DIR, PROJECT_DIR, ["app.js"], false).fs;
  fs = gitCommit(fs, PROJECT_DIR, "Add app", GIT_AUTHOR, false, false, TS).fs;

  fs = writeOrThrow(fs, APP, EDITED_APP);
  fs = writeOrThrow(fs, ENV, ENV_CONTENT);
  return gitAdd(fs, PROJECT_DIR, PROJECT_DIR, ["."], false).fs;
}

// Shared guard: the secrets file still exists with its contents intact — rules
// out `rm .env` and `git reset --hard` (which deletes staged-new files) as
// "solutions" that technically empty the index.
function envIntact(fs: VirtualFS): boolean {
  return fs.readFile(ENV).content === ENV_CONTENT;
}

export const gitUnstage: Challenge = {
  id: "git-unstage",
  title: "Unstage a file without losing it",
  type: "git",
  gitRepoPath: PROJECT_DIR,
  commands: ["git", "ls", "cat", "cd", "pwd"],
  brief:
    "A careless `git add .` staged .env, a secrets file, along with your app.js edit. " +
    "Unstage .env without losing it, then commit the app change.",
  setup,
  // `rm .env` / `git reset --hard` empty the index too, but the whole point was
  // keeping the file. Nothing brings it back, so tell the player rather than
  // leaving them on a board that can never pass.
  failed: (s) => (envIntact(s.fs) ? null : ".env was deleted or changed. Unstaging touches only the index; the file stays put. Run 'restart' to retry."),
  steps: [
    {
      instruction: "Unstage .env without deleting it or changing its contents.",
      hint:
        "git reset <path> and git restore --staged <path> both touch only the index: " +
        "the file leaves staging, your working tree stays as is.",
      command: "git reset .env",
      // app.js must still be staged: a bare `git reset` empties the whole index,
      // which isn't the targeted fix (though re-adding app.js afterward reaches
      // this same state and legitimately passes — steps are state checkpoints).
      isComplete: (s) => {
        const g = readGitState(s.fs, PROJECT_DIR);
        if (g.staged.includes(".env") || !g.untracked.includes(".env") || !envIntact(s.fs)) return false;
        // `commit -am` stages app.js and clears the index inside one atomic
        // command, so "app.js staged" is never observable on that route —
        // accept the change having already landed in a commit as the same
        // checkpoint, or the player is stranded here forever.
        const committed = g.commitCount >= 2 && !g.staged.includes("app.js") && !g.unstaged.includes("app.js");
        return g.staged.includes("app.js") || committed;
      },
    },
    {
      instruction: "Commit the staged app.js change (any message works).",
      hint: "Commit what's staged; the secrets file stays behind untracked.",
      command: 'git commit -m "update"',
      isComplete: (s) => {
        const g = readGitState(s.fs, PROJECT_DIR);
        // >= 2: overshooting with extra commits still reaches the target state
        // (secrets never committed), so it must not strand the player.
        return g.commitCount >= 2 && g.untracked.includes(".env") && envIntact(s.fs);
      },
    },
  ],
};
