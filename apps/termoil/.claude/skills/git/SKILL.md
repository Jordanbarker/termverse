---
name: git
description: "How the virtual git CLI works — repo state stored in .git/, commit graph, branches, refs, remotes, and the dispatcher in commands/builtins/git.ts. Use this skill whenever adding or modifying a git subcommand, working with the commit graph or remotes, touching files under src/engine/git/, or wiring up a new git-related story trigger (e.g. git_clone_*, git_pull_*, git_push)."
---

# Git System

A virtual git CLI that stores all state in the player's VirtualFS under `.git/` — same way real git does. Used heavily in the Day 2 "Fix the Broken Pipeline" questline (clone → pull → checkout -b → commit → push). Lives entirely in the dev container in current gameplay (`DEVCONTAINER_ONLY`).

## Architecture

```
src/engine/git/
├── types.ts        # GitCommit, GitIndex, GitRepo, GitStashEntry, RemoteRepoDef
├── repo.ts         # Pure functions for every subcommand (init, add, commit, log, branch, checkout, push, pull, ...)
├── remotes.ts      # REMOTE_REPOS registry — cloneable repos with pre-built commit history (nexacorp-analytics)
├── output.ts       # CLI-style formatters (status, log, diff)
└── __tests__/repo.test.ts

src/engine/commands/builtins/git.ts   # Subcommand dispatcher; calls repo.ts functions, emits triggerEvents
```

Imports flow one direction: `git.ts` (handler) → `repo.ts` + `remotes.ts` + `output.ts` → `types.ts`.

## Data Model (`types.ts`)

```ts
interface GitCommit {
  hash: string;
  parent: string | null;
  message: string;
  author: string;
  timestamp: number;
  tree: Record<string, string>;     // Full snapshot: relative path → file content
}

interface GitIndex {
  staged: Record<string, string>;
  deleted: string[];
}

interface GitStashEntry {
  tree: Record<string, string>;
  message: string;
}

interface GitRepo {
  root: string;                                  // Absolute path of the repo root (where .git/ lives)
  head: string;                                  // "ref: refs/heads/main" or a raw hash
  currentBranch: string | null;                  // null if detached HEAD
  index: GitIndex;
  stash: GitStashEntry[];
  remoteUrl: string | null;                      // from .git/config
  upstream: { remote: string; branch: string } | null;
}

interface RemoteRepoDef {
  files: Record<string, string>;                 // Working-tree files at clone time
  commits: GitCommit[];                          // Pre-built commit history (oldest first)
  defaultBranch: string;
  /** Optional: returns new commits for git pull, based on story state */
  getUpdates?: (storyFlags, localHead) => GitCommit[];
}
```

**Tree-snapshot model**: every commit stores the *complete* file tree, not a diff. Diffs are computed on demand by walking parent → child. This trades storage for simplicity — fine for a sim with at most a few hundred commits per repo.

## On-Disk Layout

Mirrors real git enough to be discoverable by `ls .git/` / `cat .git/HEAD`:

```
.git/
├── HEAD                      # "ref: refs/heads/main" or a hash
├── config                    # "[remote \"origin\"]\n\turl = ..." sections
├── index.json                # GitIndex serialized
├── stash.json                # GitStashEntry[] serialized
├── objects/<hash>.json       # GitCommit serialized
└── refs/
    └── heads/<branch>        # Plain text: commit hash
```

Reads happen via the helpers at the top of `repo.ts` (`readHead`, `readIndex`, `readCommit`, `readRepo`, etc.). Mutations go through `writeOrFail` / `mkdirOrFail` / `removeOrFail` / `writeRefOrFail`, which return `Result<VirtualFS>`-style values and propagate VFS errors.

## Subcommand Dispatcher (`commands/builtins/git.ts`)

`git` is registered like any other builtin. The handler:

