#!/usr/bin/env npx tsx
/**
 * Multi-arc playtest. Exercises each major story arc end-to-end with a
 * fresh runner per scenario. Reports issues / warnings / passes per arc.
 *
 * Run: npx tsx scripts/playtest_arcs.ts
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

// ── Reporting ───────────────────────────────────────────────────────

let totalPass = 0;
let totalFail = 0;
let totalWarn = 0;
const failures: Array<{ arc: string; msg: string }> = [];
let currentArc = "";

function arc(name: string) {
  currentArc = name;
  console.log(`\n${"━".repeat(70)}\n  ARC: ${name}\n${"━".repeat(70)}`);
}
function step(msg: string) {
  console.log(`\n  → ${msg}`);
}
function pass(msg: string) {
  totalPass += 1;
  console.log(`    ✓ ${msg}`);
}
function fail(msg: string) {
  totalFail += 1;
  failures.push({ arc: currentArc, msg });
  console.log(`    ✗ FAIL: ${msg}`);
}
function warn(msg: string) {
  totalWarn += 1;
  console.log(`    ! warn: ${msg}`);
}
function expectFlag(runner: GameRunner, flag: string) {
  if (runner.storyFlags[flag]) pass(`flag ${flag}`);
  else fail(`flag ${flag} not set`);
}
function expectNoFlag(runner: GameRunner, flag: string) {
  if (!runner.storyFlags[flag]) pass(`flag ${flag} correctly not set`);
  else fail(`flag ${flag} unexpectedly set`);
}
function expectEmail(runner: GameRunner, id: string) {
  if (runner.deliveredEmailIds.includes(id)) pass(`email ${id} delivered`);
  else fail(`email ${id} not delivered`);
}
function expectObjective(runner: GameRunner, id: string) {
  if (runner.completedObjectives.includes(id)) pass(`objective ${id}`);
  else fail(`objective ${id} not completed`);
}
function expectExit(out: { exitCode: number; output: string }, code: number, label?: string) {
  if (out.exitCode === code) pass(`exit ${code}${label ? ` (${label})` : ""}`);
  else fail(`expected exit ${code} got ${out.exitCode}${label ? ` (${label})` : ""}: ${out.output.slice(0, 100)}`);
}

// ── Helpers to simulate piper-driven flag unlocks (since headless runner
//    has no interactive piper sessions). These match what useSessionRouter.ts
//    would set on the matching reply. ──

function simulatePiperUnlocks(runner: GameRunner, ...flags: string[]) {
  for (const f of flags) {
    runner.storyFlags = { ...runner.storyFlags, [f]: true };
  }
}

// ── ARC 1: Chapter 1 main path + accept the offer ──────────────────

function arc1_homeMainPath() {
  arc("Chapter 1 — Home PC main path (accept offer)");
  const r = new GameRunner("home");

  step("Read job alerts email");
  let out = r.run("mail 1");
  expectExit(out, 0, "mail 1");

  step("Read backup failure (mail 2)");
  out = r.run("mail 2");
  expectFlag(r, "read_backup_failure");

  step("Read NexaCorp offer (mail 3)");
  out = r.run("mail 3");
  expectFlag(r, "read_nexacorp_offer");
  if (!r.pendingPrompt) {
    fail("NexaCorp offer should leave a pending prompt");
    return;
  }
  pass("offer has pending prompt");

  step("Accept the offer (option 1)");
  out = r.selectOption(1);
  expectEmail(r, "nexacorp_followup");
  expectEmail(r, "chip_ssh_setup");

  step("Read chip_ssh_setup to unlock ssh");
  // Read all new emails to find chip_ssh_setup
  out = r.run("mail 4");
  out = r.run("mail 5");
  expectFlag(r, "ssh_unlocked");

  step("Read nexacorp_followup to trigger transition flag");
  // Already read via mail 4 or 5; check
  pass(`flags set so far: ${Object.keys(r.storyFlags).length}`);

  step("ssh ren@nexacorp-ws01.nexacorp.internal (no alias configured yet)");
  out = r.run("ssh ren@nexacorp-ws01.nexacorp.internal");
  if (out.sshSessionStarted) pass("ssh session started");
  else fail(`ssh did not start: ${out.output.slice(0, 200)}`);

  step("Visit Downloads and read resume (pdftotext)");
  out = r.run("ls /home/ren/Downloads");
  // Visiting Downloads sets pdftotext_unlocked; that already happened via mail trigger
  out = r.run("pdftotext /home/ren/Downloads/resume_final_v3.pdf -");
  expectFlag(r, "read_resume");
}

// ── ARC 2: Chapter 1 — Olive's terminal challenges (Quest 1) ──────

function arc2_oliveChallenges() {
  arc("Chapter 1 — Olive's challenges (Quest 1, accept branch)");
  const r = new GameRunner("home");

  // Olive's challenges are delivered via piper after Linux basics reply.
  // Simulate accept of olive_challenges_intro → fires objective_completed: olive_challenges_accepted
  simulatePiperUnlocks(r, "basic_tools_unlocked", "apt_unlocked", "olive_challenges_accepted", "olive_challenges_read");
  pass("[sim] piper replies set basic_tools_unlocked, olive_challenges_accepted");

  step("Challenge 1: file in Downloads");
  let out = r.run("file /home/ren/Downloads/NexaCorp_AI_Engineer_JD.pdf");
  expectExit(out, 0, "file command");
  expectFlag(r, "used_file_in_downloads");

  step("Challenge 2: mkdir Projects");
  out = r.run("mkdir /home/ren/Projects");
  expectExit(out, 0, "mkdir");
  expectFlag(r, "created_projects_dir");

  step("Challenge 3: rm -r Projects");
  out = r.run("rm /home/ren/Projects");
  expectExit(out, 1, "plain rm refuses a directory");
  expectNoFlag(r, "removed_projects_dir");
  r.run("touch /home/ren/Projects/scratch.txt");
  out = r.run("rm -r /home/ren/Projects");
  expectExit(out, 0, "rm -r");
  expectFlag(r, "removed_projects_dir");

  step("Challenge 4: mv a file in home");
  // Create a file then mv it
  r.run("touch /home/ren/scratch.txt");
  out = r.run("mv /home/ren/scratch.txt /home/ren/scratch2.txt");
  expectExit(out, 0, "mv");
  expectFlag(r, "used_mv_home");

  step("Challenge 5: echo pipe / redirect");
  out = r.run("echo hello > /tmp/out.txt");
  expectFlag(r, "used_echo_pipe");

  step("Challenge 6: man");
  out = r.run("man ls");
  expectFlag(r, "used_man_command");

  step("Decline branch (separate runner)");
  const r2 = new GameRunner("home");
  simulatePiperUnlocks(r2, "basic_tools_unlocked", "olive_challenges_declined");
  // Verify the decline flag persists and accept flag doesn't
  expectFlag(r2, "olive_challenges_declined");
  expectNoFlag(r2, "olive_challenges_accepted");
}

// ── ARC 3: Chapter 1 — Backup quest (Quest 2) ─────────────────────

function arc3_backupQuest() {
  arc("Chapter 1 — Backup quest");
  const r = new GameRunner("home");
  simulatePiperUnlocks(r, "basic_tools_unlocked", "backup_quest_started");

  step("mkdir backups");
  let out = r.run("mkdir /home/ren/backups");
  expectExit(out, 0, "mkdir backups");
  expectFlag(r, "created_backups_dir");

  step("cp scripts/backup.sh into backups/");
  out = r.run("cp /home/ren/scripts/backup.sh /home/ren/backups/");
  expectExit(out, 0, "cp scripts");
  expectFlag(r, "copied_scripts_backup");

  step("Create backup log (path: ~/backup.log)");
  out = r.run("echo 'first backup' > /home/ren/backup.log");
  out = r.run("cat /home/ren/backup.log");
  expectFlag(r, "created_backup_log");

  step("Verify backup script in subdirectory (backups/scripts/backup.sh)");
  // Real path the trigger watches: /home/ren/backups/scripts/backup.sh
  r.run("mkdir -p /home/ren/backups/scripts");
  r.run("cp /home/ren/scripts/backup.sh /home/ren/backups/scripts/");
  out = r.run("cat /home/ren/backups/scripts/backup.sh");
  if (out.exitCode === 0) {
    expectFlag(r, "verified_backup");
  } else {
    warn(`cat backup script: ${out.output.slice(0, 100)}`);
  }
}

// ── ARC 4: Chapter 1 — Reject NexaCorp 3 times ─────────────────────

function arc4_rejectNexacorp() {
  arc("Chapter 1 — Reject NexaCorp 3 times");
  const r = new GameRunner("home");

  step("Open offer");
  r.run("mail 3");
  expectFlag(r, "read_nexacorp_offer");
  if (!r.pendingPrompt) { fail("no prompt on offer"); return; }

  step("Reject #1 (option 2)");
  r.selectOption(2);
  expectObjective(r, "rejected_nexacorp_1");
  expectEmail(r, "nexacorp_persuasion_1");

  step("Open persuasion #1");
  // Read all new mail; the new one should be at a higher index
  for (let i = 4; i <= 6; i++) r.run(`mail ${i}`);
  if (!r.pendingPrompt) { fail("no prompt on persuasion #1"); return; }

  step("Reject #2");
  r.selectOption(2);
  expectObjective(r, "rejected_nexacorp_2");
  expectEmail(r, "nexacorp_persuasion_2");

  step("Open persuasion #2");
  for (let i = 4; i <= 7; i++) r.run(`mail ${i}`);
  if (!r.pendingPrompt) { fail("no prompt on persuasion #2"); return; }

  step("Reject final");
  r.selectOption(2);
  expectObjective(r, "rejected_nexacorp_final");

  step("Verify no nexacorp_followup arrives (dead end)");
  if (!r.deliveredEmailIds.includes("nexacorp_followup")) pass("dead end — no nexacorp_followup");
  else fail("dead end leaked nexacorp_followup email");

  step("Late-accept branch: a reply option's own story-flag trigger fires");
  // Guards selectOption's flag-trigger pass (the useSessionRouter half the
  // runner does reproduce). accepted_at_180k comes from a storyFlags trigger on
  // the reply's objective_completed event, not from the option itself.
  const r2 = new GameRunner("home");
  r2.run("mail 3");
  r2.selectOption(2);
  for (let i = 4; i <= 6; i++) r2.run(`mail ${i}`);
  r2.selectOption(2);
  for (let i = 4; i <= 7; i++) r2.run(`mail ${i}`);
  const accept = r2.selectOption(1);
  expectObjective(r2, "salary_180k");
  expectFlag(r2, "accepted_at_180k");
  if (accept.storyFlagUpdates.some((u) => u.flag === "accepted_at_180k")) pass("reply reports its flag update");
  else fail(`reply did not report the flag update: ${JSON.stringify(accept.storyFlagUpdates)}`);
}

// ── ARC 5: Chapter 2 — Edward onboarding ──────────────────────────

function arc5_edwardOnboarding() {
  arc("Chapter 2 — Edward onboarding");
  const r = new GameRunner("nexacorp");

  step("Read Edward's welcome (mail 1)");
  let out = r.run("mail 1");
  // Find welcome_edward by iterating
  if (!r.storyFlags.piper_unlocked) {
    for (let i = 1; i <= 5; i++) {
      r.run(`mail ${i}`);
      if (r.storyFlags.piper_unlocked) break;
    }
  }
  expectFlag(r, "piper_unlocked");

  step("Read onboarding docs");
  out = r.run("cat /srv/engineering/onboarding.md");
  expectFlag(r, "read_onboarding");
  expectEmail(r, "oscar_coder_setup");

  step("Read team-info");
  out = r.run("cat /srv/engineering/team-info.md");
  expectFlag(r, "read_team_info");

  step("[sim] Edward's chip_intro DM (sets chip_unlocked)");
  simulatePiperUnlocks(r, "chip_unlocked");
  expectFlag(r, "chip_unlocked");

  step("Run chip → should hit API error");
  // chip needs CHIP_API_KEY env. In headless, just check command available.
  out = r.run("chip");
  // chip is interactive; may not produce simple output. Check it doesn't 404.
  if (out.output.includes("command not found")) fail("chip command blocked even after chip_unlocked");
  else pass("chip command is available");

  step("[sim] Edward's chip_fix DM sets printenv_unlocked");
  simulatePiperUnlocks(r, "printenv_unlocked");

  step("source an unedited ~/.zshrc → must NOT tick the objective");
  out = r.run("source ~/.zshrc");
  if (out.exitCode === 0) pass("source ~/.zshrc ok");
  else fail(`source failed: ${out.output.slice(0, 100)}`);
  if (r.storyFlags.sourced_nexacorp_zshrc) {
    fail("sourced_nexacorp_zshrc set by a .zshrc that never exports CHIP_API_KEY");
  } else {
    pass("unedited .zshrc leaves the CHIP_API_KEY objective open");
  }

  step("Mistype the key in ~/.zshrc → env is set, objective stays open");
  const zshrcPath = `${r.fs.homeDir}/.zshrc`;
  const baseZshrc = r.fs.readFile(zshrcPath).content ?? "";
  r.writeFile(zshrcPath, `${baseZshrc}\nexport CHIP_API_KEY=nxa_live_7f3k9m2\n`);
  out = r.run("source ~/.zshrc");
  expectExit(out, 0, "source ~/.zshrc with a typo'd key");
  if (r.envVars.nexacorp?.CHIP_API_KEY !== "nxa_live_7f3k9m2") {
    fail("source did not apply the typo'd key to the environment");
  } else if (r.storyFlags.sourced_nexacorp_zshrc) {
    fail("a wrong CHIP_API_KEY value completed the objective");
  } else {
    pass("env set but wrong value leaves the objective open");
  }

  step("Add Edward's export line to ~/.zshrc, then source it");
  // Stands in for the nano edit Edward's DM asks for (the runner has no editor).
  r.writeFile(zshrcPath, `${baseZshrc}\nexport CHIP_API_KEY=nxa_live_7f3k9m2x\n`);
  out = r.run("source ~/.zshrc");
  expectExit(out, 0, "source ~/.zshrc after the edit");
  expectFlag(r, "sourced_nexacorp_zshrc");

  step("chip now starts, and rejects a wrong key");
  out = r.run("chip");
  if (out.exitCode === 0) pass("chip starts with the real key");
  else fail(`chip refused the real key: ${out.output.slice(0, 120)}`);
  r.envVars.nexacorp = { ...r.envVars.nexacorp, CHIP_API_KEY: "nxa_live_wrong" };
  out = r.run("chip");
  if (out.exitCode === 1 && out.output.includes("invalid API key")) pass("chip rejects a wrong key");
  else fail(`chip accepted a wrong key: exit ${out.exitCode} ${out.output.slice(0, 120)}`);
}

// ── ARC 6: Chapter 2 — Oscar log investigation ────────────────────

function arc6_oscarLogs() {
  arc("Chapter 2 — Oscar log investigation");
  const r = new GameRunner("nexacorp");
  // Pretend onboarding done
  simulatePiperUnlocks(r, "piper_unlocked", "read_onboarding", "read_team_info", "search_tools_unlocked", "tabs_unlocked");

  step("cat system.log");
  let out = r.run("cat /var/log/system.log");
  expectExit(out, 0, "cat log");
  expectFlag(r, "oscar_searched_logs");

  step("cat system.log.bak");
  out = r.run("cat /var/log/system.log.bak");
  expectFlag(r, "oscar_checked_backups");
  expectFlag(r, "found_backup_files");

  step("diff the two logs (real diff returns 1 when files differ)");
  out = r.run("diff /var/log/system.log /var/log/system.log.bak");
  // exit 1 = files differ, exit 0 = same. Either is fine for the story trigger.
  if (out.exitCode === 0 || out.exitCode === 1) pass(`diff exit ${out.exitCode}`);
  else fail(`diff unexpected exit ${out.exitCode}`);
  expectFlag(r, "oscar_diffed_logs");
  expectFlag(r, "discovered_log_tampering");

  step("Oscar's access-log pipeline (file_read from a piped, non-final command)");
  simulatePiperUnlocks(r, "processing_tools_unlocked", "inspection_tools_unlocked");
  out = r.run("sort /var/log/access.log | uniq -c | sort -rn | head");
  expectExit(out, 0, "sort | uniq -c | sort -rn | head");
  // Guards buildCtx/intermediateFileReads parity in play.ts: the read that
  // fires this flag is the FIRST command of the pipe, not the last.
  expectFlag(r, "oscar_read_access_log");
}

// ── ARC 7: Chapter 2 — Auri handoff + dbt pipeline ────────────────

async function arc7_auriDbt() {
  arc("Chapter 2 — Auri handoff + dbt pipeline");
  const r = new GameRunner("nexacorp");
  simulatePiperUnlocks(r,
    "piper_unlocked", "read_onboarding", "inspection_tools_unlocked",
    "search_tools_unlocked", "processing_tools_unlocked",
    "chip_unlocked", "coder_unlocked", "tabs_unlocked"
  );

  step("ls chen-handoff");
  let out = r.run("ls /srv/engineering/chen-handoff/");
  expectExit(out, 0, "ls handoff");
  expectFlag(r, "auri_listed_handoff");

  step("Read handoff notes");
  out = r.run("cat /srv/engineering/chen-handoff/notes.txt");
  expectFlag(r, "read_handoff_notes");

  step("Read TODO");
  out = r.run("cat /srv/engineering/chen-handoff/todo.txt");
  expectFlag(r, "auri_read_todo");

  step("head/tail/wc pipeline_runs.csv");
  out = r.run("head /srv/engineering/chen-handoff/pipeline_runs.csv");
  expectFlag(r, "auri_used_head");
  out = r.run("tail /srv/engineering/chen-handoff/pipeline_runs.csv");
  expectFlag(r, "auri_used_tail");
  out = r.run("wc /srv/engineering/chen-handoff/pipeline_runs.csv");
  expectFlag(r, "auri_used_wc");

  step("Switch to devcontainer");
  r.switchComputer("devcontainer");
  pass(`activeComputer=${r.activeComputer} cwd=${r.cwd}`);

  step("git clone nexacorp-analytics");
  out = r.run("git clone nexacorp/nexacorp-analytics");
  expectExit(out, 0, "git clone");
  expectFlag(r, "dbt_project_cloned");

  step("cd nexacorp-analytics && dbt build");
  r.run("cd nexacorp-analytics");
  out = await r.runAsync("dbt build");
  expectExit(out, 0, "dbt build");
  // Every model must materialize. A missing ctx.dbtModelOrder (see buildCtx in
  // play.ts) runs marts before their staging sources and errors 6 of them.
  if (/Done\. PASS=21 WARN=0 ERROR=0 SKIP=0 TOTAL=21/.test(out.output)) pass("dbt build: 21/21 models OK");
  else fail(`dbt build did not finish clean: ${out.output.split("\n").filter((l) => /Done\.|ERROR/.test(l)).slice(-4).join(" | ")}`);
  expectFlag(r, "ran_dbt");
}

// ── ARC 8: Chapter 2 — Side quests (Dana / Jordan / Maya) ─────────

function arc8_sideQuests() {
  arc("Chapter 2 — Side quests: Dana ops incidents");
  const r = new GameRunner("nexacorp");
  simulatePiperUnlocks(r, "piper_unlocked", "search_tools_unlocked", "processing_tools_unlocked", "chmod_unlocked");

  step("chmod 755 /srv/operations (Auri's tip), then read ops incidents");
  let out = r.run("chmod 755 /srv/operations");
  expectExit(out, 0, "chmod 755");
  out = r.run("cat /srv/operations/ops_incidents.csv");
  expectExit(out, 0, "cat ops_incidents");
  expectFlag(r, "read_ops_incidents");
}

// ── ARC 9: Chapter 2 — End of Day 1 → shutdown ────────────────────

function arc9_endOfDay1() {
  arc("Chapter 2 — End of Day 1, head home, shutdown");
  const r = new GameRunner("nexacorp");
  // Simulate the two prereqs that can only come from a Piper reply: both
  // oscar_access_reported and auri_dbt_reported are emitted by every reply
  // option on their deliveries, and piper sessions aren't drivable headlessly.
  simulatePiperUnlocks(r,
    "piper_unlocked", "read_onboarding",
    "oscar_access_completed", "auri_dbt_reported",
    "discovered_log_tampering", "found_chip_directives",
    "search_tools_unlocked", "inspection_tools_unlocked", "processing_tools_unlocked",
    "tabs_unlocked"
  );

  step("Read team-info.md (the third edward_end_of_day prereq)");
  // edward_end_of_day's trigger is after_story_flag auri_dbt_reported with
  // requiredFlags [read_team_info, oscar_access_completed]. read_team_info is
  // earnable headlessly, so earn it rather than poking the flag.
  let out = r.run("cat /srv/engineering/team-info.md");
  expectExit(out, 0, "cat team-info.md");
  expectFlag(r, "read_team_info");

  // after_story_flag triggers are re-evaluated by the delivery pass that
  // computeEffects runs on every command, so any command delivers it.
  r.run("ls");
  if (r.deliveredEmailIds.includes("edward_end_of_day")) {
    pass("edward_end_of_day delivered once all three prereqs hold");
  } else {
    // Not a warn: this email gates the whole Day 1 -> Day 2 transition
    // (isEndOfDayExit reads read_end_of_day), so losing it is a hard soft-lock.
    fail("edward_end_of_day not delivered with read_team_info + oscar_access_completed + auri_dbt_reported set");
  }

  step("Exit NexaCorp (return home)");
  out = r.run("exit");
  // exit returns transitionTo: home, sets returned_home_day1 via simulated transition
  if (out.output) pass(`exit produced output (${out.output.length} bytes)`);
  // The home transition is handled by useComputerTransitions in real game; here we
  // manually flip the flag and switch computer.
  simulatePiperUnlocks(r, "returned_home_day1");
  r.switchComputer("home");

  step("Shutdown at home");
  out = r.run("shutdown -h now");
  // Immediate shutdown emits its completion event without a background timer.
  if (out.exitCode === 0) pass("immediate shutdown command accepted");
  else fail(`shutdown rejected: ${out.output.slice(0, 200)}`);
  // The day1_shutdown flag is set via the command_executed: shutdown trigger
  expectFlag(r, "day1_shutdown");
  expectFlag(r, "anon_tip_quest_started");
}

// ── ARC 10: Chapter 3 — Anonymous USB tip + mount ─────────────────

function arc10_usbTip() {
  arc("Chapter 3 — Anonymous USB tip (accept branch)");
  const r = new GameRunner("home");
  simulatePiperUnlocks(r,
    "basic_tools_unlocked", "apt_unlocked", "ssh_unlocked",
    "day1_shutdown", "returned_home_day1", "anon_tip_quest_started",
    "accepted_usb_drive", // simulate piper reply
  );

  step("lsblk should show /dev/sdb");
  let out = r.run("lsblk");
  if (out.exitCode === 0) {
    if (out.output.includes("sdb") || out.output.includes("usb")) pass("lsblk shows USB");
    else fail(`lsblk doesn't show USB: ${out.output.slice(0, 200)}`);
  } else {
    fail(`lsblk blocked: ${out.output.slice(0, 200)}`);
  }
  expectFlag(r, "ran_lsblk_for_usb");

  step("mount /dev/sdb1 /mnt/usb");
  // First need to ensure /mnt/usb exists
  r.run("mkdir -p /mnt/usb");
  out = r.run("mount /dev/sdb1 /mnt/usb");
  if (out.exitCode === 0) pass("mount succeeded");
  else fail(`mount failed: ${out.output.slice(0, 200)}`);
  expectFlag(r, "mounted_usb_drive");

  step("Read note.txt");
  out = r.run("cat /mnt/usb/note.txt");
  if (out.exitCode === 0) {
    expectFlag(r, "read_usb_note");
    pass(`note preview: ${out.output.slice(0, 80)}`);
  } else {
    fail(`note.txt not readable: ${out.output.slice(0, 200)}`);
  }
}

// ── ARC 11: Chapter 3 — Day 2 Auri pipeline fix ───────────────────

async function arc11_pipelineFix() {
  arc("Chapter 3 — Day 2 Auri pipeline fix");
  const r = new GameRunner("nexacorp");
  // Simulate Day 2 state, reaching the repo by a live `git clone` rather than a
  // checkpoint. ARC 16 covers the same chain entered via `cheat 3`, where the
  // repo comes from the checkpoint builder instead.
  simulatePiperUnlocks(r,
    "piper_unlocked", "read_onboarding", "tabs_unlocked",
    "chip_unlocked", "coder_unlocked",
    "search_tools_unlocked", "inspection_tools_unlocked", "processing_tools_unlocked",
    "day1_shutdown", "returned_home_day1", "ssh_day2",
  );
  r.switchComputer("devcontainer");
  // Fresh clone to ensure a real .git
  r.run("git clone nexacorp/nexacorp-analytics");

  step("cd to repo and git pull");
  r.run("cd nexacorp-analytics");
  let out = r.run("git pull");
  expectExit(out, 0, "git pull");
  // pulled_day2_updates is set by the git pull handler
  expectFlag(r, "pulled_day2_updates");

  step("dbt test → expect failure");
  out = await r.runAsync("dbt test");
  // The Day 2 pipeline ships with a failing conversion_rate test
  if (/FAIL\s+not_null_rpt_campaign_performance_conversion_rate/.test(out.output)) {
    pass("dbt test reports the conversion_rate failure");
  } else {
    fail(`dbt test did not report the expected failure: ${out.output.slice(-200)}`);
  }
  expectFlag(r, "dbt_test_failed_day2");

  step("git checkout -b fix/null-data");
  out = r.run("git checkout -b fix/null-data");
  expectExit(out, 0, "git checkout -b");
  expectFlag(r, "created_fix_branch");

  step("Edit campaign model to fix NULL data");
  // The model Auri names in her DM. Ground truth for the broken/fixed
  // conversion_rate lines: story/data/dbt/__tests__/day2Quest.test.ts.
  const modelPath = `${r.fs.homeDir}/nexacorp-analytics/models/marts/rpt_campaign_performance.sql`;
  out = r.run("cat models/marts/rpt_campaign_performance.sql");
  expectExit(out, 0, "read rpt_campaign_performance");
  const broken = "round(sum(conversions) * 100.0 / nullif(sum(clicks), 0), 2) as conversion_rate";
  const fixed = "coalesce(round(sum(conversions) * 100.0 / nullif(sum(clicks), 0), 2), 0) as conversion_rate";
  const modelSql = r.fs.readFile(modelPath).content ?? "";
  if (modelSql.includes(broken)) pass("model carries the broken conversion_rate line");
  else fail(`model does not contain the expected broken line: ${modelSql.slice(0, 200)}`);
  // The COALESCE fix (what Chip's fix_campaign_model menu item applies).
  r.writeFile(modelPath, modelSql.replace(broken, fixed));

  step("dbt build then dbt test → green");
  out = await r.runAsync("dbt build");
  expectExit(out, 0, "dbt build after fix");
  out = await r.runAsync("dbt test");
  const testOut = out.output;
  if (/PASS\s+not_null_rpt_campaign_performance_conversion_rate/.test(testOut)) {
    pass("conversion_rate test passes after the fix");
  } else {
    fail(`conversion_rate test not green: ${testOut.split("\n").filter((l) => l.includes("conversion_rate")).join(" | ").slice(0, 200)}`);
  }
  expectFlag(r, "fixed_campaign_model");

  step("git push fix branch");
  out = r.run("git push -u origin fix/null-data");
  expectExit(out, 0, "git push");
  expectFlag(r, "pushed_fix_branch");
}

// ── ARC 12: Chapter 3 — Edward Chip plugin build ──────────────────

function arc12_pluginBuild() {
  arc("Chapter 3 — Edward Chip plugin build (chipinfra)");
  const r = new GameRunner("nexacorp");
  simulatePiperUnlocks(r,
    "piper_unlocked", "chip_unlocked", "coder_unlocked", "tabs_unlocked",
    "day1_shutdown", "returned_home_day1", "ssh_day2",
    "unlock_chip_plugin_development",
    "accepted_edward_plugin_request",
  );
  r.switchComputer("chipinfra");

  step("Verify chipinfra FS exists");
  let out = r.run("pwd");
  expectExit(out, 0, "pwd");
  pass(`cwd=${r.cwd}`);

  step("ls /opt/chip/plugins");
  out = r.run("ls /opt/chip/plugins");
  expectExit(out, 0, "ls plugins");
  if (out.output.includes("ticket-triage") || out.output.includes("system-monitor")) {
    pass("plugins directory seeded");
  } else {
    fail(`plugins not seeded: ${out.output.slice(0, 200)}`);
  }

  step("Read existing plugin SKILL.md (found_chip_directives back-fill)");
  out = r.run("cat /opt/chip/plugins/system-monitor/SKILL.md");
  expectExit(out, 0, "read SKILL.md");
  expectFlag(r, "found_chip_directives");
  expectFlag(r, "read_plugin_template");

  step("Read cleanup script (found_cleanup_script back-fill)");
  out = r.run("cat /opt/chip/plugins/log-maintenance/cleanup.sh");
  expectExit(out, 0, "read cleanup.sh");
  expectFlag(r, "found_cleanup_script");

  step("Create plugin dir");
  out = r.run("mkdir /opt/chip/plugins/my-plugin");
  expectExit(out, 0, "mkdir my-plugin");
  expectFlag(r, "created_chip_plugin_dir");

  step("Write plugin.json (file_created via redirect)");
  out = r.run("echo '{}' > /opt/chip/plugins/my-plugin/plugin.json");
  expectExit(out, 0, "write plugin.json");
  expectFlag(r, "wrote_plugin_manifest");

  step("Write SKILL.md (file_created via redirect)");
  out = r.run("echo '# my-plugin' > /opt/chip/plugins/my-plugin/SKILL.md");
  expectExit(out, 0, "write SKILL.md");
  expectFlag(r, "wrote_plugin_skill");
}

// ── ARC 13: Chapter 3 — Loose Thread (chipinfra → erik-pc) ────────

function arc13_looseThread() {
  arc("Chapter 3 — Loose Thread: chipinfra → erik-pc pivot");
  const r = new GameRunner("nexacorp");
  simulatePiperUnlocks(r,
    "piper_unlocked", "chip_unlocked", "coder_unlocked", "tabs_unlocked",
    "day1_shutdown", "returned_home_day1", "ssh_day2",
    "unlock_chip_plugin_development",
    "accepted_usb_drive", "mounted_usb_drive", "read_usb_note",
  );
  r.switchComputer("chipinfra");
  // The cross-arc cascade — visiting chipinfra after read_usb_note — would
  // normally be handled by useComputerTransitions. Simulate it.
  simulatePiperUnlocks(r, "chipinfra_visited", "loose_thread_quest_started");

  step("ls /tmp");
  let out = r.run("ls /tmp");
  expectExit(out, 0, "ls /tmp");
  if (out.output.includes("ssh-mZ4xPq")) pass("ssh socket dir visible");
  else fail(`ssh-mZ4xPq missing: ${out.output.slice(0, 200)}`);

  step("cat /tmp/ssh-mZ4xPq/.user-erik");
  out = r.run("cat /tmp/ssh-mZ4xPq/.user-erik");
  expectExit(out, 0, "read marker");
  expectFlag(r, "cat_erik_socket_marker");

  step("export SSH_AUTH_SOCK");
  out = r.run("export SSH_AUTH_SOCK=/tmp/ssh-mZ4xPq/agent.18472");
  expectExit(out, 0, "export sock");
  expectFlag(r, "exported_erik_ssh_auth_sock");

  step("ssh-add -l should show Erik's keys");
  out = r.run("ssh-add -l");
  if (out.exitCode === 0) {
    if (out.output.toLowerCase().includes("erik")) pass("ssh-add lists Erik's keys");
    else fail(`ssh-add output missing 'erik': ${out.output.slice(0, 200)}`);
  } else {
    fail(`ssh-add failed: ${out.output.slice(0, 200)}`);
  }
  expectFlag(r, "ran_ssh_add_erik");

  step("ssh erik@nexacorp-lt05 (would start session)");
  out = r.run("ssh erik@nexacorp-lt05");
  if (out.sshSessionStarted) pass("ssh erik session started");
  else if (out.output.includes("fingerprint") || out.output.includes("authenticity")) {
    pass(`fingerprint prompt shown: ${out.output.slice(0, 120)}`);
  } else {
    fail(`ssh erik failed: ${out.output.slice(0, 300)}`);
  }
}

// ── ARC 14: Marcus endgame — accuse each suspect ──────────────────

function arc14_marcusEndgame(suspect: "edward" | "sarah" | "erik" | "nobody") {
  arc(`Chapter 3 endgame — accuse ${suspect}`);
  const r = new GameRunner("nexacorp");
  // The marcus_endgame_opening DM is triggered after_story_flag: reported_plugin_to_edward
  simulatePiperUnlocks(r,
    "piper_unlocked", "chip_unlocked", "coder_unlocked", "tabs_unlocked",
    "search_tools_unlocked", "inspection_tools_unlocked", "processing_tools_unlocked",
    "day1_shutdown", "returned_home_day1", "ssh_day2",
    "discovered_log_tampering", "found_chip_directives", "found_cleanup_script",
    "reported_plugin_to_edward",
    `accused_${suspect}`, "accusation_made",
  );

  step("Verify accusation flag set");
  expectFlag(r, `accused_${suspect}`);
  expectFlag(r, "accusation_made");

  // Simulate marcus_reaction_<suspect> reply → chapter_3_complete
  simulatePiperUnlocks(r, "chapter_3_complete");
  expectFlag(r, "chapter_3_complete");

  step("exit at NexaCorp wraps Day 2");
  // The exit builtin emits command_executed: exit_day2_logoff when accusation_made
  let out = r.run("exit");
  if (out.exitCode === 0 || out.output.length > 0) pass("exit returned");
  else fail(`exit failed: ${out.output.slice(0, 200)}`);
  if (r.storyFlags.returned_home_day2) pass("returned_home_day2 set");
  else warn("returned_home_day2 not auto-set (transition handler missing in headless)");

  step("Switch to home and read marcus_board_debrief");
  // Simulate
  simulatePiperUnlocks(r, "returned_home_day2");
  r.switchComputer("home");
  // The email is delivered when storyFlags include accusation_made && returned_home_day2
  // checkEmailDeliveries runs on every command — trigger by `ls`
  r.run("ls");
  expectEmail(r, "marcus_board_debrief");

  step("Open marcus_board_debrief via mail");
  // Find by index — debrief is delivered late; iterate
  for (let i = 1; i <= 15; i++) {
    out = r.run(`mail ${i}`);
    if (r.storyFlags.read_board_debrief_day2) {
      pass(`debrief opened at mail ${i}`);
      break;
    }
  }
  expectFlag(r, "read_board_debrief_day2");

  step("shutdown → endgame credits");
  out = r.run("shutdown -h now");
  if (out.exitCode === 0) {
    pass("shutdown accepted at endgame");
  } else {
    fail(`shutdown rejected at endgame: ${out.output.slice(0, 200)}`);
  }
  // game_ended flag is set by the React transition handler, not the command itself.
  // Check at least that endgame credits are produced via incrementalLines
}

// ── ARC 15: Security tripwires ────────────────────────────────────

function arc15_securityTripwires() {
  arc("Security tripwires — 3 termination kinds");

  /**
   * Every tripwire ends the same way in the real game: computeEffects turns the
   * violation into terminationReason + a forced route back to home. The runner
   * reports both on CommandOutput (the cinematic itself is React-side).
   */
  function expectTripwire(command: string, kind: string) {
    step(`${kind}: ${command}`);
    const r = new GameRunner("nexacorp");
    simulatePiperUnlocks(r, "piper_unlocked", "search_tools_unlocked");
    const out = r.run(command);
    if (out.terminationReason?.kind === kind) pass(`tripwire fired: ${kind} on ${out.terminationReason.path}`);
    else fail(`no ${kind} tripwire for \`${command}\`: reason=${out.terminationReason?.kind ?? "none"} out=${out.output.slice(0, 120)}`);
    if (out.transitionTo === "home") pass("terminated session routes back to home");
    else fail(`expected transitionTo home, got ${out.transitionTo ?? "none"}`);
  }

  expectTripwire("rm /var/log/system.log", "log_tampering");
  expectTripwire("echo wiped > /var/log/system.log", "log_tampering");
  expectTripwire("rm -rf /srv/leadership", "leadership_destruction");
  // Must be recursive: /srv/leadership is drwx------, so a single-file cp can't
  // even stat its way in and never reaches the tripwire.
  expectTripwire("cp -r /srv/leadership /home/ren/", "exfiltration");
}

