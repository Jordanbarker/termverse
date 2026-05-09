import type { ComputerId } from "../state/types";
import { HOME_PATHS, NEXACORP_PATHS } from "./filesystem/paths";

export interface StoryFlagTrigger {
  event: "file_read" | "command_executed" | "directory_visit" | "directory_created" | "piper_delivered" | "objective_completed";
  path?: string;
  pathPrefix?: string;
  detail?: string;
  flag: StoryFlagName;
  value: string | boolean;
  toast?: string;
  requiredFlags?: StoryFlagName[];
}

export const STORY_FLAG_NAMES = [
  "read_resume",
  "read_backup_failure",
  "fixed_backup_script",
  "ran_auto_apply",
  "pdftotext_unlocked",
  "tree_installed",
  "apt_updated",
  "apt_upgraded",
  "found_backup_files",
  "found_auth_backup",
  "found_chip_directives",
  "found_cleanup_script",
  "read_onboarding",
  "read_team_info",
  "read_handoff_notes",
  "chip_unlocked",
  "chip_error_seen",
  "printenv_unlocked",
  "sourced_nexacorp_zshrc",
  "ran_dbt",
  "auri_dbt_reported",
  "read_nexacorp_offer",
  "commands_unlocked",
  "first_ssh_connect",
  "ssh_unlocked",
  "apt_unlocked",
  "basic_tools_unlocked",
  "devcontainer_visited",
  "coder_workspace_stopped",

  "search_tools_unlocked",
  "inspection_tools_unlocked",
  "processing_tools_unlocked",
  "coder_unlocked",
  "piper_unlocked",

  "tabs_unlocked",

  "oscar_searched_logs",
  "oscar_checked_backups",
  "oscar_diffed_logs",
  "oscar_access_completed",
  "auri_listed_handoff",
  "auri_read_todo",
  "auri_used_head",
  "auri_used_tail",
  "auri_used_wc",

  "read_end_of_day",
  "returned_home_day1",
  "chmod_unlocked",
  "read_ops_incidents",
  "read_board_minutes",
  "read_headcount_plan",

  "discovered_log_tampering",
  "found_inflated_metrics",
  "used_chip_topics",
  "dbt_project_cloned",

  // Quest 1: Olive's Terminal Challenges
  "olive_challenges_read",
  "used_file_in_downloads",
  "used_which_python",
  "created_projects_dir",
  "used_mv_home",
  "used_echo_pipe",
  "used_man_command",

  // Quest 2: Fix & Extend Backup
  "backup_quest_started",
  "created_backups_dir",
  "copied_scripts_backup",
  "created_backup_log",
  "verified_backup",

  // Quest 4: Olive's Power Tools (post day 1)
  "olive_power_tools_read",
  "used_grep_at_home",
  "used_wc_at_home",
  "used_history_redirect",
  "used_sort_uniq_home",
  "used_find_home",

  // Day 1 → Day 2 transition
  "day1_shutdown",
  "read_piper_day1_home",
  "ssh_day2",

  // Salary negotiation
  "accepted_at_180k",

  // Day 2 Quest: Fix the Broken Pipeline
  "pulled_day2_updates",
  "dbt_test_failed_day2",
  "investigated_null_data",
  "created_fix_branch",
  "fixed_campaign_model",
  "pushed_fix_branch",
  "reported_fix_to_auri",
] as const;

export type StoryFlagName = (typeof STORY_FLAG_NAMES)[number];

