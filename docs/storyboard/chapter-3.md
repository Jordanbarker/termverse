# Chapter 3: "Getting the Hang of This"

### Day 2 Commands

No new command unlocks. Chapter 3 reuses everything the player earned in chapters 1–2:

**At home** (post-`returned_home_day1`): the full toolset including `grep`, `find`, `wc`, `sort`, `uniq`, `head`, `tail`, `diff`, plus `apt`, `sudo`, `shutdown`.

**At NexaCorp**: the chapter-2 toolset (`piper`, `chip`, `coder`, `chmod`, `printenv`, search/inspection/processing tools, etc.).

**In the dev container**: `git`, `dbt`, `snow` (always available there via `DEVCONTAINER_ONLY`).

The only command-related objective is `update_system` — running `apt upgrade` at home sets `apt_upgraded` (optional).

## Full Narrative Flowchart

```
                          ╔═══════════════════════════════╗
                          ║          CHAPTER 3            ║
                          ║  "Getting the Hang of This"   ║
                          ╚═══════════════╤═══════════════╝
                                          │
                   ╔═════════════════════════════════════════════╗
                   ║      ACT 1: WAKE-UP & RETURN TO WORK        ║
                   ╚══════════════════════╤══════════════════════╝
                                          │
                          ┌───────────────┴────────────────┐
                          │ Player resumes at home after   │
                          │ shutdown_day1 / day1_shutdown  │
                          └───────────────┬────────────────┘
                                          │
                ┌─────────────────────────┼─────────────────────────┐
                ▼                         ▼                         ▼
       ┌────────────────────┐  ┌─────────────────────┐    ┌────────────────────┐
       │ update_system      │  │ Olive's Power Tools │    │ bubble_buddies_    │
       │ (optional)         │  │ quest (carry-over   │    │ day2_nova          │
       │ apt upgrade        │  │ from chapter 2,     │    │ (background flavor,│
       │ → apt_upgraded     │  │ if not yet done)    │    │ delivered after    │
       └─────────┬──────────┘  └──────────┬──────────┘    │ day1_shutdown)     │
                 │                        │               └────────────────────┘
                 └────────────┬───────────┘
                              │
                              ▼
                 ┌────────────────────────────────┐
                 │ ssh nexacorp                   │
                 │ → ssh_day2 set                 │
                 │ → Snowflake state rebuilds     │
                 │   with day-2 data              │
                 │ → NexaCorp boot animation      │
                 │ → ssh_to_work_day2 completes   │
                 └────────────────┬───────────────┘
                                  │
                                  ▼
                 ┌────────────────────────────────┐
                 │ auri_day2_morning Piper DM     │
                 │ delivered automatically        │
                 │ (asks player to pull & build)  │
                 └────────────────┬───────────────┘
                                  │
                                  ▼

                   ╔═════════════════════════════════════════════╗
                   ║   ACT 2: PULL UPDATES & DISCOVER FAILURE    ║
                   ╚══════════════════════╤══════════════════════╝
                                          │
                                          ▼
                   ┌─────────────────────────────────────┐
                   │ Read auri_day2_morning, reply       │
                   │ "On it!"                            │
                   │ → read_auri_day2_morning completes  │
                   │ → fix_pipeline_quest visible        │
                   └────────────────┬────────────────────┘
                                    │
                                    ▼
                          ┌─────────────────────┐
                          │ coder ssh ai        │
                          │ (enter dev          │
                          │  container)         │
                          └──────────┬──────────┘
                                     │
                                     ▼
                   ┌─────────────────────────────────┐
                   │ git pull origin main            │
                   │ → pulled_day2_updates           │
                   └────────────────┬────────────────┘
                                    │
                                    ▼
                   ┌─────────────────────────────────────┐
                   │ dbt build                           │
                   │ → fails on rpt_campaign_performance │
                   │ → dbt_test_failed_day2              │
                   └────────────────┬────────────────────┘
                                    │
                                    ▼
                   ┌─────────────────────────────────┐
                   │ auri_test_failure_reaction      │
                   │ Piper DM delivered              │
                   └────────────────┬────────────────┘
                                    │
                                    ▼
                          ┌─────────────────────┐
                          │ Reply to Auri       │
                          │ → auri_test_        │
                          │   failure_reported  │
                          └──────────┬──────────┘
                                     │
                                     ▼
                   ┌─────────────────────────────────────┐
                   │ auri_test_failure_details Piper DM  │
                   │ (NULL data explanation + fix steps) │
                   └────────────────┬────────────────────┘
                                    │
                                    ▼

                   ╔═════════════════════════════════════════════╗
                   ║      ACT 3: INVESTIGATE, FIX, PUSH          ║
                   ╚══════════════════════╤══════════════════════╝
                                          │
                       ┌──────────────────┼──────────────────┐
                       ▼                  ▼                  ▼
              ┌──────────────────┐ ┌────────────────┐ ┌──────────────────────┐
              │ snow sql         │ │ git checkout   │ │ Edit (nano)          │
              │ query CAMPAIGN_  │ │ -b fix-...     │ │ rpt_campaign_        │
              │ METRICS          │ │ → created_     │ │ performance.sql      │
              │ → investigated_  │ │   fix_branch   │ │ (apply Auri's fix)   │
              │   null_data      │ │                │ │                      │
              │ → found_         │ │                │ │                      │
              │   inflated_      │ │                │ │                      │
              │   metrics        │ │                │ │                      │
              └─────────┬────────┘ └────────┬───────┘ └──────────┬───────────┘
                        │                   │                    │
                        └───────────────────┼────────────────────┘
                                            │
                                            ▼
                       ┌──────────────────────────────────┐
                       │ dbt build (passes all tests)     │
                       │ → fixed_campaign_model           │
                       │ (cascade-proofs investigated_    │
                       │  null_data + created_fix_branch  │
                       │  if skipped)                     │
                       └────────────────┬─────────────────┘
                                        │
                                        ▼
                              ┌─────────────────────┐
                              │ git push            │
                              │ → pushed_fix_branch │
                              └──────────┬──────────┘
                                         │
                                         ▼
                       ┌──────────────────────────────────┐
                       │ auri_fix_pushed Piper DM         │
                       │ delivered                        │
                       └────────────────┬─────────────────┘
                                        │
                                        ▼
                              ┌──────────────────────┐
                              │ Reply to Auri        │
                              │ → reported_fix_to_   │
                              │   auri               │
                              │ → report_to_auri ✓   │
                              │ → fix_pipeline_quest │
                              │   complete           │
                              └──────────┬───────────┘
                                         │
                                         ▼
                       ┌──────────────────────────────────┐
                       │ auri_fix_pushed_reply Piper DM   │
                       │ (Auri explains source data gaps) │
                       └──────────────────────────────────┘
```