// ── ARC 16: `cheat 3` → the whole Day 2 git fix chain ─────────────

/**
 * The playtester's own entry point. ARC 11 reaches the same quest by hand-setting
 * flags and re-cloning, which hides two things this arc pins:
 *
 *  1. The checkpoint's repo is a REAL repo. `cheat 3` sets dbt_project_cloned, so
 *     the working tree comes from the checkpoint builder rather than from a live
 *     `git clone`. It used to arrive without a `.git`, which left `git pull` (and
 *     therefore the entire Day 2 quest) dead on arrival for anyone who cheated in.
 *  2. `git commit` is on the path. ARC 11 goes straight from editing the model to
 *     `git push`, so nothing exercises add → commit against the cloned repo.
 */
async function arc16_cheatDay2GitChain() {
  arc("Day 2 fix chain from `cheat 3` (checkpoint repo, incl. commit)");
  const r = new GameRunner("nexacorp");

  step("cheat 3 → day2-start");
  let out = r.run("cheat 3");
  expectExit(out, 0, "cheat 3");
  r.switchComputer("devcontainer");

  step("the checkpoint's repo is a working git checkout");
  out = r.run("cd nexacorp-analytics");
  expectExit(out, 0, "cd nexacorp-analytics");
  out = r.run("git status");
  expectExit(out, 0, "git status");
  if (/On branch main/.test(out.output) && /working tree clean/.test(out.output)) {
    pass("clean checkout on main (checkpoint shipped a real .git)");
  } else {
    fail(`checkpoint repo is not a clean main checkout: ${out.output.slice(0, 200)}`);
  }

  step("git pull");
  out = r.run("git pull");
  expectExit(out, 0, "git pull");
  expectFlag(r, "pulled_day2_updates");

  step("dbt test → the conversion_rate failure that motivates the branch");
  out = await r.runAsync("dbt test");
  expectFlag(r, "dbt_test_failed_day2");

  step("git checkout -b fix/null-data");
  out = r.run("git checkout -b fix/null-data");
  expectExit(out, 0, "git checkout -b");
  // Gated on dbt_test_failed_day2: you branch after you find the bug, not before.
  expectFlag(r, "created_fix_branch");

  step("apply the COALESCE fix and go green");
  const modelPath = `${r.fs.homeDir}/nexacorp-analytics/models/marts/rpt_campaign_performance.sql`;
  const broken = "round(sum(conversions) * 100.0 / nullif(sum(clicks), 0), 2) as conversion_rate";
  const fixed = `coalesce(${broken.replace(" as conversion_rate", "")}, 0) as conversion_rate`;
  const modelSql = r.fs.readFile(modelPath).content ?? "";
  if (modelSql.includes(broken)) pass("checkpoint model carries the broken line");
  else fail(`checkpoint model missing the broken line: ${modelSql.slice(0, 200)}`);
  r.writeFile(modelPath, modelSql.replace(broken, fixed));
  await r.runAsync("dbt build");
  out = await r.runAsync("dbt test");
  expectFlag(r, "fixed_campaign_model");

  step("git add + git commit (the step ARC 11 skips)");
  out = r.run("git status");
  if (/modified:\s+models\/marts\/rpt_campaign_performance\.sql/.test(out.output)) {
    pass("edit shows as an unstaged modification");
  } else {
    fail(`edit not seen as modified: ${out.output.slice(0, 200)}`);
  }
  out = r.run("git add models/marts/rpt_campaign_performance.sql");
  expectExit(out, 0, "git add");
  out = r.run('git commit -m "fix: coalesce null conversion_rate"');
  expectExit(out, 0, "git commit");
  if (/\[fix\/null-data [0-9a-f]+\]/.test(out.output)) pass("commit lands on fix/null-data");
  else fail(`commit output has no branch/sha header: ${out.output.slice(0, 200)}`);
  out = r.run("git log --oneline");
  if (/fix: coalesce null conversion_rate/.test(out.output.split("\n")[0])) {
    pass("the fix is the new HEAD commit");
  } else {
    fail(`fix commit is not at HEAD: ${out.output.split("\n")[0]}`);
  }

  step("git push -u origin fix/null-data");
  out = r.run("git push -u origin fix/null-data");
  expectExit(out, 0, "git push");
  expectFlag(r, "pushed_fix_branch");
  out = r.run("git status");
  if (/up to date with 'origin\/fix\/null-data'/.test(out.output) && /working tree clean/.test(out.output)) {
    pass("branch tracks its pushed remote with a clean tree");
  } else {
    fail(`post-push status wrong: ${out.output.slice(0, 200)}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("Termoil - Multi-Arc Playtest\n");
  arc1_homeMainPath();
  arc2_oliveChallenges();
  arc3_backupQuest();
  arc4_rejectNexacorp();
  arc5_edwardOnboarding();
  arc6_oscarLogs();
  await arc7_auriDbt();
  arc8_sideQuests();
  arc9_endOfDay1();
  arc10_usbTip();
  await arc11_pipelineFix();
  arc12_pluginBuild();
  arc13_looseThread();
  arc14_marcusEndgame("edward");
  arc14_marcusEndgame("sarah");
  arc14_marcusEndgame("erik");
  arc14_marcusEndgame("nobody");
  arc15_securityTripwires();
  await arc16_cheatDay2GitChain();

  console.log(`\n${"═".repeat(70)}\n  RESULTS\n${"═".repeat(70)}`);
  console.log(`  Passes:   ${totalPass}`);
  console.log(`  Failures: ${totalFail}`);
  console.log(`  Warnings: ${totalWarn}`);
  if (failures.length > 0) {
    console.log(`\n  Failures by arc:`);
    for (const f of failures) {
      console.log(`    [${f.arc}]  ${f.msg}`);
    }
  }
  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