export function getStoryFlagTriggers(username: string): StoryFlagTrigger[] {
  const p = HOME_PATHS;
  return [
    { event: "file_read", path: p.resume(username), flag: "read_resume", value: true },
    { event: "directory_visit", path: p.downloadsDir(username), flag: "pdftotext_unlocked", value: true, toast: "pdftotext command unlocked!" },
    { event: "file_read", path: p.resume(username), flag: "pdftotext_unlocked", value: true, toast: "pdftotext command unlocked!" },
    { event: "file_read", path: p.jobJd(username), flag: "pdftotext_unlocked", value: true, toast: "pdftotext command unlocked!" },
    { event: "command_executed", detail: "apt_install_tree", flag: "tree_installed", value: true, toast: "tree command installed!" },
    { event: "command_executed", detail: "apt_update", flag: "apt_updated", value: true },
    { event: "command_executed", detail: "apt_upgrade", flag: "apt_upgraded", value: true, toast: "System updated!" },
    { event: "file_read", detail: "nexacorp_offer", flag: "read_nexacorp_offer", value: true },
    { event: "file_read", detail: "chip_ssh_setup", flag: "ssh_unlocked", value: true, toast: "ssh command unlocked!" },
    { event: "objective_completed", detail: "piper_reply:olive_linux_basics", flag: "basic_tools_unlocked", value: true, toast: "Basic Linux commands unlocked!" },
    { event: "piper_delivered", detail: "olive_tree_tip", flag: "apt_unlocked", value: true, toast: "sudo and apt commands unlocked!" },
    { event: "file_read", detail: "backup_failure", flag: "read_backup_failure", value: true },
    { event: "file_read", detail: "fixed_backup_script", flag: "fixed_backup_script", value: true },
    { event: "command_executed", detail: "ran_auto_apply", flag: "ran_auto_apply", value: true },
    { event: "objective_completed", detail: "salary_180k", flag: "accepted_at_180k", value: true },

    // Quest 1: Olive's Terminal Challenges
    { event: "piper_delivered", detail: "olive_challenge_file", flag: "olive_challenges_read", value: true },
    { event: "file_read", pathPrefix: p.downloadsDir(username) + "/", flag: "used_file_in_downloads", value: true },
    // Any way of locating the python interpreter — `which python3`, `command -v python3`,
    // `type python3` — credits this objective.
    { event: "command_executed", detail: "python_located", flag: "used_which_python", value: true },
    { event: "directory_created", path: p.projectsDir(username), flag: "created_projects_dir", value: true },
    { event: "command_executed", detail: "mv", flag: "used_mv_home", value: true },
    { event: "command_executed", detail: "echo_pipe", flag: "used_echo_pipe", value: true },
    { event: "command_executed", detail: "man", flag: "used_man_command", value: true },

    // Quest 2: Fix & Extend Backup
    { event: "piper_delivered", detail: "olive_backup_advice", flag: "backup_quest_started", value: true },
    { event: "directory_created", path: p.backupsDir(username), flag: "created_backups_dir", value: true },
    // Fast path: cp credits immediately. Cascade: any way of placing a script under the backup
    // dir + reading it (cat, less, nano, redirected `> dest` then verify, etc.) also credits.
    { event: "command_executed", detail: "cp", flag: "copied_scripts_backup", value: true },
    { event: "file_read", path: p.backupsScripts(username), flag: "copied_scripts_backup", value: true },
    { event: "file_read", path: p.backupLog(username), flag: "created_backup_log", value: true },
    { event: "file_read", path: p.backupsScripts(username), flag: "verified_backup", value: true },

    // Quest 4: Olive's Power Tools (post day 1)
    { event: "piper_delivered", detail: "olive_power_tools_intro", flag: "olive_power_tools_read", value: true },
    // Result-oriented events — fired by any builtin that produces the corresponding outcome.
    // text_filtered: grep (and any future filter tool — awk, sed)
    // data_deduped: uniq, sort -u (and any future dedup tool)
    // files_searched: find, tree, ls -R (and any future search tool)
    { event: "command_executed", detail: "text_filtered", flag: "used_grep_at_home", value: true },
    { event: "command_executed", detail: "wc",   flag: "used_wc_at_home",   value: true },
    { event: "file_read", path: p.myCommandsTxt(username), flag: "used_history_redirect", value: true },
    { event: "command_executed", detail: "data_deduped", flag: "used_sort_uniq_home", value: true },
    { event: "command_executed", detail: "files_searched", flag: "used_find_home", value: true },

    // Day 1 → Day 2 transition
    { event: "command_executed", detail: "shutdown", flag: "day1_shutdown", value: true },
    { event: "command_executed", detail: "piper", flag: "read_piper_day1_home", value: true },
    { event: "command_executed", detail: "ssh_nexacorp", flag: "ssh_day2", value: true },
  ];
}

