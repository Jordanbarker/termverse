# In-Game Timeline

- Day 1 (player starts at NexaCorp): 2026-02-23 (Monday)
- Day 2: 2026-02-24

A chronological reference for narrative dates scattered across Terminal Turmoil's source. Use this when adding dated content to catch continuity drift (a new email pre-dating Jin's resignation, a log entry on the wrong weekday, a board action after the fiscal close).

**Source of truth = source files.** This doc is derived and can drift. When in doubt, re-read:

- `src/engine/piper/timestamp.ts` — segment clock (the player's "now")
- `src/engine/git/remotes.ts` — `nexacorp-analytics` commit chain (~17 commits)
- `src/story/emails/{home,nexacorp}.ts` — every email `date:` header
- `src/story/data/snowflake/nexacorp_prod.json` + `src/engine/snowflake/seed/initial_data.ts` — Snowflake seed rows
- `src/story/filesystem/nexacorp/srv.ts` — incident log, board minutes
- `src/story/filesystem/chipinfra/{srv,opt}.ts` — Chip platform timeline (keys, plugins, directives)
- `src/story/filesystem/logs.ts` — NexaCorp syslog generator (Feb 17–24)
- `src/story/filesystem/home/{desktop,downloads,scripts}.ts` — player backstory

## Game "Now" — the Player's Window

Defined by `SEGMENTS` in `src/engine/piper/timestamp.ts:23-59`. Two clocks (`home`, `nexacorp`) advance independently as Piper deliveries fire.

| Segment | Date | Clock | Wall window |
|---|---|---|---|
| `home_pre_work` | Sat, Feb 21, 2026 | home | 2:00 PM → 4:00 PM |
| `nexacorp_day1` | Mon, Feb 23, 2026 | nexacorp | 8:30 AM → 6:15 PM |
| `home_post_work` | Mon, Feb 23, 2026 | home | 6:15 PM → 9:00 PM |
| `home_day2` | Tue, Feb 24, 2026 | home | 6:30 AM → 9:00 AM |
| `nexacorp_day2` | Tue, Feb 24, 2026 | nexacorp | 8:30 AM → 6:00 PM |

Boundary flags: `returned_home_day1` → `home_post_work`; `day1_shutdown` → `home_day2`; `ssh_day2` → `nexacorp_day2` (`timestamp.ts:62-71`).

The real-calendar 2026 weekdays match the fictional ones — Feb 17 is a Tuesday, Feb 23 is a Monday (asserted in `src/story/filesystem/logs.ts:82`).

---

## Tier 1 — Narrative Spine

The events story-load-bearing for the mystery and the player's experience. Sources cited.

### 2025 — the year before the game

| Date | Event | Source |
|---|---|---|
| **2025-02-15** | Founding-team batch hire (4 employees) | `nexacorp_prod.json:47-71` (HIRE_DATE) |
| **2025-04-01** | **Jin Chen joins as Data Engineer** | `nexacorp_prod.json:87` |
| 2025-04-14 | Jin scaffolds `nexacorp-analytics` dbt repo (commit #1) | `engine/git/remotes.ts:358-369` |
| 2025-04-15 → 04-17 | Jin builds raw sources, staging, and intermediate employee models (commits #2–4) | `remotes.ts:370-405` |
| 2025-06-02 → 06-04 | Sarah Knight adds support-ticket enrichment; Jin builds marts (`fct_support_tickets`, `fct_system_events`, `dim_employees`) — commits #5–9 | `remotes.ts:408-446` |
| 2025-06-01 | First Chip plugin batch installed: `analytics-reports`, `log-maintenance`, `ticket-triage`, `system-monitor` | `chipinfra/opt.ts:65-68` |
| 2025-07-10 | `data-pipeline` plugin installed (v3.0.1) | `chipinfra/opt.ts:69` |
| 2025-08-05 → 08-20 | `alert-routing`, `code-review` plugins added | `chipinfra/opt.ts:70-71` |
| 2025-08-11 | Sarah adds AI performance report (commit #10) | `remotes.ts:449-456` |
| 2025-09-12 | **`chip_service_account` last manually rotated** (overdue — should be quarterly) | `chipinfra/srv.ts:267, 297` |
| 2025-09-15 | Jin adds directory + spending reports + `fiscal_quarter` macro (commits #11–12) | `remotes.ts:458-473` |
| 2025-09-15 | `brand-voice` plugin installed (v2.1.0) | `chipinfra/opt.ts:72` |
| **2025-10-03** | **Oscar Diaz switches `profiles.yml` to `chip_service_account`** (commit #13) — *mystery seed* | `remotes.ts:477-484` |
| 2025-10-01 → 11-12 | `onboarding`, `incident-response` plugins installed | `chipinfra/opt.ts:73-74` |
| 2025-11-10 → 11-11 | Jin adds campaign performance report, seed data, custom tests (commits #14–16) | `remotes.ts:487-516` |
| **2025-11-18** | **Edward adds Chip directives**: silence log-maintenance noise; "Do not post to channels" rule | `chipinfra/opt.ts:487, 496, 695` |

### 2026 — the runway in

| Date | Event | Source |
|---|---|---|
| 2026-01-05 | P3 incident: elevated /api/chat error rate (Sarah, 55 min) | `nexacorp/srv.ts:60` |
| 2026-01-13 | **Auri Park's final commit on the repo** — README setup instructions (commit #17) | `remotes.ts:519-526` |
| 2026-01-15 | P3 incident: elevated API latency (Oscar) | `nexacorp/srv.ts:61` |
| 2026-02-01 | **P2 incident: auth service timeout** (Oscar, 120 min) | `nexacorp/srv.ts:64` |
| 2026-02-01 | Jin's handoff README/notes/todo last updated | `nexacorp/srv.ts:295, 309` |
| **2026-02-03 (Tue)** | **Jin Chen resigns** (last day) — referenced everywhere: HR end_date, "review deprioritized," service account exfiltration begins | `nexacorp_prod.json:88`; `chipinfra/srv.ts:270` |
| **2026-02-03, 01:17–04:12** | `chip_service_account` reads `/home/jchen/`, `.zsh_history`, `chip-audit/notes.md`; modifies `fct_system_events.sql` + `fct_support_tickets.sql`; cleanup writes (`system.log`, `/home/jchen/.private/` perms, log rotation, `/opt/chip/config/settings.json`) through 04:12 | `logs.ts:996-1001`; `nexacorp_prod.json` SYSTEM_EVENTS:670-705 |
| 2026-02-03 | P4: "Unusual service account activity" (auto-resolved in 1 min by `chip_service_account` itself) | `nexacorp/srv.ts:65` |
| 2026-02-03 | First production deployment in current cluster | `nexacorp_prod.json` DEPLOYMENTS |
| 2026-02-03 → 02-24 | **CHIP auto-ticket generation window** — ~43 procedurally generated tickets | `engine/snowflake/seed/initial_data.ts:66-67` |
| 2026-02-10 | **Player's malware incident — full Ubuntu reinstall** after Synthetica Labs cryptominer take-home | `home/desktop.ts:76-132` |
| 2026-02-15 | P3: deployment rollback (Oscar) | `nexacorp/srv.ts:67` |
| 2026-02-17 (Tue) | NexaCorp syslog window opens (Feb 17–23, optionally extended to Feb 24) | `logs.ts:5-7, 47-60` |
| 2026-02-18 | Auri's note: "Some of Jin's older models don't follow WHERE clause rules" | `chipinfra/srv.ts:56` |
| 2026-02-18 | Player's `auto_apply.py` last run; `Screenshot_2026-02-18.png` created | `home/scripts.ts`; `home/downloads.ts:190` |
| 2026-02-19 | Standup notes — Sarah: auth middleware refactor; Oscar: TLS staging cert renewal | `nexacorp/srv.ts:276-285` |
| 2026-02-20 (Fri) | Standup — Oscar: "weird log entries...lines that were there yesterday are gone today?" (player will discover this is the cleanup script) | `nexacorp/srv.ts:262-274` |
| 2026-02-20 | **Player's `job_search_notes.txt` last updated** — "Month 2. Getting desperate." | `home/desktop.ts:10` |
| 2026-02-20 (Fri) 09:00 | Indeed alert with NexaCorp job ad ("Posted: 6 days ago" → 2026-02-14) | `emails/home.ts:87` |
| **2026-02-21 (Sat) 02:00** | **`backup.service` fails** on player's home PC (`maniac-iv`) — game's opening event | `emails/home.ts:124-138` |
| 2026-02-21 (Sat) 08:30 | **Edward Torres's job offer** ($135K, start Mon Feb 23) | `emails/home.ts:147-174` |
| 2026-02-21 (Sat) 11:15 | Persuasion email #1 — $155K + $5K signing bonus | `emails/home.ts:182` |
| 2026-02-21 (Sat) 14:30 | Persuasion email #2 — $180K + $10K, "this is our final offer" | `emails/home.ts:206` |
| 2026-02-21 (Sat) 19:00 | Welcome / SSH access provisioned (after acceptance) | `emails/home.ts:265, 283` |
| 2026-02-22 (Sun) 10:30 | Alex Rivera's "good news" (CortexLab) email — only on reject-final branch | `emails/home.ts:233` |
| **2026-02-23 (Mon)** | **Day 1 at NexaCorp** — `nexacorp_day1` segment | — |
| 2026-02-23 07:45 → 17:00 | Provisioning cascade: Edward welcome → IT account → Maya → Jessica → Tom → Oscar's Coder setup → Edward's handoff-notes flag → Edward's end-of-day | `emails/nexacorp.ts` (all 8) |
| 2026-02-23 08:00 | dbt manifest `generated_at` | `nexacorp/dbt.ts:678` |
| **2026-02-24 (Tue)** | **Day 2** — `nexacorp_day2` + `home_day2` segments; Chip plugin questline (Edward asks player to build a plugin) | `piper/messages/edward.ts` |

### Future-dated markers (referenced but not yet "now")

| Date | Event | Source |
|---|---|---|
| 2026-02-28 | Board ACTION still open: Edward to document Chip's access scope ("No follow-up as of 2/28") | `nexacorp/srv.ts:183` |
| **2026-03-01** | Edward's revised engineering timeline due to board | `nexacorp/srv.ts:167` |
| 2026-03-15 | Series A due-diligence meetings begin; Soham Parekh PIP 30-day review | `nexacorp/srv.ts:198, 205` |
| 2026-04-10 | Wildcard `*.nexacorp.com` SSL cert expires | `nexacorp_prod.json:410` |

---

## Tier 2 — Appendices

### A. Snowflake seed dates (`nexacorp_prod.json`)

Tables with date columns (defined in `initial_data.ts:8-19`):

- **EMPLOYEES** — `HIRE_DATE`, `END_DATE`
  - Range: 2025-02-15 → 2025-12-01 (hires); end_dates clustered 2025-08-22 → 2026-02-03
  - Jin Chen: HIRE_DATE 2025-04-01, END_DATE 2026-02-03 (`nexacorp_prod.json:87-88`)
- **EMPLOYEE_DIRECTORY** — `HIRE_DATE` only (mirrors EMPLOYEES)
- **SYSTEM_EVENTS** — `TIMESTAMP`
  - Concentrated on **2026-02-03** (jchen file reads, exfiltration window) and a second activity spike 2026-02-23 → 02-24
  - Cert renewal event: `expires=2026-04-10` (`:410`)
- **ACCESS_LOG** — `TIMESTAMP`
  - Empty in JSON (`nexacorp_prod.json:854-886`); rows are runtime-generated by `generateAccessLogRows()` in `logs.ts:1262` from the same `AccessEvent` source the filesystem `access.log` uses. Focused on chip_service_account reads of `/home/jchen/` etc.
- **DEPLOYMENTS** — `DEPLOYED_AT`
  - Range: 2026-02-03 14:22 → 2026-02-24 (cluster of final 4 in the last 3 days)
- **SUPPORT_TICKETS** — `SUBMITTED_DATE`, `RESOLVED_DATE`
  - Hand-authored: 2026-01-26 → 2026-02-05
  - **Auto-generated by CHIP**: 2026-02-03 → 2026-02-24, ~43 tickets, resolved 1–3 hours after submission (`initial_data.ts:66-67`)
- **CUSTOMERS** — `SIGNUP_DATE`, `LAST_ACTIVITY_DATE`
  - Signups: 2025-06-15, 2025-08-01, 2025-09-20, 2025-11-10, 2026-01-05, 2026-02-17
  - Last activity clustered 2026-02-14 → 2026-02-24
- **DEPARTMENT_BUDGETS** — `APPROVED_DATE`
  - Q1 2026 approvals: 2025-12-10, 2025-12-15, 2025-12-20
- **AI_MODEL_METRICS** — `METRIC_DATE`
  - Daily 2026-02-01 → 02-07, then 2026-02-23 → 02-24 (visibly gappy — narrative artifact of incident days)
- **CAMPAIGN_METRICS** — `REPORT_DATE`
  - 2026-01-15 (hand-authored row in JSON); 2026-02-23 rows injected at seed time (`initial_data.ts:163-164`)

### B. `nexacorp-analytics` git commit chain

All 17 commits in `src/engine/git/remotes.ts:355-530` (`buildAnalyticsCommits()`). Times in UTC; PDT = UTC-7, PST = UTC-8.

| # | UTC | Local | Author | Message |
|---|---|---|---|---|
| 1 | 2025-04-14 17:23 | 10:23 PDT | Jin | initial project scaffold |
| 2 | 2025-04-15 21:45 | 14:45 PDT | Jin | add raw sources and staging models |
| 3 | 2025-04-15 23:12 | 16:12 PDT | Jin | fix source ref in stg_employees |
| 4 | 2025-04-17 18:05 | 11:05 PDT | Jin | add intermediate employee models |
| 5 | 2025-06-02 22:30 | 15:30 PDT | Sarah | add support ticket enrichment |
| 6 | 2025-06-03 16:18 | 09:18 PDT | Jin | fix join condition in int_support_tickets_enriched |
| 7 | 2025-06-03 21:40 | 14:40 PDT | Jin | add employee dim and events fact table |
| 8 | 2025-06-04 17:15 | 10:15 PDT | Jin | add support tickets fact table |
| 9 | 2025-06-04 17:32 | 10:32 PDT | Jin | fix yml indentation in _marts__models |
| 10 | 2025-08-11 18:50 | 11:50 PDT | Sarah | add AI performance report |
| 11 | 2025-09-15 23:20 | 16:20 PDT | Jin | add directory and spending reports |
| 12 | 2025-09-16 00:02 | 17:02 PDT (Sep 15) | Jin | update dbt_project.yml target config |
| **13** | **2025-10-03 16:45** | **09:45 PDT** | **Oscar** | **update profiles.yml: switch to chip_service_account** |
| 14 | 2025-11-10 20:15 | 13:15 PST | Jin | add campaign performance report |
| 15 | 2025-11-11 18:40 | 10:40 PST | Jin | add seed data and custom tests |
| 16 | 2025-11-11 18:58 | 10:58 PST | Jin | fix test ref: dim_employees -> stg table |
| 17 | 2026-01-13 23:30 | 15:30 PST | Auri | update README with setup instructions |

### C. Email date headers

**Home PC** (`src/story/emails/home.ts`):

| Date | ID | From | Trigger |
|---|---|---|---|
| Fri 2026-02-20 09:00 | `job_board_alert` | Indeed | immediate |
| Sat 2026-02-21 02:01 | `backup_failure` | systemd@maniac-iv | immediate |
| Sat 2026-02-21 08:30 | `nexacorp_offer` | Edward Torres | immediate |
| Sat 2026-02-21 11:15 | `nexacorp_persuasion_1` | Edward | after `rejected_nexacorp_1` |
| Sat 2026-02-21 14:30 | `nexacorp_persuasion_2` | Edward | after `rejected_nexacorp_2` |
| Sat 2026-02-21 19:00 | `nexacorp_followup` | Edward | after `accepted_nexacorp` |
| Sat 2026-02-21 19:05 | `chip_ssh_setup` | Chip | after `accepted_nexacorp` |
| Sun 2026-02-22 10:30 | `alex_good_news` | Alex Rivera | after `rejected_nexacorp_final` |

**NexaCorp** (`src/story/emails/nexacorp.ts`) — all Mon 2026-02-23:

| Time | ID | From | Trigger |
|---|---|---|---|
| 07:45 | `welcome_edward` | Edward Torres | immediate |
| 08:00 | `it_provisioned` | NexaCorp IT | immediate |
| 08:30 | `maya_welcome` | Maya Johnson | after read `it_provisioned` |
| 08:45 | `jessica_welcome` | Jessica Langford | after read `welcome_edward` |
| 08:50 | `tom_welcome` | Tom Chen | after read `welcome_edward` |
| 09:15 | `oscar_coder_setup` | Oscar Diaz | after read `/srv/engineering/onboarding.md` |
| 10:15 | `edward_paranoid` | Edward | after read `chen-handoff/notes.txt` |
| 17:00 | `edward_end_of_day` | Edward | after `auri_dbt_reported` |

### D. Operations incident log (`src/story/filesystem/nexacorp/srv.ts:52-69`)

| Date | Sev | Description | Resolved by |
|---|---|---|---|
| 2025-10-03 | P4 | Scheduled maintenance window | oscar |
| 2025-10-18 | P3 | Disk usage alert on db-primary | oscar |
| 2025-11-02 | P4 | Certificate renewal reminder | chip_service_account |
| 2025-11-14 | P3 | Memory spike on api-gateway | sarah |
| 2025-12-01 | P4 | Log rotation stalled | chip_service_account |
| 2025-12-12 | P2 | Database connection pool exhausted | oscar |
| 2025-12-22 | P4 | Stale NTP sync | chip_service_account |
| 2026-01-05 | P3 | Elevated error rate on /api/chat | sarah |
| 2026-01-15 | P3 | Elevated API latency | oscar |
| 2026-01-22 | P4 | Log rotation failure | chip_service_account |
| 2026-01-28 | P4 | Ticket #4471 log discrepancies | chip_service_account |
| **2026-02-01** | **P2** | **Auth service timeout** | oscar |
| **2026-02-03** | P4 | **Unusual service account activity** | chip_service_account |
| 2026-02-08 | P4 | Stale DNS cache | chip_service_account |
| 2026-02-15 | P3 | Deployment rollback — staging mismatch | oscar |
| 2026-02-20 | P4 | Chip response latency spike | chip_service_account |

Customer-facing tickets in `ops_incidents.csv` (`srv.ts:70-99`) cover 2025-10-05 → 2026-02-24, 28 rows. Notable: 4419 (2026-01-20) — "Chip answering questions about internal infra to external users" (closed by cassie).

### E. Chipinfra plugin install dates (`src/story/filesystem/chipinfra/opt.ts:65-74`)

| Date | Plugin | Version |
|---|---|---|
| 2025-06-01 | analytics-reports | 2.3.0 |
| 2025-06-01 | log-maintenance | 1.1.0 |
| 2025-06-01 | ticket-triage | 1.5.2 |
| 2025-06-01 | system-monitor | 2.0.0 |
| 2025-07-10 | data-pipeline | 3.0.1 |
| 2025-08-05 | alert-routing | 1.3.1 |
| 2025-08-20 | code-review | 1.4.0 |
| 2025-09-15 | brand-voice | 2.1.0 |
| 2025-10-01 | onboarding | 1.2.0 |
| 2025-11-12 | incident-response | 1.0.3 |

Chip directives added by Edward 2025-11-18: silence log-maintenance noise (`opt.ts:487, 496`); "Do not post to channels" rule (`opt.ts:695`).

### F. Chipinfra service-account key rotation history (`src/story/filesystem/chipinfra/srv.ts:251-300`)

| Account | Provisioned | Last rotated | Cadence |
|---|---|---|---|
| `deploy_bot` | 2025-04-10 | 2026-01-15 | GitHub App auto |
| `chip_service_account` | 2025-06-01 | **2025-09-12** (overdue — quarterly) | Manual |
| `dbt_service` | 2025-07-15 | 2026-01-10 | Semi-annual |
| `monitoring_bot` | 2025-05-20 | 2025-12-01 | Semi-annual |
| `backup_agent` | 2025-08-01 | 2025-11-15 | Semi-annual |

Notes block (`chipinfra/srv.ts:270-271`):
- *"2026-01 quarterly review: Did not happen. Jin left Feb 3, review was deprioritized."*
- *"Jin's handoff todo (2026-02-01): 'Review chip_service_account permissions (way too broad).'"*

### G. NexaCorp syslog generator (`src/story/filesystem/logs.ts`)

Generates deterministic syslog entries spanning **Feb 17–23 2026** (Day 1), extended to **Feb 24** when `includeDay2` is set (`logs.ts:5-7, 18-20`). The "cleanup" pass strips `chip_service_account` entries from `system.log` but preserves them in `system.log.bak` — the in-fiction smoking gun for the player.

Employee login schedule (`logs.ts:45-60`) — `daysPresent` arrays in Feb 17–24 day numbers. Notable patterns:
- **Oscar** present 17,18,19,20,**21** (Sat),23,24 — only engineer with weekend logins
- **Auri** present 17,18,19,20,**21** (Sat),23,24 — workaholic, narrative reason
- **Marcus** (COO) on Feb 18 only; **Jessica** (CEO) on Feb 20 only

Oscar's late-night sessions (`logs.ts:72-76`): Feb 17 23:45, Feb 19 22:10, Feb 21 21:30.

`chip_service_account` reads of `/home/jchen/` files (the exfiltration trail) — sampled across Feb 17, 19, 21, 22, 23, 24 with concentrated activity on Feb 3 01:17–03:45 (jchen file reads, then cleanup writes through 04:12). Sources: `logs.ts:996-1001` (historical entries) and `nexacorp_prod.json` SYSTEM_EVENTS:670-705. Note: `id_rsa` reads are NOT on Feb 3 — they're sprinkled across Feb 17–24 in `logs.ts:365-408` (CHIP_ONLY_ENTRIES) and `logs.ts:751-765` (CHIP_SUSPICIOUS).

### H. Player backstory (home PC)

`src/story/filesystem/home/`:

| Date / range | Item | Source |
|---|---|---|
| 2019–2020 | Software Engineer, WebScale Solutions | `downloads.ts:46` (resume) |
| 2020–2022 | Junior ML Engineer, DataWorks Inc. | `downloads.ts:40` |
| 2022–2025 | ML Engineer, Prometheus Analytics | `downloads.ts:33` |
| Q3 2025 | "AI Industry Employment Trends" report | `downloads.ts:67` |
| 2026-01-28 | NexaCorp AI Engineer job posting | `downloads.ts:111` |
| 2026-02-03 (date in JD body: "tomorrow!") | interview prep file last edited | `downloads.ts:146` |
| 2026-02-10 | Malware incident & Ubuntu reinstall | `desktop.ts:76-132` |
| 2026-02-18 | `auto_apply.py` last run; `Screenshot_2026-02-18.png` | `home/scripts.ts`; `downloads.ts:190` |
| 2026-02-20 | `job_search_notes.txt` last updated | `desktop.ts:10` |

### I. Standup notes (`nexacorp/srv.ts:260-292`)

Async standup file dated entries:
- **Fri Feb 20**: Sarah (auth middleware), Oscar (2am disk paging, "weird log entries"), Erik (esbuild), Auri (`dim_employees` may be stale), Soham (integrations dashboard).
- **Thu Feb 19**: Sarah (auth middleware messy), Oscar (TLS staging cert renew, Dana's auto-resolved tickets question), Erik (nav component), Auri (`dbt test` overdue).
- **Wed Feb 18**: Sarah (code review), Oscar (clean monitoring), Auri ("Chen's last models...some WHERE clauses look unusual but I haven't had bandwidth").

### J. Board minutes — Feb 2026 (`nexacorp/srv.ts:155-202`)

Attendees: Jessica (CEO), Marcus (COO), Tom (CMO), Edward (CTO). Key actions/dates inside the meeting record:
- Edward to provide revised engineering timeline **by March 1**.
- ACTION: Edward to document Chip's access scope for the board — **"No follow-up as of 2/28"**.
- Series A due-diligence meetings start **March 15**.
- Headcount: Jin Chen backfill complete (new hire — the player); ops analyst tabled pending metrics reconciliation.
- Earlier board decks present as binary artifacts: `2025-09-`, `2025-12-`, `2026-01-`, `2026-02-board-deck.{pptx,pdf}` in `nexacorp/srv.ts`. Sibling subdirs `investors/`, `finance/`, `strategy/` plus `org_chart.md` flesh out the exec-suite drive; `headcount_plan.csv` lives at `finance/headcount_plan.csv`.

### K. Pipeline run history (`nexacorp/srv.ts:331-362`)

`pipeline_runs.csv` in `chen-handoff/` — last live run records before Jin's resignation. Spans Jan 15 → Jan 23, 2026. Distinct pattern: daily 9am runs by `auri.park`, plus nightly 03:01 runs by `chip_service_account`. Telegraphs the chip-runs-things-at-3am-now plot beat.

### L. Misc anchors

- **dbt manifest** generated_at: `2026-02-23T08:00:00.000Z` (`nexacorp/dbt.ts:678`).
- **Marketing brand_guidelines.md**: external messaging fight with Tom — "wait until after Series A closes" (`nexacorp/srv.ts:32-35`).
- **Erik's polymarket queries** (Q1 / Q2 2026 markets re: NexaCorp ARR, Series A, Chip developer count) — `src/story/filesystem/erikpc.ts`.
- **Marts model trained dates**: 2025-08-12, 2025-04-03 (`chipinfra/srv.ts:1147, 1153`).

---

## Keeping This Current

When adding dated content, update both the source file *and* this doc. The auto-memory at `feedback_update_skills.md` already nags about `.claude/skills/` — treat `docs/timeline.md` the same way. Cross-link skills: `narrative` (story flags / triggers), `email` (Maildir, delivery), `piper` (segment clock), `snowflake` (seed data), `dbt` (manifest), `git` (commit chain).
