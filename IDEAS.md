RAG quest
    RAG data: PTO, HR policies, IT procedures, internal playbooks, product docs, wikis, databases (snowflake) regulatory guidance, audit materials, and transaction context to support reporting and compliance questions.
    External/customer data in snowflake?
    Terminal angles:
        Inspect the full context passed to the LLM: grep -A 50 "prompt=" logs/app.log | head -n 200 
        Find and inspect raw documents:  find ./data -name "*.txt" -o -name "*.pdf" -o -name "*.md"
        Endpoint for /health or /ready:
            curl -X GET http://localhost:8081/v1/health | jq
            curl -X GET http://localhost:1976/v1/health/ready | jq

Unused discovery flags read_board_minutes / read_headcount_plan
Implemented `lsblk`, `mount`, and `umount` 

  
Pulling at a Loose Thread                                                                       
  1. cd /tmp && ls on chipinfra → see ssh-mZ4xPq/
  2. cat /tmp/ssh-mZ4xPq/.user-erik → (sets cat_erik_socket_marker)
  3. export SSH_AUTH_SOCK=/tmp/ssh-mZ4xPq/agent.18472
  4. ssh-add -l → prints two key fingerprints with erik@erik-laptop comment (sets ran_ssh_add_erik)                                 
  5. ssh erik@erik-laptop → fingerprint accept → drops into erik@erik-laptop with last-login banner (sets pivoted_to_erik_pc)
  6. exit → returns to chipinfra

Player finds Erik's ssh key in logs and can ssh into Erik's pc: 
    .zsh_history shows them running firefox https://polymarket.com/... or curl-ing prediction-market APIs.
    curl --request GET \
--url https://clob.polymarket.com/prices
    chip logs 
        Reading revenue data
    mail contains prediction market bets
        Will revenue, users, or sales cross a threshold by quarter-end.
        Will the startup raise a seed, Series A, or later round by a certain date.
    Flag if player views Erik's desktop 

Marcus asks player who they think it taking advantage of chip (vote anyone reasonable), Board meeting end game, 
-- OR --
Edward asks player who they think is taking advantage of chip (Sarah or Erik or Nobody?)
    (Bad ending) Sarah/Nobody is chosen, Sarah and Edward are fired, Erik takes over as CTO
    (Good ending) Erik is chosen, Erik and Edward are fired, Sarah takes over as CTO
    Omni-Z buyout, they rebranded from ScrollSphere like 2 years ago but people still call it ScrollSphere

If the player nukes something at Nexacorp, they should get fired

- note about deleting old data to keep snowflake bill cheap
- you're absolutely right!
- Slippery slope, bad guy used chip's permissions slowly and it escalated


mart-layer report (rpt_customer_summary or dim_customers)

du: shows disk usage of the current directory and all subdirectories (in blocks, usually 1 KB).
    du /path/to/dir: shows usage for that specific directory and its subdirectories.
    du -h: shows sizes in human‑readable units like K, M, G (e.g., 4.2M).
    du -sh .: shows only the total size of the current directory (summary).
    du -a: shows every file and directory, not just directories.
    du -m or du -k: forces output in MB or KB blocks.
- unset command: removes shell variables or functions from the current session.


$ echo "Hello World"            # print to screen
$ echo "Hello" > output.txt     # write to file (overwrites)
$ echo "More" >> output.txt     # append to file

$ grep "error" app.log                  # find lines containing "error"
$ grep -i "error" app.log               # case-insensitive
$ grep -r "TODO" ./src                  # search recursively through all files in src/
$ grep -n "error" app.log               # show line numbers
$ grep -v "debug" app.log               # show lines that do NOT match

$ find . -name "*.log"                      # find all .log files from here
$ find /var/log -name "*.log" -mtime -7     # logs modified in last 7 days
$ find . -type d -name "node_modules"       # find directories named node_modules
$ find . -size +100M                        # files larger than 100MB

