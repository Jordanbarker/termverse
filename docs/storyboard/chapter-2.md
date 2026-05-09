# Chapter 2: "First Day"

### NexaCorp Commands

Commands unlock through colleague emails and Piper conversations:

**Always available** (27): `ls`, `cd`, `cat`, `pwd`, `clear`, `help`, `mail`, `nano`, `save`, `load`, `newgame`, `history`, `python`, `whoami`, `hostname`, `date`, `which`, `man`, `file`, `tree`, `mkdir`, `rm`, `mv`, `cp`, `touch`, `echo`, `ssh`

**After `piper_unlocked`** (read Edward's welcome email): `piper`
**After `chip_unlocked`** (Edward's `edward_chip_intro` Piper DM): `chip`
**After `printenv_unlocked`** (Edward's `edward_chip_fix` Piper DM): `printenv`, `env`
**After `search_tools_unlocked`** (accept Oscar's log task on Piper): `grep`, `find`, `diff`
**After `inspection_tools_unlocked`** (accept Auri's inspection task on Piper): `head`, `tail`, `wc`
**After `processing_tools_unlocked`** (accept Oscar's access.log task on Piper): `sort`, `uniq`
**After `coder_unlocked`** (read Oscar's coder setup email): `coder`
**After `chmod_unlocked`** (accept Dana's ops task on Piper): `chmod`
**After `devcontainer_visited`** (enter dev container via `coder ssh ai`): `dbt`, `snow`

**Multi-terminal tabs** unlock alongside search tools (`tabs_unlocked` set by `search_tools_accepted`)

### Home PC Commands (after returning home)

**After `returned_home_day1`**: `grep`, `find`, `wc`, `sort`, `uniq`, `head`, `tail`, `diff`

## Full Narrative Flowchart

```
                          ╔══════════════════════════════╗
                          ║          CHAPTER 2           ║
                          ║         "First Day"          ║
                          ╚══════════════╤═══════════════╝
                                         │
                   ╔═════════════════════════════════════════════╗
                   ║         ACT 1: ARRIVAL AT NEXACORP          ║
                   ╚══════════════════════╤══════════════════════╝
                                          │
                                          ▼
                  ┌───────────────────────────────────────┐
                  │   NexaCorp filesystem boot sequence   │
                  └───────────────────┬───────────────────┘
                                      │
                       ┌──────────────┴──────────────┐
                       ▼                             ▼
       ┌───────────────────────────┐  ┌───────────────────────────┐
       │     IMMEDIATE EMAILS      │  │     IMMEDIATE PIPER       │
       ├───────────────────────────┤  ├───────────────────────────┤
       │ welcome_edward            │  │ general_edward_welcome    │
       │ it_provisioned            │  │ general_tom_wins          │
       └─────────────┬─────────────┘  └───────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
  ┌───────────────────────┐  ┌───────────────────────────┐
  │ [read welcome_edward] │  │ [read it_provisioned]     │
  │ sets: piper_unlocked  │  │ triggers:                 │
  │ triggers:             │  │  - maya_welcome email     │
  │  - jessica_welcome    │  │  - maya_dm_welcome Piper  │
  │  - tom_welcome        │  │                           │
  │  - auri_hello Piper   │  │                           │
  └───────────┬───────────┘  └─────────────┬─────────────┘
              │                            │
              └─────────────┬──────────────┘
                            │
                            ▼

                   ╔═════════════════════════════════════════════╗
                   ║        ACT 2: EDWARD'S ONBOARDING           ║
                   ╚══════════════════════╤══════════════════════╝
                                          │
                         ┌────────────────┴────────────────┐
                         │ read_welcome_email completed    │
                         │ (piper_unlocked set)            │
                         └────────────────┬────────────────┘
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  ▼                       ▼                       ▼
           ┌─────────────┐       ┌─────────────────┐       ┌─────────────────┐
           │ auri_hello  │       │ edward_chip_    │       │ edward_         │
           │ Piper DM    │       │ intro Piper DM  │       │ onboarding      │
           │             │       │ sets:           │       │ group visible   │
           │ • meet_auri │       │   chip_unlocked │       │                 │
           │ • help_auri_│       │ triggers:       │       │ (continues      │
           │   inspect   │       │  - eng_sarah_   │       │  below)         │
           │             │       │    welcome      │       │                 │
           │ → see Act 4 │       │  - cassie_dm_   │       │                 │
           │             │       │    product      │       │                 │
           └─────────────┘       └────────┬────────┘       └────────┬────────┘
                                          │                         │
                                          ▼                         │
                       ┌──────────────────────────────┐             │
                       │ [player runs chip]           │             │
                       │ fails: CHIP_API_KEY missing  │             │
                       │ sets: chip_error_seen        │             │
                       └──────────────┬───────────────┘             │
                                      │                             │
                                      ▼                             │
                  ┌────────────────────────────────────────┐        │
                  │ [reply to Edward]                      │        │
                  │ edward_chip_error → edward_chip_fix    │        │
                  │ sets: printenv_unlocked                │        │
                  │ (source ~/.zshrc, then chip works)     │        │
                  └────────────────────┬───────────────────┘        │
                                       │                            │
                                       └──────────────┬─────────────┘
                                                      │
                                  ┌───────────────────┴───────────────────┐
                                  ▼                                       ▼
                       ┌──────────────────────┐              ┌──────────────────────┐
                       │ read_onboarding      │              │ meet_the_team        │
                       │ (onboarding.md)      │              │ (team-info.md)       │
                       └──────────┬───────────┘              └──────────┬───────────┘
                                  │                                     │
                ┌─────────────────┼─────────────────┐                   │
                ▼                 ▼                 ▼                   ▼
       oscar_coder_setup    oscar_log_check    dana_welcome     eng_code_review_
       email                Piper DM           Piper DM         debate Piper DM
                │
                ▼
       ┌──────────────────┐
       │ [read email]     │
       │ coder_unlocked   │
       └────────┬─────────┘
                │
                ▼

                   ╔═════════════════════════════════════════════╗
                   ║       ACT 3: OSCAR'S LOG INVESTIGATION      ║
                   ╚══════════════════════╤══════════════════════╝
                                          │
                          ┌───────────────┴────────────────┐
                          │ help_oscar_logs visible        │
                          │ (after read_onboarding)        │
                          └───────────────┬────────────────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              ▼                           ▼                           ▼
     ┌───────────────────┐       ┌───────────────────┐       ┌───────────────────┐
     │ oscar_search_logs │       │ oscar_check_      │       │ oscar_diff_logs   │
     │ grep system.log   │       │ backups           │       │ diff the logs     │
     │                   │       │ read .bak file    │       │                   │
     └─────────┬─────────┘       └─────────┬─────────┘       └───────────────────┘
               │                           │
               ▼                           ▼
       [read system.log]         [read system.log.bak]
               │                           │
               │                           ├─── sarah_dm_mystery Piper
               │                           │    (investigation hint)
               ▼                           ▼
       oscar_access_review       [diffed logs]
       Piper DM                   (requires discovered_log_tampering)
               │                           │
       ┌───────┴────────┐                  ▼
       ▼                ▼          oscar_log_tampered Piper
   [nothing weird]  [log path]              │
       │                ▲                   │
       ▼                │                   │
   oscar_log_normal     └───────────────────┘
   Piper                          │
       │                          │
       └────────────┬─────────────┘
                    │
                    ▼
              ┌──────────────────────┐
              │ access.log task      │
              └──────────┬───────────┘
                         │
                         ▼
                ┌──────────────────┐
                │ [reply to Oscar] │
                └────────┬─────────┘
                         │
                         ▼
              ┌─────────────────────────────┐
              │ processing_tools_unlocked   │
              │ (sort/uniq)                 │
              └──────────────┬──────────────┘
                             │
                             ▼
              ┌────────────────────────────────────────┐
              │ report_to_oscar visible                │
              │ (player reads access.log, e.g.         │
              │  sort /var/log/access.log | uniq -c)   │
              └──────────────────┬─────────────────────┘
                                 │
                                 ▼
              ┌────────────────────────────────────────┐
              │ oscar_access_followup(_tampered)       │
              │ Piper DM — Oscar reacts to findings    │
              └──────────────────┬─────────────────────┘
                                 │
                  ┌──────────────┴──────────────┐
                  ▼                             ▼
          [flagged SSH keys]             [nothing concerning]
                  │                             │
                  └──────────────┬──────────────┘
                                 │
                                 ▼
              ┌────────────────────────────────────────┐
              │ oscar_access_reported (quest complete) │
              └──────────────────┬─────────────────────┘
                                 │
                                 ▼
              ┌────────────────────────────────────────┐
              │ oscar_access_reaction Piper DM         │
              │ — Oscar escalates to Sarah             │
              └──────────────────┬─────────────────────┘
                                 │
                ┌────────────────┼────────────────┐
                ▼                ▼                ▼
       dana_ops_dashboard  jordan_marketing_  maya_dm_checkin
       Piper DM            data Piper DM      Piper DM
                │
                ▼
        ┌──────────────────┐
        │ [reply to Dana]  │
        └────────┬─────────┘
                 │
                 ▼
       ┌────────────────────┐
       │ dana_ops_accepted  │
       └─────────┬──────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
  chmod_unlocked    auri_chmod_help Piper DM

                   ╔═════════════════════════════════════════════╗
                   ║         ACT 4: AURI'S DATA PIPELINE         ║
                   ╚══════════════════════╤══════════════════════╝
                                          │
                          ┌───────────────┴────────────────┐
                          │ meet_auri visible              │
                          │ (after piper_unlocked)         │
                          └───────────────┬────────────────┘
                                          │
                       ┌──────────────────┴──────────────────┐
                       │  [reply to Auri's inspect ask]      │
                       │  → inspection_tools_accepted        │
                       │  → inspection_tools_unlocked        │
                       │    (head/tail/wc) + tabs_unlocked   │
                       └──────────────────┬──────────────────┘
                                          │
                       ┌──────────────────┴──────────────────┐
                       │  Inspect CSVs (optional sub-objs)   │
                       │   • auri_ls_data   (auri_listed_    │
                       │                     handoff)        │
                       │   • auri_check_todo (auri_read_todo)│
                       │   • auri_use_head/tail/wc           │
                       └──────────────────┬──────────────────┘
                                          │
                                          ▼
                       ┌──────────────────────────────────┐
                       │ review_handoff                   │
                       │ (read chen-handoff/notes)        │
                       └────────────────┬─────────────────┘
                                        │
                       ┌────────────────┼────────────────┐
                       ▼                ▼                ▼
                edward_paranoid    auri_pipeline_   maya_dm_handoff
                email              help Piper DM    Piper DM
                                        │
                                        ▼
                       ┌──────────────────────────────────┐
                       │ reply_auri_handoff               │
                       │ → handoff_reviewed               │
                       │ → pipeline_tools_accepted        │
                       │ (also sets coder_unlocked)       │
                       └────────────────┬─────────────────┘
                                        │
                                        ▼
                       ┌──────────────────────────────────┐
                       │ help_auri_pipeline               │
                       └────────────────┬─────────────────┘
                                        │
                                        ▼
                       ┌──────────────────────────────────────┐
                       │ clone_analytics_repo                 │
                       │ coder ssh ai → chip clones           │
                       │ nexacorp-analytics                   │
                       │ → dbt_project_cloned                 │
                       └────────────────┬─────────────────────┘
                                        │
                                        ▼
                       ┌──────────────────────────────────────┐
                       │ run_dbt                              │
                       │ dbt build → ran_dbt                  │
                       └────────────────┬─────────────────────┘
                                        │
                                        ▼
                       ┌──────────────────────────────────┐
                       │ check_auri_dbt                   │
                       │ → auri_dbt_reported              │
                       │ → meet_auri completed            │
                       └────────────────┬─────────────────┘
                                        │
                                        ▼

                   ╔═════════════════════════════════════════════╗
                   ║            ACT 5: END OF DAY                ║
                   ╚══════════════════════╤══════════════════════╝
                                          │
                          ┌───────────────┴────────────────┐
                          │ edward_end_of_day email        │
                          │ delivered (after dbt/ran_dbt)  │
                          │ → closing_time group visible   │
                          └───────────────┬────────────────┘
                                          │
                                          ▼
                              ┌──────────────────────┐
                              │ read_eod_email       │
                              │ → read_end_of_day    │
                              └──────────┬───────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │ head_home visible    │
                              └──────────┬───────────┘
                                         │
                                         ▼
                              ┌──────────────────────────┐
                              │ [exit from NexaCorp]     │
                              └────────────┬─────────────┘
                                           │
                          ┌────────────────┴────────────────┐
                          │ runExitToHome()                 │
                          │  - logs off NexaCorp            │
                          │  - rebuilds home FS             │
                          │  - sets returned_home_day1      │
                          │  - completes head_home          │
                          └────────────────┬────────────────┘
                                           │
                  ┌────────────────────────┼─────────────────────────┐
                  ▼                        ▼                         ▼
           alex_day1_checkin     olive_power_tools_intro     read_piper_home
           Piper DM              Piper DM                    (optional)
           (how was it?)         (round 2?)                  read_piper_day1_home
                                         │
                                         ▼
                                 olive_power_tools_read
                                 → olive_power_tools quest visible
                                           │
                                           ▼
                                ┌──────────────────────┐
                                │ shutdown_day1        │
                                │ → day1_shutdown      │
                                │ → closing_time done  │
                                └──────────────────────┘
```

## Investigation Paths (Optional)

These optional objectives allow the player to discover evidence of Chip's autonomous behavior:

```
  ╔══════════════════════════════════════════╗
  ║          INVESTIGATION THREADS           ║
  ╚══════════════════════════════════════════╝

  explore_jchen ──── Read system.log.bak (found_backup_files)
       │
       ├─── discover_tampering ── diff live vs bak logs
       │                          (discovered_log_tampering)
       │
       └─── find_directives ───── read /opt/chip/directives.conf
                                  (found_chip_directives)

  investigate_ops_data ── Read /srv/operations/ops_incidents.csv
                          (visible after dana_ops_accepted)
  report_dana_ops ─────── Report findings to Dana via Piper reply
                          (visible after read_ops_incidents)

  sarah_dm_mystery ──── Triggered by reading system.log.bak
                        (Sarah hints at chip_service_account anomalies)
```

## Objectives Summary

| Objective | Type | Completion Condition | Visible When |
|-----------|------|---------------------|--------------|
| `read_welcome_email` | **required** | `piper_unlocked` flag | always |
| `edward_onboarding` | **required**, group | all visible children | `read_welcome_email` completed |
| `read_onboarding` | hidden, child | `read_onboarding` flag | `read_welcome_email` completed |
| `meet_the_team` | hidden, child | `read_team_info` flag | `read_welcome_email` completed |
| `reply_edward_chip_intro` | hidden, child | `replied_edward_chip_intro` objective | `read_team_info` flag |
| `try_chip` | hidden, child | `chip_error_seen` flag | `chip_unlocked` flag |
| `tell_edward_chip_error` | hidden, child | `told_edward_chip_error` objective | `chip_error_seen` flag |
| `source_zshrc` | hidden, child | `sourced_nexacorp_zshrc` flag | `printenv_unlocked` flag |
| `help_oscar_logs` | hidden | `oscar_access_reported` objective | `read_onboarding` flag |
| `oscar_search_logs` | hidden, child | `oscar_searched_logs` flag | `search_tools_accepted` completed |
| `oscar_check_backups` | hidden, optional, child | `oscar_checked_backups` flag | `search_tools_accepted` completed |
| `oscar_diff_logs` | hidden, optional, child | `oscar_diffed_logs` flag | `search_tools_accepted` completed |
| `reply_oscar_logs` | hidden, child | `oscar_log_findings_shared` objective | `oscar_searched_logs` flag |
| `report_to_oscar` | hidden, child | `oscar_access_reported` objective | `processing_tools_accepted` completed |
| `meet_auri` | hidden | `auri_dbt_reported` objective | `piper_unlocked` flag |
| `auri_ls_data` | hidden, optional, child | `auri_listed_handoff` flag | `inspection_tools_accepted` completed |
| `auri_check_todo` | hidden, optional, child | `auri_read_todo` flag | `inspection_tools_accepted` completed |
| `auri_use_head` | hidden, optional, child | `auri_used_head` flag | `inspection_tools_accepted` completed |
| `auri_use_tail` | hidden, optional, child | `auri_used_tail` flag | `inspection_tools_accepted` completed |
| `auri_use_wc` | hidden, optional, child | `auri_used_wc` flag | `inspection_tools_accepted` completed |
| `review_handoff` | hidden, child | `read_handoff_notes` flag | `inspection_tools_accepted` completed |
| `reply_auri_handoff` | hidden, child | `handoff_reviewed` objective | `read_handoff_notes` flag |
| `help_auri_pipeline` | hidden, child | `ran_dbt` flag | `handoff_reviewed` completed |
| `clone_analytics_repo` | hidden, child | `dbt_project_cloned` flag | `help_auri_pipeline` completed |
| `run_dbt` | hidden, child | `ran_dbt` flag | `clone_analytics_repo` completed |
| `check_auri_dbt` | hidden, child | `auri_dbt_reported` objective | `run_dbt` completed |
| `closing_time` | hidden, group | all visible children | `edward_end_of_day` delivered |
| `read_eod_email` | hidden, child | `read_end_of_day` flag | `edward_end_of_day` delivered |
| `head_home` | hidden, child | `returned_home_day1` flag | `read_end_of_day` flag |
| `read_piper_home` | hidden, optional | `read_piper_day1_home` flag | `returned_home_day1` flag |
| `shutdown_day1` | hidden, child | `day1_shutdown` flag | `returned_home_day1` flag |
| `explore_jchen` | hidden, optional | `found_backup_files` flag | always |
| `discover_tampering` | hidden, optional | `discovered_log_tampering` flag | prereq: `explore_jchen` |
| `find_directives` | hidden, optional | `found_chip_directives` flag | prereq: `explore_jchen` |
| `investigate_ops_data` | hidden, optional | `read_ops_incidents` flag | `dana_ops_accepted` objective |
| `report_dana_ops` | hidden, optional | `dana_ops_reported` objective | `read_ops_incidents` flag |
| `jordan_query_metrics` | hidden, optional | `found_inflated_metrics` flag | `pipeline_tools_accepted` completed |
| `jordan_report_findings` | hidden, optional | `jordan_metrics_reported` objective | `found_inflated_metrics` flag |

### Quest Groups

| Quest | Trigger | Sub-objectives |
|-------|---------|---------------|
| Edward's Onboarding | `read_welcome_email` completed | read_onboarding, meet_the_team, reply_edward_chip_intro, try_chip, tell_edward_chip_error, source_zshrc |
| Help Oscar with Logs | `read_onboarding` flag | oscar_search_logs, oscar_check_backups, oscar_diff_logs, reply_oscar_logs, report_to_oscar |
| Meet Auri | `piper_unlocked` flag | auri_ls_data/check_todo/use_head/use_tail/use_wc (optional) → review_handoff → reply_auri_handoff → help_auri_pipeline → clone_analytics_repo → run_dbt → check_auri_dbt |
| Closing Time | `edward_end_of_day` delivered | read_eod_email → head_home → shutdown_day1 |
| Explore Jin Chen | `found_backup_files` flag | discover_tampering, find_directives |
| Olive's Power Tools | `olive_power_tools_read` flag (home, post-return) | grep → wc → redirect → sort+uniq → find |

### Command Unlock Chain

```
read welcome_edward ──→ piper
edward_chip_intro DM ─→ chip
edward_chip_fix DM ───→ printenv, env
read oscar_coder_setup → coder
reply to Oscar (logs) → grep, find, diff + multi-tabs
reply to Auri (CSV) ──→ head, tail, wc
reply to Oscar (access) → sort, uniq
reply to Dana (ops) ──→ chmod
coder ssh ai ─────────→ dbt, snow (in dev container + NexaCorp)
exit to home ─────────→ grep, find, wc, sort, uniq, head, tail, diff (at home)
```

### Email Delivery Chain

```
IMMEDIATE: welcome_edward, it_provisioned

welcome_edward read ──→ jessica_welcome, tom_welcome
it_provisioned read ──→ maya_welcome
onboarding.md read ───→ oscar_coder_setup
chen-handoff/notes read → edward_paranoid
ran_dbt / dbt command ─→ edward_end_of_day
```

### Piper Delivery Chain

```
IMMEDIATE (NexaCorp): general_edward_welcome, general_tom_wins

chip_unlocked flag ───→ eng_sarah_welcome, cassie_dm_product
edward_chip_intro DM ─→ edward_chip_error → edward_chip_fix (DM chain)
it_provisioned read ──→ maya_dm_welcome
onboarding.md read ───→ oscar_log_check, dana_welcome
welcome_edward read ──→ auri_hello
team-info.md read ────→ eng_code_review_debate
chen-handoff/notes read → auri_pipeline_help, maya_dm_handoff
system.log read ──────→ oscar_access_review (requires oscar_log_check)
system.log.bak read ──→ sarah_dm_mystery

search_tools_accepted ──→ (triggers via reply)
  oscar_logs_normal ────→ oscar_log_normal → processing task
  oscar_logs_tampered ──→ oscar_log_tampered → processing task
access.log read ──────────→ oscar_access_followup (requires oscar_log_normal)
                            oscar_access_followup_tampered (requires oscar_log_tampered)
oscar_access_reported ────→ oscar_access_reaction
processing_tools_accepted → dana_ops_dashboard, jordan_marketing_data,
                            maya_dm_checkin
pipeline_tools_accepted ─→ (triggers via reply)
dana_ops_accepted ───────→ auri_chmod_help

AFTER RETURN HOME:
returned_home_day1 ──→ alex_day1_checkin, olive_power_tools_intro
```

### Notes

- **Oscar's investigation branches**: the player sees different Oscar dialogue based on whether they discovered the log tampering. Both paths converge on the `processing_tools_accepted` event and `sort`/`uniq` unlock.