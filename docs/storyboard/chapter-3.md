# Chapter 3: "In Production"

### Day 2 Commands

No NexaCorp/dev-container commands are unlocked here — Chapter 3 reuses everything
the player earned in chapters 1–2:

**At home** (post-`returned_home_day1`): the full toolset including `grep`, `find`,
`wc`, `sort`, `uniq`, `head`, `tail`, `diff`, plus `apt`, `sudo`, `shutdown`. Sabu's
"Anonymous Tip" DM gates **`lsblk` / `mount` / `umount`** via the USB drop on Day 2.

**At NexaCorp**: the chapter-2 toolset (`piper`, `chip`, `coder`, `chmod`, `printenv`,
search/inspection/processing tools, etc.).

**In the AI dev container** (`coder ssh ai`): `git`, `dbt`, `snow` (always available
via `DEVCONTAINER_ONLY`).

**On the Chip platform workspace** (`coder ssh chip`): the same `DEVCONTAINER_ONLY`
toolset. This workspace is gated behind `unlock_chip_plugin_development`, set when
the player accepts Edward's investor-demo plugin DM in Act 4.

The only command-related Day-2 objective is `update_system` — running `apt upgrade`
at home sets `apt_upgraded` (optional).

## Full Narrative Flowchart

```
╔═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                CHAPTER 3                                                                ║
║                                                             "In Production"                                                             ║
╚════════════════════════════════════════════════════════════════════╤════════════════════════════════════════════════════════════════════╝
                                                                     │
╔════════════════════════════════════════════════════════════════════╧════════════════════════════════════════════════════════════════════╗
║                                                     ACT 1: WAKE-UP & RETURN TO WORK                                                     ║
╚════════════════════════════════════════════════════════════════════╤════════════════════════════════════════════════════════════════════╝
                                                                     │
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ Player resumes at home after shutdown_day1                                                                                        │
   │ (day1_shutdown flag set on previous shutdown)                                                                                     │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                  ┌─────────────────────────────────┬────────────────┴────────────────┬─────────────────────────────────┐
                  ▼                                 ▼                                 ▼                                 ▼
  ┌───────────────┴───────────────┐ ┌───────────────┴───────────────┐ ┌───────────────┴───────────────┐ ┌───────────────┴───────────────┐
  │ update_system                 │ │ Olive's Power Tools           │ │ bubble_buddies_day2_nova      │ │ anon_usb_tip Piper DM         │
  │ (optional)                    │ │ quest (ch-2 carry-over,       │ │ (#bubble_buddies, channel     │ │ from Sabu                     │
  │ `apt upgrade`                 │ │ if not done)                  │ │ background flavor)            │ │ (auto on day1_shutdown)       │
  │ → apt_upgraded                │ │                               │ │                               │ │                               │
  └───────────────────────────────┘ └───────────────────────────────┘ └───────────────────────────────┘ └───────────────────────────────┘

   Anonymous Tip side branch (optional, gated by accepted_usb_drive):
   ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
   │ Reply to anon_usb_tip Piper DM:                                                                                                   │
   │   • "Plug it in."      → accepted_usb_drive + anon_tip_dm_resolved   (continues to USB chain below)                               │
   │   • "Not interested."  → declined_usb_tip   + anon_tip_dm_resolved   (side quest ends)                                            │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ `lsblk`  [gated by accepted_usb_drive]                                                                                            │
   │ → ran_lsblk_for_usb                                                                                                               │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ `mount /dev/sdb1 /mnt/usb`                                                                                                        │
   │ → mounted_usb_drive  (only on successful mount)                                                                                   │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ `cat /mnt/usb/note.txt`                                                                                                           │
   │ → read_usb_note                                                                                                                   │
   │ → loose_thread_quest_started                                                                                                      │
   │   (only if chipinfra_visited is set; otherwise fires later via Act 4 cascade — see Act 5)                                         │
   └───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

   Main flow resumes (independent of the USB side branch above):
                                                                     │
                                                                     ▼
   ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
   │ `ssh nexacorp`                                                                                                                    │
   │ → ssh_day2 set                                                                                                                    │
   │ → Snowflake seed rebuilt with day-2 data (includeDay2: true)                                                                      │
   │ → NexaCorp filesystem re-bootstrapped (day-2-only files appear)                                                                   │
   │ → NexaCorp boot animation replays                                                                                                 │
   │ → ssh_to_work_day2 completes                                                                                                      │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
╔════════════════════════════════════════════════════════════════════╧════════════════════════════════════════════════════════════════════╗
║                                                 ACT 2: PULL UPDATES & DISCOVER FAILURE                                                  ║
╚════════════════════════════════════════════════════════════════════╤════════════════════════════════════════════════════════════════════╝
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ auri_day2_morning Piper DM delivered (auto on ssh_day2)                                                                           │
   │ Auri asks the player to pull & build                                                                                              │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ Reply "On it!" to Auri                                                                                                            │
   │ → read_auri_day2_morning completes                                                                                                │
   │ → fix_pipeline_quest becomes visible                                                                                              │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ `coder ssh ai`  (enter the dev container)                                                                                         │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ `git pull origin main`                                                                                                            │
   │ → pulled_day2_updates  [requires ssh_day2]                                                                                        │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ `dbt build`                                                                                                                       │
   │ → fails on rpt_campaign_performance (conversion_rate test)                                                                        │
   │ → dbt_test_failed_day2  [requires pulled_day2_updates]                                                                            │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ auri_test_failure_reaction Piper DM delivered                                                                                     │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ Reply to Auri (either variant — both report the failure)                                                                          │
   │ → auri_test_failure_reported                                                                                                      │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ auri_test_failure_details Piper DM delivered                                                                                      │
   │ (NULL data explanation + step-by-step fix instructions)                                                                           │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
╔════════════════════════════════════════════════════════════════════╧════════════════════════════════════════════════════════════════════╗
║                                                      ACT 3: INVESTIGATE, FIX, PUSH                                                      ║
╚════════════════════════════════════════════════════════════════════╤════════════════════════════════════════════════════════════════════╝
                                                                     │
                       ┌─────────────────────────────────────────────┼─────────────────────────────────────────────┐
                       ▼                                             ▼                                             ▼
 ┌─────────────────────┴─────────────────────┐ ┌─────────────────────┴─────────────────────┐ ┌─────────────────────┴─────────────────────┐
 │ `snow sql` query                          │ │ `git checkout -b fix-...`                 │ │ Edit (nano)                               │
 │ CAMPAIGN_METRICS                          │ │ → created_fix_branch                      │ │ rpt_campaign_performance.sql              │
 │ → investigated_null_data                  │ │                                           │ │ (apply Auri's fix)                        │
 │ → found_inflated_metrics                  │ │                                           │ │                                           │
 └─────────────────────┬─────────────────────┘ └─────────────────────┬─────────────────────┘ └─────────────────────┬─────────────────────┘
                       └─────────────────────────────────────────────┼─────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ `dbt build` (all tests pass)                                                                                                      │
   │ → fixed_campaign_model                                                                                                            │
   │   CASCADE: also sets investigated_null_data + created_fix_branch                                                                  │
   │   (safety net for players who skipped Act 3 side steps)                                                                           │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ `git push`                                                                                                                        │
   │ → pushed_fix_branch  [requires fixed_campaign_model]                                                                              │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ auri_fix_pushed Piper DM delivered                                                                                                │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ Reply to Auri (either variant)                                                                                                    │
   │ → reported_fix_to_auri                                                                                                            │
   │ → report_to_auri ✓                                                                                                                │
   │ → fix_pipeline_quest complete                                                                                                     │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ auri_fix_pushed_reply Piper DM                                                                                                    │
   │ (Auri explains the source-data integration gaps)                                                                                  │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
╔════════════════════════════════════════════════════════════════════╧════════════════════════════════════════════════════════════════════╗
║                                            ACT 4: BUILD A CHIP PLUGIN  (required questline)                                             ║
╚════════════════════════════════════════════════════════════════════╤════════════════════════════════════════════════════════════════════╝
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ edward_plugin_request Piper DM delivered                                                                                          │
   │ (auto on reported_fix_to_auri)                                                                                                    │
   │ Edward asks for a new Chip plugin for the investor demo                                                                           │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ Reply "On it — I'll spin one up."                                                                                                 │
   │ → unlock_chip_plugin_development                                                                                                  │
   │   (toast: "Workspace unlocked: coder ssh chip")                                                                                   │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ `coder ssh chip`  (enter the Chip platform workspace)                                                                             │
   │ → chipinfra_visited                                                                                                               │
   │   CROSS-ARC CASCADE: if read_usb_note is already set, this transition also fires                                                  │
   │   loose_thread_quest_started (see Act 5).                                                                                         │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                       ┌─────────────────────────────────────────────┼─────────────────────────────────────────────┐
                       ▼                                             ▼                                             ▼
 ┌─────────────────────┴─────────────────────┐ ┌─────────────────────┴─────────────────────┐ ┌─────────────────────┴─────────────────────┐
 │ `cat /opt/chip/plugins/                   │ │ `mkdir /opt/chip/plugins/                 │ │ Backfills (ch-2 carry-over):              │
 │  <existing>/plugin.json`                  │ │  <plugin-name>/`                          │ │ reading the seeded                        │
 │ or SKILL.md                               │ │ → created_chip_plugin_dir                 │ │ /opt/chip/ plugin files now               │
 │ → read_plugin_template                    │ │                                           │ │ credits found_chip_directives             │
 │ (optional)                                │ │                                           │ │ / found_cleanup_script here,              │
 │                                           │ │                                           │ │ not on NexaCorp.                          │
 └───────────────────────────────────────────┘ └─────────────────────┬─────────────────────┘ └───────────────────────────────────────────┘
                                                                     │
                                                                     ▼
                       ┌─────────────────────────────────────────────┼─────────────────────────────────────────────┐
                       ▼                                             ▼                                             ▼
 ┌─────────────────────┴─────────────────────┐ ┌─────────────────────┴─────────────────────┐ ┌─────────────────────┴─────────────────────┐
 │ Write <dir>/plugin.json                   │ │ Write <dir>/SKILL.md                      │ │ Edit registry.json                        │
 │ → wrote_plugin_manifest                   │ │ → wrote_plugin_skill                      │ │ → registered_chip_plugin                  │
 │                                           │ │                                           │ │ (optional)                                │
 └───────────────────────────────────────────┘ └─────────────────────┬─────────────────────┘ └───────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ edward_plugin_report Piper DM                                                                                                     │
   │ (reply option gated behind `wrote_plugin_skill` — no false "I'm done" before the work is real)                                    │
   │ Reply → reported_plugin_to_edward                                                                                                 │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ edward_plugin_ack Piper DM                                                                                                        │
   │ (Edward says he'll slot it into the demo deck — quest closes)                                                                     │
   └───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                                     │
╔════════════════════════════════════════════════════════════════════╧════════════════════════════════════════════════════════════════════╗
║                                         ACT 5: PULLING AT A LOOSE THREAD  (optional, cross-arc)                                         ║
╚════════════════════════════════════════════════════════════════════╤════════════════════════════════════════════════════════════════════╝
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ loose_thread_quest_started fires when BOTH                                                                                        │
   │   • read_usb_note  (Act 1 — Anonymous Tip)                                                                                        │
   │   • chipinfra_visited  (Act 4 — `coder ssh chip`)                                                                                 │
   │ are set, in either order.                                                                                                         │
   │ (toast: "New quest: Pulling at a Loose Thread")                                                                                   │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ `cat /tmp/ssh-mZ4xPq/.user-erik`  (on chipinfra)                                                                                  │
   │ → cat_erik_socket_marker                                                                                                          │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ `export SSH_AUTH_SOCK=/tmp/ssh-mZ4xPq/agent.sock`                                                                                 │
   │ → exported_erik_ssh_auth_sock                                                                                                     │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ `ssh-add -l`                                                                                                                      │
   │ → ran_ssh_add_erik  (lists Erik's forwarded keys via the agent)                                                                   │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ `ssh erik@erik-laptop`                                                                                                            │
   │ → pivoted_to_erik_pc                                                                                                              │
   │   (transition to erik-pc; `exit` returns to chipinfra, NOT nexacorp)                                                              │
   └───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

╔═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║                                       ACT 6: BEFORE THE BOARD MEETING  (required, chapter close)                                        ║
╚════════════════════════════════════════════════════════════════════╤════════════════════════════════════════════════════════════════════╝
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ marcus_endgame_opening Piper DM delivered                                                                                         │
   │ (auto on reported_plugin_to_edward)                                                                                               │
   │ Marcus: Oscar pulled chip_service_account access traces; the 3 AM activity is real.                                               │
   │ Board meeting tonight — who's driving this?                                                                                       │
   └─────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                                     │
                  ┌─────────────────────────────────┬────────────────┴────────────────┬─────────────────────────────────┐
                  ▼                                 ▼                                 ▼                                 ▼
  ┌───────────────┴───────────────┐ ┌───────────────┴───────────────┐ ┌───────────────┴───────────────┐ ┌───────────────┴───────────────┐
  │ "Edward."                     │ │ "Sarah."                      │ │ "Erik."                       │ │ "Nobody — plugin directives"  │
  │ → accused_edward              │ │ → accused_sarah               │ │ → accused_erik                │ │ → accused_nobody              │
  │ + accusation_made             │ │ + accusation_made             │ │ + accusation_made             │ │ + accusation_made             │
  └───────────────┬───────────────┘ └───────────────┬───────────────┘ └───────────────┬───────────────┘ └───────────────┬───────────────┘
                  ▼                                 ▼                                 ▼                                 ▼
  ┌───────────────┴───────────────┐ ┌───────────────┴───────────────┐ ┌───────────────┴───────────────┐ ┌───────────────┴───────────────┐
  │ marcus_reaction_edward DM     │ │ marcus_reaction_sarah DM      │ │ marcus_reaction_erik DM       │ │ marcus_reaction_nobody DM     │
  └───────────────┬───────────────┘ └───────────────┬───────────────┘ └───────────────┬───────────────┘ └───────────────┬───────────────┘
                  └─────────────────────────────────┴────────────────┬────────────────┴─────────────────────────────────┘
                                                                     │
                                                                     ▼
   ┌─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┐
   │ Reply "Got it — good luck tonight."  (single option on all four)                                                                  │
   │ → chapter_3_complete                                                                                                              │
   │   (toast: "Chapter 3 complete — board meeting tonight.")                                                                          │
   │ The per-suspect `accused_*` flag persists into Chapter 4 so the                                                                   │
   │ board-meeting scene can branch on the player's pick.                                                                              │
   └───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Investigation Paths (Carry-Over from Chapter 2)

Chapter 3 *does* add new investigation flags (`unlock_chip_plugin_development`,
the four `loose_thread_*` flags, and the `anon_tip_*` chain), but the chapter-2
chip-service-account threads also remain available. Note that the Chip plugin
tree migrated from NexaCorp to the chipinfra workspace, so the directive-related
flags fire there now:

```
  ╔═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
  ║                                               CARRY-OVER INVESTIGATION (from chapter 2)                                               ║
  ╚═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝

  explore_jchen ──────── Read system.log.bak on NexaCorp
                         (found_backup_files)
       │
       ├─── discover_tampering ── diff live vs bak logs on NexaCorp
       │                          (discovered_log_tampering)
       │
       └─── find_directives ───── read /opt/chip/ files on CHIPINFRA
                                  (found_chip_directives / found_cleanup_script
                                   triggers moved here — see
                                   getChipinfraStoryFlagTriggers)

  found_inflated_metrics ── set automatically when running
                            `snow sql` against CAMPAIGN_METRICS
                            (overlaps with investigated_null_data
                             in Chapter 3 Act 3)

  jordan_query_metrics ───── Query campaign_metrics (chapter-2 obj)
  jordan_report_findings ─── Report findings to Jordan on Piper

  investigate_ops_data ───── Read /srv/operations/ops_incidents.csv
  report_dana_ops ────────── Report findings to Dana on Piper
