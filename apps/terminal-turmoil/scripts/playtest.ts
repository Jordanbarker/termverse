#!/usr/bin/env npx tsx
/**
 * Automated play-test: walks through the entire game checking objectives,
 * story flags, deliveries, and flow issues.
 */

// Must mock localStorage BEFORE any imports
const storage = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => { storage.set(k, v); },
  removeItem: (k: string) => { storage.delete(k); },
  clear: () => storage.clear(),
  get length() { return storage.size; },
  key: (i: number) => [...storage.keys()][i] ?? null,
} as Storage;

import { GameRunner } from "./play";

// ── Helpers ──────────────────────────────────────────────────────────

const issues: string[] = [];
const warnings: string[] = [];
const successes: string[] = [];

function issue(msg: string) { issues.push(msg); console.log(`  ❌ ISSUE: ${msg}`); }
function warn(msg: string) { warnings.push(msg); console.log(`  ⚠️  WARN: ${msg}`); }
function ok(msg: string) { successes.push(msg); console.log(`  ✅ ${msg}`); }
function section(msg: string) { console.log(`\n${"═".repeat(60)}\n  ${msg}\n${"═".repeat(60)}`); }
function step(msg: string) { console.log(`\n  → ${msg}`); }

function expectFlag(runner: GameRunner, flag: string, label?: string) {
  if (runner.storyFlags[flag]) {
    ok(`Flag '${flag}' set${label ? ` (${label})` : ""}`);
  } else {
    issue(`Flag '${flag}' NOT set${label ? ` — expected from: ${label}` : ""}`);
  }
}

function expectObjective(runner: GameRunner, obj: string) {
  if (runner.completedObjectives.includes(obj)) {
    ok(`Objective '${obj}' completed`);
  } else {
    issue(`Objective '${obj}' NOT completed`);
  }
}

function expectEmail(runner: GameRunner, id: string) {
  if (runner.deliveredEmailIds.includes(id)) {
    ok(`Email '${id}' delivered`);
  } else {
    issue(`Email '${id}' NOT delivered`);
  }
}

function expectOutput(result: { output: string; exitCode: number }, contains: string, label?: string) {
  if (result.output.includes(contains)) {
    ok(`Output contains "${contains.slice(0, 40)}"${label ? ` (${label})` : ""}`);
  } else {
    issue(`Output missing "${contains.slice(0, 40)}"${label ? ` — ${label}` : ""}\n      Got: ${result.output.slice(0, 100)}`);
  }
}

function expectExitCode(result: { exitCode: number }, code: number, label?: string) {
  if (result.exitCode === code) {
    ok(`Exit code ${code}${label ? ` (${label})` : ""}`);
  } else {
    issue(`Exit code ${result.exitCode}, expected ${code}${label ? ` — ${label}` : ""}`);
  }
}

// ── Main Play-Test ───────────────────────────────────────────────────

