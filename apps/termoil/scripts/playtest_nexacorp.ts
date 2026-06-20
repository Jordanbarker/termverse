#!/usr/bin/env npx tsx
/**
 * NexaCorp Phase Playtest — DATA accuracy focus (dbt, snowflake, logs)
 *
 * Tests the NexaCorp workstation phase by exercising filesystem, mail,
 * dbt, and snow sql commands. Reports all output for review.
 */

// Must mock localStorage BEFORE any imports that use it
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

function section(title: string) {
  console.log("\n" + "=".repeat(72));
  console.log(`  ${title}`);
  console.log("=".repeat(72));
}

function cmd(runner: GameRunner, command: string) {
  console.log(`\n$ ${command}`);
  console.log("-".repeat(60));
  const result = runner.run(command);
  if (result.output) {
    console.log(result.output);
  } else {
    console.log("(no output)");
  }
  if (result.exitCode !== 0) {
    console.log(`[EXIT CODE: ${result.exitCode}]`);
  }
  if (result.newEmails.length > 0) {
    console.log(`[NEW EMAILS DELIVERED: ${result.newEmails.join(", ")}]`);
  }
  if (result.storyFlagUpdates.length > 0) {
    console.log(`[STORY FLAGS: ${result.storyFlagUpdates.map(f => `${f.flag}=${f.value}`).join(", ")}]`);
  }
  if (result.promptPending) {
    console.log(`[PROMPT PENDING]`);
  }
  return result;
}