## Investigation Paths (Carry-Over from Chapter 2)

Chapter 3 doesn't add new investigation flags, but the chapter-2 chip-service-account threads remain available — the player can keep poking around `/srv/engineering/` and `/opt/chip/` while in NexaCorp:

```
  ╔══════════════════════════════════════════════╗
  ║    CARRY-OVER INVESTIGATION (from ch 2)      ║
  ╚══════════════════════════════════════════════╝

  explore_jchen ──────── Read system.log.bak (found_backup_files)
       │
       ├─── discover_tampering ── diff live vs bak logs
       │                          (discovered_log_tampering)
       │
       └─── find_directives ───── read /opt/chip/ files
                                  (found_chip_directives)

  found_inflated_metrics ── set automatically when running
                            snow sql against CAMPAIGN_METRICS
                            (overlaps with investigated_null_data
                             in chapter 3 Act 3)
  jordan_query_metrics ───── Query campaign_metrics (chapter 2 obj)
  jordan_report_findings ─── Report findings to Jordan on Piper

  investigate_ops_data ───── Read /srv/operations/ops_incidents.csv
  report_dana_ops ────────── Report findings to Dana on Piper
```

## Objectives Summary

| Objective | Type | Completion Condition | Visible When |
|-----------|------|---------------------|--------------|
| `update_system` | optional | `apt_upgraded` flag | always |
| `ssh_to_work_day2` | **required** | `ssh_day2` flag | always |
| `fix_pipeline_quest` | hidden, group | all visible children | `ssh_to_work_day2` completed |
| `read_auri_day2_morning` | hidden, child | `read_auri_day2_morning` completed | `ssh_to_work_day2` completed |
| `pull_day2_updates` | hidden, child | `pulled_day2_updates` flag | `read_auri_day2_morning` completed |
| `discover_test_failure` | hidden, child | `dbt_test_failed_day2` flag | `pulled_day2_updates` flag |
| `investigate_null_data` | hidden, child | `investigated_null_data` flag | `dbt_test_failed_day2` flag |
| `create_fix_branch` | hidden, child | `created_fix_branch` flag | `dbt_test_failed_day2` flag |
| `fix_the_model` | hidden, child | `fixed_campaign_model` flag | `dbt_test_failed_day2` flag |
| `push_fix` | hidden, child | `pushed_fix_branch` flag | `fixed_campaign_model` flag |
| `report_to_auri` | hidden, child | `reported_fix_to_auri` flag | `pushed_fix_branch` flag |