export function getNexacorpStoryFlagTriggers(_username: string): StoryFlagTrigger[] {
  const p = NEXACORP_PATHS;
  return [
    { event: "file_read", path: p.systemLog, flag: "oscar_searched_logs", value: true },
    { event: "file_read", path: p.systemLogBak, flag: "oscar_checked_backups", value: true },
    { event: "command_executed", detail: "diff", flag: "oscar_diffed_logs", value: true },
    // Cascade: reading both logs (in either order) credits the diff objective even
    // without `diff` — `cat`, `comm`, `vimdiff`, or any other comparison method works.
    { event: "file_read", path: p.systemLog, flag: "oscar_diffed_logs", value: true, requiredFlags: ["oscar_checked_backups"] },
    { event: "file_read", path: p.systemLogBak, flag: "oscar_diffed_logs", value: true, requiredFlags: ["oscar_searched_logs"] },
    { event: "objective_completed", detail: "oscar_access_reported", flag: "oscar_access_completed", value: true },
    { event: "objective_completed", detail: "auri_dbt_reported", flag: "auri_dbt_reported", value: true },
    // Reading pipeline_runs.csv with any tool (cat, head, tail, wc, less, nano, …) credits all
    // three "audit the file" objectives. The auto-emitter in applyResult.ts emits file_read for
    // cat/head/tail/grep/wc/sort/uniq/file/pdftotext, so any reader counts.
    { event: "file_read", path: p.pipelineRuns, flag: "auri_used_head", value: true },
    { event: "file_read", path: p.pipelineRuns, flag: "auri_used_tail", value: true },
    { event: "file_read", path: p.pipelineRuns, flag: "auri_used_wc", value: true },
    { event: "file_read", path: p.systemLogBak, flag: "found_backup_files", value: true },
    { event: "file_read", path: p.authLogBak, flag: "found_auth_backup", value: true },
    { event: "file_read", path: p.chipPluginSdk, flag: "found_chip_directives", value: true },
    { event: "file_read", path: p.chipTicketTriage, flag: "found_chip_directives", value: true },
    { event: "file_read", path: p.chipSystemMonitor, flag: "found_chip_directives", value: true },
    { event: "file_read", path: p.chipAlertRouting, flag: "found_chip_directives", value: true },
    { event: "file_read", path: p.chipAnalyticsReports, flag: "found_chip_directives", value: true },
    { event: "file_read", path: p.chipLogMaintenance, flag: "found_chip_directives", value: true },
    { event: "file_read", path: p.chipCleanup, flag: "found_cleanup_script", value: true },
    { event: "directory_visit", path: p.chenHandoff, flag: "auri_listed_handoff", value: true },
    { event: "file_read", path: p.chenHandoffTodo, flag: "auri_read_todo", value: true },
    { event: "file_read", path: p.onboarding, flag: "read_onboarding", value: true },
    { event: "command_executed", detail: "coder_start", flag: "coder_workspace_stopped", value: false },
    { event: "command_executed", detail: "coder_stop", flag: "coder_workspace_stopped", value: true },
    { event: "file_read", detail: "oscar_coder_setup", flag: "coder_unlocked", value: true, toast: "coder command unlocked! Try: coder ssh ai" },
    { event: "objective_completed", detail: "pipeline_tools_accepted", flag: "coder_unlocked", value: true, toast: "coder command unlocked! Try: coder ssh ai" },
    { event: "file_read", path: p.teamInfo, flag: "read_team_info", value: true },
    { event: "file_read", path: p.handoffNotes, flag: "read_handoff_notes", value: true },
    { event: "piper_delivered", detail: "edward_chip_intro", flag: "chip_unlocked", value: true, toast: "chip command unlocked!" },
    { event: "command_executed", detail: "chip_api_error", flag: "chip_error_seen", value: true },
    { event: "piper_delivered", detail: "edward_chip_fix", flag: "printenv_unlocked", value: true, toast: "printenv command unlocked!" },
    { event: "command_executed", detail: "sourced_zshrc", flag: "sourced_nexacorp_zshrc", value: true, requiredFlags: ["printenv_unlocked"] },
    { event: "command_executed", detail: "exported_chip_api_key", flag: "sourced_nexacorp_zshrc", value: true, requiredFlags: ["printenv_unlocked"] },
    { event: "file_read", detail: "welcome_edward", flag: "piper_unlocked", value: true, toast: "piper command unlocked!" },
    { event: "file_read", detail: "edward_end_of_day", flag: "read_end_of_day", value: true },
    { event: "file_read", detail: "discovered_log_tampering", flag: "discovered_log_tampering", value: true },
    { event: "command_executed", detail: "queried_campaign_metrics", flag: "found_inflated_metrics", value: true },
    { event: "file_read", path: p.opsIncidents, flag: "read_ops_incidents", value: true },
    { event: "file_read", path: p.boardMinutes, flag: "read_board_minutes", value: true },
    { event: "file_read", path: p.headcountPlan, flag: "read_headcount_plan", value: true },
    // Day 2 quest: Piper reply fires on nexacorp since dm_auri defaults there
    { event: "objective_completed", detail: "reported_fix_to_auri", flag: "reported_fix_to_auri", value: true },
  ];
}

