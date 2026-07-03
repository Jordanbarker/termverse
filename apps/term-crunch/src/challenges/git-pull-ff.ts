import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import type { GitCommit } from "@tt/core/git/types";
import {
  gitInit, gitAdd, gitCommit, gitCheckout, createBranch,
  resolveHead, readCommit, readStash, shortHash,
} from "@tt/core/git/repo";
import { GIT_AUTHOR } from "../lib/machine";
import { readGitState } from "../lib/gitState";
import type { Challenge } from "./types";

const PROJECT_DIR = "/home/player/project";
const BRANCH = "feat/add-sql";
const LOAD = `${PROJECT_DIR}/pipeline/load.py`;
const SCRATCH = `${PROJECT_DIR}/sql/existing_credit_card.sql`;
const REMOTE_URL = "git@github.com:acme/credit-pipeline.git";

const README = "# credit-pipeline\n\nLoads credit-card data into the warehouse.\n";
const LOAD_BASE = "def load():\n    rows = read_source()\n    write_warehouse(rows)\n";
// The uncommitted WIP edit the player will stash and later restore.
const LOAD_WIP = "def load():\n    rows = read_source()\n    rows = dedupe(rows)  # WIP: drop duplicate cards\n    write_warehouse(rows)\n";
const SCRATCH_SQL = "select * from raw.credit_card where created_at > current_date - 30;\n";
// Files the two upstream commits add (DIFFERENT files than load.py, so the pop is clean).
const CHANGELOG = "# Changelog\n\n- Add nightly schema migration\n";
const SCHEMA = "create table warehouse.credit_card (id int, masked_pan string);\n";

// Fixed timestamps keep seeded commit hashes deterministic.
const TS = 1_700_000_000_000;

/** Write a file, creating any missing parent directories, throwing on failure. */
function writeP(fs: VirtualFS, path: string, content: string): VirtualFS {
  const parts = path.slice(PROJECT_DIR.length + 1).split("/");
  for (let i = 1; i < parts.length; i++) {
    const dir = `${PROJECT_DIR}/${parts.slice(0, i).join("/")}`;
    if (!fs.getNode(dir)) {
      const r = fs.makeDirectory(dir);
      if (!r.fs) throw new Error(r.error ?? `git-pull-ff: mkdir ${dir} failed`);
      fs = r.fs;
    }
  }
  const r = fs.writeFile(path, content);
  if (!r.fs) throw new Error(r.error ?? `git-pull-ff: write ${path} failed`);
  return r.fs;
}

function mkCommit(parent: string | null, message: string, ts: number, tree: Record<string, string>): GitCommit {
  const hash = shortHash(message + ts + (parent ?? "") + JSON.stringify(tree));
  return { hash, parent, message, author: GIT_AUTHOR, timestamp: ts, tree };
}

/**
 * Seed ~/project on `feat/add-sql` so the branch is BEHIND `origin/feat/add-sql` by 2
 * fast-forwardable commits, with a dirty working tree: one MODIFIED tracked file
 * (pipeline/load.py) and one UNTRACKED new file (sql/existing_credit_card.sql).
 *
 * The two upstream commits live as objects with refs/remotes/origin/feat/add-sql
 * pointing at the newer one, while refs/heads/feat/add-sql stays at the base commit —
 * exactly the state `git status` reports as "behind by 2, can be fast-forwarded".
 */