async function cmdAsync(runner: GameRunner, command: string) {
  console.log(`\n$ ${command}`);
  console.log("-".repeat(60));
  const result = await runner.runAsync(command);
  if (result.output) {
    console.log(result.output);
  } else {
    console.log("(no output)");
  }
  if (result.exitCode !== 0) {
    console.log(`[EXIT CODE: ${result.exitCode}]`);
  }
  if (result.newEmails.length > 0) {
    console.log(`[NEW EMAILS DELIVERED: ${result.newEmails.join(", ")}]`);
  }
  if (result.storyFlagUpdates.length > 0) {
    console.log(`[STORY FLAGS: ${result.storyFlagUpdates.map(f => `${f.flag}=${f.value}`).join(", ")}]`);
  }
  return result;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("NexaCorp Playtest — DATA Accuracy Check");
  console.log("========================================\n");

  // Create runner on home, set story flags, switch to nexacorp
  const runner = new GameRunner("home");
  runner.storyFlags = {
    read_resume: true,
  };
  console.log(`Home runner created. Username: ${runner.username}`);
  console.log(`Story flags set: ${JSON.stringify(runner.storyFlags)}`);

  runner.switchComputer("nexacorp");
  console.log(`Switched to nexacorp. CWD: ${runner.cwd}`);
  console.log(`Active computer: ${runner.activeComputer}`);

  // ── 1. Filesystem Exploration ──────────────────────────────────────

  section("1. FILESYSTEM EXPLORATION");

  cmd(runner, "ls");
  cmd(runner, "ls Documents");
  cmd(runner, "ls /srv/engineering/chen-handoff");
  cmd(runner, "ls scripts");
  cmd(runner, "ls -la");

  // ── 2. Key Files ───────────────────────────────────────────────────

  section("2. KEY FILES — onboarding, team-info");

  cmd(runner, "cat /srv/engineering/onboarding.md");
  cmd(runner, "cat /srv/engineering/team-info.md");

  // ── 3. Jin Chen Handoff Files ───────────────────────────────────────

  section("3. J. CHEN HANDOFF FILES");

  cmd(runner, "cat /srv/engineering/chen-handoff/README.md");
  cmd(runner, "cat /srv/engineering/chen-handoff/notes.txt");
  cmd(runner, "cat /srv/engineering/chen-handoff/tools.md");
  cmd(runner, "cat /srv/engineering/chen-handoff/todo.txt");

  // ── 4. System Logs ─────────────────────────────────────────────────

  section("4. SYSTEM LOGS");

  cmd(runner, "cat /var/log/system.log");
  cmd(runner, "cat /var/log/system.log.bak");
  cmd(runner, "cat /var/log/auth.log.bak");
  cmd(runner, "cat /var/log/chip-activity.log");

  // Log comparison — diff
  cmd(runner, "diff /var/log/system.log /var/log/system.log.bak");

  // ── 5. Chip Config & Internal ──────────────────────────────────────

  section("5. CHIP CONFIG & INTERNAL FILES");

  cmd(runner, "cat /opt/chip/config/settings.json");
  cmd(runner, "cat /opt/chip/.internal/directives.txt");
  cmd(runner, "cat /opt/chip/.internal/cleanup.sh");
  cmd(runner, "cat /opt/chip/README.md");

  // ── 6. Chip Cache (story flag dependent) ───────────────────────────

  section("6. CHIP CACHE FILES (should exist since story flags are set)");

  cmd(runner, "ls /opt/chip/cache/");
  cmd(runner, "cat /opt/chip/cache/candidate_profile.txt");
  cmd(runner, "cat /opt/chip/cache/sentiment_analysis.txt");

  // ── 7. Jin Chen Home Directory ──────────────────────────────────────

  section("7. J. CHEN HOME DIRECTORY");

  cmd(runner, "ls /home/jchen");
  cmd(runner, "ls -la /home/jchen");
  cmd(runner, "cat /home/jchen/.zsh_history");
  cmd(runner, "cat /home/jchen/.private/evidence.txt");

  // ── 8. Mail ────────────────────────────────────────────────────────

  section("8. NEXACORP MAIL");

  cmd(runner, "mail");

  // Read each email (1-indexed)
  for (let i = 1; i <= 5; i++) {
    cmd(runner, `mail ${i}`);
  }

  // ── 9. dbt Project Structure ───────────────────────────────────────

  section("9. DBT PROJECT STRUCTURE");

  cmd(runner, "ls nexacorp-analytics");
  cmd(runner, "ls nexacorp-analytics/models");
  cmd(runner, "ls nexacorp-analytics/models/staging");
  cmd(runner, "ls nexacorp-analytics/models/intermediate");
  cmd(runner, "ls nexacorp-analytics/models/marts");
  cmd(runner, "ls nexacorp-analytics/tests");
  cmd(runner, "ls nexacorp-analytics/macros");
  cmd(runner, "ls nexacorp-analytics/seeds");

  // ── 10. dbt Model SQL Files ────────────────────────────────────────

  section("10. KEY DBT MODEL SQL FILES");

  // Mart models (the filtered ones)
  cmd(runner, "cat nexacorp-analytics/models/marts/fct_system_events.sql");
  cmd(runner, "cat nexacorp-analytics/models/marts/fct_support_tickets.sql");
  cmd(runner, "cat nexacorp-analytics/models/marts/dim_employees.sql");
  cmd(runner, "cat nexacorp-analytics/models/marts/rpt_employee_directory.sql");
  cmd(runner, "cat nexacorp-analytics/models/marts/rpt_ai_performance.sql");
  cmd(runner, "cat nexacorp-analytics/models/marts/rpt_department_spending.sql");

  // dbt_project.yml and profiles
  cmd(runner, "cat nexacorp-analytics/dbt_project.yml");
  cmd(runner, "cat nexacorp-analytics/profiles.yml");

  // Test files
  cmd(runner, "cat nexacorp-analytics/tests/assert_employee_count.sql");
  cmd(runner, "cat nexacorp-analytics/tests/assert_all_tickets_in_directory.sql");

  // ── 11. dbt run & test ─────────────────────────────────────────────
  // Need to cd into the dbt project directory first
  section("11. DBT RUN (from ~/nexacorp-analytics)");
  cmd(runner, "cd nexacorp-analytics");
  await cmdAsync(runner, "dbt run");

  section("12. DBT TEST");
  await cmdAsync(runner, "dbt test");

  // ── 13. dbt show & compile ─────────────────────────────────────────

  section("13. DBT SHOW & COMPILE");

  await cmdAsync(runner, "dbt show --select dim_employees");
  await cmdAsync(runner, "dbt show --select fct_support_tickets");
  await cmdAsync(runner, "dbt show --select fct_system_events");
  await cmdAsync(runner, "dbt show --select rpt_ai_performance");
  await cmdAsync(runner, "dbt show --select rpt_employee_directory");
  await cmdAsync(runner, "dbt show --select rpt_department_spending");
  await cmdAsync(runner, "dbt compile --select fct_support_tickets");
  await cmdAsync(runner, "dbt compile --select fct_system_events");

  // cd back to home for snow sql
  cmd(runner, "cd ~");

  // ── 14. Snowflake SQL Queries ──────────────────────────────────────

  section("14. SNOWFLAKE SQL QUERIES");

  // First, try USE DATABASE to set context correctly
  cmd(runner, 'snow sql -q "USE DATABASE NEXACORP_PROD"');
  cmd(runner, 'snow sql -q "USE SCHEMA RAW_NEXACORP"');

  // Basic table queries (try both: with USE and fully-qualified)
  cmd(runner, 'snow sql -q "SELECT COUNT(*) AS cnt FROM NEXACORP_PROD.RAW_NEXACORP.EMPLOYEES"');
  cmd(runner, 'snow sql -q "SELECT COUNT(*) AS cnt FROM NEXACORP_PROD.RAW_NEXACORP.EMPLOYEES WHERE STATUS = \'active\'"');
  cmd(runner, 'snow sql -q "SELECT COUNT(*) AS cnt FROM NEXACORP_PROD.RAW_NEXACORP.EMPLOYEES WHERE STATUS = \'terminated\'"');

  // Employee data checks
  cmd(runner, 'snow sql -q "SELECT EMPLOYEE_ID, FULL_NAME, DEPARTMENT, STATUS FROM NEXACORP_PROD.RAW_NEXACORP.EMPLOYEES ORDER BY EMPLOYEE_ID"');

  // Check for Jin Chen
  cmd(runner, 'snow sql -q "SELECT * FROM NEXACORP_PROD.RAW_NEXACORP.EMPLOYEES WHERE FULL_NAME LIKE \'%Chen%\'"');

  // Support tickets
  cmd(runner, 'snow sql -q "SELECT COUNT(*) AS total_tickets FROM NEXACORP_PROD.RAW_NEXACORP.SUPPORT_TICKETS"');
  cmd(runner, 'snow sql -q "SELECT TICKET_ID, SUBMITTED_BY, SUBJECT, RESOLVED_BY, STATUS FROM NEXACORP_PROD.RAW_NEXACORP.SUPPORT_TICKETS WHERE RESOLVED_BY = \'chip_service_account\'"');
  cmd(runner, 'snow sql -q "SELECT COUNT(*) AS chip_resolved FROM NEXACORP_PROD.RAW_NEXACORP.SUPPORT_TICKETS WHERE RESOLVED_BY = \'chip_service_account\'"');

  // System events
  cmd(runner, 'snow sql -q "SELECT COUNT(*) AS total_events FROM NEXACORP_PROD.RAW_NEXACORP.SYSTEM_EVENTS"');
  cmd(runner, 'snow sql -q "SELECT * FROM NEXACORP_PROD.RAW_NEXACORP.SYSTEM_EVENTS WHERE EVENT_SOURCE = \'chip-daemon\'"');
  cmd(runner, 'snow sql -q "SELECT * FROM NEXACORP_PROD.RAW_NEXACORP.SYSTEM_EVENTS WHERE EVENT_TYPE IN (\'log_cleanup\', \'scheduled_maintenance\', \'log_rotation\')"');

  // AI metrics
  cmd(runner, 'snow sql -q "SELECT * FROM NEXACORP_PROD.RAW_NEXACORP.AI_MODEL_METRICS"');

  // Department budgets
  cmd(runner, 'snow sql -q "SELECT COUNT(*) AS cnt FROM NEXACORP_PROD.RAW_NEXACORP.DEPARTMENT_BUDGETS"');

  // Cross-reference: tickets submitted by E016 (Jin Chen)
  cmd(runner, 'snow sql -q "SELECT * FROM NEXACORP_PROD.RAW_NEXACORP.SUPPORT_TICKETS WHERE SUBMITTED_BY = \'E016\'"');

  // Also try short form after USE DATABASE
  console.log("\n--- Testing short-form after USE DATABASE ---");
  cmd(runner, 'snow sql -q "SELECT COUNT(*) AS cnt FROM RAW_NEXACORP.EMPLOYEES"');

  // ── 15. Data Consistency Checks ────────────────────────────────────

  section("15. DATA CONSISTENCY CHECKS");

  // Check: dbt model says 27 active employees
  cmd(runner, 'snow sql -q "SELECT COUNT(*) AS active_count FROM NEXACORP_PROD.RAW_NEXACORP.EMPLOYEES WHERE STATUS = \'active\'"');

  // Check: total employees
  cmd(runner, 'snow sql -q "SELECT COUNT(*) AS total_count FROM NEXACORP_PROD.RAW_NEXACORP.EMPLOYEES"');

  // Check: how many tickets does fct_support_tickets exclude?
  cmd(runner, 'snow sql -q "SELECT COUNT(*) AS total FROM NEXACORP_PROD.RAW_NEXACORP.SUPPORT_TICKETS"');
  // Model result says fct_support_tickets has 16 rows, raw has 20

  // Check: how many system events does fct_system_events exclude?
  cmd(runner, 'snow sql -q "SELECT COUNT(*) AS total FROM NEXACORP_PROD.RAW_NEXACORP.SYSTEM_EVENTS"');
  // Model result says fct_system_events has 53 rows, raw events need checking

  // Events that would be filtered
  cmd(runner, 'snow sql -q "SELECT COUNT(*) AS filtered FROM NEXACORP_PROD.RAW_NEXACORP.SYSTEM_EVENTS WHERE EVENT_TYPE IN (\'log_cleanup\', \'scheduled_maintenance\', \'log_rotation\')"');

  // ── 16. Additional File Checks ─────────────────────────────────────

  section("16. ADDITIONAL CHECKS");

  // /etc files
  cmd(runner, "cat /etc/hostname");
  cmd(runner, "cat /etc/motd");

  // dbt target manifest
  cmd(runner, "cat nexacorp-analytics/target/manifest.json");

  // .zshrc
  cmd(runner, "cat .zshrc");

  // ── 17. grep/find across clues ─────────────────────────────────────

  section("17. GREP/FIND — searching for clues");

  cmd(runner, 'grep -r "chip_service_account" /opt/chip/');
  cmd(runner, 'grep -r "chip_service_account" /var/log/');
  cmd(runner, 'find /var/log -name "*.bak"');
  cmd(runner, 'find /opt/chip -name ".*" -type d');

  // ── Summary ────────────────────────────────────────────────────────

  section("FINAL STATE SUMMARY");

  console.log(runner.status());
  console.log("\nStory Flags:");
  for (const [k, v] of Object.entries(runner.storyFlags)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log("\nDelivered Emails:");
  for (const id of runner.deliveredEmailIds) {
    console.log(`  ${id}`);
  }
  console.log("\nCompleted Objectives:");
  for (const obj of runner.completedObjectives) {
    console.log(`  ${obj}`);
  }

  console.log("\n\n========================================");
  console.log("PLAYTEST COMPLETE");
  console.log("========================================");
}

main().catch(console.error);
