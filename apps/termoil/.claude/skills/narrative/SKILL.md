---
name: narrative
description: "Story flags, triggers, chapter/objective system, investigation paths, Chip assistant, and the home→NexaCorp transition. Use this skill whenever modifying story progression, adding/changing story flags, working on investigation triggers, or touching files under src/engine/narrative/, src/story/, src/engine/assistant/, or story-flag-related code in src/engine/commands/applyResult.ts."
---

# Narrative System

Tracks player discoveries via story flags, fires email/Piper deliveries and story progression off game events, and manages the home→NexaCorp→devcontainer/chipinfra→erik-pc computer transitions.

Code map: `src/engine/narrative/` (types, `objectives.ts`, `storyFlags.ts` trigger engine, `triggerMatcher.ts`), `src/story/` (the content: `chapters.ts`, `storyFlags.ts`, `commandGates.ts`, `player.ts`, `piper/`, `filesystem/`), and `src/engine/commands/{applyResult,processDeliveries}.ts` (events → flag updates + deliveries). All types live in `engine/narrative/types.ts` and `state/types.ts` — read them there.

## Chip is an LLM tool, not a character

Write Chip the way you'd write ChatGPT or Claude — a tool employees prompt through the `chip` CLI. It is **not autonomous and not sentient**: no goals, feelings, or initiative. Every "scheduled Chip task" is a systemd timer or webhook handler authored by a human (Edward, ops, ex-engineer Jin) that invokes Chip with a specific prompt. Both boxes use **systemd timers, not cron** (`/etc/systemd/system/` on NexaCorp, `~/.config/systemd/user/` on the Home PC).

When the mystery surfaces something suspicious "Chip did", the agency is human: Edward's prompts/plugin configs, systemd-timer services running under `chip_service_account` (e.g. `chip-log-maintenance.timer` runs the log-scrub script Edward wrote — Chip didn't decide to scrub its own logs), or plugins Edward quietly modified.

- ✅ "ask Chip, it's good at explaining git" / "the chip-monitor plugin emits a heap-pressure warning" / "Edward added a filter to scrub `chip_service_account` entries"
- ❌ "Chip notices its own heap pressure" / "Chip knows git better than anyone" / "Chip cleans up after itself" / "Chip is doing things outside its spec" (say instead: "Chip's responses don't match the spec — likely a plugin or prompt change")

First-person voice is fine ("I'm Chip", "I can query Snowflake when you ask") — that's how LLMs talk. The line is between *describing what Chip does when invoked* (fine) and *claiming unprompted initiative* (not fine). The "Chip going autonomous" content in `/srv/` is Edward's *intent*, plot-relevant, and stays. Chip's character constitution is `/srv/chip/config/chip-soul.md` (timeless prose); the operational prompt is `system_prompt:` in `/srv/chip/config/prompts.yml`.

## Prose style: avoid em-dash crutches

Player-facing copy (emails, Piper, seeded files, objectives, engine strings) should not lean on em dashes — they flatten every speaker into one voice. Prefer a period (sentence joiners), a colon (definitions/pseudo-headings), a comma/`;` (weak parentheticals), or parens (asides). Em dashes are fine in signoffs (`— Sarah`), the rare earned dramatic pause, and code comments. When in doubt, rewrite the sentence.

## Story flags — source of truth

**Don't maintain a hand-curated flag table here — it rots.** `STORY_FLAG_NAMES` in `src/story/storyFlags.ts` (100+ entries, grouped by arc under comment headers) is authoritative; the integrity test `src/story/__tests__/storyIntegrity.test.ts` fails any reference to an undefined flag. Flags set programmatically via `setStoryFlag` must still be registered there (the type system won't force it). Trigger interface (`StoryFlagTrigger`) and the per-computer trigger functions (`getStoryFlagTriggers` / `getNexacorpStoryFlagTriggers` / `getDevcontainerStoryFlagTriggers` / `getChipinfraStoryFlagTriggers` / `getErikpcStoryFlagTriggers`, dispatched by `getTriggersForComputer`) are all in that file.

Trigger matching notes worth knowing: `pathPrefix` fires for any file under a dir; `pathSuffix` brackets a player-chosen middle segment (both must match when both set); `requiredFlags` gates on prior flags (positive AND, checked before event matching). Non-obvious flag groups: **termination detail flags** (`termination_path/command/descendant_count/dest_path`) are set by `runTerminationTransition` and read by termination email bodies; **accusation carrier flags** (`accused_*`, `accusation_made`) persist past Chapter 3 for a planned Chapter 4 branch.