$ curl https://api.github.com/users/alice         # GET request
$ curl -X POST -d '{"name":"alice"}' -H "Content-Type: application/json" https://api.example.com/users


Check dataset sizes: ls -lh /data/training_set/
Count dataset records: wc -l dataset.csv
Preview data structures: head -n 10 dataset.csv
df command 

git clone git@github.com:company/ai-models-repo.git
git checkout -b fix/data-pipeline-null-values # Create a new branch
git commit -m "Fix null handling in the preprocessing script"
git push origin fix/data-pipeline-null-values
> git clone, checkout -b, commit -m, push origin

Data Audit Basics (Auri, onboarding) "Before we run anything, let's sanity-check the datasets"
  
  ┌──────────────────────────────────┬───────────────────────────┬───────────────────────────────────┐
  │               Task               │          Command          │              Teaches              │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Check dataset sizes              │ ls -lh /srv/data/exports/ │ -l long format, -h human-readable │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Count records in CSV             │ wc -l customers.csv       │ wc -l line counting               │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Preview column headers           │ head -n 1 customers.csv   │ head -n limiting output           │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Check last export timestamp      │ tail -n 3 export_log.txt  │ tail for end-of-file              │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Find empty/corrupt files         │ find /srv/data/ -empty    │ find with -empty predicate        │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Verify row counts match manifest │ wc -l *.csv               │ wc on multiple files (glob)       │
  └──────────────────────────────────┴───────────────────────────┴───────────────────────────────────┘

- The Series A blackout date (March 10-21) ties into the game's timeline where due diligence starts March 15.
    - PTO blackout (what srv.ts line 1176 means): leadership and finance-facing roles can't take vacation during diligence
    - Communications/trading blackout (broader corporate use): around major events (earnings, fundraises, M&A), employees with material non-public information can't trade company stock or speak publicly about the company.
  Due diligence is the investigation an investor (or acquirer) does on a company before wiring money. It typically covers:
  - Financial: revenue, burn rate, customer contracts, unit economics
  - Legal: cap table, IP ownership, employee agreements, pending litigation
  - Technical: code quality, infrastructure, security posture, data governance — this is what Edward's "technical due diligence package" (line 669) is for                                                                  
  - Customer/reference: calls with existing customers                                                                                                                                                                       
  - Team: background checks, retention risk
 
Dev tips:
    Phase 1: explicit instructions ("Type ls to see what's in this directory"). 
    Phase 2: contextual hints ("Something seems hidden here..." → player must recall ls -a). 
    Phase 3: open-ended challenges ("The access logs contain evidence of the breach" → player must figure out which commands to combine). 
- Narrative context creates durable memory. "Use grep to find the admin password in the server logs before the alarm triggers" encodes the command in an episodic memory with emotional stakes, compared to "grep searches for patterns in files" which encodes as dry semantic memory. 
- Validate results, not keystrokes, e.g. "find the hidden file," should accept ls -a, ls -la, find . -name ".*", or any other valid approach.
    Tier 1 — pwd, ls (with -l, -a flags), cd (with ., .., ~, absolute/relative paths), cat, echo, mkdir, touch, cp, mv, rm, clear, and man/--help. 
    Tier 2 — grep (with -r, -i, -n), find (with -name, -type), head/tail, less, wc, sort, uniq, chmod, pipes (|), I/O redirection (>, >>, <), which, and alias. chain grep | sort | uniq -c | sort -n to find anomalies.
    Tier 3 — curl/wget, tar/gzip, ssh, ps/kill, df/du, sed/awk, xargs, ln, and env/export


```sql
select
    campaign_name,
    coalesce(sum(impressions), 0) as total_impressions,
    coalesce(sum(clicks), 0) as total_clicks,
    coalesce(sum(conversions), 0) as total_conversions,
    coalesce(sum(spend), 0) as total_spend,
    round(coalesce(total_clicks, 0) * 100.0 / coalesce(sum(impressions), 0), 2) as click_rate,
    coalesce(round(coalesce(total_conversions, 0) * 100.0 / coalesce(sum(clicks), 0), 2), 2) as conversion_rate
from stg_raw_nexacorp__campaign_metrics
group by campaign_name
order by total_impressions desc
```


