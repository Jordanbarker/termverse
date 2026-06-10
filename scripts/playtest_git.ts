#!/usr/bin/env npx tsx
/**
 * Comprehensive git command playtest.
 * Exercises every git subcommand end-to-end through the GameRunner.
 *
 * git is DEVCONTAINER_ONLY in this game, so we run inside the Coder dev container.
 */

import { GameRunner } from "./play";

let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function section(label: string) {
  console.log(`\n\x1b[1;34m━━━ ${label} ━━━\x1b[0m`);
}

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
    passCount++;
  } else {
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? "\n      " + detail.replace(/\n/g, "\n      ") : ""}`);
    failures.push(label);
    failCount++;
  }
}

function safeRun(
  runner: { run(input: string): { output: string; exitCode: number } },
  input: string
): { output: string; exitCode: number; crashed: boolean; error?: string } {
  try {
    const r = runner.run(input);
    return { output: r.output, exitCode: r.exitCode, crashed: false };
  } catch (e) {
    return { output: "", exitCode: -1, crashed: true, error: e instanceof Error ? e.message : String(e) };
  }
}

function show(input: string, output: string) {
  console.log(`  \x1b[90m$\x1b[0m ${input}`);
  if (output.trim()) {
    console.log(output.split("\n").map(l => `    ${l}`).join("\n"));
  }
}

async function main() {
  // ─────────────────────────────────────────────────────────────────────
  section("Setup: dev container (where git lives)");
  // ─────────────────────────────────────────────────────────────────────
  const runner = new GameRunner("home");
  runner.switchComputer("devcontainer");
  const HOME = `/home/ren`;
  let r = runner.run("pwd");
  show("pwd", r.output);
  check("cwd is /home/ren", r.output.trim() === HOME);

  r = runner.run("whoami");
  show("whoami", r.output);
  check("user is ren", r.output.trim() === "ren");

  // ─────────────────────────────────────────────────────────────────────
  section("git --version");
  // ─────────────────────────────────────────────────────────────────────
  r = runner.run("git --version");
  show("git --version", r.output);
  check("reports a git version", /git version/.test(r.output));

  // ─────────────────────────────────────────────────────────────────────
  section("git outside a repo");
  // ─────────────────────────────────────────────────────────────────────
  r = runner.run("git status");
  show("git status (no repo)", r.output);
  check("status outside repo errors", /not a git repository/.test(r.output));
  check("exit code 128", r.exitCode === 128);

  r = runner.run("git log");
  check("log outside repo errors", /not a git repository/.test(r.output));

  // ─────────────────────────────────────────────────────────────────────
  section("git init");
  // ─────────────────────────────────────────────────────────────────────
  runner.run(`mkdir -p ${HOME}/myproj`);
  runner.run(`cd ${HOME}/myproj`);
  r = runner.run("pwd");
  check("cwd is myproj", r.output.trim() === `${HOME}/myproj`);

  r = runner.run("git init");
  show("git init", r.output);
  check("init success", /Initialized empty Git repository/.test(r.output));

  r = runner.run("ls -la .git");
  show("ls -la .git", r.output);
  check(".git/HEAD listed", /HEAD/.test(r.output));
  check(".git/refs listed", /refs/.test(r.output));
  check(".git/objects listed", /objects/.test(r.output));
  check(".git/index.json listed", /index\.json/.test(r.output));

  r = runner.run("cat .git/HEAD");
  check("HEAD points to main", /ref: refs\/heads\/main/.test(r.output));

  r = runner.run("git init");
  check("re-init reports reinitialized", /Reinitialized/.test(r.output));

  // ─────────────────────────────────────────────────────────────────────
  section("git status (empty repo)");
  // ─────────────────────────────────────────────────────────────────────
  r = runner.run("git status");
  show("git status", r.output);
  check("status mentions main branch", /main/.test(r.output));

  // ─────────────────────────────────────────────────────────────────────
  section("git add untracked file");
  // ─────────────────────────────────────────────────────────────────────
  runner.writeFile(`${HOME}/myproj/README.md`, "# My Project\n\nHello world.\n");
  r = runner.run("git status");
  show("git status (untracked)", r.output);
  check("README.md shown as untracked", /README\.md/.test(r.output) && /Untracked/i.test(r.output));

  r = runner.run("git add README.md");
  show("git add README.md", r.output);
  check("add succeeds silently", r.output.trim() === "" && r.exitCode === 0);

  r = runner.run("git status");
  show("git status (staged)", r.output);
  check("README.md shown as new file (staged)", /new file/.test(r.output) && /README\.md/.test(r.output));

  r = runner.run("git add doesnotexist.txt");
  show("git add doesnotexist.txt", r.output);
  check("add of missing file errors", /pathspec.*did not match/.test(r.output));

  // ─────────────────────────────────────────────────────────────────────
  section("git commit");
  // ─────────────────────────────────────────────────────────────────────
  r = runner.run("git commit");
  check("commit with no -m errors", /requires a value/.test(r.output));

  r = runner.run("git commit -m \"initial commit\"");
  show("git commit -m 'initial commit'", r.output);
  check("commit reports root-commit", /root-commit/.test(r.output));
  check("commit reports 1 file changed", /1 file changed/.test(r.output));
  check("commit on main branch", /\[main/.test(r.output));

  r = runner.run("git status");
  show("git status (clean)", r.output);
  check("working tree clean", /clean/i.test(r.output) || /nothing to commit/.test(r.output));

  r = runner.run("git commit -m \"empty\"");
  check("commit with no changes reports clean", /nothing to commit/.test(r.output));

  // ─────────────────────────────────────────────────────────────────────
  section("git log");
  // ─────────────────────────────────────────────────────────────────────
  r = runner.run("git log");
  show("git log", r.output);
  check("log shows commit hash", /commit\s+[0-9a-f]{7}/i.test(r.output));
  check("log shows author", /Author:.+ren/.test(r.output));
  check("log shows date", /Date:/.test(r.output));
  check("log shows message", /initial commit/.test(r.output));

  r = runner.run("git log --oneline");
  show("git log --oneline", r.output);
  check("oneline format compact", r.output.split("\n").filter(l => l.trim()).length === 1);
  check("oneline contains hash and message", /^[0-9a-f]{7}\s+initial commit/.test(r.output.trim()));

  // ─────────────────────────────────────────────────────────────────────
  section("git diff (modified vs HEAD)");
  // ─────────────────────────────────────────────────────────────────────
  runner.writeFile(`${HOME}/myproj/README.md`, "# My Project\n\nHello, modified world!\n");
  r = runner.run("git status");
  show("git status (modified)", r.output);
  check("modified file shown unstaged", /modified/.test(r.output));

  r = runner.run("git diff");
  show("git diff", r.output);
  check("diff shows -Hello world", /-.*Hello world/.test(r.output));
  check("diff shows +Hello, modified world!", /\+.*Hello, modified world!/.test(r.output));
  check("diff exit code 1 (changes present)", r.exitCode === 1);

  r = runner.run("git diff --staged");
  show("git diff --staged (before add)", r.output);
  check("staged diff empty before adding", r.output.trim() === "" && r.exitCode === 0);

  r = runner.run("git add README.md");
  r = runner.run("git diff");
  show("git diff (after add)", r.output);
  check("diff (working) empty after add", r.output.trim() === "" && r.exitCode === 0);

  r = runner.run("git diff --staged");
  show("git diff --staged (after add)", r.output);
  check("staged diff non-empty", r.exitCode === 1);

  r = runner.run("git diff --cached");
  check("--cached alias works", r.exitCode === 1);

  runner.run("git commit -m \"update readme greeting\"");

  // ─────────────────────────────────────────────────────────────────────
  section("git add . / -A (multiple files)");
  // ─────────────────────────────────────────────────────────────────────
  runner.writeFile(`${HOME}/myproj/a.txt`, "alpha\n");
  runner.writeFile(`${HOME}/myproj/b.txt`, "beta\n");
  runner.run(`mkdir -p ${HOME}/myproj/sub`);
  runner.writeFile(`${HOME}/myproj/sub/c.txt`, "charlie\n");

  r = runner.run("git add .");
  show("git add .", r.output);
  r = runner.run("git status -s");
  show("git status -s", r.output);
  check("a.txt staged", /A\s+a\.txt/.test(r.output));
  check("b.txt staged", /A\s+b\.txt/.test(r.output));
  check("sub/c.txt staged", /A\s+sub\/c\.txt/.test(r.output));

  runner.run("git commit -m \"add abc files\"");

  runner.writeFile(`${HOME}/myproj/d.txt`, "delta\n");
  r = runner.run("git add -A");
  r = runner.run("git status -s");
  show("git status -s after -A", r.output);
  check("d.txt staged via -A", /A\s+d\.txt/.test(r.output));
  runner.run("git commit -m \"add d\"");

  // ─────────────────────────────────────────────────────────────────────
  section("git rm");
  // ─────────────────────────────────────────────────────────────────────
  r = runner.run("git rm a.txt");
  show("git rm a.txt", r.output);
  r = runner.run("git status");
  show("git status (after rm)", r.output);
  check("a.txt shown as deleted (staged)", /deleted:.*a\.txt/.test(r.output));

  r = runner.run("ls a.txt");
  check("a.txt removed from working tree", /No such|cannot access|not found/i.test(r.output) || r.exitCode !== 0);

  r = runner.run("git rm sub");
  show("git rm sub (no -r)", r.output);
  check("rm dir without -r errors", /not removing.*recursively/.test(r.output));

  r = runner.run("git rm -r sub");
  show("git rm -r sub", r.output);
  r = runner.run("git status");
  check("sub/c.txt deleted", /deleted:.*sub\/c\.txt/.test(r.output));

  runner.run("git commit -m \"remove a and sub\"");

  // ─────────────────────────────────────────────────────────────────────
  section("git commit -am (auto-stage)");
  // ─────────────────────────────────────────────────────────────────────
  runner.writeFile(`${HOME}/myproj/b.txt`, "beta MODIFIED\n");
  r = runner.run("git commit -am \"modify b\"");
  show("git commit -am", r.output);
  check("commit -am succeeds", /modify b/.test(r.output));
  check("commit -am reports 1 file", /1 file changed/.test(r.output));

  // ─────────────────────────────────────────────────────────────────────
  section("git commit --amend");
  // ─────────────────────────────────────────────────────────────────────
  runner.writeFile(`${HOME}/myproj/b.txt`, "beta MODIFIED AGAIN\n");
  runner.run("git add b.txt");
  r = runner.run("git commit --amend -m \"modify b (amended)\"");
  show("git commit --amend", r.output);
  check("amend succeeds", /amended/.test(r.output));

  r = runner.run("git log --oneline");
  show("git log --oneline (post-amend)", r.output);
  const linesPostAmend = r.output.split("\n").filter(l => l.trim());
  check("amended message in log", /modify b \(amended\)/.test(r.output));
  check("amend kept commit count at 6 (not 7)", linesPostAmend.length === 6);

  // ─────────────────────────────────────────────────────────────────────
  section("git branch");
  // ─────────────────────────────────────────────────────────────────────
  r = runner.run("git branch");
  show("git branch", r.output);
  check("current branch marked with *", /\*\s+main/.test(r.output));

  // Slash-named branches (very common in real workflows: feature/X, bugfix/Y)
  let s = safeRun(runner, "git branch feature/foo");
  show("git branch feature/foo", s.crashed ? `*** CRASH: ${s.error}` : s.output);
  check("create slash-named branch (no crash)", !s.crashed,
    s.crashed ? `crashed: ${s.error}` : undefined);
  check("create slash-named branch (silent on success)",
    !s.crashed && s.output.trim() === "" && s.exitCode === 0);

  // Flat name should always work
  r = runner.run("git branch foo-flat");
  show("git branch foo-flat", r.output);
  check("create flat-named branch", r.output.trim() === "" && r.exitCode === 0);

  r = runner.run("git branch");
  show("git branch (after create)", r.output);
  check("foo-flat listed", /foo-flat/.test(r.output));
  check("main still current", /\*\s+main/.test(r.output));

  r = runner.run("git branch foo-flat");
  check("duplicate branch errors", /already exists/.test(r.output));

  // ─────────────────────────────────────────────────────────────────────
  section("git checkout / git switch");
  // ─────────────────────────────────────────────────────────────────────
  // checkout slash-named branch (if it was created)
  s = safeRun(runner, "git checkout feature/foo");
  show("git checkout feature/foo", s.crashed ? `*** CRASH: ${s.error}` : s.output);

  // flat branch checkout
  r = runner.run("git checkout foo-flat");
  show("git checkout foo-flat", r.output);
  check("checkout flat branch succeeds", /Switched to branch 'foo-flat'/.test(r.output));

  r = runner.run("git branch");
  check("now on foo-flat", /\*\s+foo-flat/.test(r.output));

  // checkout -b with slash
  s = safeRun(runner, "git checkout -b feature/bar");
  show("git checkout -b feature/bar", s.crashed ? `*** CRASH: ${s.error}` : s.output);
  check("checkout -b slash branch (no crash)", !s.crashed,
    s.crashed ? `crashed: ${s.error}` : undefined);

  // checkout -b flat
  r = runner.run("git checkout -b bar-flat");
  show("git checkout -b bar-flat", r.output);
  check("checkout -b flat creates and switches", /Switched to a new branch 'bar-flat'/.test(r.output));

  r = runner.run("git switch main");
  show("git switch main", r.output);
  check("switch main succeeds", /Switched to branch 'main'/.test(r.output));

  s = safeRun(runner, "git switch -c feature/baz");
  show("git switch -c feature/baz", s.crashed ? `*** CRASH: ${s.error}` : s.output);
  check("switch -c slash branch (no crash)", !s.crashed,
    s.crashed ? `crashed: ${s.error}` : undefined);

  r = runner.run("git switch -c baz-flat");
  show("git switch -c baz-flat", r.output);
  check("switch -c flat creates and switches", /Switched to a new branch 'baz-flat'/.test(r.output));

  r = runner.run("git checkout doesnotexist");
  show("git checkout doesnotexist", r.output);
  check("checkout invalid errors", /did not match/.test(r.output));

  runner.run("git switch main");
  r = runner.run("git branch -d main");
  check("cannot delete current branch", /Cannot delete branch/.test(r.output));

  r = runner.run("git branch -d baz-flat");
  show("git branch -d baz-flat", r.output);
  check("delete merged branch succeeds", /Deleted branch baz-flat/.test(r.output));

  // ─────────────────────────────────────────────────────────────────────
  section("git stash");
  // ─────────────────────────────────────────────────────────────────────
  runner.writeFile(`${HOME}/myproj/b.txt`, "stash test\n");
  r = runner.run("git status");
  show("git status (pre-stash)", r.output);
  check("dirty tree before stash", /modified:.*b\.txt/.test(r.output));

  r = runner.run("git stash");
  show("git stash", r.output);
  check("stash saved", /Saved working directory/.test(r.output));

  r = runner.run("git status");
  show("git status (post-stash)", r.output);
  check("clean tree after stash", /clean/.test(r.output) || /nothing to commit/.test(r.output));

  r = runner.run(`cat ${HOME}/myproj/b.txt`);
  show("cat b.txt (post-stash)", r.output);
  check("file reverted to HEAD content", /MODIFIED AGAIN/.test(r.output));

  r = runner.run("git stash list");
  show("git stash list", r.output);
  check("stash list shows entry", /stash@\{0\}/.test(r.output));

  r = runner.run("git stash pop");
  show("git stash pop", r.output);
  check("pop succeeds", /changes restored/.test(r.output));

  r = runner.run(`cat ${HOME}/myproj/b.txt`);
  check("file restored from stash", /stash test/.test(r.output));

  r = runner.run("git stash list");
  check("stash list empty after pop", r.output.trim() === "");

  r = runner.run("git stash pop");
  check("pop on empty stash errors", /No stash entries/.test(r.output));

  // Discard the stash test changes
  runner.writeFile(`${HOME}/myproj/b.txt`, "beta MODIFIED AGAIN\n");

  // ─────────────────────────────────────────────────────────────────────
  section("git clone (mock remote)");
  // ─────────────────────────────────────────────────────────────────────
  runner.run(`mkdir -p ${HOME}/clones`);
  runner.run(`cd ${HOME}/clones`);

  r = runner.run("git clone nexacorp/nexacorp-analytics");
  show("git clone nexacorp/nexacorp-analytics", r.output);
  check("clone reports cloning", /Cloning into 'nexacorp-analytics'/.test(r.output));
  check("clone reports unpacking", /Unpacking objects/.test(r.output));

  r = runner.run("ls nexacorp-analytics");
  show("ls nexacorp-analytics", r.output);
  check("repo dir contains README.md", /README\.md/.test(r.output));
  check("repo dir contains models", /models/.test(r.output));

  r = runner.run("git clone nexacorp/nexacorp-analytics");
  check("duplicate clone errors", /already exists/.test(r.output));

  r = runner.run("git clone github.com/fake/notreal");
  show("git clone (bad url)", r.output);
  check("bogus github url returns not found", /not found/.test(r.output));

  runner.run(`cd ${HOME}/clones/nexacorp-analytics`);
  r = runner.run("git log --oneline");
  const cloneLogLines = r.output.split("\n").filter(l => l.trim());
  check("cloned repo has full commit history (>=15)", cloneLogLines.length >= 15);
  show("git log --oneline (cloned, first 5)", cloneLogLines.slice(0, 5).join("\n"));

  r = runner.run("git branch");
  show("git branch (cloned)", r.output);
  check("cloned repo on main", /\*\s+main/.test(r.output));

  r = runner.run("git status");
  show("git status (cloned, clean)", r.output);
  check("cloned repo clean", /clean/.test(r.output) || /nothing to commit/.test(r.output));

  // ─────────────────────────────────────────────────────────────────────
  section("git push");
  // ─────────────────────────────────────────────────────────────────────
  r = runner.run("git push");
  show("git push (no changes)", r.output);
  check("push up-to-date", /up-to-date/i.test(r.output));

  runner.writeFile(`${HOME}/clones/nexacorp-analytics/notes.md`, "local note\n");
  runner.run("git add notes.md");
  runner.run("git commit -m \"add local notes\"");
  r = runner.run("git push");
  show("git push (with new commit)", r.output);
  check("push reports To <url>", /To nexacorp\/nexacorp-analytics/.test(r.output));
  check("push shows hash range", /[0-9a-f]{7}\.\.[0-9a-f]{7}/.test(r.output));
  check("push references branch", /main -> main/.test(r.output));

  // Use a flat branch name to avoid the slash-branch crash (separately reported)
  runner.run("git checkout -b local-only");
  runner.writeFile(`${HOME}/clones/nexacorp-analytics/feat.md`, "feature\n");
  runner.run("git add feat.md");
  runner.run("git commit -m \"feat\"");
  r = runner.run("git push -u origin local-only");
  show("git push -u", r.output);
  check("push -u sets upstream", /set up to track/.test(r.output));

  runner.writeFile(`${HOME}/clones/nexacorp-analytics/feat.md`, "feature v2\n");
  runner.run("git add feat.md");
  runner.run("git commit -m \"feat v2\"");
  r = runner.run("git push");
  show("git push (with upstream)", r.output);
  check("push uses upstream branch", /local-only -> local-only/.test(r.output));

  // ─────────────────────────────────────────────────────────────────────
  section("git pull");
  // ─────────────────────────────────────────────────────────────────────
  runner.run("git checkout main");
  r = runner.run("git pull");
  show("git pull (no flag)", r.output);
  check("pull up-to-date without story flag", /Already up to date/i.test(r.output));

  runner.storyFlags.day1_shutdown = true;
  r = runner.run("git pull");
  show("git pull (with day1_shutdown flag)", r.output);
  check("pull receives new commit", /Fast-forward/.test(r.output));
  check("pull mentions conversion_rate file", /_marts__models\.yml/.test(r.output));

  r = runner.run("git log --oneline");
  show("git log --oneline (post-pull, first 3)", r.output.split("\n").slice(0, 3).join("\n"));
  check("new commit at top of log", /add not_null test for conversion_rate/.test(r.output));

  r = runner.run("git pull");
  check("second pull up-to-date", /Already up to date/i.test(r.output));

  // ─────────────────────────────────────────────────────────────────────
  section("Edge cases");
  // ─────────────────────────────────────────────────────────────────────
  r = runner.run("git frobnicate");
  show("git frobnicate", r.output);
  check("unknown subcommand errors", /not a git command/.test(r.output));

  r = runner.run("git");
  show("git (no args)", r.output.split("\n").slice(0, 3).join("\n") + "\n  ...");
  check("git with no args shows help", /usage|commit|clone/i.test(r.output));

  runner.run(`cd ${HOME}/clones/nexacorp-analytics/models`);
  r = runner.run("git status");
  show("git status from subdir", r.output);
  check("status works from subdir", /branch main/.test(r.output));

  // ─────────────────────────────────────────────────────────────────────
  section("Summary");
  // ─────────────────────────────────────────────────────────────────────
  console.log(`\n  \x1b[32m${passCount} passed\x1b[0m, \x1b[31m${failCount} failed\x1b[0m`);
  if (failures.length > 0) {
    console.log("\n  Failures:");
    for (const f of failures) console.log(`    - ${f}`);
  }
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Test crashed:", e);
  process.exit(2);
});