Two special triggers live in `applyResult.ts`, not the trigger tables: `discovered_log_tampering` (`diff` on NexaCorp with `.bak` args) and the transition trigger (reading the `nexacorp_followup` email sets `triggerTransition`).

### Result-oriented `command_executed` details — validate results, not keystrokes

Founding principle: `find the hidden file` should accept `ls -a`, `ls -la`, `find . -name ".*"`, or any valid approach. Quest triggers fire on the *outcome*, not the literal command. Several builtins emit a synthetic `command_executed` event with a result-shaped `detail` (e.g. `python_located`, `text_filtered`, `data_deduped`, `files_searched`) so multiple commands credit the same flag — see the emitters in `which.ts`/`grep`/`sort`/etc. When adding a builtin that produces one of these outcomes, emit the matching event from its `triggerEvents`; when adding a new outcome, prefer this over a command-name `detail`.

**Tutorial carve-out — strict on purpose:** a few flags still match the command name because the objective text names the tool (`used_mv_home`, `used_wc_at_home`, `used_echo_pipe`). Loosening them defeats the teaching moment. Document any future strict trigger here so it doesn't get "fixed".

### Cascade / cross-arc / branching patterns

These are the non-obvious trigger-wiring idioms; the code examples live in `storyFlags.ts` and the hook files.

