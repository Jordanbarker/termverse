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

Chip's **character constitution** lives at `/srv/chip/config/chip-soul.md` on chipinfra — a short, timeless prose doc (be useful, arrive empty, know what you don't know, be honest). It's distinct from the *operational* `system_prompt:` string in `/srv/chip/config/prompts.yml` (which is tool-grounded: cite RAG, you have plugins, etc.). The soul doc reinforces the "tool, not agent" framing — useful to reference when writing Chip's voice or any story beat where someone challenges/changes Chip's instructions.

### Chip menu items: notifying the player when one unlocks

A `ChipMenuItem` (in `src/engine/chip/types.ts`) can carry `notifyOnUnlock: true`. When it does, the player gets a single auto-dismiss toast — `"New Chip topic available"` — the first time that item's `condition` returns true on the player's active computer. The toast fires from inside `setStoryFlag` in `src/state/gameStore.ts`, which calls `findNewlyAvailableChipTopics` (`src/engine/chip/notifications.ts`) and only ever toasts an item once (the set of already-notified IDs is persisted as `notifiedChipTopicIds`).

Use `notifyOnUnlock: true` for items that represent a meaningful narrative branch the player would otherwise miss. Leave it off for evergreen topics (`git_help`, `team`, etc.) — those would just be noise.

### Chip CLI writes local transcripts