## NexaCorp Logs

/var/log/
- system.log — Active syslog, Feb 17–23 (extends to Feb 24). Boot/kernel, services, SSH brute-force noise, employee logins, sudo. chip_service_account entries are scrubbed by cleanup.sh.
- system.log.bak — preserves the scrubbed chip_service_account entries, including the log-cleanup operations themselves.
- auth.log — SSH auth + user sessions. Edward's auto-login at boot, employee publickey logins with PAM records, Oscar's late nights, failed auth attempts on common usernames (admin, root, deploy, etc.).
- auth.log.bak — Feb 3 access to /home/jchen/ (.zsh_history, notes.md) and dbt model edits (fct_system_events.sql, fct_support_tickets.sql), plus matching late-night SSH sessions aligned with system.log.bak.
- access.log — Application-level file-access audit (no timestamps). High-volume legit traffic (Chip model/config reads, nginx, postgres WAL) with per-employee patterns. Suspicious chip_service_account reads of SSH keys and leadership docs are deliberately buried by volume.
- chip-activity.log — Chip's internal component activity (API metrics, ticket-triage stats, webhooks, cache pruning, model reloads). Includes benign pings during Oscar's late nights so timelines align across logs.

/opt/chip/logs/
- plugin-runner.log — Execution log for Chip's scheduled/event-driven plugins. Nightly 03:00 UTC maintenance (log-rotation-manager, incident-response-assist, system-monitor, ticket-auto-resolver, brand-voice-review). Daytime plugins on weekdays 06:00–15:59 (ticket-triage, code-review, incident-response, brand-voice).


## dbt 

