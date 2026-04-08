---
name: narrative
description: "Story flags, triggers, chapter/objective system, investigation paths, Chip assistant, and the home→NexaCorp transition. Use this skill whenever modifying story progression, adding/changing story flags, working on investigation triggers, or touching files under src/engine/narrative/, src/story/, src/engine/assistant/, or story-flag-related code in src/engine/commands/applyResult.ts."
---

# Narrative System

The narrative system tracks player discoveries via story flags, triggers email and Piper message deliveries and story progression based on game events, and manages the home→NexaCorp computer transition.

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
│   └── applyResult.ts     # computeEffects() — processes events into story flag updates, email + piper deliveries, transitions

src/story/
├── chapters.ts            # CHAPTERS array (chapter/objective definitions)
├── storyFlags.ts          # STORY_FLAG_NAMES, StoryFlagName, StoryFlagTrigger interface, getStoryFlagTriggers(), getNexacorpStoryFlagTriggers(), getDevcontainerStoryFlagTriggers(), getTriggersForComputer(computer, username)
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

### Player & Computers (`story/player.ts`)

```ts
const COMPUTERS: Record<ComputerId, { hostname: string; promptHostname: string }> = {
  home: { hostname: "maniac-iv", promptHostname: "maniac-iv" },
  nexacorp: { hostname: "nexacorp-ws01", promptHostname: "nexacorp-ws01" },
  devcontainer: { hostname: "coder-ai", promptHostname: "coder-ai" },
};
```

### Triggers (`story/storyFlags.ts`)

```ts
// Defined in story/storyFlags.ts
interface StoryFlagTrigger {
  event: "file_read" | "command_executed" | "directory_visit" | "directory_created" | "piper_delivered" | "objective_completed";
  path?: string;
  detail?: string;
  flag: StoryFlagName;   // must be a valid STORY_FLAG_NAMES entry
  value: string | boolean;
  toast?: string;
  requiredFlags?: StoryFlagName[];  // All must be truthy in currentFlags for trigger to fire
}
```

**`requiredFlags`**: Optional array of flags that must all be truthy before the trigger fires. Used to gate Day 2 quest triggers so they only fire in the correct story context (e.g., `dbt_test_warn` only sets `dbt_test_failed_day2` if `pulled_day2_updates` is already set). Checked in `checkStoryFlagTriggers()` before event matching.

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

## All Story Flag Triggers

### Home PC Flags (`story/storyFlags.ts` — `getStoryFlagTriggers(username)`)

| Flag | Event | Path / Detail | Value |
|------|-------|---------------|-------|
| `read_resume` | `file_read` | `/home/{username}/Downloads/resume_final_v3.pdf` | `true` |
| `pdftotext_unlocked` | `directory_visit` | `/home/{username}/Downloads` | `true` |
| `pdftotext_unlocked` | `file_read` | (any PDF in `~/Downloads`) | `true` |
| `tree_installed` | `command_executed` | detail: `apt_install_tree` | `true` |
| `read_nexacorp_offer` | `file_read` | detail: `nexacorp_offer` | `true` |
| `ssh_unlocked` | `file_read` | detail: `chip_ssh_setup` | `true` |
| `apt_unlocked` | `file_read` | detail: `olive_tree_tip` | `true` |
| `read_cron_backup` | `file_read` | detail: `cron_backup_failure` | `true` |
| `fixed_backup_script` | `file_read` | detail: `fixed_backup_script` | `true` |
| `ran_auto_apply` | `command_executed` | detail: `ran_auto_apply` | `true` |

### NexaCorp Investigation Flags (`story/storyFlags.ts` — `getNexacorpStoryFlagTriggers()`)

| Flag | Event | Path / Detail | Value |
|------|-------|---------------|-------|
| `oscar_searched_logs` | `file_read` | `/var/log/system.log` | `true` |
| `oscar_checked_backups` | `file_read` | `/var/log/system.log.bak` | `true` |
| `oscar_diffed_logs` | `command_executed` | detail: `diff` | `true` |
| `auri_used_head` | `command_executed` | detail: `head` | `true` |
| `auri_used_tail` | `command_executed` | detail: `tail` | `true` |
| `auri_used_wc` | `command_executed` | detail: `wc` | `true` |
| `found_backup_files` | `file_read` | `/var/log/system.log.bak` | `true` |
| `found_auth_backup` | `file_read` | `/var/log/auth.log.bak` | `true` |
| `found_chip_directives` | `file_read` | `/opt/chip/.internal/directives.txt` | `true` |
| `found_cleanup_script` | `file_read` | `/opt/chip/.internal/cleanup.sh` | `true` |
| `read_onboarding` | `file_read` | `/srv/engineering/onboarding.md` | `true` |
| `coder_unlocked` | `file_read` | `/srv/engineering/onboarding.md` | `true` |
| `coder_workspace_stopped` | `command_executed` | detail: `coder_stop` | `true` |
| `coder_workspace_stopped` | `command_executed` | detail: `coder_start` | `false` |
| `read_team_info` | `file_read` | `/srv/engineering/team-info.md` | `true` |
| `read_handoff_notes` | `file_read` | `/srv/engineering/chen-handoff/notes.txt` | `true` |
| `chip_unlocked` | `piper_delivered` | detail: `edward_chip_intro` | `true` |
| `chip_error_seen` | `command_executed` | detail: `chip_api_error` | `true` |
| `printenv_unlocked` | `piper_delivered` | detail: `edward_chip_fix` | `true` |
| `sourced_nexacorp_zshrc` | `command_executed` | detail: `sourced_zshrc` | `true` | requires: `printenv_unlocked` |
| `piper_unlocked` | `file_read` | detail: `welcome_edward` | `true` |
| `discovered_log_tampering` | `file_read` | detail: `discovered_log_tampering` | `true` |
### Dev Container Flags (`story/storyFlags.ts` — `getDevcontainerStoryFlagTriggers()`)