function setup(base: VirtualFS): VirtualFS {
  const mk = base.makeDirectory(PROJECT_DIR);
  if (!mk.fs) throw new Error(mk.error ?? "git-pull-ff: mkdir failed");

  let fs = writeP(mk.fs, `${PROJECT_DIR}/README.md`, README);
  fs = writeP(fs, LOAD, LOAD_BASE);
  fs = gitInit(fs, PROJECT_DIR, GIT_AUTHOR).fs;
  fs = gitAdd(fs, PROJECT_DIR, PROJECT_DIR, [], true).fs;
  fs = gitCommit(fs, PROJECT_DIR, "Initial pipeline", GIT_AUTHOR, false, false, TS).fs;

  // Work happens on a feature branch tracking origin/feat/add-sql.
  fs = createBranch(fs, PROJECT_DIR, BRANCH).fs;
  const co = gitCheckout(fs, PROJECT_DIR, BRANCH, false);
  if (co.error) throw new Error(co.error);
  fs = co.fs;

  // Two upstream-ahead commits, seeded as objects WITHOUT moving the local ref.
  const c0 = resolveHead(fs, PROJECT_DIR);
  if (!c0) throw new Error("git-pull-ff: missing base commit");
  const c0Tree = readCommit(fs, PROJECT_DIR, c0)?.tree ?? {};
  const c1 = mkCommit(c0, "Add changelog", TS + 1000, { ...c0Tree, "CHANGELOG.md": CHANGELOG });
  const c2 = mkCommit(c1.hash, "Add warehouse schema", TS + 2000, { ...c1.tree, "sql/schema.sql": SCHEMA });
  for (const c of [c1, c2]) {
    fs = writeP(fs, `${PROJECT_DIR}/.git/objects/${c.hash}.json`, JSON.stringify(c));
  }
  // refs/remotes/origin/feat/add-sql → c2 (the slash in the branch needs the nested dir).
  fs = writeP(fs, `${PROJECT_DIR}/.git/refs/remotes/origin/${BRANCH}`, c2.hash);

  // Remote + per-branch upstream config (so `git pull` resolves origin/feat/add-sql).
  fs = writeP(
    fs,
    `${PROJECT_DIR}/.git/config`,
    `[remote "origin"]\n  url = ${REMOTE_URL}\n  fetch = +refs/heads/*:refs/remotes/origin/*\n[branch "${BRANCH}"]\n  remote = origin\n  merge = refs/heads/${BRANCH}\n`,
  );

  // Dirty the tree: an unstaged edit to a tracked file + a brand-new untracked file.
  fs = writeP(fs, LOAD, LOAD_WIP);
  fs = writeP(fs, SCRATCH, SCRATCH_SQL);
  return fs;
}

export const gitPullFf: Challenge = {
  id: "git-pull-ff",
  title: "Sync a branch that's fallen behind",
  type: "git",
  gitRepoPath: PROJECT_DIR,
  commands: ["git", "ls", "cat", "cd", "pwd"],
  brief:
    "Your feat/add-sql branch is 2 commits behind origin with a dirty tree (a modified file " +
    "and an untracked one). Catch up without a merge, then reapply your work.",
  setup,
  steps: [
    {
      instruction: "Shelve all your local changes, including the untracked file, so the tree is completely clean.",
      hint: "A plain stash leaves untracked files sitting in the tree, so it won't be clean. You need the option that sweeps those in too.",
      command: "git stash --include-untracked",
      isComplete: (s) =>
        readGitState(s.fs, PROJECT_DIR).clean && readStash(s.fs, PROJECT_DIR).length > 0,
    },
    {
      instruction: "Catch up to the 2 upstream commits without creating a merge commit.",
      hint: "Pull from origin, but only allow it if the branch can fast-forward straight onto the upstream commits.",
      command: "git pull --ff-only",
      isComplete: (s) => {
        const g = readGitState(s.fs, PROJECT_DIR);
        return g.behind === 0 && g.commitCount === 3 && readStash(s.fs, PROJECT_DIR).length > 0;
      },
    },
    {
      instruction: "Restore your shelved work on top of the new commits.",
      hint: "Reapply the most recent stash and drop it from the stash list.",
      command: "git stash pop",
      isComplete: (s) =>
        readStash(s.fs, PROJECT_DIR).length === 0 &&
        (s.fs.readFile(LOAD).content ?? "") === LOAD_WIP &&
        s.fs.getNode(SCRATCH) !== null,
    },
  ],
};