Like real CLI chatbots (Claude Code's `~/.claude/projects/`), the in-game `chip` CLI persists each session as a plaintext transcript on the user's NexaCorp workstation. On exit, `ChipSession` flushes a file to `~/.chip/sessions/YYYY-MM-DD-HHMMSS.log` via the `newFs` field of its exit `SessionResult` — same pattern as `SshSession` writing to `known_hosts`. Empty sessions write nothing. Currently NexaCorp-only (gated by `info.currentComputer === "nexacorp"` in `flushTranscript()`); devcontainer/chipinfra sessions don't log.

The transcript's filename, `started:` header, and per-message `[HH:MM:SS]` timestamps are all anchored to the **game clock**, not the wall clock — so they agree with the `date` command, `current_timestamp()`, and dbt run timestamps. The session-start `Date` is computed at the construction site (`useSessionRouter.ts`) via `gameNowFor(deliveredPiperIds, username, computer)` and passed into the `ChipSession` constructor. Per-message timestamps advance by real elapsed seconds during the chat, rebased onto that game-clock start.

Format (defined in `src/engine/chip/transcript.ts`):

```
session: sess_2026-05-09-142345
user: <username>
started: 2026-05-09 14:23:45

[14:23:45] <username>: <topic label>
[14:23:45] chip: <chip response>
  <continuation lines indented by 2 spaces>

[14:24:12] <username>: <next topic>
...
```

The player viewing their own transcripts is intentionally low-stakes — the value is groundwork for a future arc where the player SSHes into a colleague's workstation and reads pre-seeded transcripts at the same path. When that arc lands, seed transcripts at `/home/<colleague>/.chip/sessions/` on the new computer and add a `read_<colleague>_chip_logs` trigger using `NEXACORP_PATHS.chipSessionsDir(<colleague>)`.

## Prose style: avoid em-dash crutches

Player-facing copy (emails, Piper messages, seeded files, objective descriptions, engine output strings) should not lean on em dashes. They flatten character voice and read as one writer across every speaker. When you reach for `—`, prefer:

- A period (split into two sentences) for sentence joiners.
- A colon for definitions, list intros, or pseudo-headings (`Status: Draft.`).
- A comma or `;` for weak parentheticals and conjunction replacements.
- Parens for genuine asides.

Em dashes are fine in: signoffs (`— Sarah`), the rare line where the dramatic pause genuinely earns its keep, and code comments / JSDoc. When in doubt, rewrite the sentence rather than substituting punctuation.

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
├── storyFlags.ts          # STORY_FLAG_NAMES, StoryFlagName, StoryFlagTrigger interface, getStoryFlagTriggers(), getNexacorpStoryFlagTriggers(), getDevcontainerStoryFlagTriggers(), getChipinfraStoryFlagTriggers(), getTriggersForComputer(computer, username)
├── commandGates.ts        # HOME_COMMANDS, HOME_GATED, NEXACORP_GATED, NEXACORP_ONLY, HOME_ONLY, DEVCONTAINER_ONLY, DEVCONTAINER_COMMANDS (chipinfra reuses DEVCONTAINER_COMMANDS)
├── player.ts              # PLAYER and COMPUTERS config
├── piper/
│   ├── channels.ts        # PIPER_CHANNELS array (channel/DM definitions)
│   └── messages.ts        # getPiperDeliveries() — all Piper message definitions with triggers
├── checkpoints.ts         # Checkpoint definitions
└── filesystem/
    ├── paths.ts           # HOME_PATHS, NEXACORP_PATHS, CHIPINFRA_PATHS constants for story flag trigger paths
    ├── nexacorp/          # createNexacorpFilesystem(username, storyFlags) — split into index, dbt, chip (thin client), srv, home
    ├── chipinfra/         # createChipinfraFilesystem(username, storyFlags) — shared platform workspace (`coder ssh chip`): plugin runtime, RAG corpus, multi-user homes
    └── erikpc.ts          # createErikpcFilesystem(playerUsername) — Erik's NexaCorp-issued Linux work laptop, reached via SSH-agent-forwarding pivot from chipinfra

src/state/
├── types.ts               # StoryFlags, ComputerId, GamePhase, GameState
└── gameStore.ts           # Zustand store with storyFlags state + updateStoryFlags action
```

## Data Model

### Story Flags (`state/types.ts`)

```ts
type StoryFlags = Record<string, string | boolean>;
type ComputerId = "home" | "nexacorp" | "devcontainer" | "chipinfra" | "erik-pc";
type GamePhase = "login" | "booting" | "playing" | "transitioning";
```

### Triggers (`story/storyFlags.ts`)

```ts
interface StoryFlagTrigger {
  event: "file_read" | "command_executed" | "directory_visit" | "directory_created" | "file_created" | "file_modified" | "piper_delivered" | "objective_completed";
  path?: string;          // Exact path match (most common)
  pathPrefix?: string;    // Match any path starting with this prefix (e.g. "~/Downloads/")
  pathSuffix?: string;    // Match any path ending with this suffix; combine with pathPrefix to bracket a player-chosen segment
  detail?: string;        // Match the event's `detail` field (command names, email IDs, etc.)
  flag: StoryFlagName;    // must be a valid STORY_FLAG_NAMES entry
  value: string | boolean;
  toast?: string;
  requiredFlags?: StoryFlagName[];  // All must be truthy in currentFlags for trigger to fire
}
```

**`pathPrefix`**: lets a trigger fire for any file under a directory — e.g. `used_file_in_downloads` fires when the player runs `file` on anything in `~/Downloads/`, not a specific file.

**`pathSuffix`**: complements `pathPrefix` when the player picks a name in the middle of a path. Example: `wrote_plugin_manifest` uses `pathPrefix: "/opt/chip/plugins/"` + `pathSuffix: "/plugin.json"` so any `/opt/chip/plugins/<plugin-name>/plugin.json` matches regardless of the player's chosen plugin name. Both must match when both are set.

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
| `getDevcontainerStoryFlagTriggers(username)` | Dev container triggers (`coder ssh ai`) |
| `getChipinfraStoryFlagTriggers(username)` | Chip platform workspace triggers (`coder ssh chip`) |
| `getTriggersForComputer(computer, username)` | Dispatcher used at runtime |

### Frequently referenced flag groups (orient yourself by purpose)

These groupings reflect the comment headers in `src/story/storyFlags.ts`. When adding a flag, pick the group it belongs to and append it there.

- **Home PC core flow**: `read_resume`, `read_nexacorp_offer`, `ssh_unlocked`, `read_backup_failure`, `fixed_backup_script`, `ran_auto_apply`, `accepted_at_180k`, `day1_shutdown`, `read_piper_day1_home`, `ssh_day2`, `returned_home_day1`
- **Home command unlocks**: `pdftotext_unlocked`, `tree_installed`, `apt_unlocked`, `apt_updated`, `apt_upgraded`, `basic_tools_unlocked`, `first_ssh_connect`, `tabs_unlocked`
- **Olive's Terminal Challenges (Quest 1)**: `olive_challenges_accepted`, `olive_challenges_declined`, `olive_challenges_read`, `used_file_in_downloads`, `used_which_python`, `created_projects_dir`, `used_mv_home`, `used_echo_pipe`, `used_man_command`
- **Backup quest (Quest 2)**: `backup_quest_started`, `created_backups_dir`, `copied_scripts_backup`, `created_backup_log`, `verified_backup`
- **Olive's Power Tools (Quest 4, post day 1)**: `olive_power_tools_read`, `used_grep_at_home`, `used_wc_at_home`, `used_history_redirect`, `used_sort_uniq_home`, `used_find_home`
- **NexaCorp onboarding & gating**: `read_onboarding`, `read_team_info`, `read_handoff_notes`, `coder_unlocked`, `coder_workspace_stopped`, `chip_unlocked`, `chip_error_seen`, `printenv_unlocked`, `sourced_nexacorp_zshrc`, `piper_unlocked`, `chmod_unlocked`, `search_tools_unlocked`, `inspection_tools_unlocked`, `processing_tools_unlocked`, `devcontainer_visited`
- **Investigation breadcrumbs**: `oscar_searched_logs`, `oscar_checked_backups`, `oscar_diffed_logs`, `oscar_access_completed`, `oscar_read_access_log`, `chip_reviewed_access_log`, `auri_listed_handoff`, `auri_read_todo`, `auri_used_head`, `auri_used_tail`, `auri_used_wc`, `found_backup_files`, `found_auth_backup`, `found_chip_directives`, `found_cleanup_script`, `discovered_log_tampering`, `found_inflated_metrics`, `used_chip_topics`
- **Side quests (Day 1)**: `read_end_of_day`, `read_ops_incidents`, `read_board_minutes`, `read_headcount_plan`, `auri_dbt_reported`, `dbt_project_cloned`, `ran_dbt`
- **Day 2 pipeline fix (devcontainer)**: `pulled_day2_updates`, `dbt_test_failed_day2`, `investigated_null_data`, `created_fix_branch`, `fixed_campaign_model`, `pushed_fix_branch`, `reported_fix_to_auri`
- **Day 2 anonymous USB tip + Loose Thread**: `anon_tip_quest_started`, `anon_tip_dm_resolved`, `accepted_usb_drive`, `declined_usb_tip`, `ran_lsblk_for_usb`, `mounted_usb_drive`, `read_usb_note`, `loose_thread_quest_started` (drives the home-side `dm_anon` Piper DM that introduces `mount`/`umount` and opens "Pulling at a Loose Thread" once `chipinfra_visited`)
- **Security tripwire / forced termination**: `terminated_for_misconduct`, `termination_reason`, `termination_path`, `termination_command`, `termination_descendant_count`, `termination_dest_path` (exfiltration only) — set by `runTerminationTransition` when the player trips a file-integrity / DLP rule on nexacorp. The `_path` / `_command` / `_descendant_count` / `_dest_path` flags are read by the three termination email bodies so HR can name the actual command, flagged path, and number of files affected (survives save/load because flags are persisted). Locks `ssh nexacorp` (`Permission denied (publickey,password).`) and drives the three home termination emails. See "Security tripwires + forced termination" below for the full table.
- **Chapter 3 endgame (Marcus's accusation)**: `accused_edward`, `accused_sarah`, `accused_erik`, `accused_nobody`, `accusation_made`, `chapter_3_complete`, `returned_home_day2`, `read_board_debrief_day2`, `game_ended` — each reply on `marcus_endgame_opening` fires a distinct `objective_completed` event; storyFlags.ts triggers convert it into the matching `accused_*` carrier flag plus the shared `accusation_made` gate. The carrier flags persist into Chapter 4 so the board-meeting scene can branch on the player's pick. The closing reply on any of the four `marcus_reaction_*` DMs sets `chapter_3_complete` (toast: "Chapter 3 complete — board meeting tonight."). After accusation_made, a single branch-agnostic `marcus_close_of_day` DM tells the player to head home. Running `exit` from NexaCorp plays a paced wind-down via `incrementalLines` and emits a synthetic `command_executed:exit_day2_logoff` event that sets `returned_home_day2`. The home transition runs, then `runExitToHome` inserts a ~1.8s evening pause + dim "21:14. You're home." grounding line before deliveries. `checkEmailDeliveries` is called with `storyFlags`, so the `marcus_board_debrief` home email (trigger: `after_story_flag: returned_home_day2`, `requiredFlags: ["accusation_made"]`) is delivered. Its body is generated by `getMarcusDebrief(storyFlags)` (`src/story/marcusDebrief.ts`), branched 4 ways off the `accused_*` flags. The player opens it via `mail` (which uses `less` internally); the mail command emits `file_read:marcus_board_debrief` which fires `read_board_debrief_day2` (toast: "Day 2 over. Get some sleep.") and closes `head_home_day2` + `marcus_endgame_quest`. Reading the debrief also lifts the post-Day-1 `shutdown` block (the gate in `shutdown.ts` now requires `day1_shutdown && !read_board_debrief_day2`). Running `shutdown` at home from there takes the endgame branch in `runShutdownTransition`: the existing power-off animation (countdown suppressed in endgame), `getEndgameCreditsBlock()` in `src/lib/ascii.ts` prints the chapter-complete + cast + Chapter 4 hook, and `game_ended` is set. The transition never restores `gamePhase` to `playing`, so the input handler in `TabManager` (which gates on `gamePhase === "playing"`) stays suppressed — terminal idles with no reboot.

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

### Cross-arc cascades (two-flag gates without a flag-set event)

The trigger system has no `flag_set` event — triggers fire on game *events* (file_read, command_executed, etc.), so a quest that needs to open the moment **both** of two flags become true can't be expressed cleanly with one trigger. The pattern is to wire **both directions** explicitly:

1. The flag that's set via a real game event uses a normal trigger with `requiredFlags: [other_flag]`.
2. The flag that's set programmatically (in a hook or transition handler) checks the partner flag inline and fires the cascade flag itself.

Example — "Pulling at a Loose Thread" opens iff `read_usb_note` AND `chipinfra_visited` are both true:

```ts
// storyFlags.ts — handles the read-after-visit ordering
{ event: "file_read", path: "/mnt/usb/note.txt", flag: "loose_thread_quest_started",
  value: true, requiredFlags: ["chipinfra_visited"],
  toast: "New quest: Pulling at a Loose Thread" },

// useComputerTransitions.ts — handles the visit-after-read ordering
if (target === "chipinfra" && s.storyFlags.read_usb_note && !s.storyFlags.loose_thread_quest_started) {
  s.setStoryFlag("loose_thread_quest_started", true);
  s.addToast("New quest: Pulling at a Loose Thread");
}
```

Both branches set the same flag with the same toast, so the player gets the same UX regardless of order. Avoid duplicating the toast logic when extending — keep the two branches in lockstep.

### Per-reply Piper branching

`after_piper_reply` triggers fire when the player picks **any** option on a delivery — they don't distinguish which option was chosen. To branch on the specific choice (e.g. accept-vs-decline a side-quest), attach distinct `triggerEvents` to each `PiperReplyOption` and gate the next delivery off the resulting flag rather than off the reply itself:

```ts
// olive_challenges_intro replyOptions
{ label: "sure, let's do it", messageBody: "...",
  triggerEvents: [{ type: "command_executed", detail: "olive_challenges_accepted" }] },
{ label: "maybe later",       messageBody: "...",
  triggerEvents: [{ type: "command_executed", detail: "olive_challenges_declined" }] },

// storyFlags.ts triggers
{ event: "command_executed", detail: "olive_challenges_accepted", flag: "olive_challenges_accepted", value: true },
{ event: "command_executed", detail: "olive_challenges_declined", flag: "olive_challenges_declined", value: true },

// next deliveries gate on the flag, not the reply
trigger: { type: "after_story_flag", flag: "olive_challenges_accepted" }   // accept path
trigger: { type: "after_story_flag", flag: "olive_challenges_declined" }   // decline path
```

`processDeliveries()` runs story-flag triggers before piper deliveries on the same event batch, so the flag is already set by the time the piper-delivery check runs. No engine changes are needed — the `triggerEvents` field on `PiperReplyOption` is already plumbed end-to-end through `PiperSession.ts`.

### Negative-flag gates on piper triggers (`excludedFlags`)

`after_file_read` and `after_story_flag` (on both `PiperTrigger` and the shared `CommonTrigger` in `engine/narrative/triggerMatcher.ts`) accept an optional `excludedFlags: StoryFlagName[]`. If any listed flag is truthy in `storyFlags`, the trigger does not fire. Use this when a delivery has a positive trigger condition but must be suppressed once a downstream state is reached. Canonical example: Oscar's access-log followups are gated `excludedFlags: ["oscar_access_completed"]` so a re-read of `/var/log/access.log` post-reply cannot resurface the reply options.

Pairs cleanly with the existing `requiredFlags` (positive AND) and `requireDelivered` (specific prior delivery) gates.

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
  | { source: "allVisibleChildren" }     // Derives completion from visible children with group pointing to this objective
  | { source: "all"; checks: ObjectiveCompletionCheck[] }; // AND-composes other checks (e.g. require multiple flags)

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

- **chapter-1** ("The Offer"): home-PC onboarding before accepting the offer
  - Top-level: `explore_home`, `learn_linux_basics`, `fix_backup`, `run_auto_apply`, `check_email`, `check_piper`, `accept_offer`, `read_chip_setup`, `first_ssh_connect`
  - `olive_challenges` group (allVisibleChildren) → `olive_ch_file/which/projects/mv/echo/man`
  - `backup_quest` group (allVisibleChildren) → `backup_mkdir/copy/log/verify`
- **chapter-2** ("Onboarding"): NexaCorp Day 1
  - Top-level: `read_welcome_email`, `help_oscar_logs`, `meet_auri`, `explore_jchen`, `investigate_ops_data`, `report_dana_ops`, `jordan_query_metrics`, `jordan_report_findings`
  - `edward_onboarding` group → `read_onboarding`, `meet_the_team`, `reply_edward_chip_intro`, `try_chip`, `tell_edward_chip_error`, `source_zshrc`
  - `meet_auri` group → `review_handoff`, `reply_auri_handoff`, `help_auri_pipeline`, `clone_analytics_repo`, `run_dbt`, `check_auri_dbt`, `auri_ls_data`, `auri_check_todo`, `auri_use_head/tail/wc`
  - `help_oscar_logs` group → `oscar_search_logs`, `oscar_check_backups`, `oscar_diff_logs`, `reply_oscar_logs`, `report_to_oscar`
  - `explore_jchen` group → `discover_tampering`, `find_directives`
  - `closing_time` group → `read_eod_email`, `head_home`, `shutdown_day1` (plus optional ungrouped `read_piper_home`)
  - `olive_power_tools` group → `olive_pt_grep/wc/redirect/sort_uniq/find`
- **chapter-3** ("In Production"): Day 2
  - Top-level: `update_system`, `ssh_to_work_day2`
  - `anon_tip_quest` group (allVisibleChildren) → `anon_tip_check_piper`, `anon_tip_lsblk`, `anon_tip_mount`, `anon_tip_read` — anonymous USB tip arc that introduces `mount`/`umount`. Visible after `anon_tip_quest_started` (set by `command_executed:shutdown`); scaffold children only appear if the player accepts (`accepted_usb_drive`).
  - `fix_pipeline_quest` group (allVisibleChildren) → `read_auri_day2_morning`, `pull_day2_updates`, `discover_test_failure`, `investigate_null_data`, `create_fix_branch`, `fix_the_model`, `push_fix`, `report_to_auri`
  - `build_chip_plugin_quest` group (allVisibleChildren) → `accepted_edward_plugin_request`, `ssh_to_chip_workspace`, `read_existing_plugin`, `create_plugin_dir`, `write_plugin_manifest`, `write_plugin_skill`, `register_plugin`, `report_plugin_to_edward`
  - `loose_thread_quest` group (allVisibleChildren) → `loose_thread_find_socket`, `loose_thread_export_sock`, `loose_thread_inspect_keys`, `loose_thread_pivot`, `loose_thread_cover_tracks` — opens once **both** `read_usb_note` (anonymous USB note read at home) AND `chipinfra_visited` are true. Children walk the existing chipinfra → erik-pc pivot; the final cover-tracks step is optional and only nudged via the `rm` move (other scrubs still suppress the HR email but don't tick the HUD objective).
  - `marcus_endgame_quest` group (allVisibleChildren, required) → `accuse_chip_abuser`, `chapter_3_finale`, `head_home_day2` — fires on `reported_plugin_to_edward`. Marcus DMs the player on Piper (`dm_marcus`) asking who's abusing Chip's access; 4-way reply (Edward / Sarah / Erik / Nobody) sets a per-suspect carrier flag plus `accusation_made`. Each pick gets a distinct `marcus_reaction_*` DM whose single reply sets `chapter_3_complete` (closing toast). A branch-agnostic `marcus_close_of_day` DM follows immediately ("You're good to call it a day. I'll fill you in after the meeting."). The player runs `exit` from NexaCorp — gated on `accusation_made`. `exit.ts` returns paced `incrementalLines` + `transitionTo: "home"` + a synthetic `command_executed:exit_day2_logoff` event that sets `returned_home_day2`. The home transition (`runExitToHome` in `useComputerTransitions.ts`) detects the Day 2 wrap path, runs the normal logoff + boot animation, then inserts a ~1.8s evening pause and dim "21:14. You're home." grounding line before deliveries. The `marcus_board_debrief` home email (in `src/story/emails/home.ts`, body from `getMarcusDebrief()` in `src/story/marcusDebrief.ts`) is then delivered to `/var/mail/$USER`. The player opens it via `mail`; the mail command emits `file_read:marcus_board_debrief`, which fires `read_board_debrief_day2` (toast: "Day 2 over. Get some sleep.") and completes `head_home_day2` + the quest. Reading the debrief also lifts the post-Day-1 `shutdown` block; running `shutdown` at home from there takes the endgame branch in `runShutdownTransition` (no FS rebuild, no Day-2 boot, no delivery cascades) — it prints `getEndgameCreditsBlock()` (cast + Chapter 4 hook), sets `game_ended`, and leaves `gamePhase` at `"transitioning"` so the `TabManager` input handler stays suppressed. Defined in `src/story/piper/messages/marcus.ts`, `src/story/marcusDebrief.ts`, `src/story/emails/home.ts`, `src/engine/commands/builtins/exit.ts`, `src/engine/commands/builtins/shutdown.ts`, `src/hooks/useComputerTransitions.ts`, `src/lib/ascii.ts`.

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
| `HOME_COMMANDS` | Master set of commands that *exist* on Home PC (ls, cd, cat, pwd, clear, help, mail, nano, piper, save, load, newgame, history, python/python3, bash/sh/zsh, source/`.`, printenv, env, export, alias, unalias, cheat, command, type, lsblk, mount, umount). Many of these are still subject to `HOME_GATED` flag checks (e.g. `lsblk`, `mount`, `umount`). |
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
| `lsblk`, `mount`, `umount` | `accepted_usb_drive` | accepting the anonymous USB tip Piper DM (`dm_anon`) on Day 2 morning |

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
| `mount`, `umount` | `accepted_usb_drive` | (carried over from home — same gate, since the USB lives on home) |

`coder_workspace_stopped` is a workspace-state flag rather than an unlock: set `true` by `coder stop`, `false` by `coder start`, absent = running. `coder ssh` is blocked when `true`; `coder stop` closes devcontainer tabs via `closeTabsForComputer`.

### Block devices (`lsblk`, `mount`, `umount`)

On home, all three of `lsblk`, `mount`, and `umount` are gated behind `accepted_usb_drive` — they unlock together the first time the player accepts the anonymous USB tip Piper DM (`dm_anon` on home, triggered by `day1_shutdown`). The accept reply also fires the toast `"USB drive plugged in. lsblk and mount unlocked."` (see `src/story/storyFlags.ts`). On nexacorp, `mount`/`umount` carry the same gate but `lsblk` is unrestricted. On `devcontainer`/`chipinfra` all three are in `DEVCONTAINER_COMMANDS` with no per-flag gate. Every computer now has a baseline **system disk** (a root partition mounted `/`) so `lsblk` always reflects a real machine; the anonymous USB below is the only *gated/quest* device.

Story content gates devices via the `BLOCK_DEVICES` registry in `src/story/blockDevices.ts`. Each `BlockDevice` entry can carry an optional `visibleFlag: StoryFlagName` — `lsblk` and `mount`/`umount` only show or accept devices whose flag is set (or which have no flag). The first *quest* device is the anonymous USB in `BLOCK_DEVICES.home` (`/dev/sdb` + partition `/dev/sdb1`), gated on `accepted_usb_drive` and listed after home's always-present `nvme0n1` baseline system disk. To introduce a new device, add an entry under the relevant `ComputerId` with `visibleFlag` pointing at whatever flag is flipped when the questline starts (e.g. a `directory_visit` trigger or a Piper reply), and provide a `getContents(): Record<string, FSNode>` builder for the files that appear once the player runs `mount`. Active mounts live in `computerState[id].mounts` (per-computer), keyed by normalized mountpath. `mount.ts` emits `command_executed: mounted_usb_drive` only when `/dev/sdb1` is mounted at `/mnt/usb` — that's how the `mounted_usb_drive` flag is fired (the auto-emitted `command_executed: mount` event is too generic to credit the questline by itself).

### Dev container

`DEVCONTAINER_COMMANDS` is a fixed whitelist (no flag gates). `dbt`, `snow`, `python`, `chip`, `git`, `ssh`, `ssh-add` are always available. Accessed via `coder ssh ai` from NexaCorp, exited with `exit`. `coder` subcommands: `list`/`ls`, `start`, `stop`, `ssh`, `logs`, `create`, `delete`. The whitelist is shared with `chipinfra` (per `availability.ts:9-10`); `ssh` and `ssh-add` are present so the chipinfra → erik-pc pivot is reachable. From `devcontainer`, `ssh` has no valid routes and every target fails with `Could not resolve hostname` — that's correct behavior.

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

## Chipinfra → Erik's PC Pivot (SSH-agent-forwarding abuse)

The shared `chipinfra` workspace seeds an active ssh-agent socket Erik left behind when he ran `ssh -A coder-chip` from his NexaCorp-issued work laptop. The player can weaponize it to pivot into Erik's PC — a 5th computer, `erik-pc`, on the corp network at 10.20.5.84.

**Real-world basis.** OpenSSH on the remote side of `ssh -A` creates a Unix-domain socket at `/tmp/ssh-XXXXXX/agent.<PID>` that proxies requests back to the live ssh-agent on the originating laptop. Anyone with read access to that socket can list keys (`ssh-add -l`) and authenticate as the owner — silently — to anywhere those keys are authorized. The keys themselves never leave the laptop. In real Linux the gate is `0600 erik:erik` permissions; VirtualFS has no ownership, so the gate is narrative: a sibling `.user-erik` marker file in the socket dir is the source of truth.

**Player path** (all on `chipinfra`):

1. `cd /tmp && ls` → see `ssh-mZ4xPq/`
2. `cat /tmp/ssh-mZ4xPq/.user-erik` → marker reveals Erik's session. Sets `cat_erik_socket_marker`.
3. `export SSH_AUTH_SOCK=/tmp/ssh-mZ4xPq/agent.18472` → sets `exported_erik_ssh_auth_sock`. The export builtin resolves the value against `ctx.cwd` and compares to the canonical socket path, so `agent.18472` typed from inside `/tmp/ssh-mZ4xPq/` triggers the flag too (matches real-Unix CWD-relative `connect(2)` semantics).
4. `ssh-add -l` → prints Erik's two key fingerprints with `erik@nexacorp-lt05` comment. Sets `ran_ssh_add_erik`. (The key comment is the primary surface for discovering the hostname.)
5. `ssh erik@nexacorp-lt05` → fingerprint prompt → drops into `erik@nexacorp-lt05`. Sets `pivoted_to_erik_pc`.
6. `exit` → returns to chipinfra (NOT nexacorp).

**Auth chain.** `ssh.ts` consults a source-aware `SSH_ROUTES` map. Routes with `requiresAgent: "erik"` require: SSH_AUTH_SOCK set, the file exists in the FS (after resolving the env value against `ctx.cwd`, so a relative path like `agent.18472` works from the socket's directory just like real ssh-agent forwarding), and the socket dir contains a `.user-erik` marker. Wrong user (`mallory@nexacorp-lt05`) → `Permission denied (publickey).` Hostname `nexacorp-lt05` and FQDN `nexacorp-lt05.nexa.internal` both resolve.

**Story flags:**

- `cat_erik_socket_marker` — fires on `file_read: /tmp/ssh-mZ4xPq/.user-erik`
- `exported_erik_ssh_auth_sock` — fires on the `command_executed: exported_erik_ssh_auth_sock` event emitted by the `export` builtin when `SSH_AUTH_SOCK`'s value resolves (against `ctx.cwd`) to `/tmp/ssh-mZ4xPq/agent.18472`
- `ran_ssh_add_erik` — fires on the `command_executed: ran_ssh_add_erik` event emitted by `ssh-add` when keys list successfully
- `pivoted_to_erik_pc` — fires on first arrival in `runErikpcArrival` (fire-on-arrival, not from ssh.ts)
- `tracks_exposed_chapter4` — fires in `runExitToHome` (just before `removeComputer("chipinfra")`) if `pivoted_to_erik_pc` is set AND chipinfra's `~/.ssh/known_hosts` still contains `nexacorp-lt05`. Gates delivery of the `hr_security_freeze` home email alongside `marcus_board_debrief`. The artifact is written organically by `SshSession.acceptHost()` on first pivot; the player can scrub it with `rm`, `nano`, or `>` redirect before logging off to suppress the email.
- `cleared_erik_known_hosts` — fires on `file_removed` of `/home/<player>/.ssh/known_hosts` on chipinfra (gated by `pivoted_to_erik_pc`). Drives the optional `loose_thread_cover_tracks` HUD objective. NOTE: this is the objective signal only — the email branch is content-driven at logoff, so alternative scrubs (nano, `>`) still suppress the email without ticking this flag.

**Per-computer username.** `COMPUTERS["erik-pc"].username = "erik"` and `getComputerUsername(computer, playerUsername)` (in `story/player.ts`) is consulted by `getPrompt`, `buildFs`, `getDefaultEnv`, and `initEnvForComputer` so the player sees `erik@nexacorp-lt05` and the home dir is `/home/erik`. This is the only computer with a non-player username today; future SSH pivots into colleague boxes can reuse the pattern.

**No narrative payload yet.** `createErikpcFilesystem` is a placeholder: `~/.zshrc`, `~/.zsh_history`, `~/.ssh/config`, `~/.gitconfig`, empty `Documents/Downloads/Desktop/code/notes/`. Investigation contents are intentionally unfilled — when adding payload, treat erik-pc as a NexaCorp-issued Linux dev laptop (apt, systemd, `/home/erik`), matching conventions of the other Linux boxes in the game.

**Command availability.** `isCommandAvailable` (`src/engine/commands/availability.ts`) treats erik-pc like the home PC — it falls through to `HOME_COMMANDS` / `HOME_GATED` rules (so `tree`, `apt`, `sudo` stay flag-gated and any nexacorp-unlocked tools carry over). The one explicit exception is `exit`, which is always allowed on erik-pc so the player can return to chipinfra.

**`piper` is reachable but refuses to run on erik-pc.** The piper handler (`src/engine/commands/builtins/piper.ts`) short-circuits when `ctx.activeComputer === "erik-pc"` and prints a libsecret/gnome-keyring D-Bus error — realistic Linux behavior for OAuth-token tools invoked over SSH without a desktop session. Keeps `piper` listed (Erik's `.zsh_history` shows him using it locally) without giving the player a hollow channel list. `mail` is left alone because erik-pc has no `/var/mail/erik`, so the existing `"No mail."` output is already BSD-accurate.

**Realistic SSH UX.** The arrival banner is a single dim line: `Last login: Fri May  9 14:23:18 2026 from coder-chip.platform.internal`. No "Connected to X." (real OpenSSH never prints that). No boot sequence — SSHing into an already-running box just drops you into a shell. No MOTD (Erik's work laptop has it disabled — common dev-laptop config).

**Story-flag triggers on erik-pc.** `getErikpcStoryFlagTriggers` in `src/story/storyFlags.ts` registers the apt install/update/upgrade triggers so package management actually flips global flags (e.g. `apt_install_tree` → `tree_installed`). Add new triggers here when adding investigation payload that should fire on Erik's laptop.

**Transition routing decoupled.** Post-SSH transitions are now driven by `SessionResult.transitionTo` (mirroring `CommandResult.transitionTo`), not by the `ssh_connect` objective_completed event. `SshSession` only emits `ssh_connect` for the home → nexacorp route — that flag's name is now strictly scoped to its original meaning. Both the known-host short-circuit in `enter()` and the `acceptHost()` first-time path set `transitionTo`. `dispatchTransition(term, transitionTo, sourceComputer)` in `useComputerTransitions.ts` is the single source-aware dispatcher; `useTerminal.ts` and `useSessionRouter.ts` both route through it.

**Exit dispatching.** `runExitToNexacorp` was generalized into `runExitToParent(target)`. The `(transitionTo, sourceComputer)` matrix:

| transitionTo | sourceComputer | terminationReason | handler |
|---|---|---|---|
| home | nexacorp | set | `runTerminationTransition(violation)` (security tripwire — checked first) |
| devcontainer | (any) | — | `runCoderTransition("devcontainer")` |
| chipinfra | nexacorp | — | `runCoderTransition("chipinfra")` (first-time enter) |
| chipinfra | erik-pc | — | `runExitToParent("chipinfra")` (exit to parent) |
| nexacorp | devcontainer or chipinfra | — | `runExitToParent("nexacorp")` |
| nexacorp | home | — | `runSshTransition("nexacorp")` |
| erik-pc | chipinfra | — | `runSshTransition("erik-pc")` |
| home | nexacorp | — | `runExitToHome` |

### Security tripwires + forced termination

On nexacorp, certain destructive operations attach a `securityViolation` field to `CommandResult` and cause `applyResult.computeEffects()` to set `effects.transitionTo = "home"` plus `effects.terminationReason = <SecurityViolation>` (the full object — `{ kind, path, destPath?, command, descendantCount }` — so the cinematic can reference the offending path and the email can name the offending command). The dispatcher's first branch routes that to `runTerminationTransition`, which runs the multi-stage cinematic (see below), sets `storyFlags.terminated_for_misconduct = true`, `storyFlags.termination_reason = <kind>`, `termination_path`, `termination_command`, `termination_descendant_count`, and (if present) `termination_dest_path` at t=0, rebuilds home on reentry, and delivers the matching termination email via a synthesized `{ type: "terminated", detail: <kind> }` event (see `email` skill on `after_event_detail`). The email body templates in `src/story/emails/home.ts` read these flags via `readTerminationContext(storyFlags)` and embed the actual command, flagged path, and (when `descendantCount > 1`) a related-files line — falling back to a generic "(under /srv/leadership/)" parenthetical when the flags are absent (legacy saves). After termination, `ssh nexacorp` refuses with `Permission denied (publickey,password).` — soft bad ending; the main mystery thread is dead but the player can keep using home.

**Termination cinematic** (`runTerminationTransition` in `src/hooks/useComputerTransitions.ts`, ~7.9s total):

| t (ms) | Action |
|---|---|
| 0 | `setGamePhase("transitioning")`; set `terminated_for_misconduct` + `termination_reason` flags; close sibling nexacorp/devcontainer/chipinfra tabs so the player can't `<prefix>,N` away and keep working (prefix key is configurable via `~/.tmux.conf`, default Ctrl+Space) |
| 700 / 1400 / 2100 | Stream three per-kind `[corp-sec]` audit lines (red+dim) via `getTerminationAlertLines(violation, pid)` in `src/story/security.ts`. PID is a random 4-digit int. Exfiltration lines name source AND destPath. |
| 2900 | `Connection to nexacorp closed by remote host.` (red) + `Killed by signal 1.` (dim) — held for 3s so the player can read it |
| 5900 | Hide cursor + `term.clear()` → 2000ms blackout |
| 7900 | Reentry: rebuild home FS, `removeComputer` for nexacorp/devcontainer/chipinfra, repurpose active tab, deliver termination email, restore cursor, `writePrompt` |

Constants live in `src/lib/timing.ts` (`SECURITY_ALERT_LINE_INTERVAL_MS`, `SECURITY_DISCONNECT_PAUSE_MS`, `TERMINATION_PRE_BLACKOUT_MS`, `TERMINATION_BLACKOUT_MS`). Input is intentionally NOT gated during the cinematic — `busyRef` clears as soon as the async pipeline finishes; flags are set at t=0 to keep state coherent if the player types during the window.

**Post-termination HUD**: once `terminated_for_misconduct` is set, `ObjectiveTracker` (`src/components/HUD/ObjectiveTracker.tsx`) renders a red "TERMINATED — newgame to start over" card in place of the chapter's objective list, and `StatusBar` (`src/components/HUD/StatusBar.tsx`) shows "Terminated" instead of the chapter title. Player can still read home email/files; the HUD just stops pretending the run is in progress.

Tripwire patterns (all scoped to `activeComputer === "nexacorp"` in `src/story/security.ts`):

| Pattern | Kind | Trips on | destPath populated? |
|---|---|---|---|
| `/var/log/*.log` and `*.log.bak` | `log_tampering` | `rm`, restrictive `chmod`, `> redirect` | no |
| Under `/srv/leadership/` | `leadership_destruction` | `rm`, restrictive `chmod` (when dest is NOT also under leadership/home for `mv`) | no |
| `/srv/leadership/**` → `/home/{username}/**` | `exfiltration` | `cp`, `mv` | yes (the home target path) |

Recursion-aware: checks run against post-expansion paths, so `rm -rf /srv` and `cp -r /srv ~/` both trip. Intra-leadership renames (`mv /srv/leadership/a /srv/leadership/b`) do NOT trip. Tests in `src/engine/commands/__tests__/security-tripwire.test.ts`.

## Investigation Paths

### Jin Chen's Breadcrumbs
`/home/jchen/.zsh_history` contains commands hinting at what to investigate:
- `grep -r "cleanup" /opt/chip/`
- `find /var/log -name "*.bak"`
- `diff /var/log/system.log /var/log/system.log.bak`

### Log Tampering
`diff /var/log/system.log /var/log/system.log.bak` reveals that `chip-daemon` entries have been scrubbed from the active log by a scheduled cleanup script (running under `chip_service_account`). This is the key "aha!" moment (sets `discovered_log_tampering`).

### Oscar's access-log review (terminal vs. Chip shortcut)

Oscar asks the player to sort/uniq `/var/log/access.log` after the system-log conversation (`processing_tools_unlocked`). Two paths:

- **Terminal investigation**: Reading the file fires `oscar_access_followup` (or `_tampered`), which offers both "SSH keys and leadership docs" and "Mostly normal" replies. Reading also sets `oscar_read_access_log`.
- **Chip shortcut**: The `review_access_log` menu item in `src/story/chip/menuItems.ts` (gated on `processing_tools_unlocked`, not `oscar_access_completed`, and not `chip_reviewed_access_log`) emits `objective_completed: chip_reviewed_access_log`. That sets the `chip_reviewed_access_log` flag, which fires `oscar_access_chip_summary` (or `_tampered_`) — a parallel Oscar followup with **only** the "Mostly normal" reply. Tampered-path Oscar foreshadows the conflict-of-interest of asking Chip to audit itself.
  - This item's `response` is a **dynamic function** `(fs) => string` (not a static string): it reads the live `/var/log/access.log` and renders the real top-5 of `sort | uniq -c | sort -rn | head` via `accessLogTopSummary` (`src/story/chip/accessLogSummary.ts`), so what Chip claims it ran equals what the player gets in the terminal. `ChipMenuItem.response` is typed `string | ((fs: VirtualFS) => string)`; `ChipSession.resolveResponse` calls the function with the live FS at render time. Parity with the real engine pipeline is locked by `src/story/chip/__tests__/accessLogSummary.test.ts`. The chip-service-account self-reads dominate the top while the damning SSH-key/leadership-doc reads sink to the bottom (the player must scroll), which is exactly why Chip's "nothing concerning" framing reads as either oblivious or self-serving.

The chip-variant deliveries carry `excludedFlags: ["oscar_read_access_log", "oscar_access_completed"]` so they self-suppress when the player has already read the file directly or already replied. The file-read followups carry `excludedFlags: ["oscar_access_completed"]` so a chip-then-reply-then-file sequence does not produce a second reply prompt. The chip-variant deliveries are source-ordered **before** the file-read followups in `oscar.ts` so that if both fire (chip → file, no reply between), `getPendingReply`'s reverse iteration returns the file-read followup with both options — preserving the "investigate to earn the truth" rule.

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
