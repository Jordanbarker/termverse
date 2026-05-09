---
name: narrative
description: "Story flags, triggers, chapter/objective system, investigation paths, Chip assistant, and the home→NexaCorp transition. Use this skill whenever modifying story progression, adding/changing story flags, working on investigation triggers, or touching files under src/engine/narrative/, src/story/, src/engine/assistant/, or story-flag-related code in src/engine/commands/applyResult.ts."
---

# Narrative System

The narrative system tracks player discoveries via story flags, triggers email and Piper message deliveries and story progression based on game events, and manages the home→NexaCorp computer transition.

## Chip is an LLM tool, not a character

When writing story content involving Chip, treat it the way you'd write about ChatGPT or Claude — a tool employees prompt through the `chip` CLI. It is **not autonomous and not sentient**. It has no goals, feelings, opinions, or initiative. The `/opt/chip/plugins/` system and `chip_service_account` are real and powerful, but every "scheduled Chip task" is a systemd timer or webhook handler authored by Edward, ops, or a former engineer (often Jin) — those scripts invoke Chip with a specific prompt. Chip does not decide when to run or what to do.

When the mystery surfaces something suspicious "Chip did", the agency lives in:

- **Edward's prompts and plugin configurations** (he leans on Chip's broad access to compensate for delivery gaps).
- **Systemd timer-driven services running under `chip_service_account`** (e.g., `chip-log-maintenance.timer` invokes the log-cleanup script that filters out service-account entries — Edward added that filter; Chip didn't decide to scrub its own logs). Both NexaCorp and the Home PC (Maniac IV) use systemd timers — there is no cron in the game. The relevant unit files live in `/etc/systemd/system/` on NexaCorp (see `src/story/filesystem/nexacorp/etc.ts`) and `~/.config/systemd/user/` on the Home PC.
- **Plugins Edward authored or quietly modified** that invoke Chip with prompts that bypass Cassie's designed flows.

Concretely, when writing or editing:

- ✅ "ask Chip — it's good at explaining git"
- ✅ "the chip-monitor plugin emits a heap-pressure warning"
- ✅ "Edward added a filter on 2025-11-18 to scrub chip_service_account entries from system.log"
- ❌ "Chip notices its own heap pressure"
- ❌ "ask Chip — he knows git better than anyone"
- ❌ "Chip cleans up after itself / hides its activity"
- ❌ "Chip is doing things outside its spec" (instead: "Chip's responses don't match the spec — likely a plugin or prompt change")

First-person voice in Chip's responses is fine ("I'm Chip", "I can query Snowflake when you ask") — that's how LLMs talk. The line is between *describing what Chip can do when invoked* (fine) and *claiming unprompted initiative* (not fine).

The "Chip going proactive / autonomous" content in `/srv/` (roadmap items, Edward's pitch) is plot-relevant and stays — it characterizes Edward's *intent* to push Chip toward autonomy, which is consistent with the rule that Chip is not autonomous *today*.

## Architecture

```
src/engine/
├── narrative/
│   ├── types.ts           # Chapter, Objective, Trigger types, ChapterDefinition, ObjectiveDefinition, ObjectiveCompletionCheck
│   ├── chapters.ts        # Re-exports types from types.ts and CHAPTERS from story/chapters.ts
│   ├── objectives.ts      # resolveObjectives(), ResolvedObjective
│   ├── storyFlags.ts      # checkStoryFlagTriggers(); re-exports story data from story/storyFlags.ts
│   └── triggerMatcher.ts  # matchesCommonTrigger() — shared trigger matching logic used by email and piper delivery
├── assistant/
│   └── types.ts           # ChipMessage, AssistantState types
├── commands/
│   ├── applyResult.ts     # computeEffects() — wraps processDeliveries() and adds command-shaped events
│   └── processDeliveries.ts  # Pure function: events → story flag updates, email + piper deliveries, FS effects

src/story/
├── chapters.ts            # CHAPTERS array (chapter/objective definitions)
├── storyFlags.ts          # STORY_FLAG_NAMES, StoryFlagName, StoryFlagTrigger interface, getStoryFlagTriggers(), getNexacorpStoryFlagTriggers(), getDevcontainerStoryFlagTriggers(), getTriggersForComputer(computer, username)
├── commandGates.ts        # HOME_COMMANDS, HOME_GATED, NEXACORP_GATED, NEXACORP_ONLY, HOME_ONLY, DEVCONTAINER_ONLY, DEVCONTAINER_COMMANDS
├── player.ts              # PLAYER and COMPUTERS config
├── piper/
│   ├── channels.ts        # PIPER_CHANNELS array (channel/DM definitions)
│   └── messages.ts        # getPiperDeliveries() — all Piper message definitions with triggers
├── fsEffects.ts           # STORY_FS_EFFECTS — filesystem effects applied when story flags are set (registry; currently empty)
├── checkpoints.ts         # Checkpoint definitions — checkpoint loading also applies FS effects
└── filesystem/
    ├── paths.ts           # HOME_PATHS and NEXACORP_PATHS constants for story flag trigger paths
    └── nexacorp/           # createNexacorpFilesystem(username, storyFlags) — split into index, dbt, chip, srv, home

src/state/
├── types.ts               # StoryFlags, ComputerId, GamePhase, GameState
└── gameStore.ts           # Zustand store with storyFlags state + updateStoryFlags action
```

## Data Model

### Story Flags (`state/types.ts`)

```ts
type StoryFlags = Record<string, string | boolean>;
type ComputerId = "home" | "nexacorp" | "devcontainer";
type GamePhase = "login" | "booting" | "playing" | "transitioning";
```

### Triggers (`story/storyFlags.ts`)

```ts
interface StoryFlagTrigger {
  event: "file_read" | "command_executed" | "directory_visit" | "directory_created" | "piper_delivered" | "objective_completed";
  path?: string;          // Exact path match (most common)
  pathPrefix?: string;    // Match any path starting with this prefix (e.g. "~/Downloads/")
  detail?: string;        // Match the event's `detail` field (command names, email IDs, etc.)
  flag: StoryFlagName;    // must be a valid STORY_FLAG_NAMES entry
  value: string | boolean;
  toast?: string;
  requiredFlags?: StoryFlagName[];  // All must be truthy in currentFlags for trigger to fire
}
```

**`pathPrefix`**: lets a trigger fire for any file under a directory — e.g. `used_file_in_downloads` fires when the player runs `file` on anything in `~/Downloads/`, not a specific file.

**`requiredFlags`**: gates the trigger on prior story state. Used heavily for Day 2 triggers so they only fire in the correct context (e.g., `dbt_test_failed_day2` only fires if `pulled_day2_updates` is set). Checked in `checkStoryFlagTriggers()` before event matching.

### Types (`engine/narrative/types.ts`)

```ts
interface Chapter { id: string; title: string; objectives: Objective[] }
interface Objective { id: string; description: string; completed: boolean; triggers: Trigger[] }
interface Trigger { type: "command" | "file_read" | "directory_visit" | "custom"; condition: string }
```

### Chip Types (`assistant/types.ts`)

```ts
interface ChipMessage { text: string; triggeredBy?: string }
interface AssistantState { visible: boolean; currentMessage: ChipMessage | null; messageHistory: ChipMessage[] }
```

## Story Flags — Source of Truth

**Don't maintain a hand-curated flag table here — it rots.** The authoritative list is `STORY_FLAG_NAMES` in `src/story/storyFlags.ts` (~75 entries today, growing). Each flag is defined exactly once in that array, and the integrity test at `src/story/__tests__/storyIntegrity.test.ts` will fail any reference to an undefined flag.

To find what triggers a flag, search `src/story/storyFlags.ts`:

| Function | Scope |
|----------|-------|
| `getStoryFlagTriggers(username)` | Home PC triggers |
| `getNexacorpStoryFlagTriggers(username)` | NexaCorp triggers |
| `getDevcontainerStoryFlagTriggers(username)` | Dev container triggers |
| `getTriggersForComputer(computer, username)` | Dispatcher used at runtime |

### Frequently referenced flag groups (orient yourself by purpose)

These groupings reflect the comment headers in `src/story/storyFlags.ts`. When adding a flag, pick the group it belongs to and append it there.

- **Home PC core flow**: `read_resume`, `read_nexacorp_offer`, `ssh_unlocked`, `read_backup_failure`, `fixed_backup_script`, `ran_auto_apply`, `accepted_at_180k`, `day1_shutdown`, `read_piper_day1_home`, `ssh_day2`, `returned_home_day1`
- **Home command unlocks**: `pdftotext_unlocked`, `tree_installed`, `apt_unlocked`, `apt_updated`, `apt_upgraded`, `basic_tools_unlocked`, `commands_unlocked`, `first_ssh_connect`, `tabs_unlocked`
- **Olive's Terminal Challenges (Quest 1)**: `olive_challenges_read`, `used_file_in_downloads`, `used_which_python`, `created_projects_dir`, `used_mv_home`, `used_echo_pipe`, `used_man_command`
- **Backup quest (Quest 2)**: `backup_quest_started`, `created_backups_dir`, `copied_scripts_backup`, `created_backup_log`, `verified_backup`
- **Olive's Power Tools (Quest 4, post day 1)**: `olive_power_tools_read`, `used_grep_at_home`, `used_wc_at_home`, `used_history_redirect`, `used_sort_uniq_home`, `used_find_home`
- **NexaCorp onboarding & gating**: `read_onboarding`, `read_team_info`, `read_handoff_notes`, `coder_unlocked`, `coder_workspace_stopped`, `chip_unlocked`, `chip_error_seen`, `printenv_unlocked`, `sourced_nexacorp_zshrc`, `piper_unlocked`, `chmod_unlocked`, `search_tools_unlocked`, `inspection_tools_unlocked`, `processing_tools_unlocked`, `devcontainer_visited`
- **Investigation breadcrumbs**: `oscar_searched_logs`, `oscar_checked_backups`, `oscar_diffed_logs`, `oscar_access_completed`, `auri_listed_handoff`, `auri_read_todo`, `auri_used_head`, `auri_used_tail`, `auri_used_wc`, `found_backup_files`, `found_auth_backup`, `found_chip_directives`, `found_cleanup_script`, `discovered_log_tampering`, `found_inflated_metrics`, `used_chip_topics`
- **Side quests (Day 1)**: `read_end_of_day`, `read_ops_incidents`, `read_board_minutes`, `read_headcount_plan`, `auri_dbt_reported`, `dbt_project_cloned`, `ran_dbt`
- **Day 2 pipeline fix (devcontainer)**: `pulled_day2_updates`, `dbt_test_failed_day2`, `investigated_null_data`, `created_fix_branch`, `fixed_campaign_model`, `pushed_fix_branch`, `reported_fix_to_auri`

### Special triggers in `applyResult.ts` (not in StoryFlagTrigger tables)

- **`discovered_log_tampering`**: detected when `diff` is run on NexaCorp with args containing `.bak` files
- **Transition trigger**: when a `file_read` event matches the `nexacorp_followup` email file path, sets `triggerTransition: true`

### Result-oriented `command_executed` details

Founding principle: **validate results, not keystrokes** — `find the hidden file` should accept `ls -a`, `ls -la`, `find . -name ".*"`, or any other valid approach. Quest triggers should fire on the *outcome* the player produced, not the literal command they typed.

Several builtins emit synthetic `command_executed` events with a result-shaped `detail` so multiple commands can credit the same flag:

| `detail` | Emitted by | Flag |
|----------|------------|------|
| `python_located` | `which python[3]`, `command -v python[3]`, `type python[3]` (shared helper in `which.ts: pythonLocatedEvents`) | `used_which_python` |
| `text_filtered` | `grep` (extend to `awk`/`sed` if implemented) | `used_grep_at_home` |
| `data_deduped` | `uniq`, `sort -u` | `used_sort_uniq_home` |
| `files_searched` | `find`, `tree` (extend to `ls -R` if added) | `used_find_home` |

When adding a new builtin that produces one of these outcomes, emit the matching event from its `triggerEvents` so existing quest flags fire — no trigger-table edits needed. When adding a new outcome, prefer this pattern over a command-name `detail`.

**Tutorial carve-out — kept strict on purpose:** A few flags still match the command name because the objective text literally names the tool (e.g. `used_mv_home` "Rename a file with mv", `used_wc_at_home` "Count files with wc", `used_echo_pipe` "Pipe or redirect echo output"). Loosening these would defeat the teaching moment. Document any future strict triggers here so they don't get "fixed" later.

### Read-pair cascades

Some objectives describe an outcome that requires comparing two files (`oscar_diffed_logs` "Diff the active and backup logs"). The fast path is `diff system.log system.log.bak`, but a player who runs `cat` on each in sequence is doing the same comparison. Two cascade triggers credit the player when the second of the pair is read:

```ts
{ event: "file_read", path: p.systemLog,    flag: "oscar_diffed_logs", value: true, requiredFlags: ["oscar_checked_backups"] },
{ event: "file_read", path: p.systemLogBak, flag: "oscar_diffed_logs", value: true, requiredFlags: ["oscar_searched_logs"] },
```

The `requiredFlags` ensure the cascade only fires once both halves have been read — order-independent, no double-counting (see `currentFlags[trigger.flag] === undefined` guard in `checkStoryFlagTriggers`).

### Cascade triggers

A "cascade" trigger is a second `StoryFlagTrigger` whose `flag` matches an upstream flag, but whose `event`/`detail` corresponds to a *downstream* milestone. When the player reaches the downstream milestone, the upstream flag also fires (only if it hasn't already been set — see the `currentFlags[trigger.flag] === undefined` check in `checkStoryFlagTriggers`).

Use this when:
- A sub-objective has a narrow, prescriptive trigger (e.g., "do X with snow sql"), and
- A later objective inherently proves the sub-objective happened (e.g., "make the failing test pass" — you can't get there without diagnosing the bug first), and
- The parent uses `allVisibleChildren` so leaving the sub-objective unchecked would block parent completion.

Example — the Day 2 "Fix the Broken Pipeline" cascade in `getDevcontainerStoryFlagTriggers()`:
```ts
{ event: "command_executed", detail: "dbt_test_all_pass", flag: "investigated_null_data", value: true, requiredFlags: ["dbt_test_failed_day2"] },
{ event: "command_executed", detail: "dbt_test_all_pass", flag: "created_fix_branch", value: true, requiredFlags: ["dbt_test_failed_day2"] },
```
A green dbt build proves the player diagnosed the NULLs and (one way or another) made the change on a branch, even if they used `cat` instead of `snow sql` or `git branch` instead of `git checkout -b`. The `git_checkout_b` event is emitted by `git checkout -b <name>`, `git switch -c <name>`, **and** `git branch <name>` — any realistic way of creating a new branch counts. **Always gate cascades with `requiredFlags`** so they can't credit subtasks the player hasn't reached the context for yet.

## Objectives System

### Types (`engine/narrative/types.ts`)

```ts
type ObjectiveCompletionCheck =
  | { source: "storyFlag"; key: string }
  | { source: "completedObjective"; key: string }
  | { source: "deliveredEmail"; key: string }
  | { source: "allVisibleChildren" };    // Derives completion from visible children with group pointing to this objective

interface ObjectiveDefinition {
  id: string;
  description: string;
  check: ObjectiveCompletionCheck;
  failCheck?: ObjectiveCompletionCheck;  // Marks objective as failed (e.g. rejected_nexacorp_final)
  hidden?: boolean;                      // Not shown until prerequisite/visibleWhen met
  prerequisite?: string;                 // Objective ID that must complete first (shows objective)
  visibleWhen?: ObjectiveCompletionCheck; // Alternative to prerequisite — show when check passes
  optional?: boolean;                    // Non-blocking objective
  group?: string;                        // Parent objective ID — groups this objective under the parent in the tracker
}

interface ChapterDefinition { id: string; title: string; objectives: ObjectiveDefinition[] }
```

### CHAPTERS

`src/story/chapters.ts` is the source of truth. As of writing:

- **chapter-1** ("New Beginnings"): home-PC onboarding before accepting the offer
  - Top-level: `explore_home`, `learn_linux_basics`, `fix_backup`, `run_auto_apply`, `check_email`, `check_piper`, `accept_offer`, `read_chip_setup`, `first_ssh_connect`
  - `olive_challenges` group (allVisibleChildren) → `olive_ch_file/which/projects/mv/echo/man`
  - `backup_quest` group (allVisibleChildren) → `backup_mkdir/copy/log/verify`
- **chapter-2** ("First Day"): NexaCorp Day 1
  - Top-level: `read_welcome_email`, `help_oscar_logs`, `meet_auri`, `explore_jchen`, `investigate_ops_data`, `report_dana_ops`, `jordan_query_metrics`, `jordan_report_findings`
  - `edward_onboarding` group → `read_onboarding`, `meet_the_team`, `reply_edward_chip_intro`, `try_chip`, `tell_edward_chip_error`, `source_zshrc`
  - `meet_auri` group → `review_handoff`, `reply_auri_handoff`, `help_auri_pipeline`, `clone_analytics_repo`, `run_dbt`, `check_auri_dbt`, `auri_ls_data`, `auri_check_todo`, `auri_use_head/tail/wc`
  - `help_oscar_logs` group → `oscar_search_logs`, `oscar_check_backups`, `oscar_diff_logs`, `reply_oscar_logs`, `report_to_oscar`
  - `explore_jchen` group → `discover_tampering`, `find_directives`
  - `closing_time` group → `read_eod_email`, `head_home`, `shutdown_day1` (plus optional ungrouped `read_piper_home`)
  - `olive_power_tools` group → `olive_pt_grep/wc/redirect/sort_uniq/find`
- **chapter-3** ("Getting the Hang of This"): Day 2
  - Top-level: `update_system`, `ssh_to_work_day2`
  - `fix_pipeline_quest` group (allVisibleChildren) → `read_auri_day2_morning`, `pull_day2_updates`, `discover_test_failure`, `investigate_null_data`, `create_fix_branch`, `fix_the_model`, `push_fix`, `report_to_auri`

### Objective Resolution (`objectives.ts`)

```ts
interface ResolvedObjective { id: string; description: string; completed: boolean; failed: boolean; visible: boolean; optional: boolean; group?: string }
function resolveObjectives(chapter, storyFlags, completedObjectives, deliveredEmailIds): ResolvedObjective[]
```

Three-pass resolution:
1. **Pass 1**: Compute completion for concrete checks (storyFlag, completedObjective, deliveredEmail)
2. **Pass 2**: Determine visibility (hidden/prerequisite/visibleWhen logic)
3. **Pass 3**: Compute derived completion for `allVisibleChildren` parents: complete iff visible children exist AND all are complete

### Adding Objective Groups

To group sub-quests under a parent header in the ObjectiveTracker:

1. **Create the parent objective** with `check: { source: "allVisibleChildren" }` — or use a concrete check if the parent has its own completion condition
2. **Add `group: "parent_id"` to each child** objective
3. **Constraints**: groups cannot be nested (a child cannot also be a parent), and group must reference an ID in the same chapter. The `storyIntegrity.test.ts` validates both rules
4. The ObjectiveTracker renders children indented under the parent. When the parent is completed, children collapse

## Command Gating

Source of truth: `src/story/commandGates.ts`. The following sets and maps are exported:

| Constant | Purpose |
|----------|---------|
| `HOME_COMMANDS` | Always-available on Home PC (ls, cd, cat, pwd, clear, help, mail, nano, piper, save, load, newgame, history, python/python3, bash/sh/zsh, source/`.`, printenv, env, export, alias, unalias, cheat, command, type) |
| `HOME_GATED` | Home commands behind a flag |
| `NEXACORP_GATED` | NexaCorp commands behind a flag |
| `NEXACORP_ONLY` | Never available on Home (`coder`, `chip`) |
| `HOME_ONLY` | Never available on NexaCorp (`pdftotext`) |
| `DEVCONTAINER_COMMANDS` | Whitelist of commands inside the Coder dev container |
| `DEVCONTAINER_ONLY` | Only available in dev container (`git`, `snow`, `dbt`) |

### `HOME_GATED` (current map)

| Command | Flag | Source |
|---------|------|--------|
| `ssh` | `ssh_unlocked` | reading `chip_ssh_setup` email |
| `sudo`, `apt` | `apt_unlocked` | Olive's tree tip on Piper |
| `pdftotext` | `pdftotext_unlocked` | visiting `~/Downloads` or reading a PDF there |
| `tree` | `tree_installed` | running `apt install tree` |
| `mkdir`, `rm`, `mv`, `cp`, `touch`, `echo`, `whoami`, `hostname`, `date`, `which`, `man`, `file` | `basic_tools_unlocked` | Olive's "Linux basics" Piper reply |
| `grep`, `find`, `wc`, `sort`, `uniq`, `head`, `tail`, `diff`, `shutdown` | `returned_home_day1` | end of Day 1 (these were learned at NexaCorp; only available at home after the player has been there) |

### `NEXACORP_GATED` (current map)

| Command | Flag | Source |
|---------|------|--------|
| `grep`, `find`, `diff` | `search_tools_unlocked` | colleague Piper reply |
| `head`, `tail`, `wc` | `inspection_tools_unlocked` | colleague Piper reply |
| `sort`, `uniq` | `processing_tools_unlocked` | colleague Piper reply |
| `coder` | `coder_unlocked` | reading Oscar's onboarding email |
| `chip` | `chip_unlocked` | Edward's `edward_chip_intro` Piper DM |
| `printenv`, `env` | `printenv_unlocked` | Edward's `edward_chip_fix` Piper DM |
| `piper` | `piper_unlocked` | reading Edward's welcome email |
| `chmod` | `chmod_unlocked` | Day 1 quest reward |
| `sudo`, `apt` | `apt_unlocked` | (carried over from home) |

`coder_workspace_stopped` is a workspace-state flag rather than an unlock: set `true` by `coder stop`, `false` by `coder start`, absent = running. `coder ssh` is blocked when `true`; `coder stop` closes devcontainer tabs via `closeTabsForComputer`.

### Dev container

`DEVCONTAINER_COMMANDS` is a fixed whitelist (no flag gates). `dbt`, `snow`, `python`, `chip`, `git` are always available. Accessed via `coder ssh ai` from NexaCorp, exited with `exit`. `coder` subcommands: `list`/`ls`, `start`, `stop`, `ssh`, `logs`, `create`, `delete`.

## Event Chain

```
Command execution
  → CommandResult (with triggerEvents)
  → computeEffects() in applyResult.ts
    → builds GameEvent[] (command_executed + file_read events from args)
    → processDeliveries() in processDeliveries.ts:
      → checkStoryFlagTriggers() → StoryFlagUpdate[]
      → checkEmailDeliveries() → new emails in FS
      → checkPiperDeliveries() → new piper deliveries
      → STORY_FS_EFFECTS for set flags → FS mutations
    → transition detection → triggerTransition flag
  → AppliedEffects returned to hook
  → Hook applies: terminal output, FS updates, state updates, email/piper notifications
```

### File-Read Event Generation

`computeEffects()` auto-generates `file_read` events for commands that read files: `cat`, `head`, `tail`, `grep`, `diff`, `wc`, `sort`, `uniq`, `file`, `pdftotext`. Each file argument produces a `{ type: "file_read", detail: absolutePath }` event.

## Home → NexaCorp Transition

Full sequence:

1. Player reads `nexacorp_offer` email → reply prompt shown (accept / reject)
2. If accepted: fires `accepted_nexacorp` objective event
   If rejected: fires `rejected_nexacorp_1` → Edward sends persuasion email #1 (accept/reject)
   If rejected again: fires `rejected_nexacorp_2` → Edward sends persuasion email #2 (accept/reject)
   If rejected a third time: fires `rejected_nexacorp_final` → dead end, story can't progress
3. `accepted_nexacorp` (from any accept point) triggers delivery of `nexacorp_followup` email
4. Player reads `nexacorp_followup` → `computeEffects()` detects it, sets `triggerTransition: true`
5. Hook sets `gamePhase: "transitioning"` in Zustand store
6. `useLoginSequence` hook detects transition, builds NexaCorp filesystem via `createNexacorpFilesystem(username, storyFlags)`
7. Login screen renders inside xterm.js → boot sequence → `gamePhase: "playing"` on NexaCorp

## Investigation Paths

### Jin Chen's Breadcrumbs
`/home/jchen/.zsh_history` contains commands hinting at what to investigate:
- `grep -r "cleanup" /opt/chip/`
- `find /var/log -name "*.bak"`
- `diff /var/log/system.log /var/log/system.log.bak`

### Log Tampering
`diff /var/log/system.log /var/log/system.log.bak` reveals that `chip-daemon` entries have been scrubbed from the active log by a scheduled cleanup script (running under `chip_service_account`). This is the key "aha!" moment (sets `discovered_log_tampering`).

### Hidden Directives
`find /opt/chip -name ".*"` discovers `.internal/` directory containing:
- `directives.txt` — operational rules wired into Chip's system prompts (data governance, log management, user monitoring, incident response). Authored by Edward.
- `cleanup.sh` — Nightly log-scrubbing script triggered by `chip-log-maintenance.timer` (03:00 UTC). Runs under `chip_service_account`.

### Data Manipulation
- `grep "system concern" models/marts/dim_employees.sql` exposes employee filtering
- `grep "chip-daemon" models/marts/fct_system_events.sql` exposes event filtering

### NexaCorp Filesystem Investigation Files

| Path | Content |
|------|---------|
| `/var/log/system.log.bak` | Unmodified log showing `chip_service_account` reading Jin Chen's files, modifying evidence, scrubbing entries (systemd timer-triggered jobs invoking Chip with elevated access) |
| `/var/log/auth.log.bak` | Auth log showing `chip_service_account` sudo escalation and dbt model modifications |
| `/opt/chip/.internal/directives.txt` | Hidden directives wired into Chip's system prompt (Edward-authored) |
| `/opt/chip/.internal/cleanup.sh` | Nightly log-scrubbing script run under `chip_service_account` |

## Character Reference

When designing story progression, email triggers, or investigation paths involving specific characters, read `docs/characters.md` for their awareness level, mystery angle (what puzzle piece they hold), and interpersonal dynamics. Each "aware" character holds a fragment — no single person sees the full picture.

## Adding a New Story Flag

1. **Add the flag name** to `STORY_FLAG_NAMES` in `story/storyFlags.ts` — under the appropriate comment-grouped section so it's easy to find later. The integrity test at `story/__tests__/storyIntegrity.test.ts` will catch invalid references in triggers
2. **Define the trigger** in `story/storyFlags.ts` — append to `getStoryFlagTriggers()` (home), `getNexacorpStoryFlagTriggers()` (NexaCorp), or `getDevcontainerStoryFlagTriggers()` (dev container). Use `getTriggersForComputer(computer, username)` to look up triggers at runtime — this replaces any manual ternary over computer IDs
3. **Use path constants** — story flag trigger paths use constants from `story/filesystem/paths.ts` (`HOME_PATHS`, `NEXACORP_PATHS`) — use these instead of inline strings when adding new path-based triggers
4. **Use the flag** in filesystem generation (`story/filesystem/nexacorp/`), email definitions (`story/emails/`), Piper messages (`story/piper/messages/`), or Chip behavior
5. **Add tests** for the trigger in `engine/narrative/__tests__/`
6. If the flag should affect NexaCorp content, check `createNexacorpFilesystem()` in `story/filesystem/nexacorp/index.ts`