- **Read-pair cascade** — an objective that means "compare two files" (`oscar_diffed_logs`) is credited by two triggers, one per file, each gated on the *other* having been read (`requiredFlags`). Order-independent, no double-count (guarded by the `currentFlags[flag] === undefined` check in `checkStoryFlagTriggers`).
- **Cross-arc cascade (two-flag gate, no `flag_set` event)** — the trigger system fires on game events, not flag-sets, so "open when BOTH flags true" needs both directions wired: the event-set flag uses a normal trigger with `requiredFlags: [other]`; the programmatically-set flag (in a hook/transition) checks the partner inline and fires the cascade flag itself, with the same toast. Canonical case: "Pulling at a Loose Thread" (`read_usb_note` AND `chipinfra_visited`), split across `storyFlags.ts` and `useComputerTransitions.ts`. Keep the two branches in lockstep.
- **Result cascade** — a second trigger whose `flag` is an upstream milestone but whose event is a *downstream* proof (e.g. a green `dbt build` proves the NULLs were diagnosed and a branch was made). **Always gate cascades with `requiredFlags`.** See the Day 2 "Fix the Broken Pipeline" cascade in `getDevcontainerStoryFlagTriggers()`. Note `git_checkout_b` is emitted by `checkout -b`, `switch -c`, AND `branch <name>` — any realistic branch creation counts.
- **Per-reply Piper branching** — `after_piper_reply` doesn't distinguish which option was picked. To branch on a specific choice, attach distinct `triggerEvents` to each `PiperReplyOption` and gate the next delivery off the resulting flag. `processDeliveries()` runs flag triggers before piper deliveries in the same batch, so the flag is set in time. Plumbing is already end-to-end via `PiperReplyOption.triggerEvents`.
- **Negative-flag gates (`excludedFlags`)** — `after_file_read`/`after_story_flag` (on `PiperTrigger` and the shared `CommonTrigger`) accept `excludedFlags`; if any is truthy the trigger is suppressed. Use to stop a delivery resurfacing once a downstream state is reached (Oscar's access-log followups gated on `oscar_access_completed`). Pairs with `requiredFlags` (AND) and `requireDelivered`.

## Objectives, chapters, gating

- **Objectives/chapters** — `src/story/chapters.ts` is the source of truth (three chapters: "The Offer", "Onboarding", "In Production"). Types (`ObjectiveDefinition`, `ObjectiveCompletionCheck`, `resolveObjectives`) are in `engine/narrative/types.ts` + `objectives.ts`. Don't mirror the objective tree here; read `chapters.ts` and `docs/storyboard/chapter-{1,2,3}.md`. Resolution is three-pass (completion → visibility → `allVisibleChildren` derivation). Groups: parent with `check: allVisibleChildren`, children with `group: "parent_id"`; groups can't nest and must be same-chapter (validated by `storyIntegrity.test.ts`). Non-obvious behaviors (`anon_tip_quest`, `loose_thread_quest`, `marcus_endgame_quest` spanning many files) are documented in comments at their definitions.
- **Command gating** — source of truth `src/story/commandGates.ts` (`HOME_COMMANDS`, `HOME_GATED`, `NEXACORP_GATED`, `NEXACORP_ONLY`, `HOME_ONLY`, `DEVCONTAINER_COMMANDS`, `DEVCONTAINER_ONLY`). Read the maps there rather than a mirror. Traps: `man` is **never** gated (it's the discovery command, self-limits to available commands); `shutdown` is ungated on every computer and consequence-free except two scripted home beats (end-of-Day-1 and endgame) — the flag triggers for those carry `requiredFlags: ["returned_home_day1"]` so a cosmetic reboot can't advance the day; a mid-shift nexacorp `exit` is a **soft disconnect**, only an `isEndOfDayExit()` exit tears down the workday. `coder_workspace_stopped` is a state flag (set by `coder stop`/`start`), not an unlock. Block devices (`lsblk`/`mount`/`umount`) gate via the `BLOCK_DEVICES` registry in `src/story/blockDevices.ts` (`visibleFlag` + `getContents()`); every computer has a baseline system disk, and `mount` emits `mounted_usb_drive` only for `/dev/sdb1` at `/mnt/usb`.

## Event chain

`Command → CommandResult(triggerEvents) → computeEffects() (applyResult.ts) → processDeliveries() → { checkStoryFlagTriggers, checkEmailDeliveries, checkPiperDeliveries } + transition detection → AppliedEffects → hook applies output/FS/state/notifications.` `computeEffects()` auto-generates `file_read` events for commands registered `readsFiles: true` (see the commands skill).

## Chip assistant specifics

- **Menu items** (`src/engine/chip/types.ts`, content in `src/story/chip/menuItems.ts`). `notifyOnUnlock: true` gives a one-time "New Chip topic available" toast the first time an item's `condition` passes (fired from `setStoryFlag` via `findNewlyAvailableChipTopics`, deduped by `notifiedChipTopicIds`). Use it for meaningful branches, not evergreen topics.
- **`applyFs`** — a menu item can carry `applyFs?: (fs) => VirtualFS`; the mutation applies to the live FS and threads out via `SessionResult.newFs` on exit. Write it **idempotent** (items can be re-selected). First use: `fix_campaign_model` applies the COALESCE fix on the devcontainer (see Day 2 quest below).
- **`response` can be dynamic** — `string | ((fs) => string)`, resolved at render time against the live FS. Used by `review_access_log` to render the real `sort|uniq -c|sort -rn|head` top-5 via `accessLogTopSummary`, so Chip's claim matches the terminal. Parity locked by `accessLogSummary.test.ts`.
- **Transcripts** — `ChipSession` flushes each session to `~/.chip/sessions/YYYY-MM-DD-HHMMSS.log` on exit via `newFs` (NexaCorp only, gated in `flushTranscript()`). Filename/`started:`/per-message timestamps are anchored to the **game clock** (via `gameNowFor(...)` at the `useSessionRouter.ts` construction site), not wall-clock. Format defined in `src/engine/chip/transcript.ts`. Groundwork for a future arc reading a colleague's pre-seeded transcripts at the same path.

## Investigation paths (the mystery)

Jin Chen's `~/.zsh_history` breadcrumbs point at the log tampering: `diff /var/log/system.log /var/log/system.log.bak` reveals `chip-daemon` entries scrubbed by a systemd-timer cleanup script running as `chip_service_account` — the key "aha" (`discovered_log_tampering`). Other threads: hidden `/opt/chip/.internal/` (`directives.txt` Edward-authored, `cleanup.sh` the nightly scrub) found via `find /opt/chip -name ".*"`; dbt-model data manipulation (`dim_employees.sql` filters "system concern" employees, `fct_system_events.sql` filters chip events — see the dbt skill); the `.bak` logs showing `chip_service_account` reading Jin's files and escalating. Read `docs/characters.md` for who knows what (each aware character holds one fragment).

Two paths carry a **terminal-vs-Chip-shortcut** structure worth preserving:
- **Oscar's access-log review** — reading `/var/log/access.log` fires `oscar_access_followup` (both replies); the Chip `review_access_log` item fires a parallel `oscar_access_chip_summary` with **only** the "Mostly normal" reply. Chip-variant deliveries carry `excludedFlags` and are source-ordered *before* the file-read followups so `getPendingReply`'s reverse iteration prefers the full-reply version — preserving "investigate to earn the truth".
- **Day 2 pipeline quest** — the `fix_campaign_model` Chip item applies the COALESCE fix via `applyFs` but does **not** advance the quest (no `triggerEvents`, no `fixed_campaign_model`); the player still runs `dbt build` and branches/commits/pushes for real.

## Transitions

- **Home → NexaCorp** — reading `nexacorp_offer` → accept/reject reply chain (three persuasion rounds; third rejection is a dead end); accepting delivers `nexacorp_followup`; reading it sets `triggerTransition` → `gamePhase: "transitioning"` → `useLoginSequence` builds NexaCorp FS → boot → `playing`.
- **Chipinfra → Erik's PC (SSH-agent-forwarding pivot)** — the shared chipinfra workspace seeds Erik's live ssh-agent socket (`/tmp/ssh-mZ4xPq/`). Player path: read `.user-erik` marker → `export SSH_AUTH_SOCK=...` → `ssh-add -l` (key comment reveals `nexacorp-lt05`) → `ssh erik@nexacorp-lt05`. Auth is narrative (VirtualFS has no ownership): the `.user-erik` sibling marker gates it. `ssh.ts` uses a source-aware `SSH_ROUTES` map; `requiresAgent: "erik"` routes check SSH_AUTH_SOCK set + socket file exists (resolved against `ctx.cwd`, so a relative `agent.18472` works like real forwarding) + `.user-erik` present. Flags: `cat_erik_socket_marker`, `exported_erik_ssh_auth_sock`, `ran_ssh_add_erik`, `pivoted_to_erik_pc` (fire-on-arrival), `tracks_exposed_chapter4` (set in `runExitToHome` if the pivot happened AND `~/.ssh/known_hosts` still names `nexacorp-lt05` — gates the `hr_security_freeze` email; scrubbable pre-logoff), `cleared_erik_known_hosts` (objective signal only; the email branch is content-driven so nano/`>` scrubs also suppress it). `erik-pc` is the only computer with a non-player username (`getComputerUsername` in `story/player.ts`); its FS (`createErikpcFilesystem`) is a placeholder — treat it as a NexaCorp-issued Linux dev laptop when adding payload. `piper` is reachable but short-circuits with a libsecret D-Bus error (no desktop session). Arrival is a single dim `Last login:` line — no "Connected", no boot, no MOTD.
- **Transition dispatch** — driven by `SessionResult.transitionTo` (mirrors `CommandResult.transitionTo`), routed by the single source-aware `dispatchTransition(term, transitionTo, sourceComputer)` in `useComputerTransitions.ts`. `SshSession` only emits `ssh_connect` for the home→nexacorp route. The `(transitionTo, sourceComputer)` → handler matrix lives in that file; the security-tripwire `terminationReason` branch is checked first. `runExitToParent` is a **soft disconnect** (repurposes only the active pane, keeps sibling panes + `computerState`, reattach on reconnect); the end-of-day nexacorp exit runs the full teardown instead.

## Security tripwires + forced termination

On nexacorp, destructive ops attach a `securityViolation` to `CommandResult`; `computeEffects()` sets `transitionTo = "home"` + `terminationReason = <SecurityViolation>` (the full object, so the cinematic/email can name the path/command/count). `runTerminationTransition` runs the ~7.9s cinematic (audit lines → disconnect → blackout → reentry), sets `terminated_for_misconduct` + the `termination_*` detail flags at t=0, rebuilds home, and delivers the matching termination email via a synthesized `{ type: "terminated", detail: <kind> }` event (see the email skill's `after_event_detail`). Email bodies read the flags via `readTerminationContext(storyFlags)` (fall back to a generic parenthetical for legacy saves). Post-termination, `ssh nexacorp` refuses (soft bad ending; home still usable) and the HUD shows a red "TERMINATED" card. Tripwire patterns (all scoped to nexacorp, in `src/story/security.ts`): `/var/log/*.log`+`.bak` → `log_tampering`; under `/srv/leadership/` → `leadership_destruction`; `/srv/leadership/**` → `/home/{user}/**` → `exfiltration`. Recursion-aware (checks post-expansion paths); intra-leadership renames don't trip. Cinematic timing constants in `src/lib/timing.ts`; tests in `security-tripwire.test.ts`.

## Adding a new story flag

1. Add the name to `STORY_FLAG_NAMES` in `story/storyFlags.ts`, under the matching comment group (the integrity test catches invalid references).
2. Define the trigger in the appropriate `get*StoryFlagTriggers()` (looked up at runtime via `getTriggersForComputer`).
3. Use path constants from `story/filesystem/paths.ts` (`HOME_PATHS`/`NEXACORP_PATHS`/`CHIPINFRA_PATHS`) for path-based triggers.
4. Use the flag in FS generation, emails, Piper, or Chip.
5. Add a trigger test in `engine/narrative/__tests__/`.
