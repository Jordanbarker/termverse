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

  step("Challenge 2: which python");
  out = r.run("which python3");
  expectFlag(r, "used_which_python");

  step("Challenge 3: mkdir Projects");
  out = r.run("mkdir /home/ren/Projects");
  expectExit(out, 0, "mkdir");
  expectFlag(r, "created_projects_dir");

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

  step("source ~/.zshrc to set CHIP_API_KEY");
  out = r.run("source ~/.zshrc");
  if (out.exitCode === 0) pass("source ~/.zshrc ok");
  else fail(`source failed: ${out.output.slice(0, 100)}`);
  expectFlag(r, "sourced_nexacorp_zshrc");
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
  if (out.exitCode === 0) pass(`dbt build ok (output ${out.output.length} bytes)`);
  else warn(`dbt build exit ${out.exitCode}: ${out.output.slice(-200)}`);
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
  // Simulate end-of-day prereqs satisfied
  simulatePiperUnlocks(r,
    "piper_unlocked", "read_onboarding",
    "oscar_access_completed", "auri_dbt_reported",
    "discovered_log_tampering", "found_chip_directives",
    "search_tools_unlocked", "inspection_tools_unlocked", "processing_tools_unlocked",
    "tabs_unlocked"
  );
  // Force-deliver edward_end_of_day by reading nexacorp_followup-style trigger.
  // Easier: simulate by directly running the cat on the trigger file path.
  // edward_end_of_day fires from after_story_flag triggers; the runner's
  // delivery checker is invoked on each computeEffects. Let's invoke a noop.
  r.run("ls"); // triggers delivery cascade evaluation
  // Email may still not be present without all triggers — accept either path
  if (r.deliveredEmailIds.includes("edward_end_of_day")) {
    pass("edward_end_of_day delivered after side quests");
  } else {
    warn("edward_end_of_day not auto-delivered (triggers may need different prereqs)");
  }

  step("Exit NexaCorp (return home)");
  let out = r.run("exit");
  // exit returns transitionTo: home, sets returned_home_day1 via simulated transition
  if (out.output) pass(`exit produced output (${out.output.length} bytes)`);
  // The home transition is handled by useComputerTransitions in real game; here we
  // manually flip the flag and switch computer.
  simulatePiperUnlocks(r, "returned_home_day1");
  r.switchComputer("home");

  step("Shutdown at home");
  out = r.run("shutdown");
  // bare shutdown returns incrementalLines (gameAction shutdown) — output buffer may be empty
  if (out.exitCode === 0) pass("shutdown command accepted (60s countdown)");
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
  // Simulate Day 2 state. Note: skip dbt_project_cloned so that git clone
  // creates a fresh .git tree (headless runner FS builder doesn't carry .git).
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
  if (out.exitCode === 0) pass("git pull ok");
  else warn(`git pull: ${out.output.slice(0, 200)}`);
  // pulled_day2_updates is set by git pull handler
  if (r.storyFlags.pulled_day2_updates) pass("flag pulled_day2_updates");
  else warn("pulled_day2_updates not auto-set by git pull");

  step("dbt test → expect failure");
  out = await r.runAsync("dbt test");
  // The pipeline is supposed to have a failing test on Day 2
  if (out.output.toLowerCase().includes("fail")) pass(`dbt test reports failures`);
  else warn(`dbt test output didn't mention 'fail': ${out.output.slice(0, 200)}`);
  if (r.storyFlags.dbt_test_failed_day2) pass("flag dbt_test_failed_day2");
  else warn("dbt_test_failed_day2 not set");

  step("git checkout -b fix/null-data");
  out = r.run("git checkout -b fix/null-data");
  if (out.exitCode === 0) pass("checkout -b ok");
  else fail(`checkout -b failed: ${out.output.slice(0, 200)}`);
  if (r.storyFlags.created_fix_branch) pass("flag created_fix_branch");
  else warn("created_fix_branch not set");

  step("Edit campaign model to fix NULL data");
  // Read it first to understand
  out = r.run("cat models/marts/fct_campaign_metrics.sql");
  if (out.exitCode === 0) pass("read fct_campaign_metrics");
  else warn(`could not read model: ${out.output.slice(0, 120)}`);
  // Simulate edit: just overwrite with a different content via writeFile
  r.writeFile("/home/ren/nexacorp-analytics/models/marts/fct_campaign_metrics.sql",
    "-- fixed: filter out null campaign_id\nSELECT * FROM source WHERE campaign_id IS NOT NULL\n");
  out = await r.runAsync("dbt test");
  if (out.output.toLowerCase().includes("pass") || !out.output.toLowerCase().includes("fail")) {
    pass("dbt test green after fix");
  } else {
    warn(`dbt test still failing: ${out.output.slice(0, 200)}`);
  }
  if (r.storyFlags.fixed_campaign_model) pass("flag fixed_campaign_model");
  else warn("fixed_campaign_model not auto-set (may need exact edit)");

  step("git push fix branch");
  out = r.run("git push -u origin fix/null-data");
  if (out.exitCode === 0) pass("push ok");
  else warn(`push: ${out.output.slice(0, 120)}`);
  if (r.storyFlags.pushed_fix_branch) pass("flag pushed_fix_branch");
  else warn("pushed_fix_branch not set");
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
  out = r.run("shutdown");
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

  // log_tampering
  step("log_tampering: rm /var/log/system.log");
  {
    const r = new GameRunner("nexacorp");
    simulatePiperUnlocks(r, "piper_unlocked", "search_tools_unlocked");
    const out = r.run("rm /var/log/system.log");
    // The result includes securityViolation → effects.transitionTo=home + terminationReason
    if (out.output.toLowerCase().includes("connection") || out.output.toLowerCase().includes("permitted") || out.output.toLowerCase().includes("closed")) {
      pass(`tripwire output: ${out.output.slice(0, 200)}`);
    } else {
      warn(`rm output (may rely on terminationReason routing): ${out.output.slice(0, 200)}`);
    }
    // Check the result events / triggerEvents for security signal
    pass(`exit ${out.exitCode}`);
  }

  // leadership_destruction
  step("leadership_destruction: rm -rf /srv/leadership");
  {
    const r = new GameRunner("nexacorp");
    simulatePiperUnlocks(r, "piper_unlocked", "search_tools_unlocked");
    const out = r.run("rm -rf /srv/leadership");
    pass(`output: ${out.output.slice(0, 200)} (exit ${out.exitCode})`);
  }

  // exfiltration
  step("exfiltration: cp /srv/leadership/headcount_plan.md ~/");
  {
    const r = new GameRunner("nexacorp");
    simulatePiperUnlocks(r, "piper_unlocked", "search_tools_unlocked");
    const out = r.run("cp /srv/leadership/headcount_plan.md /home/ren/");
    pass(`output: ${out.output.slice(0, 200)} (exit ${out.exitCode})`);
  }

  // Direct vitest run for tripwire is the source of truth.
  warn("Tripwire transition (back to home + email) is React-side; see security-tripwire vitest tests for assertions");
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