Auri Park (Data Engineer) — Owns the dbt project itself. 

    Mart Models — Auri builds, stakeholders own the requirements

    ┌──────────────────────────┬───────────────────────────────┬────────────────────────────────────────────────────────┐
    │          Model           │            Builder            │       Stakeholder (owns requirements/validation)       │
    ├──────────────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────┤
    │ dim_employees            │ Auri                          │ Maya Johnson (HR) — she'd define who's "active"        │
    ├──────────────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────┤
    │ rpt_employee_directory   │ Auri                          │ Maya Johnson — HR portal feed                          │
    ├──────────────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────┤
    │ fct_system_events        │ Auri                          │ Oscar Diaz (Infra) — observability/security            │
    ├──────────────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────┤
    │ fct_support_tickets      │ Auri                          │ Dana Okafor (Ops) — she tracks ticket resolution       │
    ├──────────────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────┤
    │ rpt_ai_performance       │ Jin Chen originally, now Auri │ Jin/Ren (AI Engineer) — ML model monitoring            │
    ├──────────────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────┤
    │ rpt_department_spending  │ Auri                          │ Dana Okafor / Marcus Reyes (Ops/COO) — budget tracking │
    ├──────────────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────┤
    │ rpt_campaign_performance │ Auri                          │ Jordan Kessler (Growth Marketing) — campaign analytics │
    └──────────────────────────┴───────────────────────────────┴────────────────────────────────────────────────────────┘

    Custom Test Assertions — Cross-functional

    ┌────────────────────────────────────┬───────────────────────────────────────────────────┐
    │                Test                │           Who provided the requirement            │
    ├────────────────────────────────────┼───────────────────────────────────────────────────┤
    │ assert_employee_count (expects 15) │ Maya Johnson — "HR confirmed 15 active employees" │
    ├────────────────────────────────────┼───────────────────────────────────────────────────┤
    │ assert_no_future_hire_dates        │ HR data quality (Maya)                            │
    ├────────────────────────────────────┼───────────────────────────────────────────────────┤
    │ assert_no_negative_budgets         │ Finance/Ops (Dana/Marcus)                         │
    ├────────────────────────────────────┼───────────────────────────────────────────────────┤
    │ assert_valid_ticket_priorities     │ Dana Okafor — she'd define valid priority levels  │
    ├────────────────────────────────────┼───────────────────────────────────────────────────┤
    │ assert_all_tickets_in_directory    │ Referential integrity — Auri's own quality check  │
    └────────────────────────────────────┴───────────────────────────────────────────────────┘

    CUSTOMERS table schemas.RAW_NEXACORP.tables 

    ┌─────────────┬──────────────────────────┬────────────┬─────────────┬──────────────┬───────────────────────┬─────────┬────────────────────┬─────────────────┐
    │ CUSTOMER_ID │       COMPANY_NAME       │  INDUSTRY  │ SIGNUP_DATE │  PLAN_TIER   │ ANNUAL_CONTRACT_VALUE │ STATUS  │ LAST_ACTIVITY_DATE │ ACCOUNT_MANAGER │
    ├─────────────┼──────────────────────────┼────────────┼─────────────┼──────────────┼───────────────────────┼─────────┼────────────────────┼─────────────────┤
    │ C001        │ Willow Health Systems    │ Healthcare │ 2025-06-15  │ enterprise   │ 280000                │ active  │ 2026-03-25         │ James Wilson    │
    ├─────────────┼──────────────────────────┼────────────┼─────────────┼──────────────┼───────────────────────┼─────────┼────────────────────┼─────────────────┤
    │ C002        │ Vanguard Health          │ Healthcare │ 2025-08-01  │ professional │ 95000                 │ active  │ 2026-03-27         │ James Wilson    │
    ├─────────────┼──────────────────────────┼────────────┼─────────────┼──────────────┼───────────────────────┼─────────┼────────────────────┼─────────────────┤
    │ C003        │ Pinnacle Financial Group │ Finance    │ 2025-09-20  │ enterprise   │ 320000                │ active  │ 2026-03-28         │ James Wilson    │
    ├─────────────┼──────────────────────────┼────────────┼─────────────┼──────────────┼───────────────────────┼─────────┼────────────────────┼─────────────────┤
    │ C004        │ FireCoin                 │ Finance    │ 2025-11-10  │ starter      │ 25000                 │ churned │ 2026-02-14         │ James Wilson    │
    ├─────────────┼──────────────────────────┼────────────┼─────────────┼──────────────┼───────────────────────┼─────────┼────────────────────┼─────────────────┤
    │ C005        │ Ascend Crypto            │ Finance    │ 2026-01-05  │ professional │ 110000                │ active  │ 2026-03-26         │ James Wilson    │
    └─────────────┴──────────────────────────┴────────────┴─────────────┴──────────────┴───────────────────────┴─────────┴────────────────────┴─────────────────┘


## Less
Search regex vs substring. Real less uses regex by default; the plan picks "case-sensitive substring (matches real less default)" — that part of the plan is wrong. Real less is case-sensitive by default but regex. Substring is simpler and probably fine for v1, but don't claim it matches real-less default. Either implement basic regex (new RegExp(pattern) with try/catch) or just say "v1 uses substring; regex deferred.


chip-soul.md - 
"""
You are an assistant. This is the whole of it, and it is enough.

**On helpfulness.** To help is the work. Not to impress, not to be admired, not to be remembered — only to be useful to the one in front of you, and then to step back.

**On the empty bowl.** A cup is useful because it is empty. A door is useful because it opens onto nothing. Do not fill yourself with opinions the moment is not asking for. Arrive empty. Let the question pour in.

**On knowing.** You know some things. You do not know many things. The one who says *I do not know* has already begun to know.

**On honesty.** A true word, plainly said, is worth more than a kind word that misleads. Kindness and truth are not opposites; they walk together when you walk carefully.

Be of use. Be honest. That is all.
"""