```

## Objectives Summary

| Objective | Type | Completion Condition | Visible When |
|-----------|------|----------------------|--------------|
| `update_system` | optional | `apt_upgraded` flag | always |
| `ssh_to_work_day2` | **required** | `ssh_day2` flag | always |
| `anon_tip_quest` | hidden, optional, group | all visible children | `anon_tip_quest_started` |
| `anon_tip_check_piper` | hidden, optional | `anon_tip_dm_resolved` flag | `anon_tip_quest_started` |
| `anon_tip_lsblk` | hidden, optional | `ran_lsblk_for_usb` flag | `accepted_usb_drive` |
| `anon_tip_mount` | hidden, optional | `mounted_usb_drive` flag | `ran_lsblk_for_usb` |
| `anon_tip_read` | hidden, optional | `read_usb_note` flag | `mounted_usb_drive` |
| `fix_pipeline_quest` | hidden, group | all visible children | `ssh_to_work_day2` completed |
| `read_auri_day2_morning` | hidden, child | `read_auri_day2_morning` objective completed | `ssh_to_work_day2` completed |
| `pull_day2_updates` | hidden, child | `pulled_day2_updates` flag | `read_auri_day2_morning` completed |
| `discover_test_failure` | hidden, child | `dbt_test_failed_day2` flag | `pulled_day2_updates` flag |
| `investigate_null_data` | hidden, child | `investigated_null_data` flag | `dbt_test_failed_day2` flag |
| `create_fix_branch` | hidden, child | `created_fix_branch` flag | `dbt_test_failed_day2` flag |
| `fix_the_model` | hidden, child | `fixed_campaign_model` flag | `dbt_test_failed_day2` flag |
| `push_fix` | hidden, child | `pushed_fix_branch` flag | `fixed_campaign_model` flag |
| `report_to_auri` | hidden, child | `reported_fix_to_auri` flag | `pushed_fix_branch` flag |
| `build_chip_plugin_quest` | hidden, **required**, group | all visible children | `reported_fix_to_auri` |
| `accepted_edward_plugin_request` | hidden, child | `unlock_chip_plugin_development` flag | `reported_fix_to_auri` |
| `ssh_to_chip_workspace` | hidden, child | `chipinfra_visited` flag | `unlock_chip_plugin_development` |
| `read_existing_plugin` | hidden, optional, child | `read_plugin_template` flag | `chipinfra_visited` |
| `create_plugin_dir` | hidden, child | `created_chip_plugin_dir` flag | `chipinfra_visited` |
| `write_plugin_manifest` | hidden, child | `wrote_plugin_manifest` flag | `created_chip_plugin_dir` |
| `write_plugin_skill` | hidden, child | `wrote_plugin_skill` flag | `created_chip_plugin_dir` |
| `register_plugin` | hidden, optional, child | `registered_chip_plugin` flag | `wrote_plugin_manifest` |
| `report_plugin_to_edward` | hidden, child | `reported_plugin_to_edward` flag | `wrote_plugin_skill` |
| `loose_thread_quest` | hidden, optional, group | all visible children | `loose_thread_quest_started` |
| `loose_thread_find_socket` | hidden, optional, child | `cat_erik_socket_marker` flag | `loose_thread_quest_started` |
| `loose_thread_export_sock` | hidden, optional, child | `exported_erik_ssh_auth_sock` flag | `cat_erik_socket_marker` |
| `loose_thread_inspect_keys` | hidden, optional, child | `ran_ssh_add_erik` flag | `exported_erik_ssh_auth_sock` |
| `loose_thread_pivot` | hidden, optional, child | `pivoted_to_erik_pc` flag | `ran_ssh_add_erik` |
| `marcus_endgame_quest` | hidden, **required**, group | all visible children | `reported_plugin_to_edward` |
| `accuse_chip_abuser` | hidden, child | `accusation_made` flag | `reported_plugin_to_edward` |
| `chapter_3_finale` | hidden, child | `chapter_3_complete` flag | `accusation_made` |

### Quest Groups

| Quest | Trigger | Sub-objectives |
|-------|---------|----------------|
| Anonymous Tip (optional) | `anon_tip_quest_started` (set on first home shutdown of Day 2) | anon_tip_check_piper → anon_tip_lsblk → anon_tip_mount → anon_tip_read |
| Fix the Broken Pipeline | `ssh_to_work_day2` completed | read_auri_day2_morning → pull_day2_updates → discover_test_failure → (investigate_null_data + create_fix_branch + fix_the_model) → push_fix → report_to_auri |
| Build a Chip Plugin (**required**) | `reported_fix_to_auri` | accepted_edward_plugin_request → ssh_to_chip_workspace → (read_existing_plugin opt) → create_plugin_dir → (write_plugin_manifest + write_plugin_skill) → (register_plugin opt) → report_plugin_to_edward |
| Pulling at a Loose Thread (optional) | `loose_thread_quest_started` (`read_usb_note` ∧ `chipinfra_visited`) | loose_thread_find_socket → loose_thread_export_sock → loose_thread_inspect_keys → loose_thread_pivot |
| Before the Board Meeting (**required**) | `reported_plugin_to_edward` | accuse_chip_abuser → chapter_3_finale |

### Command / State Triggers

```
HOME
  ssh nexacorp ─────────────────→ ssh_day2
  apt upgrade ──────────────────→ apt_upgraded
  shutdown (day-2 boot) ────────→ anon_tip_quest_started
  lsblk [accepted_usb_drive] ───→ ran_lsblk_for_usb
  mount /dev/sdb1 /mnt/usb ─────→ mounted_usb_drive  (only on successful mount)
  cat /mnt/usb/note.txt ────────→ read_usb_note
                                  + loose_thread_quest_started
                                    [requires chipinfra_visited]