1. Reads positional args, skipping global flags
2. Treats first positional as subcommand
3. Special-cases `init` and `clone` (they don't need an existing repo)
4. For all others: `findRepoRoot(fs, cwd)` walks up from cwd looking for `.git/`; errors out if not found
5. `switch (subcommand)` dispatches to the matching `gitX(...)` function in `repo.ts`
6. Every result has `{ fs, output, triggerEvents? }`; the handler returns these as `CommandResult`

Supported subcommands today (all in the switch in `git.ts`):

| Subcommand | Calls | Notes |
|---|---|---|
| `init` | `gitInit` | Creates `.git/` skeleton |
| `clone <url>` | `gitClone` | Looks up `REMOTE_REPOS[name]`, materializes files, writes commits + refs + config |
| `add <paths>` / `add -A` | `gitAdd` | Stages relative to repo root |
| `rm <paths>` / `rm -r` | `gitRm` | Stages deletion |
| `commit -m <msg>` | `gitCommit` | Hashes tree+parent+msg, writes object, updates ref. Takes a `timestamp` arg — dispatcher in `commands/builtins/git.ts` passes `gameNowFor(...).getTime()` so `git log` Date headers agree with `date` (UTC, `+0000`). |
| `status` / `status -s` | `gitStatus` + `formatStatus` | Branch + staged/unstaged/untracked |
| `log` | `getCommitLog` + formatter | Walks parent chain from HEAD |
| `branch` / `branch <name>` / `branch -d <name>` / `branch -a` / `branch -r` | `listBranches` / `createBranch` / `deleteBranch` | `branch <name>` emits `git_checkout_b` (counts as branch creation for cascade). `-a` lists locals + `remotes/<remote>/<branch>`, `-r` lists only remotes; both reject a positional branch name with `fatal: branch name required` (exit 128). `listBranches(fs, root, mode)` returns `{ branches, remotes, current }` — callers that don't need remotes can ignore the `remotes` field. |
| `checkout <ref>` / `checkout -b <name>` | `gitCheckout` / `createBranch` | `-b` emits `git_checkout_b` |
| `switch <branch>` / `switch -c <name>` | `gitCheckout` / `createBranch` | `-c` emits `git_checkout_b` |
| `diff` / `diff --staged` | `gitDiffFiles` + diff lib | Unified-diff output |
| `stash` / `stash pop` / `stash list` | `gitStashSave` / `gitStashPop` / `gitStashList` | One-deep stack (no `--keep-index`) |
| `push` / `push origin <branch>` | `gitPush` | Updates the remote's branch ref + appends commits to `REMOTE_REPOS` in-memory entry |
| `pull` / `pull origin <branch>` | `gitPull` | Calls `getUpdates(storyFlags, localHead)` on the remote def to fetch story-driven commits |
| `help` | `helpText` | |

Unknown subcommands return `error: unknown subcommand: ...` with `exitCode: 1`.

### Per-subcommand flag validation

`git` opts out of the dispatcher's generic flag check (`skipFlagValidation("git")`) and validates inside the handler. `GIT_SUBCOMMAND_FLAGS` at the top of `git.ts` maps each subcommand to its `KnownFlags`; after `parseGitArgs`, the handler calls `rejectUnknownFlags("git", flags, known, { style: "git" })` which produces git-style errors (`error: unknown switch \`z'` for short, `error: unknown option \`bogus'` for long; exit 129). `--help` is intercepted before validation and returns `HELP_TEXTS.git`.

When you add a new subcommand, also add its flag set to `GIT_SUBCOMMAND_FLAGS`. Without an entry, validation is bypassed for that subcommand.

## Remotes (`remotes.ts`)

`REMOTE_REPOS: Record<string, RemoteRepoDef>` is the registry of cloneable repos. Currently one entry: `nexacorp-analytics` (the dbt project). Its history is hand-built by `buildAnalyticsCommits()` to look authentic — Jin Chen's initial scaffold, Sarah's CI tweaks, Oscar's profile fixes, Auri's recent broken commit. The `_marts__models.yml` file goes through several versions across commits (`MARTS_YAML_V1` … `V5`) so `git log -p` and `git diff <hash>` produce realistic output.