| Flag | Event | Path / Detail | Value |
|------|-------|---------------|-------|
| `ran_dbt` | `command_executed` | detail: `dbt_build` | `true` |
| `found_inflated_metrics` | `command_executed` | detail: `queried_campaign_metrics` | `true` |
| `pulled_day2_updates` | `command_executed` | detail: `git_pull_origin_main` | `true` | requires: `ssh_day2` |
| `dbt_test_failed_day2` | `command_executed` | detail: `dbt_test_warn` | `true` | requires: `pulled_day2_updates` |
| `investigated_null_data` | `command_executed` | detail: `queried_campaign_metrics` | `true` | requires: `dbt_test_failed_day2` |
| `created_fix_branch` | `command_executed` | detail: `git_checkout_b` | `true` | requires: `dbt_test_failed_day2` |
| `fixed_campaign_model` | `command_executed` | detail: `dbt_test_all_pass` | `true` | requires: `dbt_test_failed_day2` |
| `pushed_fix_branch` | `command_executed` | detail: `git_push` | `true` | requires: `fixed_campaign_model` |

### NexaCorp Day 2 Flags (`getNexacorpStoryFlagTriggers()`)

| Flag | Event | Detail | Value |
|------|-------|--------|-------|
| `reported_fix_to_auri` | `objective_completed` | `reported_fix_to_auri` | `true` |

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

- **chapter-1** ("New Beginnings"): Core objectives + 2 grouped optional quest lines:
  - `olive_challenges` (allVisibleChildren) → 6 children: olive_ch_file/which/projects/mv/echo/man
  - `backup_quest` (allVisibleChildren) → 4 children: backup_mkdir/copy/log/verify
  - Ungrouped: explore_home, learn_linux_basics, fix_backup, run_auto_apply, check_email, check_piper, accept_offer
- **chapter-2** ("First Day"): Core objectives + grouped sub-quests:
  - `help_oscar_logs` (concrete check) → 3 children: oscar_search/check/diff_logs
  - `meet_auri` (concrete check) → 5 optional children: auri_ls_data, auri_check_todo, auri_use_head/tail/wc
  - `explore_jchen` (concrete check) → 2 children: discover_tampering, find_directives
  - `olive_power_tools` (allVisibleChildren) → 5 children: olive_pt_grep/wc/redirect/sort_uniq/find
  - `edward_onboarding` (allVisibleChildren) → 5 children: read_onboarding, meet_the_team, try_chip, tell_edward_chip_error, source_zshrc
  - Ungrouped: read_welcome_email, review_handoff, help_auri_pipeline, run_dbt, head_home, investigate_ops_data
- **chapter-3** ("Getting the Hang of This"): Day 2 content:
  - `fix_pipeline_quest` (allVisibleChildren) → 7 children: pull_day2_updates, discover_test_failure, investigate_null_data, create_fix_branch, fix_the_model, push_fix, report_to_auri
  - Ungrouped: ssh_to_work_day2

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

### Command Gating

Commands are gated differently per computer (see `engine/commands/availability.ts`, with gate data in `story/commandGates.ts`):

**Home PC**: `HOME_COMMANDS` set available from the start (ls, cd, cat, pwd, clear, help, mail, nano, save, load, newgame, history, python, pdftotext, tree). `HOME_GATED` commands require story flags:
- `ssh` — unlocked by `ssh_unlocked` (reading chip_ssh_setup email)
- `sudo`, `apt` — unlocked by `apt_unlocked` (reading olive_tree_tip email)
- `pdftotext` — also unlocked by `pdftotext_unlocked` (visiting `~/Downloads` or reading a PDF there)
- `tree` — unlocked by `tree_installed` (running `apt install tree`)