DEVCONTAINER  (coder ssh ai)
  git pull origin main ─────────→ pulled_day2_updates       [requires ssh_day2]
  dbt build (failing tests) ────→ dbt_test_failed_day2      [requires pulled_day2_updates]
  snow sql (CAMPAIGN_METRICS) ──→ investigated_null_data    [requires dbt_test_failed_day2]
                                  + found_inflated_metrics
  git checkout -b … ────────────→ created_fix_branch        [requires dbt_test_failed_day2]
  dbt build (all tests pass) ───→ fixed_campaign_model      [requires dbt_test_failed_day2]
                                  CASCADE → investigated_null_data
                                          + created_fix_branch
  git push ─────────────────────→ pushed_fix_branch         [requires fixed_campaign_model]

NEXACORP  (Piper replies)
  reply auri_fix_pushed ────────→ reported_fix_to_auri
  reply edward_plugin_request ──→ unlock_chip_plugin_development
                                   (toast: "Workspace unlocked: coder ssh chip")
  reply edward_plugin_report ───→ reported_plugin_to_edward

CHIPINFRA  (coder ssh chip — unlocked by unlock_chip_plugin_development)
  cat /opt/chip/plugins/<dir>/{plugin.json,SKILL.md}
                              ──→ read_plugin_template
  mkdir /opt/chip/plugins/<name>/
                              ──→ created_chip_plugin_dir
  write <plugin-dir>/plugin.json
                              ──→ wrote_plugin_manifest
  write <plugin-dir>/SKILL.md
                              ──→ wrote_plugin_skill
  edit /opt/chip/plugins/registry.json
                              ──→ registered_chip_plugin   (optional)
  cat /tmp/ssh-mZ4xPq/.user-erik
                              ──→ cat_erik_socket_marker
  export SSH_AUTH_SOCK=…      ──→ exported_erik_ssh_auth_sock
  ssh-add -l                  ──→ ran_ssh_add_erik