### Quest Groups

| Quest | Trigger | Sub-objectives |
|-------|---------|---------------|
| Fix the Broken Pipeline | `ssh_to_work_day2` completed | read_auri_day2_morning → pull_day2_updates → discover_test_failure → (investigate_null_data + create_fix_branch + fix_the_model) → push_fix → report_to_auri |

### Command / State Triggers

```
ssh nexacorp (from home, post-day1) ─→ ssh_day2 (also rebuilds Snowflake w/ day-2 data
                                       and re-initialises NexaCorp boot)
apt upgrade (at home) ────────────────→ apt_upgraded
git pull origin main (devcontainer) ──→ pulled_day2_updates           [requires ssh_day2]
dbt build (failing tests) ─────────────→ dbt_test_failed_day2          [requires pulled_day2_updates]
snow sql (CAMPAIGN_METRICS query) ─────→ investigated_null_data,       [requires dbt_test_failed_day2]
                                         found_inflated_metrics
git checkout -b … ─────────────────────→ created_fix_branch            [requires dbt_test_failed_day2]
dbt build (all tests pass) ────────────→ fixed_campaign_model          [requires dbt_test_failed_day2]
                                         (also cascade-sets investigated_null_data
                                          + created_fix_branch as a safety net)
git push ──────────────────────────────→ pushed_fix_branch             [requires fixed_campaign_model]
reply to auri_fix_pushed ──────────────→ reported_fix_to_auri
```

### Email Delivery Chain

```
(none — chapter 3 has no new email deliveries; all narrative beats run via Piper)
```

### Piper Delivery Chain

```
ssh_day2 ──────────────────────────→ auri_day2_morning (DM Auri)
dbt_test_failed_day2 ───────────────→ auri_test_failure_reaction (DM Auri)
auri_test_failure_reported done ────→ auri_test_failure_details (DM Auri)
pushed_fix_branch ──────────────────→ auri_fix_pushed (DM Auri)
reply to auri_fix_pushed ───────────→ auri_fix_pushed_reply (DM Auri)

day1_shutdown (background, optional)→ bubble_buddies_day2_nova (#BubbleBuddies, home)
```

### Notes

- **Chapter increments implicitly**: there is no explicit chapter-bump call. Chapter 3 objectives become reachable once `ssh_to_work_day2` completes — the engine treats whatever objectives are live as the "current" chapter.
- **Day-2 state changes happen on `ssh_day2`**: The Snowflake seed is re-initialised with `includeDay2: true`, the NexaCorp filesystem is re-bootstrapped (so any day-2-only files appear), and the boot animation plays again. The dev container state persists across the day boundary.
- **The dbt fix is enforced by the test suite**: `dbt build` fails on the day-2 data until the player edits `models/marts/rpt_campaign_performance.sql` per Auri's instructions in `auri_test_failure_details`. A passing build is the only way to set `fixed_campaign_model`.
- **Cascade proofs**: lines 253–254 of `storyFlags.ts` set `investigated_null_data` and `created_fix_branch` automatically when `dbt_test_all_pass` fires. Players who skip ahead (just edit the SQL and run `dbt build`) still get those objectives marked complete.
- **`reported_fix_to_auri` is set via the Piper reply**, not a command. Both reply branches on `auri_fix_pushed` complete `report_to_auri`.
- **Chip / chip_service_account mystery**: nothing new lands in chapter 3. Auri continues to reference Oscar's earlier revocation of the chip service account's push access in `auri_hello`, but chapter 3 doesn't open new threads. Optional chapter-2 investigation objectives (`explore_jchen`, `discover_tampering`, `find_directives`, `investigate_ops_data`, `jordan_query_metrics`) remain visible if the player didn't complete them on day 1.
