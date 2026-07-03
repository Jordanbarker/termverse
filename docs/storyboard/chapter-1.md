# Chapter 1: "New Beginnings"

### Home PC Commands

Commands unlock progressively through Piper conversations and exploration:

**Always available** (15): `ls`, `cd`, `cat`, `pwd`, `clear`, `help`, `mail`, `nano`, `piper`, `save`, `load`, `newgame`, `history`, `python`, `man` (the manual is the discovery command; it self-limits to currently-available commands, so `man mkdir` still says "No manual entry" until `basic_tools_unlocked`)

**After `basic_tools_unlocked`** (reply to Olive's linux basics on Piper): `mkdir`, `rm`, `mv`, `cp`, `touch`, `echo`, `whoami`, `hostname`, `date`, `which`, `file`

**After `apt_unlocked`** (Olive's tree tip delivered on Piper): `sudo`, `apt`

**Individual gates:**
- `pdftotext` — visit ~/Downloads, read ~/resume.pdf, or read the job JD PDF (`pdftotext_unlocked`)
- `tree` — run `apt install tree` (`tree_installed`)
- `ssh` — read Chip's SSH setup email (`ssh_unlocked`)

## Full Narrative Flowchart

```
                          ╔══════════════════════╗
                          ║     CHAPTER 1        ║
                          ║  "New Beginnings"    ║
                          ╚══════════╤═══════════╝
                                     │
                   ╔═════════════════════════════════════╗
                   ║          ACT 1: HOME PC             ║
                   ╚═════════════════╤═══════════════════╝
                                     │
              ┌───────────────────────┴───────────────────────┐
              │ Terminal boots, opens nano with tutorial file │
              └───────────────────────┬───────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
       ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
       │   IMMEDIATE EMAILS   │ │  IMMEDIATE PIPER DMs │ │ IMMEDIATE PIPER CHANS│
       ├──────────────────────┤ ├──────────────────────┤ ├──────────────────────┤
       │ job_board_alert      │ │ alex_checkin         │ │ #OpenClam            │
       │ backup_failure       │ │ olive_linux_basics   │ │   openclam_history   │
       │ nexacorp_offer       │ │                      │ │ #BubbleBuddies       │
       │                      │ │                      │ │   bubble_buddies_    │
       │                      │ │                      │ │   history            │
       └──────────┬───────────┘ └──────────┬───────────┘ └──────────────────────┘
                  │                        │
                  │            ┌───────────┴────────────┐
                  │            ▼                        ▼
                  │   [reply to olive_linux_basics]   [explore filesystem, read personal files]
                  │            │                                        │
                  │            ▼                                        ▼
                  │   basic_tools_unlocked                       read_resume?
                  │   (12 commands)                              pdftotext_unlocked?
                  │            │
                  │            ▼
                  │   olive_tree_tip auto-delivered
                  │   (fires on basic_tools_unlocked,
                  │    no player action needed)
                  │            │
                  │            ▼
                  │   apt_unlocked (sudo, apt)
                  │
       ┌──────────┴──────────────────────────────────────────┐
       │                OPTIONAL OBJECTIVES                  │
       ├─────────────────────────────────────────────────────┤
       │ explore_home ─── read any personal file             │
       │ check_piper ──── open Piper                         │
       │ run_auto_apply ─ run auto_apply.py                  │
       │ fix_backup ───── fix the backup script              │
       │                  (visible after reading backup-     │
       │                   failure email)                    │
       │ learn_linux_basics ── (auto-completes on unlock)    │
       └─────────────────────────────────────────────────────┘

  ╔══════════════════════════════════════════════════════════════╗
  ║                    OPTIONAL QUESTS                           ║
  ╚═══════════════════════════╤══════════════════════════════════╝
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
     ┌────────────────────────────┐  ┌────────────────────────────┐
     │ QUEST 1                    │  │ QUEST 2                    │
     │ Olive's Terminal Challenges│  │ Fix & Extend Backup        │
     ├────────────────────────────┤  ├────────────────────────────┤
     │ Visible when               │  │ Visible when               │
     │ olive_challenge_file       │  │ olive_backup_advice        │
     │ Piper delivered            │  │ Piper delivered            │
     │                            │  │                            │
     │ Sequential:                │  │ Requires: fix_backup done  │
     │  1. file                   │  │                            │
     │  2. mkdir                  │  │  1. mkdir ~/backups        │
     │  3. rm -r                  │  │  2. cp scripts             │
     │  4. mv                     │  │  3. read log               │
     │  5. echo/pipe              │  │  4. verify backup          │
     │  6. man                    │  │                            │
     └────────────────────────────┘  └────────────────────────────┘

                   ╔═════════════════════════════════════╗
                   ║       ACT 2: GETTING HIRED          ║
                   ╚═════════════════╤═══════════════════╝
                                     │
                       ┌─────────────┴─────────────────┐
                       │ nexacorp_offer (seeded at     │
                       │ game start)                   │
                       └──────────────┬────────────────┘
                                      │
                                      ▼
              ┌───────────────────────────────────────────────────┐
              │ [read offer email] sets read_nexacorp_offer       │
              │ → accept_offer visible                            │
              └────────────────────────┬──────────────────────────┘
                                       │
                                ┌──────┴──────────┐
                                │ reply to Edward │
                                └──────┬──────────┘
                                       │
                          ┌────────────┴────────────┐
                          ▼                         ▼
                       [accept]                  [reject]
                       $135K                        │
                          │                  ┌──────┴──────────────┐
                          │                  │ persuasion_1        │
                          │                  │ ($155K + $5K bonus) │
                          │                  └──────┬──────────────┘
                          │             ┌───────────┴───────────┐
                          │             ▼                       ▼
                          │          [accept]               [reject]
                          │             │                       │
                          │             │                ┌──────┴──────────────┐
                          │             │                │ persuasion_2        │
                          │             │                │ ($180K + $10K bonus)│
                          │             │                └──────┬──────────────┘
                          │             │             ┌─────────┴───────────┐
                          │             │             ▼                     ▼
                          │             │          [accept]            [final reject]
                          │             │          +accepted_at_180k        │
                          │             │             │                     ▼
                          │             │             │      ┌──────────────────────────────────────┐
                          │             │             │      │ alex_good_news email                 │
                          │             │             │      │ (CortexLab alternative)              │
                          │             │             │      └──────────────────┬───────────────────┘
                          │             │             │                         │
                          │             │             │                   ╔═════╧═════════╗
                          │             │             │                   ║ CHAPTER 1     ║
                          │             │             │                   ║ ENDS (fail)   ║
                          │             │             │                   ╚═══════════════╝
                          │             │             │
                          └─────────────┴─────────────┘
                                        │
                                        ▼

                   ╔═════════════════════════════════════╗
                   ║      ACT 3: SSH TRANSITION          ║
                   ╚═════════════════╤═══════════════════╝
                                     │
                          ┌──────────┴──────────┐
                          │ accepted_nexacorp   │
                          └──────────┬──────────┘
                                     │
                          ┌──────────┴──────────┐
                          ▼                     ▼
                   nexacorp_followup       chip_ssh_setup
                   (Edward: welcome)       (Chip: SSH details)
                          │                     │
                          └──────────┬──────────┘
                                     │
                                     ▼
                ┌────────────────────────────────────────────┐
                │ player reads chip_ssh_setup → ssh_unlocked │
                └─────────────────────┬──────────────────────┘
                                      │
                                      ▼
                            ┌──────────────────┐
                            │   ssh nexacorp   │
                            └────────┬─────────┘
                                     │
                       ┌─────────────┴────────────────┐
                       │ host key prompt — type "yes" │
                       └─────────────┬────────────────┘
                                     │
                                     ▼
                          ┌─────────────────────────┐
                          │ ssh_connect event fires │
                          └────────────┬────────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │  runSshTransition()  │
                            └──────────┬───────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                │ SSH animation, computer swap, NexaCorp boot │
                └──────────────────────┬──────────────────────┘
                                       │
                                       ▼
                              ╔══════════════╗
                              ║  CHAPTER 2   ║
                              ║  begins      ║
                              ╚══════════════╝
```

## Objectives Summary

| Objective | Type | Completion Flag / Objective | Visible When |
|-----------|------|---------------------------|--------------|
| `check_email` | **required** | `read_nexacorp_offer` | always |
| `accept_offer` | **required**, hidden | `accepted_nexacorp` / fail: `rejected_nexacorp_final` | `read_nexacorp_offer` |
| `read_chip_setup` | hidden | `ssh_unlocked` [^1] | `accepted_nexacorp` completed |
| `first_ssh_connect` | hidden | `first_ssh_connect` flag [^2] | `ssh_unlocked` |
| `explore_home` | optional | `read_resume` | always |
| `check_piper` | optional | `piper_checked` completed | always |
| `run_auto_apply` | optional | `ran_auto_apply` | always |
| `learn_linux_basics` | optional, hidden | `basic_tools_unlocked` | on unlock |
| `fix_backup` | optional, hidden | `fixed_backup_script` | `read_backup_failure` |

### Quest Groups

| Quest | Trigger | Sub-objectives |
|-------|---------|---------------|
| Olive's Terminal Challenges | `olive_challenge_file` Piper delivered | file → mkdir → rm -r → mv → echo → man |
| Fix & Extend Backup | `olive_backup_advice` Piper delivered | mkdir → cp → log → verify |

[^1]: `ssh_unlocked` fires on **reading the email body** (`file_read` trigger on the `chip_ssh_setup` email id, see `src/story/storyFlags.ts:176`) — not on email delivery.
[^2]: The `first_ssh_connect` flag is set in `src/hooks/useSessionRouter.ts` from the `ssh_connect` objective event emitted by `SshSession` on successful connection — distinct from `ssh_unlocked`, which only signals that the player has read the setup instructions.