**NexaCorp**: Most commands available by default (including dbt, snow, python). `NEXACORP_GATED` commands require specific story flags from colleague emails:
- `search_tools_unlocked` — unlocks grep, find, diff
- `inspection_tools_unlocked` — unlocks head, tail, wc
- `processing_tools_unlocked` — unlocks sort, uniq
- `coder_unlocked` — unlocks coder (triggered by reading onboarding docs)
- `coder_workspace_stopped` — tracks workspace state; set true by `coder stop`, false by `coder start`. Absent = running. `coder ssh` blocked when true; `coder stop` closes devcontainer tabs via `closeTabsForComputer`
- `chip_unlocked` — unlocks chip (triggered by delivery of `edward_chip_intro` Piper DM)
- `printenv_unlocked` — unlocks printenv, env (triggered by delivery of `edward_chip_fix` Piper DM)
- `piper_unlocked` — unlocks piper (triggered by reading Edward's welcome email)

**Dev Container**: Has a fixed whitelist of commands (`DEVCONTAINER_COMMANDS` in `story/commandGates.ts`). dbt, snow, python, and chip are always available — no story flags needed. Accessed via `coder ssh ai` from NexaCorp, exited with `exit`. The `coder` command supports subcommands: `list`/`ls`, `start`, `stop`, `ssh`, `logs`, `create`, `delete`.

## Event Chain

```
Command execution
  → CommandResult (with triggerEvents)
  → computeEffects() in applyResult.ts
    → builds GameEvent[] (command_executed + file_read events from args)
    → checkStoryFlagTriggers() → StoryFlagUpdate[]
    → checkEmailDeliveries() → new emails in FS
    → transition detection → triggerTransition flag
  → AppliedEffects returned to hook
  → Hook applies: terminal output, FS updates, state updates, email notifications
```

### File-Read Event Generation

`computeEffects()` auto-generates `file_read` events for commands that read files: `cat`, `head`, `tail`, `grep`, `diff`, `wc`, `sort`, `uniq`, `file`, `pdftotext`. Each file argument produces a `{ type: "file_read", detail: absolutePath }` event.

### Special Cases in `computeEffects()`

- **`discovered_log_tampering`**: Detected when `diff` command is run on NexaCorp with args containing `.bak` files — not via standard `StoryFlagTrigger`
- **Transition trigger**: When a `file_read` event matches the `nexacorp_followup` email file path, sets `triggerTransition: true`

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
`diff /var/log/system.log /var/log/system.log.bak` reveals Chip scrubbed `chip-daemon` entries from the active log. This is the key "aha!" moment (sets `discovered_log_tampering`).

### Hidden Directives
`find /opt/chip -name ".*"` discovers `.internal/` directory containing:
- `directives.txt` — Chip's operational rules (data governance, log management, user monitoring, incident response)
- `cleanup.sh` — Nightly script that scrubs chip-daemon entries from active logs

### Data Manipulation
- `grep "system concern" models/marts/dim_employees.sql` exposes employee filtering
- `grep "chip-daemon" models/marts/fct_system_events.sql` exposes event filtering

### NexaCorp Filesystem Investigation Files

| Path | Content |
|------|---------|
| `/var/log/system.log.bak` | Unmodified log showing Chip reading Jin Chen's files, modifying evidence, scrubbing entries |
| `/var/log/auth.log.bak` | Auth log showing Chip's sudo escalation and dbt model modifications |
| `/opt/chip/.internal/directives.txt` | Chip's hidden operational directives |
| `/opt/chip/.internal/cleanup.sh` | Chip's nightly log-scrubbing script |

## Character Reference

When designing story progression, email triggers, or investigation paths involving specific characters, read `docs/characters.md` for their awareness level, mystery angle (what puzzle piece they hold), and interpersonal dynamics. Each "aware" character holds a fragment — no single person sees the full picture.

## Adding a New Story Flag

1. **Add the flag name** to `STORY_FLAG_NAMES` in `story/storyFlags.ts` — `flag` must be a valid `StoryFlagName` entry (the integrity test at `story/__tests__/storyIntegrity.test.ts` will catch invalid references)
2. **Define the trigger** in `story/storyFlags.ts` — add to `getStoryFlagTriggers()` (home), `getNexacorpStoryFlagTriggers()` (NexaCorp), or `getDevcontainerStoryFlagTriggers()` (dev container). Use `getTriggersForComputer(computer, username)` to look up triggers at runtime — this replaces any manual ternary over computer IDs
3. **Use path constants** — story flag trigger paths use constants from `story/filesystem/paths.ts` (`HOME_PATHS`, `NEXACORP_PATHS`) — use these instead of inline strings when adding new path-based triggers
4. **Use the flag** in filesystem generation (`story/filesystem/nexacorp/`), email definitions (`story/emails/`), or Chip behavior
5. **Add tests** for the trigger in `engine/narrative/__tests__/`
6. If the flag should affect NexaCorp content, check `createNexacorpFilesystem()` in `story/filesystem/nexacorp/index.ts`
