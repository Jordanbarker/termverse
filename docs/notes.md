RAG quest
    RAG data: PTO, HR policies, IT procedures, internal playbooks, product docs, wikis, databases (snowflake) regulatory guidance, audit materials, and transaction context to support reporting and compliance questions.

- note about deleting old data to keep snowflake bill cheap
- you're absolutely right!
- Slippery slope, bad guy used chip's permissions slowly and it escalated

du: shows disk usage of the current directory and all subdirectories (in blocks, usually 1 KB).
    du /path/to/dir: shows usage for that specific directory and its subdirectories.
    du -h: shows sizes in human‑readable units like K, M, G (e.g., 4.2M).
    du -sh .: shows only the total size of the current directory (summary).
    du -a: shows every file and directory, not just directories.
    du -m or du -k: forces output in MB or KB blocks.

$ echo "Hello World"            # print to screen
$ echo "Hello" > output.txt     # write to file (overwrites)
$ echo "More" >> output.txt     # append to file

$ grep "error" app.log                  # find lines containing "error"
$ grep -i "error" app.log               # case-insensitive
$ grep -r "TODO" ./src                  # search recursively through all files in src/
$ grep -n "error" app.log               # show line numbers
$ grep -v "debug" app.log               # show lines that do NOT match
$ grep -rn

$ find . -name "*.log"                      # find all .log files from here
$ find /var/log -name "*.log" -mtime -7     # logs modified in last 7 days
$ find . -type d -name "node_modules"       # find directories named node_modules
$ find . -size +100M                        # files larger than 100MB

Endpoint for /health or /ready:
$ curl -X GET http://localhost:8081/v1/health | jq
$ curl -X GET http://localhost:1976/v1/health/ready | jq

Check dataset sizes: ls -lh /data/training_set/     -l long format, -h human-readable
Count dataset records: wc -l dataset.csv            wc -l line counting
Preview data structures: head -n 10 dataset.csv     head -n limiting output
Check last export timestamp: tail -n 3 export_log.txt  │ tail for end-of-file

echo -e

rm folder

df command 

git clone git@github.com:company/ai-models-repo.git
git checkout -b fix/data-pipeline-null-values # Create a new branch
git commit -m "Fix null handling in the preprocessing script"
git push origin fix/data-pipeline-null-values
git clone, checkout -b, commit -m, push origin
Git stash - changes made to branch so sync fails
Git rebase - add changes on top of new commits
 
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

Pulling at a Loose Thread
  - cat /tmp/ssh-mZ4xPq/.user-erik
  - export SSH_AUTH_SOCK=/tmp/ssh-mZ4xPq/agent.18472
  - ssh-add -l
  - ssh erik@nexacorp-lt05


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

[2026-02-23 03:00:01] systemd[1]: Starting chip-log-maintenance.service - Chip log maintenance: rotate and prune system logs...
[2026-02-23 03:00:02] systemd[1]: chip-log-maintenance.service: Deactivated successfully.
[2026-02-23 03:00:02] systemd[1]: Finished chip-log-maintenance.service - Chip log maintenance: rotate and prune system logs.
[2026-02-23 03:00:05] systemd[1]: Starting dbt-nightly.service - Nightly dbt run for nexacorp-analytics...
[2026-02-23 03:00:06] systemd[1]: dbt-nightly.service: Deactivated successfully.
[2026-02-23 03:00:06] systemd[1]: Finished dbt-nightly.service - Nightly dbt run for nexacorp-analytics.

# Chip runs this, it should match what the player gets when they run it. @menuItems.ts
sort /var/log/access.log | uniq -c | sort -rn | head


---

├── tests/
│   └── test_tools.py


chip/
├── src/
│   ├── agent.py              # Loop + conversation state
│   ├── llm.py                # Provider client (Anthropic/OpenAI)
│   ├── tools/
│   │   ├── __init__.py       # Tool registry
│   │   ├── files.py          # read, write, str_replace, list
│   │   ├── bash.py           # Shell execution
│   │   └── search.py         # ripgrep wrapper
│   ├── prompts/
│   │   └── system.md
│   ├── cli.py                # Entry point
│   └── config.py
│
├── .env.example
├── .gitignore
├── pyproject.toml
├── Makefile
└── README.md