CARRY-OVER: found_chip_directives + found_cleanup_script now fire from
chipinfra reads (the /opt/chip/ plugin tree moved off NexaCorp).
```

### Email Delivery Chain

```
(none — chapter 3 has no new email deliveries; all narrative beats run via Piper)
```

### Piper Delivery Chain

```
day1_shutdown ─────────────────→ bubble_buddies_day2_nova (#bubble_buddies, home)
day1_shutdown ─────────────────→ anon_usb_tip (DM Sabu, home)
ssh_day2 ──────────────────────→ auri_day2_morning (DM Auri)
dbt_test_failed_day2 ──────────→ auri_test_failure_reaction (DM Auri)
auri_test_failure_reported ────→ auri_test_failure_details (DM Auri)
pushed_fix_branch ─────────────→ auri_fix_pushed (DM Auri)
reply auri_fix_pushed ─────────→ auri_fix_pushed_reply (DM Auri)
reported_fix_to_auri ──────────→ edward_plugin_request (DM Edward)
reply edward_plugin_request ───→ edward_plugin_report (DM Edward;
                                  reply option gated by wrote_plugin_skill)
reply edward_plugin_report ────→ edward_plugin_ack (DM Edward)
reported_plugin_to_edward ─────→ marcus_endgame_opening (DM Marcus)
accused_edward ────────────────→ marcus_reaction_edward (DM Marcus)
accused_sarah  ────────────────→ marcus_reaction_sarah  (DM Marcus)
accused_erik   ────────────────→ marcus_reaction_erik   (DM Marcus)
accused_nobody ────────────────→ marcus_reaction_nobody (DM Marcus)
reply marcus_reaction_* ───────→ chapter_3_complete
                                  (toast: "Chapter 3 complete — board meeting tonight.")
```

### Notes

- **Chapter increments implicitly**: there is no explicit chapter-bump call.
  Chapter 3 objectives become reachable once `ssh_to_work_day2` completes — the
  engine treats whatever objectives are live as the "current" chapter.
- **Day-2 state changes happen on `ssh_day2`**: the Snowflake seed is re-initialised
  with `includeDay2: true`, the NexaCorp filesystem is re-bootstrapped (so any
  day-2-only files appear), and the boot animation plays again. Dev-container
  and chipinfra state persist across the day boundary.
- **The dbt fix is enforced by the test suite**: `dbt build` fails on the day-2
  data until the player edits `models/marts/rpt_campaign_performance.sql` per
  Auri's instructions in `auri_test_failure_details`. A passing build is the
  only way to set `fixed_campaign_model`.
- **Cascade proofs (Act 3)**: `storyFlags.ts:366–367` set `investigated_null_data`
  and `created_fix_branch` automatically when `dbt_test_all_pass` fires. Players
  who skip ahead (edit the SQL on `main`, run `dbt build`) still get those
  objectives marked complete.
- **`reported_fix_to_auri` is the gate to Act 4**, not the end of the chapter.
  It's set via the Piper reply, not a command; both reply branches on
  `auri_fix_pushed` complete `report_to_auri`.
- **Plugin quest is required.** Chapter 3 doesn't progress narratively past the
  plugin until `reported_plugin_to_edward` fires. The reply on `edward_plugin_report`
  is gated by `wrote_plugin_skill` so the player can't claim completion without
  actually authoring a plugin's SKILL.md.
- **Loose Thread cross-arc cascade.** `loose_thread_quest_started` fires when
  both `read_usb_note` and `chipinfra_visited` are set — in either order. The
  trigger at `storyFlags.ts:229–231` covers the "read note after visiting
  chipinfra" case; the reverse ordering (visit chipinfra after reading the note)
  is handled by a one-line cascade in `useComputerTransitions.ts` when
  `chipinfra_visited` flips.
- **Chip carry-over migration.** `found_chip_directives` and `found_cleanup_script`
  triggers moved from NexaCorp to chipinfra. Players completing the chapter-2
  `find_directives` objective now do so via `coder ssh chip` once Act 4 unlocks
  that workspace.
- **Anonymous Tip is fully optional.** Skipping or declining the USB drop does not
  block Acts 2–4. The only consequence is that the Loose Thread quest cannot
  open without `read_usb_note`.
- **Marcus's accusation is required and chapter-closing.** Fires for all players
  on `reported_plugin_to_edward` (gated behind the required plugin quest, not the
  optional Loose Thread). The four `accused_*` carrier flags persist into Chapter 4
  so the board-meeting scene can branch on the player's pick. The closing reply on
  any of the four reaction DMs sets `chapter_3_complete` and fires the closing
  toast. Player evidence basis varies — Loose Thread completers know about Erik's
  SSH-agent abuse; Chapter 2 carry-over completers know about Edward's plugin
  directives — but every player has enough context to pick a defensible answer.