async function playtest() {
  console.log("Terminal Turmoil — Automated Play-Test\n");

  // ────────────────────────────────────────────────────────────
  // CHAPTER 1: New Beginnings (Home PC)
  // ────────────────────────────────────────────────────────────
  section("CHAPTER 1: New Beginnings — Home PC");

  const runner = new GameRunner("home");
  const username = runner.username;
  ok(`Game started. Username: ${username}, Computer: ${runner.activeComputer}`);

  // Basic commands should work
  step("Testing basic commands on home PC");
  let r = runner.run("ls");
  expectExitCode(r, 0, "ls works");

  r = runner.run("pwd");
  expectOutput(r, `/home/${username}`, "pwd shows home dir");

  r = runner.run("help");
  expectExitCode(r, 0, "help works");

  // Gated commands should NOT work yet
  step("Testing gated commands are blocked");
  r = runner.run("ssh nexacorp");
  expectOutput(r, "not found", "ssh blocked before unlock");

  r = runner.run("mkdir test");
  expectOutput(r, "not found", "mkdir blocked before basic_tools_unlocked");

  // ── Objective: Explore personal files (read_resume) ──
  step("Objective: Explore personal files");
  r = runner.run("ls Downloads");
  expectExitCode(r, 0);

  r = runner.run(`cat Downloads/resume_final_v3.pdf`);
  expectFlag(runner, "read_resume", "cat resume");
  expectFlag(runner, "pdftotext_unlocked", "pdftotext auto-unlocked");

  // ── Check email ──
  step("Objective: Check email (read_nexacorp_offer)");
  r = runner.run("mail");
  expectExitCode(r, 0, "mail command works");
  expectOutput(r, "NexaCorp", "mail list shows NexaCorp");

  // Read the NexaCorp offer
  r = runner.run("mail 3");
  if (r.promptPending) {
    ok("NexaCorp offer has reply options (prompt pending)");
    expectFlag(runner, "read_nexacorp_offer", "read offer email");
  } else {
    // Try different mail numbers
    for (let i = 1; i <= 5; i++) {
      r = runner.run(`mail ${i}`);
      if (runner.storyFlags.read_nexacorp_offer) {
        ok(`NexaCorp offer was mail #${i}`);
        break;
      }
    }
    if (!runner.storyFlags.read_nexacorp_offer) {
      issue("Could not find NexaCorp offer email");
    }
  }

  // ── Check Piper before accepting (optional objective) ──
  step("Checking Piper (optional)");
  r = runner.run("piper");
  // Piper should show channels/DMs (alex, olive, openclam, bubble_buddies)
  if (r.output) {
    ok("Piper accessible on home PC");
  }

  // ── Reply to olive basics (unlock basic_tools) ──
  step("Replying to Olive's Linux basics (unlock basic_tools)");
  // The olive_linux_basics message is immediate — we need to reply to it
  // But the GameRunner doesn't have a piper reply mechanism...
  // In the actual game, piper sessions handle this.
  // Let's simulate by triggering the objective_completed event manually
  // Actually, let me check if piper command returns a session
  if (r.output.includes("piper")) {
    ok("Piper session would start — headless runner can't interact with piper sessions");
    warn("Cannot test Piper reply flow in headless mode (piper sessions not simulated)");
  }

  // ── Accept the NexaCorp offer ──
  step("Accepting the NexaCorp job offer");
  if (runner.pendingPrompt) {
    r = runner.selectOption(1); // "I'm in! When do I start?"
    expectObjective(runner, "accepted_nexacorp");

    // Check follow-up emails
    expectEmail(runner, "nexacorp_followup");
    expectEmail(runner, "chip_ssh_setup");
  } else {
    issue("No pending prompt to accept the offer");
  }

  // ── Read chip_ssh_setup to unlock SSH ──
  step("Reading Chip's SSH setup email to unlock SSH");
  r = runner.run("mail");
  // Find the chip_ssh_setup email
  // Read each new email until we find chip_ssh_setup
  for (let i = 1; i <= 8; i++) {
    r = runner.run(`mail ${i}`);
    if (runner.storyFlags.ssh_unlocked) {
      ok(`SSH unlocked after reading mail #${i}`);
      break;
    }
  }
  if (!runner.storyFlags.ssh_unlocked) {
    issue("SSH not unlocked — could not find chip_ssh_setup email");
  }

  // ── Test SSH to NexaCorp ──
  step("Testing SSH to NexaCorp");
  if (runner.storyFlags.ssh_unlocked) {
    r = runner.run("ssh nexacorp");
    if (r.sshSessionStarted) {
      ok("SSH session started (would trigger transition)");
    } else {
      // The SSH config might not have the alias
      r = runner.run(`ssh ${username}@nexacorp-ws01.nexacorp.internal`);
      if (r.sshSessionStarted) {
        ok("SSH session started with full hostname");
      } else {
        issue(`SSH failed: ${r.output.slice(0, 100)}`);
      }
    }
  }

  // ── Run auto_apply script ──
  step("Running auto_apply script (optional objective)");
  r = runner.run("cat scripts/auto_apply.py");
  if (!r.output.includes("Error") && !r.output.includes("error") && r.exitCode === 0) {
    ok("auto_apply.py readable");
  }
  // In headless mode, python is async so we'd need runAsync
  // Let's just check if the bash command works
  r = runner.run("bash scripts/auto_apply.py");
  if (runner.storyFlags.ran_auto_apply) {
    ok("ran_auto_apply flag set");
  } else {
    // Try alternate approach
    r = runner.run("python scripts/auto_apply.py");
    warn("ran_auto_apply might require python command which is async");
  }

  // ── Fix backup script (optional) ──
  step("Fix backup script (optional)");
  r = runner.run("cat scripts/backup.sh");
  if (r.output.includes("BAKCUP_DIR") || r.output.includes("backup")) {
    ok("backup.sh readable, contains the typo to fix");
  }

  // ────────────────────────────────────────────────────────────
  // CHAPTER 2: First Day (NexaCorp)
  // ────────────────────────────────────────────────────────────
  section("CHAPTER 2: First Day — NexaCorp");

  runner.switchComputer("nexacorp");
  ok(`Switched to NexaCorp. CWD: ${runner.cwd}`);

  // ── Read Edward's welcome email (unlocks piper) ──
  step("Reading Edward's welcome email (piper_unlocked)");
  r = runner.run("mail");
  expectExitCode(r, 0, "mail on NexaCorp");

  // Find and read welcome_edward
  for (let i = 1; i <= 5; i++) {
    r = runner.run(`mail ${i}`);
    if (runner.storyFlags.piper_unlocked) {
      ok(`piper_unlocked after reading mail #${i}`);
      break;
    }
  }
  if (!runner.storyFlags.piper_unlocked) {
    issue("piper_unlocked not set — welcome_edward email not found");
  }

  // ── Read onboarding docs ──
  step("Reading onboarding docs (Edward's Onboarding quest)");
  r = runner.run("cat /srv/engineering/onboarding.md");
  expectFlag(runner, "read_onboarding", "cat onboarding.md");

  // Check oscar_coder_setup email delivered
  expectEmail(runner, "oscar_coder_setup");

  // ── Read team info ──
  step("Reading team info");
  r = runner.run("cat /srv/engineering/team-info.md");
  expectFlag(runner, "read_team_info", "cat team-info.md");

  // Edward's Chip DM delivers after read_team_info; its piper_delivered
  // cascade sets chip_unlocked (storyFlags.ts trigger on edward_chip_intro)
  step("Edward's Chip DM unlocks chip");
  r = runner.run("ls"); // any command processes pending deliveries
  if (runner.deliveredPiperIds.includes("edward_chip_intro")) {
    ok("edward_chip_intro Piper DM delivered");
  } else {
    issue("edward_chip_intro Piper DM NOT delivered after read_team_info");
  }
  expectFlag(runner, "chip_unlocked", "Edward's Chip DM (piper_delivered cascade)");

  // ── Oscar's log investigation ──
  step("Oscar's log investigation");
  // After reading onboarding, Oscar should DM about logs on Piper
  // Since we can't interact with piper sessions, let's simulate the key actions

  // Search system logs
  r = runner.run("cat /var/log/system.log");
  expectFlag(runner, "oscar_searched_logs", "read system.log");

  // Check backups
  r = runner.run("cat /var/log/system.log.bak");
  expectFlag(runner, "oscar_checked_backups", "read system.log.bak");
  expectFlag(runner, "found_backup_files", "found backup files");

  // Diff logs
  r = runner.run("diff /var/log/system.log /var/log/system.log.bak");
  if (runner.storyFlags.search_tools_unlocked) {
    expectFlag(runner, "oscar_diffed_logs", "diff logs");
  } else {
    warn("diff command gated behind search_tools_unlocked — need Piper reply to Oscar");
    // Manually set flag to continue testing
    runner.storyFlags = { ...runner.storyFlags, search_tools_unlocked: true };
    r = runner.run("diff /var/log/system.log /var/log/system.log.bak");
    expectFlag(runner, "oscar_diffed_logs", "diff logs (after manual flag)");
  }

  // ── Read handoff notes (Auri's quest line) ──
  step("Auri's handoff investigation");

  // Need inspection_tools_unlocked for head/tail/wc
  if (!runner.storyFlags.inspection_tools_unlocked) {
    warn("inspection_tools_unlocked not set — need Piper reply to Auri. Setting manually.");
    runner.storyFlags = { ...runner.storyFlags, inspection_tools_unlocked: true };
  }

  r = runner.run("ls /srv/engineering/chen-handoff/");
  expectFlag(runner, "auri_listed_handoff", "listed chen-handoff dir");

  r = runner.run("cat /srv/engineering/chen-handoff/notes.txt");
  expectFlag(runner, "read_handoff_notes", "read handoff notes");

  r = runner.run("cat /srv/engineering/chen-handoff/todo.txt");
  expectFlag(runner, "auri_read_todo", "read chen todo");

  // Use head/tail/wc on pipeline data
  r = runner.run("head /srv/engineering/chen-handoff/pipeline_runs.csv");
  expectFlag(runner, "auri_used_head", "used head");

  r = runner.run("tail /srv/engineering/chen-handoff/pipeline_runs.csv");
  expectFlag(runner, "auri_used_tail", "used tail");

  r = runner.run("wc /srv/engineering/chen-handoff/pipeline_runs.csv");
  expectFlag(runner, "auri_used_wc", "used wc");

  // ── Explore Jin Chen's hidden files ──
  step("Investigating Jin Chen's files");
  r = runner.run("cat /var/log/auth.log.bak");
  expectFlag(runner, "found_auth_backup", "read auth.log.bak");

  // Chip plugin directives live on the chipinfra workspace (the plugin tree
  // migrated; see getChipinfraStoryFlagTriggers in storyFlags.ts). In the real
  // game `coder ssh chip` is gated behind unlock_chip_plugin_development.
  step("Investigating Chip plugin directives (chipinfra)");
  if (!runner.storyFlags.unlock_chip_plugin_development) {
    runner.storyFlags = { ...runner.storyFlags, unlock_chip_plugin_development: true };
    warn("unlock_chip_plugin_development set manually (Edward's Chapter 3 DM)");
  }
  runner.switchComputer("chipinfra");

  r = runner.run("cat /opt/chip/plugins/system-monitor/SKILL.md");
  expectFlag(runner, "found_chip_directives", "read chip plugin (chipinfra)");

  r = runner.run("cat /opt/chip/plugins/log-maintenance/cleanup.sh");
  expectFlag(runner, "found_cleanup_script", "read cleanup script (chipinfra)");

  runner.switchComputer("nexacorp");

  // ── Coder dev container & dbt ──
  step("Coder dev container & dbt pipeline");

  // Need coder_unlocked
  if (!runner.storyFlags.coder_unlocked) {
    // Read oscar_coder_setup email should have unlocked it
    warn("coder_unlocked not set — checking oscar_coder_setup email delivery");
  }

  // Switch to devcontainer
  runner.switchComputer("devcontainer");
  ok(`Switched to devcontainer. CWD: ${runner.cwd}`);

  // Clone the analytics repo
  r = runner.run("git clone nexacorp/nexacorp-analytics");
  expectFlag(runner, "dbt_project_cloned", "cloned analytics repo");

  // Run dbt
  r = await runner.runAsync("dbt build");
  expectFlag(runner, "ran_dbt", "ran dbt build");

  // ── Switch back to NexaCorp for remaining objectives ──
  step("Switching back to NexaCorp");
  runner.switchComputer("nexacorp");

  // ── Read Dana's ticket export ──
  step("Dana's operations investigation");
  if (!runner.storyFlags.processing_tools_unlocked) {
    runner.storyFlags = { ...runner.storyFlags, processing_tools_unlocked: true };
    warn("processing_tools_unlocked set manually");
  }

  // Need chmod to access /srv/operations/
  if (!runner.storyFlags.chmod_unlocked) {
    runner.storyFlags = { ...runner.storyFlags, chmod_unlocked: true };
    warn("chmod_unlocked set manually");
  }

  // /srv/operations ships mode rwx------ — the player must chmod it open
  r = runner.run("chmod 755 /srv/operations");
  expectExitCode(r, 0, "chmod /srv/operations");

  r = runner.run("cat /srv/operations/ops_incidents.csv");
  expectFlag(runner, "read_ops_incidents", "read ops incidents");

  // ── End of day ──
  step("End of day — Edward's email");
  // edward_end_of_day requires: auri_dbt_reported + read_team_info + oscar_access_completed
  if (!runner.storyFlags.oscar_access_completed) {
    warn("oscar_access_completed not set — would need Piper reply to Oscar");
    runner.storyFlags = { ...runner.storyFlags, oscar_access_completed: true };
  }
  if (!runner.storyFlags.auri_dbt_reported) {
    warn("auri_dbt_reported not set — would need Piper reply to Auri about dbt results. Setting manually.");
    runner.storyFlags = { ...runner.storyFlags, auri_dbt_reported: true };
  }

  // Trigger the end_of_day email by running a command (the flag trigger fires on any event)
  r = runner.run("ls");
  if (runner.deliveredEmailIds.includes("edward_end_of_day")) {
    ok("edward_end_of_day email delivered");
  } else {
    warn("edward_end_of_day not delivered — may need specific trigger sequence");
    // The trigger requires ran_dbt + read_team_info + oscar_access_completed all set
    // Let's check
    console.log(`    ran_dbt: ${runner.storyFlags.ran_dbt}`);
    console.log(`    read_team_info: ${runner.storyFlags.read_team_info}`);
    console.log(`    oscar_access_completed: ${runner.storyFlags.oscar_access_completed}`);
  }

  // Read end of day email
  r = runner.run("mail");
  for (let i = 1; i <= 10; i++) {
    r = runner.run(`mail ${i}`);
    if (runner.storyFlags.read_end_of_day) break;
  }
  if (runner.storyFlags.read_end_of_day) {
    ok("read_end_of_day flag set");
  } else {
    warn("Could not find end-of-day email to read");
  }

  // ── Return home ──
  step("Returning home for the day");
  runner.switchComputer("home");
  // In the real game, SSH back triggers returned_home_day1
  // The runner doesn't simulate SSH sessions, so let's set this manually
  runner.storyFlags = { ...runner.storyFlags, returned_home_day1: true };
  ok("Simulated returning home (returned_home_day1 set)");

  // ── Shutdown for day 1 ──
  step("Day 1 shutdown");
  r = runner.run("shutdown");
  if (runner.storyFlags.day1_shutdown) {
    ok("day1_shutdown flag set");
  } else {
    issue("day1_shutdown flag NOT set from shutdown command");
  }

  // ────────────────────────────────────────────────────────────
  // CHAPTER 3: Getting the Hang of This
  // ────────────────────────────────────────────────────────────
  section("CHAPTER 3: Getting the Hang of This");

  step("SSH to NexaCorp for day 2");
  r = runner.run(`ssh ${username}@nexacorp-ws01.nexacorp.internal`);
  if (runner.storyFlags.ssh_day2) {
    ok("ssh_day2 flag set");
  } else if (r.sshSessionStarted) {
    ok("SSH session started (ssh_day2 flag would be set by transition handler)");
  } else {
    issue(`SSH day 2 failed: ${r.output.slice(0, 100)}`);
  }

  // ────────────────────────────────────────────────────────────
  // GameRunner Bug Checks
  // ────────────────────────────────────────────────────────────
  section("GameRunner Bug Checks");

  step("Checking deliveredPiperIds tracking");
  if ("deliveredPiperIds" in runner) {
    ok("deliveredPiperIds field exists");
  } else {
    issue("GameRunner does not have deliveredPiperIds field — piper messages will re-deliver every command");
  }

  step("Checking completedObjectives from applyEffects");
  // applyEffects should capture objective_completed events from triggerEvents
  // Currently only selectOption captures them
  const testRunner = new GameRunner("home");
  // Read the offer email to set up prompt
  testRunner.run("mail 3");
  if (testRunner.pendingPrompt) {
    testRunner.selectOption(1); // Accept
    if (testRunner.completedObjectives.includes("accepted_nexacorp")) {
      ok("selectOption correctly captures objectives");
    }
  }

  // ────────────────────────────────────────────────────────────
  // Edge Cases & Flow Issues
  // ────────────────────────────────────────────────────────────
  section("Edge Cases & Flow Issues");

  step("Testing pipe support");
  const pipeRunner = new GameRunner("home");
  r = pipeRunner.run("ls | cat");
  expectExitCode(r, 0, "pipe works");

  step("Testing redirection");
  // Need basic_tools for echo
  pipeRunner.storyFlags = { ...pipeRunner.storyFlags, basic_tools_unlocked: true };
  r = pipeRunner.run("echo hello > /tmp/test.txt");
  const readBack = pipeRunner.run("cat /tmp/test.txt");
  expectOutput(readBack, "hello", "redirect write + read back");

  step("Testing SSH connection timeout after day1 return (before shutdown)");
  const sshRunner = new GameRunner("home");
  sshRunner.storyFlags = { ...sshRunner.storyFlags, ssh_unlocked: true, returned_home_day1: true };
  r = sshRunner.run(`ssh ${sshRunner.username}@nexacorp-ws01.nexacorp.internal`);
  expectOutput(r, "timed out", "SSH times out after return home (before shutdown)");

  step("Testing shutdown blocks after day1_shutdown");
  const shutdownRunner = new GameRunner("home");
  shutdownRunner.storyFlags = { ...shutdownRunner.storyFlags, returned_home_day1: true, day1_shutdown: true };
  r = shutdownRunner.run("shutdown");
  expectOutput(r, "Not now", "shutdown declines after already used (story gate)");

  // ────────────────────────────────────────────────────────────
  // Summary
  // ────────────────────────────────────────────────────────────
  section("PLAY-TEST SUMMARY");

  console.log(`\n  Passed:   ${successes.length}`);
  console.log(`  Warnings: ${warnings.length}`);
  console.log(`  Issues:   ${issues.length}`);

  if (warnings.length > 0) {
    console.log("\n  ⚠️  Warnings:");
    for (const w of warnings) {
      console.log(`    - ${w}`);
    }
  }

  if (issues.length > 0) {
    console.log("\n  ❌ Issues:");
    for (const i of issues) {
      console.log(`    - ${i}`);
    }
  }

  console.log();
}

playtest().catch(console.error);