export function getTriggersForComputer(computer: ComputerId, username: string): StoryFlagTrigger[] {
  if (computer === "home") return getStoryFlagTriggers(username);
  if (computer === "devcontainer") return getDevcontainerStoryFlagTriggers(username);
  return getNexacorpStoryFlagTriggers(username);
}

export function getDevcontainerStoryFlagTriggers(username: string): StoryFlagTrigger[] {
  const p = HOME_PATHS;
  return [
    { event: "command_executed", detail: "git_clone_nexacorp-analytics", flag: "dbt_project_cloned", value: true, toast: "dbt project cloned to ~/nexacorp-analytics/" },
    { event: "command_executed", detail: "dbt_build", flag: "ran_dbt", value: true },
    { event: "command_executed", detail: "queried_campaign_metrics", flag: "found_inflated_metrics", value: true },
    // Day 2 quest triggers
    { event: "command_executed", detail: "git_pull_origin_main", flag: "pulled_day2_updates", value: true, requiredFlags: ["ssh_day2"] },
    { event: "command_executed", detail: "dbt_test_fail", flag: "dbt_test_failed_day2", value: true, requiredFlags: ["pulled_day2_updates"] },
    { event: "command_executed", detail: "queried_campaign_metrics", flag: "investigated_null_data", value: true, requiredFlags: ["dbt_test_failed_day2"] },
    { event: "command_executed", detail: "git_checkout_b", flag: "created_fix_branch", value: true, requiredFlags: ["dbt_test_failed_day2"] },
    { event: "command_executed", detail: "dbt_test_all_pass", flag: "fixed_campaign_model", value: true, requiredFlags: ["dbt_test_failed_day2"] },
    { event: "command_executed", detail: "git_push", flag: "pushed_fix_branch", value: true, requiredFlags: ["fixed_campaign_model"] },
    // Cascade: a green dbt build proves the upstream investigation + branching happened, even if the player took an unconventional path
    { event: "command_executed", detail: "dbt_test_all_pass", flag: "investigated_null_data", value: true, requiredFlags: ["dbt_test_failed_day2"] },
    { event: "command_executed", detail: "dbt_test_all_pass", flag: "created_fix_branch", value: true, requiredFlags: ["dbt_test_failed_day2"] },
  ];
}
