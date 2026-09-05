---
name: git
description: "How the virtual git CLI works — repo state stored in .git/, commit graph, branches, refs, remotes, and the dispatcher in commands/builtins/git.ts. Use this skill whenever adding or modifying a git subcommand, working with the commit graph or remotes, touching files under packages/core/src/git/, or wiring up a new git-related story trigger (e.g. git_clone_*, git_pull_*, git_push)."
---

# Git System

A virtual git CLI storing all state in the player's VirtualFS under `.git/` — same layout as real git (`HEAD`, `config`, `index.json`, `stash.json`, `rebase-state.json`, `merge-state.json`, `objects/<hash>.json`, `refs/heads/<branch>`), so `cat .git/HEAD` matches what a real repo shows. Used heavily in the Day 2 questline (clone → pull → checkout -b → commit → push). `DEVCONTAINER_ONLY`.

**The engine is `@tt/core`; the repos it can clone are termoil's.** Code map (`packages/core/src/git/`): `types.ts` (all types — read them there), `repo.ts` (pure functions for every subcommand, `(fs, root, ...args) => {fs, output, error?, triggerEvents?}`; read/write via the `readHead`/`writeOrFail`-family helpers), `remotes.ts`, `output.ts` (formatters). Dispatcher `packages/core/src/commands/builtins/git.ts`.

**Tree-snapshot model:** every commit stores the complete file tree; diffs are computed on demand by walking parent→child.

**First-parent by default.** `GitCommit.parent2` is set only by merges. `git log`, `~N`, pull's ff check and rebase are deliberately first-parent; reachability questions (merge-base, `branch -d` safety, "Already up to date") must go through `ancestorSet`, which follows both parents — a hand-rolled `.parent` loop silently ignores merged history.

**Line counting:** anything reporting insertions/deletions must go through `contentLines` + `countLineChanges` in `repo.ts` — raw `split("\n")` miscounts empty files and trailing newlines. `diffTrees` (behind `formatDiffStat`) is the remaining approximation.

## Dispatcher (`commands/builtins/git.ts`)

Reads positional args (skipping global flags), treats the first as subcommand, special-cases `init`/`clone`, else `findRepoRoot(fs, cwd)` walks up for `.git/`; a `switch` dispatches to `gitX(...)`. **The supported subcommand set is the `switch` in `git.ts` — read it there.** Behavior traps:

- **`add`** — pathspecs and `.` resolve against **cwd**; `-A`/`--all` stage the whole repo.
- **`commit`** — takes a `timestamp` arg; the dispatcher passes `(ctx.clock ?? realWallClock()).now().getTime()` so `git log` dates agree with `date`.
- **`status`** — renders the tracking line only when the remote-tracking ref exists (`-s` gets none). Takes pathspecs (cwd-relative) that narrow the lists but never the branch line; an unmatched pathspec is not fatal here, unlike diff/log.
- **`rebase`** — replays the branch's commits onto `<upstream>` (resolved through `resolveRef`, so `origin/<branch>` and hashes work; file-level 3-way merge); on overlap writes conflict markers, persists `GitRebaseState`, stops. HEAD stays on the branch — `rebase-state.json` is the source of truth. `--continue` needs conflict files staged AND marker-free. No `--onto`/interactive.
- **`merge`** — ff when HEAD is an ancestor, else a real merge commit with `parent2` (or the `NOT_FAST_FORWARD` refusal under `--ff-only`). Conflicts persist `GitMergeState` and stop with **exit 1 on stdout**. HEAD doesn't move until concluded by `git commit -m` or `git merge --continue`; `--abort` restores HEAD's tree. The conclusion **rebuilds** the merged tree via `mergeTrees` and overlays staged resolutions (committing the index alone would drop the auto-merged files), and lands through `writeMergeToWorkingDir` — only paths the merge changes get written, so uncommitted edits to untouched files survive.
- **`reset`** — path form (no mode flag) only edits the index; commit form supports `--soft`/`--mixed` (default)/`--hard`. Refused mid-rebase and mid-merge; `--hard` reuses `writeTreeToWorkingDir` so untracked files survive but staged-new files are removed.
- **Revisions (`resolveRef`)** — one choke point for `log`/`diff`/`reset`/`checkout`/`merge`. Grammar: base (`HEAD`, local branch, `origin/main`, exact hash, or unique 4+-char abbreviation) + any number of `^`/`~N` steps (`~N` first parents, `^2` a merge's second, `^0` itself). Missing/ambiguous → `null`. `splitRevsAndPaths` resolves undivided args with `allowPrefix: false` first, then prefers a known path, then retries loosely — otherwise a file named `cafe` becomes a revision when a hash starts with it.
- **Detached HEAD** — `checkout <rev>` writes a raw hash to `.git/HEAD` (`checkout HEAD` is a no-op, as in real git) and emits `git_checkout_detached`, never `git_checkout_b`. `git switch` refuses to detach without `-d`/`--detach`. Commit/reset/merge on a detached HEAD move the raw ref via `moveHeadTo`; `status` reports `detachedAt`.
- **Mid-merge refusals** — `MERGE_IN_PROGRESS` is exported from `repo.ts` and returned by `reset`/`rebase`/`checkout`/`stash`/`pull`/`commit --amend`. A new state-mutating subcommand should add the same guard.
- **`restore`** — `--staged` shares `unstagePaths` with `git reset <paths>`; `git checkout -- <file>` and bare `git checkout <file>` route to the same function; `git checkout <rev> -- <file>` is refused (not modeled).
- **`diff` / `log`** — both take revisions and pathspecs through `splitRevsAndPaths` (`--` authoritative; an unmatchable arg is the `ambiguous argument` fatal). `diff` accepts `<rev>`, `<rev1>..<rev2>`, `<rev1> <rev2>`; `log` one revision + `-n N`/`-N`. **`git diff` never reports untracked files** (its exit code is a real "are there tracked changes" signal).
- **`stash`** — `push` (default) / `pop` / `apply` / `drop` / `list`; none take `stash@{n}` (always the newest entry). `-u`/`--include-untracked` folds untracked files in. Each entry records `base` (HEAD content of stashed paths at save time); apply refuses with `would be overwritten by merge` when a path matches neither its base nor the stashed content — what stops a wrong-branch pop from clobbering. Entries without `base` skip the check.
- **`pull`** — two FF paths: (1) if `refs/remotes/origin/<branch>` exists and local is a strict ancestor, FF to the tracking tip; (2) else `getUpdates(storyFlags, localHead)` fetches story-driven commits. **Termoil's story pulls use path (2)** — `gitClone` seeds local and tracking refs equal, so (1) never fires. `--ff-only` refuses a diverged branch; `--rebase` delegates to `gitRebase` onto `origin/<branch>`. Both emit `git_pull_origin_<branch>`.
- **`fetch`** — lives only in `git.ts`: remote-tracking refs are seeded statically, so with a remote configured it's a silent no-op; without one it's the `does not appear to be a git repository` fatal. Every "pull without a merge commit" route lands on the same state as `pull --ff-only`.
- **`branch <name>`** / `checkout -b` / `switch -c` all emit `git_checkout_b`.
- **`rm`** — `-r` required for a directory, `--cached` untracks without touching the worktree. **Unlike real git there is no safety check**: a modified or staged file is deleted without a refusal, so `git rm` here is as destructive as `rm`.
- **Deleting refs** — `branch -d` gates on *reachability* from HEAD (a merged branch's tip is an ancestor, not equal, to HEAD), `-D` skips the check; both refuse the checked-out branch. `push -d`/`--delete` needs an existing `refs/remotes/<remote>/<branch>`, removes only that tracking ref (never the local branch), and emits **no** push event. The configured-URL check applies **only when the target remote is `origin`** — a named non-origin remote skips it.

**Per-subcommand flag validation:** `git` calls `skipFlagValidation("git")`; `GIT_SUBCOMMAND_FLAGS` (top of `git.ts`) maps each subcommand to its `KnownFlags`, checked via `rejectUnknownFlags("git", flags, known, {style: "git"})` (exit 129). **Without a `GIT_SUBCOMMAND_FLAGS` entry, validation is silently bypassed for that subcommand.**

## Remotes (`remotes.ts`)

**Core's `REMOTE_REPOS` starts empty.** `packages/core/src/git/remotes.ts` declares the registry and `RemoteRepoDef`; termoil fills it at import time from `apps/termoil/src/story/git/remotes.ts` (key `"nexacorp/nexacorp-analytics"`), which owns `buildAnalyticsCommits()` (hand-built to produce realistic `git log -p`/`diff` output) and `getUpdates(storyFlags, localHead)`, the hook for **story-driven pulls** (the Day 2 `git pull origin main` after `ssh_day2` returns Auri's broken commit). Registration is a **side-effect import** in `state/gameStore.ts` and `state/saveManager.ts` — anything that clones outside those paths must import it too. Add story-gated remote commits app-side, never in core's `repo.ts`. `buildSimpleRemote(...)` is exported for tests.

## Story integration (stable contract)

These `command_executed` details are emitted from `repo.ts` and consumed by `getDevcontainerStoryFlagTriggers()` in `story/storyFlags.ts` — change them carefully.

| Event detail | Emitted by | Wires into |
|---|---|---|
| `git_clone_<repoName>` | `gitClone` | `dbt_project_cloned` (when `nexacorp-analytics`) |
| `git_pull_origin_<branch>` | `gitPull` | `pulled_day2_updates` (gated on `ssh_day2`) |
| `git_checkout_b` | `checkout -b` / `switch -c` / `branch <name>` | `created_fix_branch` (gated on `dbt_test_failed_day2`) |
| `git_push_origin_<branch>` | `gitPush` | `pushed_fix_branch` (`detailPrefix`, `detailNot: git_push_origin_main`, gated on `fixed_campaign_model`) |
| `git_push` | `gitPush` | (unused; can't tell a fix-branch push from a main push) |
| `git_merge_<rev>` | `gitMerge` (ff + clean) and the conflict conclusion | (unused) — `<rev>` is the player's spelling; a conflicted stop emits nothing, only a completed merge counts |
| `git_checkout_detached` | `checkout <rev>` / `switch --detach` | (unused) — deliberately not `git_checkout_b`, so detaching can't satisfy "create a fix branch" |

Prefer a generic detail + `requiredFlags` gating over per-branch details **unless which ref was acted on is the objective** ("push the fix branch" is exactly that case).

**Status hints must name subcommands this engine has** — they are the primary discovery path for `restore`, so `output.ts`'s hints and the `git.ts` switch move together.

**Push events fire on a no-op re-push too** ("Everything up-to-date" returns the same `triggerEvents`), so a flag whose gate wasn't satisfied on the first push can still be earned. Story flags are set-to-true, so duplicates are harmless — keep it that way for any push-driven flag.

**`gitPush` pushes the named ref, not HEAD.** A branch with no local ref is `error: src refspec <branch> does not match any` (stderr, exit 1), and no remote ref is written.

## Adding

**A subcommand:** implement a pure function in `repo.ts` (use the existing helpers) → add a `case` in `git.ts`, parsing flags after stripping the subcommand → **add its flag set to `GIT_SUBCOMMAND_FLAGS`** → add the name to `SUBCOMMAND_MAP.git` in `@tt/core/suggestions/suggest` → guard with `MERGE_IN_PROGRESS`/rebase state if it mutates repo state → emit `triggerEvents` with a stable `git_<verb>` detail if it drives a story flag → test in `__tests__/repo.test.ts` (or a focused file) → update `HELP_TEXTS.git` → run `npm run playtest:git`, which walks the Day 2 questline end to end.

**A cloneable remote:** add a `REMOTE_REPOS` entry in the **app's** `story/git/remotes.ts` (`files` via `flattenTree(...)`, `commits`, `defaultBranch`) → build realistic history (see `buildAnalyticsCommits`) → implement `getUpdates` if pull should depend on story state → wire the clone event into `getDevcontainerStoryFlagTriggers()`.