`getUpdates(storyFlags, localHead)` is the hook for **story-driven pulls**. The Day 2 questline relies on this: `git pull origin main` after `ssh_day2` returns Auri's "broken" commit that introduces the failing test. Without it, `pull` would always be a no-op. Add new story-gated remote commits here, not in `repo.ts`.

`buildSimpleRemote(files, defaultBranch?)` is exported for tests that need a generic remote without writing a full history.

## Story Integration

These `command_executed` event details are emitted from `repo.ts` and feed `getDevcontainerStoryFlagTriggers()` in `src/story/storyFlags.ts`:

| Event detail | Emitted by | Wires into |
|---|---|---|
| `git_clone_<repoName>` | `gitClone` | `dbt_project_cloned` (when `<repoName>` is `nexacorp-analytics`) |
| `git_pull_origin_<branch>` | `gitPull` | `pulled_day2_updates` (gated on `ssh_day2`) |
| `git_checkout_b` | `gitCheckout -b` / `git switch -c` / `git branch <name>` | `created_fix_branch` (gated on `dbt_test_failed_day2`) |
| `git_push_origin_<branch>` | `gitPush` | (currently unused — available if needed for branch-specific hooks) |
| `git_push` | `gitPush` | `pushed_fix_branch` (gated on `fixed_campaign_model`) |

When adding a new git-driven story flag, prefer firing on a generic detail (`git_push`) and gating with `requiredFlags` over inventing per-branch details. See the `created_fix_branch` cascade in the **narrative skill** for why the trigger accepts three different ways of creating a branch.

## Adding a New Subcommand

1. **Implement the operation** as a pure function in `repo.ts` returning `{ fs, output, error?, triggerEvents? }`. Use the existing helpers (`readRepo`, `writeOrFail`, `writeRefOrFail`) — don't reach into the VFS directly.
2. **Add a `case`** in the switch in `commands/builtins/git.ts`. Parse subcommand-specific flags from the positional args **after** stripping the subcommand itself (the dispatcher only handles global flags). **Also add the subcommand's flag set to `GIT_SUBCOMMAND_FLAGS`** at the top of the file — without an entry, the per-subcommand validator silently accepts anything.
3. **Emit `triggerEvents`** if the operation should drive a story flag. Use a stable `detail` string (e.g. `git_<verb>` or `git_<verb>_<scope>`).
4. **Add a test** in `src/engine/git/__tests__/repo.test.ts` exercising the pure function — the dispatcher is thin enough that unit-testing `repo.ts` is sufficient.
5. **Update `HELP_TEXTS.git`** in `src/engine/commands/helpTexts.ts` if the subcommand should appear in `git --help`.

## Adding a New Cloneable Remote

1. Add an entry to `REMOTE_REPOS` in `remotes.ts` with `files`, `commits`, and `defaultBranch`. Use `flattenTree(...)` to convert a `DirectoryNode` builder into the flat path→content map clone needs.
2. Build commit history with realistic timestamps, authors, and message style (look at `buildAnalyticsCommits` for the pattern).
3. If pull behavior should depend on story state, implement `getUpdates`. Return the *new* commits to append, in order — `gitPull` walks from `localHead` to the latest of those.
4. Wire the clone event into `getDevcontainerStoryFlagTriggers()` (or wherever the player will run `git clone`) using the `git_clone_<repoName>` detail.

## Design Patterns

- **Pure repo functions**: `repo.ts` exports take `(fs, root, ...args)` and return `{ fs, output, error?, triggerEvents? }`. No store access, no I/O outside the VFS.
- **Real-git on-disk layout**: state lives in `.git/` files so the player can `cat .git/HEAD`, `ls .git/refs/heads`, etc., and have it match what they'd see in a real repo. This is part of the project's narrative-realism rule.
- **Tree snapshots, not deltas**: every commit stores the full tree. Simpler than a packfile sim and fine at this scale.
- **Story-driven remotes**: `getUpdates` lets remote history advance based on flags, so `git pull` becomes a meaningful narrative beat instead of always a no-op.
- **Stable event details**: trigger details are the stable contract between this module and `story/storyFlags.ts` — change them carefully.
