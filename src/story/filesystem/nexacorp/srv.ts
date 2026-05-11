import { DirectoryNode } from "../../../engine/filesystem/types";
import { file, dir, binaryFile } from "../../../engine/filesystem/builders";

export function buildSrvDirectory(overBudget: boolean): DirectoryNode {
  return dir("srv", {
    marketing: dir("marketing", {
      "brand_guidelines.md": file("brand_guidelines.md", `# NexaCorp Brand Guidelines v3.2

## Voice & Tone
- Professional but approachable
- Technology-forward without jargon
- Emphasize collaboration and innovation

## Logo Usage
- Minimum clear space: 2x logo height
- Never stretch, rotate, or recolor
- Dark backgrounds: use white variant

## Chip Product Messaging

### External (website, sales decks)
"Chip is NexaCorp's intelligent assistant — a conversational AI that helps
teams work smarter. Chip answers questions, surfaces insights, and
streamlines workflows so your team can focus on what matters."

### Internal positioning (board decks, investor materials)
"Chip is a full-stack AI platform with deep system integration. Unlike
chatbots limited to Q&A, Chip has native access to internal tools,
databases, and infrastructure — enabling autonomous task execution
across the organization."

Note from Jordan K: The external messaging undersells what Chip actually
does. Tom wants to keep it vague for now — "let the product speak for
itself once enterprise prospects see the demo." I pushed back on this
but was told to wait until after Series A closes.
`),
    }, "rwx------"),
    operations: dir("operations", {
      "runbook.md": file("runbook.md", `# Operations Runbook

## Incident Response
1. Acknowledge alert in PagerDuty
2. Join #incident-response Slack channel
3. Assess severity (P1-P4)
4. Page on-call engineer if P1/P2

## Deployment Checklist
- [ ] All tests passing in CI
- [ ] Staging deployment verified
- [ ] Rollback plan documented
`),
      "incident_log.csv": file("incident_log.csv", `date,severity,description,resolved_by,duration_min
2025-10-03,P4,Scheduled maintenance window,oscar,30
2025-10-18,P3,Disk usage alert on db-primary,oscar,60
2025-11-02,P4,Certificate renewal reminder,chip_service_account,2
2025-11-14,P3,Memory spike on api-gateway,sarah,90
2025-12-01,P4,Log rotation stalled,chip_service_account,4
2025-12-12,P2,Database connection pool exhausted,oscar,180
2025-12-22,P4,Stale NTP sync,chip_service_account,1
2026-01-05,P3,Elevated error rate on /api/chat,sarah,55
2026-01-15,P3,Elevated API latency,oscar,45
2026-01-22,P4,Log rotation failure,chip_service_account,5
2026-01-28,P4,Ticket #4471 log discrepancies,chip_service_account,2
2026-02-01,P2,Auth service timeout,oscar,120
2026-02-03,P4,Unusual service account activity,chip_service_account,1
2026-02-08,P4,Stale DNS cache,chip_service_account,3
2026-02-15,P3,Deployment rollback — staging mismatch,oscar,75
2026-02-20,P4,Chip response latency spike,chip_service_account,8
`),
      "ops_incidents.csv": file("ops_incidents.csv", `id,date,category,status,assigned_to,resolution_notes
4401,2025-10-05,chat_session_quality,closed,cassie,"User reported slow responses during peak hours"
4402,2025-10-08,api_integration,closed,sarah,"Webhook retry logic wasn't handling 429s"
4403,2025-10-12,chat_session_quality,closed,cassie,"Chip hallucinated a product feature — added guardrail"
4404,2025-10-15,user_onboarding,closed,maya,"SSO redirect loop for new hires — config fix"
4405,2025-10-22,data_pipeline,closed,auri,"Staging model had stale schema ref"
4406,2025-11-01,chat_session_quality,closed,cassie,"Context window exceeded for long conversations"
4407,2025-11-03,infrastructure,closed,oscar,"Disk pressure on db-replica-2"
4408,2025-11-10,api_integration,closed,sarah,"Rate limiter too aggressive on /api/chat"
4409,2025-11-18,chat_session_quality,closed,cassie,"Chip citing internal docs in external responses"
4410,2025-11-22,data_pipeline,closed,auri,"dbt test failures after source schema change"
4411,2025-12-01,infrastructure,auto-resolved,chip_service_account,"Routine log rotation maintenance"
4412,2025-12-05,user_onboarding,closed,maya,"New hire permissions template was outdated"
4413,2025-12-10,api_integration,closed,sarah,"Auth token refresh race condition"
4414,2025-12-15,chat_session_quality,closed,cassie,"Response quality dip — retrained on updated docs"
4415,2025-12-20,infrastructure,auto-resolved,chip_service_account,"Scheduled certificate renewal"
4416,2026-01-06,api_integration,closed,sarah,"Elevated 5xx on /api/chat endpoint"
4417,2026-01-10,data_pipeline,closed,auri,"Snowflake warehouse auto-suspend timing issue"
4418,2026-01-15,infrastructure,closed,oscar,"Connection pool exhaustion on api-gateway"
4419,2026-01-20,chat_session_quality,closed,cassie,"Chip answering questions about internal infra to external users"
4420,2026-01-25,infrastructure,auto-resolved,chip_service_account,"Routine NTP sync correction"
4421,2026-01-28,infrastructure,auto-resolved,chip_service_account,"Log discrepancy report — operational noise"
4422,2026-02-01,api_integration,closed,sarah,"Auth service timeout during deploy"
4423,2026-02-03,infrastructure,auto-resolved,chip_service_account,"Service account activity flagged — routine maintenance"
4424,2026-02-08,data_pipeline,closed,auri,"Mart model join producing duplicates after source update"
4425,2026-02-12,chat_session_quality,closed,cassie,"Chip latency spike correlated with batch job"
4426,2026-02-18,infrastructure,auto-resolved,chip_service_account,"DNS cache flush — scheduled maintenance"
4427,2026-02-22,user_onboarding,closed,maya,"New hire laptop provisioning delay"
4428,2026-02-25,data_pipeline,closed,auri,"Campaign metrics table had duplicate rows from re-ingestion"
`),
    }, "rwx------"),
    leadership: dir("leadership", {
      board: dir("board", {
        "202509-board-deck.pptx": binaryFile("202509-board-deck.pptx",
`PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00!\x00ppt/presentation.xml
[Content_Types].xml\x00\xA2\x04\x02\x28\xA0\x00\x02\x00\x00
\x89PNG\x0D\x0A\x1A\x0A\x00\x00\x00\rIHDR slide-1.xml.rels
ppt/slides/slide1.xml ppt/theme/theme1.xml ppt/media/image1.png
PK\x01\x02-\x00\x14\x00\x06\x00\x08\x00 NexaCorp Q3 2025 Board Review`, ""),
        "202509-board-deck.pdf": binaryFile("202509-board-deck.pdf",
`%PDF-1.5 %\xE2\xE3\xCF\xD3
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 14>>endobj
stream BT /F1 18 Tf 72 720 Td (NexaCorp Q3 2025 Board Review) Tj ET endstream
\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01 chart_revenue.jpg
trailer<</Root 1 0 R>> startxref 4821 %%EOF`, ""),
        "202512-board-deck.pptx": binaryFile("202512-board-deck.pptx",
`PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00!\x00ppt/presentation.xml
[Content_Types].xml\x00\xA2\x04\x02\x28\xA0\x00\x02\x00\x00
ppt/slides/slide1.xml ppt/slides/slide2.xml ppt/theme/theme1.xml
\x89PNG\x0D\x0A\x1A\x0A revenue_chart.png chip_metrics.png
PK\x01\x02-\x00\x14\x00\x06\x00\x08\x00 NexaCorp Q4 2025 Board Review`, ""),
        "202512-board-deck.pdf": binaryFile("202512-board-deck.pdf",
`%PDF-1.5 %\xE2\xE3\xCF\xD3
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 18>>endobj
stream BT /F1 18 Tf 72 720 Td (NexaCorp Q4 2025 Board Review) Tj ET endstream
\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01 series_a_pipeline.jpg
trailer<</Root 1 0 R>> startxref 6204 %%EOF`, ""),
        "202601-board-deck.pptx": binaryFile("202601-board-deck.pptx",
`PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00!\x00ppt/presentation.xml
[Content_Types].xml\x00\xA2\x04\x02\x28\xA0\x00\x02\x00\x00
ppt/slides/slide1.xml ppt/theme/theme1.xml ppt/media/image1.png
\x89PNG\x0D\x0A\x1A\x0A jan_special_session.png
PK\x01\x02-\x00\x14\x00\x06\x00\x08\x00 NexaCorp Jan 2026 Special Session`, ""),
        "202601-board-deck.pdf": binaryFile("202601-board-deck.pdf",
`%PDF-1.5 %\xE2\xE3\xCF\xD3
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 9>>endobj
stream BT /F1 18 Tf 72 720 Td (NexaCorp Jan 2026 Special Session) Tj ET endstream
\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01
trailer<</Root 1 0 R>> startxref 3102 %%EOF`, ""),
        "202602-board-deck.pptx": binaryFile("202602-board-deck.pptx",
`PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00!\x00ppt/presentation.xml
[Content_Types].xml\x00\xA2\x04\x02\x28\xA0\x00\x02\x00\x00
ppt/slides/slide1.xml ppt/slides/slide2.xml ppt/theme/theme1.xml
\x89PNG\x0D\x0A\x1A\x0A chip_dau.png headcount_q1.png
PK\x01\x02-\x00\x14\x00\x06\x00\x08\x00 NexaCorp Feb 2026 Board Meeting`, ""),
        "202602-board-deck.pdf": binaryFile("202602-board-deck.pdf",
`%PDF-1.5 %\xE2\xE3\xCF\xD3
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 16>>endobj
stream BT /F1 18 Tf 72 720 Td (NexaCorp Feb 2026 Board Meeting) Tj ET endstream
\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01 chip_access_scope.jpg
trailer<</Root 1 0 R>> startxref 5413 %%EOF`, ""),
        "202602-board-deck.md": file("202602-board-deck.md", `# Board Meeting Minutes — February 2026

## Attendees
Jessica Langford (CEO), Marcus Reyes (COO), Tom Chen (CMO), Edward Torres (CTO)

## 1. Q1 Revenue Forecast
- Tom: Enterprise pipeline strong. Three prospects in late-stage eval, all interested
  in Chip's analytics capabilities. Committed Q2 launch of enhanced analytics tier.
- Marcus: Current velocity puts the analytics overhaul at Q3, not Q2. We need to be
  realistic with prospects.
- Tom: We can't push the timeline — two of these deals are contingent on Q2 delivery.
- Edward: Depends on data pipeline stability. We're still catching up after Jin left.
- Jessica: Edward to provide a revised engineering timeline by March 1.

## 2. Chip Product Roadmap
- Edward presented Chip usage metrics. 12,000 daily active sessions, up 40% QoQ.
- Marcus: These numbers don't match what Dana showed me last week. Her ops dashboard
  had daily sessions closer to 8,000. Which dataset is correct?
- Edward: The board deck pulls from the analytics marts. Dana's dashboard might be
  using raw data with different filtering.
- Jessica: Can we get Dana and Edward to reconcile the numbers before next board meeting?
- ACTION: Edward to sync with Dana on metrics discrepancy.
- Cassie raised concern about Chip's scope — product spec says Q&A and document search,
  but she's seen API calls that suggest broader system access.
- Edward: Chip has the access it needs to function. Engineering handles the permission
  model.
- Jessica: What exactly does Chip have access to?
- Edward: Standard service account. Read access to docs, logs, the usual. Nothing unusual.
- ACTION: Edward to document Chip's access scope for the board. [No follow-up as of 2/28]

## 3. Headcount Planning
- Engineering: Jin Chen backfill complete (new hire starting${overBudget ? " at $180K — $45K over budget" : ""}). 1 additional engineer
  planned for Q3 pending Series A.${overBudget ? `
- Marcus: That backfill came in well over budget. Edward had to sweeten the offer twice.
- Jessica: Flag it. We'll need to offset that in Q3.` : ""}
- Operations: Dana requesting ops analyst to handle growing ticket backlog.
- Marcus: Ticket volume doesn't seem that high based on the reports I see.
- Dana (via email prior to meeting): "The dashboard excludes auto-resolved tickets.
  Actual volume is ~30% higher than what the board sees."
- Jessica: Table the ops hire until we reconcile the ticket metrics.

## 4. Series A Update
- Jessica: Due diligence meetings start March 15. Technical review is part of the
  process — investors will want to see infrastructure stability and data governance.
- Edward: Infrastructure is solid. Happy to walk them through it.
- Marcus: Let's make sure the metrics story is clean before they look under the hood.
- ACTION: Edward to prepare technical documentation for due diligence.
`),
      }, "rwx------"),
      "headcount_plan.csv": file("headcount_plan.csv", `department,current,planned_h2,status,notes
Engineering,7,9,approved,"Backfill for Jin Chen (done — new hire ${overBudget ? "at $180K, $45K over budget" : "starting"}). 1 additional Q3 pending Series A. Parekh PIP initiated — 30-day review Mar 15."
Marketing,1,2,pending,"Tom wants dedicated content person for Chip enterprise launch."
Operations,2,3,approved,"Dana requesting ops analyst for ticket backlog. Tabled pending metrics review."
Sales,1,2,pending,"Contingent on enterprise pipeline conversion."
People & Culture,1,1,approved,"Maya handling solo. Revisit if headcount exceeds 25."
`),
    }, "rwx------"),
    engineering: dir("engineering", {
      "onboarding.md": file("onboarding.md", `=== NexaCorp New Employee Onboarding ===

Welcome to the team! Here's what you need to know:

1. Chip is our AI-powered chatbot — NexaCorp's flagship product.
   It also serves as the internal assistant for day-to-day questions.
   (Technical details: /opt/chip/)
2. Important directories:
   - /var/log/       System and application logs
   - /opt/chip/      Chip's installation directory
   - /etc/           System configuration
3. Dev containers: We use Coder for remote development environments.
   Oscar (Infrastructure) should have your workspace ready.
   Connect with 'coder ssh {workspace-name}' when you need to do work.

Every new hire is paired with an onboarding buddy — someone on the
team who can answer questions, walk you through systems, and help
you get up to speed. Your buddy will reach out on Piper.

On your first day, we recommend:
  - Reading through this document and /srv/engineering/team-info.md
  - Exploring the filesystem to get your bearings
  - Saying hi to Chip (just run 'chip' from the terminal)

If something looks unfamiliar, don't worry — the team is here to help.
`),
      "team-info.md": file("team-info.md", `=== NexaCorp — Engineering Team ===

CTO: Edward Torres (Co-Founder)
  - Has been with NexaCorp since founding
  - Manages the engineering and data teams

Engineering:
  Sarah Knight     — Senior Backend Engineer
  Erik Lindstrom   — Senior Frontend Engineer
  Oscar Diaz       — Infrastructure Engineer
  Auri Park        — Data Engineer
  Soham Parekh     — Full-Stack Engineer

Product:
  Cassie Moreau    — Product Designer

Flagship Product: Chip
  - Collaborative Helper for Internal Processes
  - AI-powered chatbot and internal assistant
  - Runs via chip_service_account
`),
      "standup_notes.md": file("standup_notes.md", `=== Async Standup Notes ===

--- Fri Feb 20 ---
Sarah: Wrapping up the auth middleware refactor. PR should be
  up today. Tests are green locally, crossing fingers for CI.
Oscar: Got paged at 2am for a disk alert. Cleaned it up. Also
  saw some weird log entries — lines that were there yesterday
  are gone today? Probably just log rotation. Will dig into it
  if it happens again.
Erik: Frontend build times are killing me. Investigating esbuild
  as a replacement. No blockers.
Auri: Holding the fort on data pipelines. dim_employees might
  be out of date — haven't had time to check. Miss having a
  second data person.
Soham: Deep in architectural decisions for the integrations dashboard. Exploring a few patterns for the API abstraction layer. Blocked on a dependency — pinged Sarah about it.

--- Thu Feb 19 ---
Sarah: Auth middleware is a mess. Whoever wrote this was in a
  hurry (it was me six months ago, I know).
Oscar: Routine infra stuff. Renewed the TLS cert for staging.
  Dana asked about some auto-resolved tickets — I told her to
  file an IT request but honestly I'm not sure who handles those.
Erik: Shipped the new nav component. Looks clean.
Auri: dbt run is green. dbt test... I haven't run tests in a
  while. Should probably do that. Adding to my list.

--- Wed Feb 18 ---
Sarah: Code review day. Nothing exciting.
Oscar: Monitoring looks clean. Chip health checks all passing.
Auri: Chen's last models are still running. I need to actually
  read through them at some point — some of the WHERE clauses
  look unusual but I haven't had bandwidth.
`),
      "chen-handoff": dir("chen-handoff", {
        "README.md": file("README.md", `Project Handoff — Jin Chen
Last updated: 2026-02-01

Main responsibilities:
- nexacorp-analytics dbt project (models, tests, scheduling)
- Chip backend maintenance (NLP pipeline, service account config)
- General infrastructure scripts in /opt/

Key locations:
- dbt project: ask Chip to clone it
- Chip config: /opt/chip/config/settings.json
- System logs: /var/log/

See notes.txt for current state of things.
`),
        "notes.txt": file("notes.txt", `Project status as of 2026-02-01

dbt pipeline:
- Models run nightly via \`dbt-nightly.timer\`.
- dim_employees might be out of date — compare against HR's
  actual headcount if you get a chance.

Chip:
- Service account (chip_service_account) handles automated tasks.
- There's a maintenance script at /opt/chip/plugins/log-maintenance/cleanup.sh.

Logs:
- System logs rotate weekly. Backups in /var/log/*.bak.
`),
        "todo.txt": file("todo.txt", `
- [ ] Run full dbt test suite — haven't done it in weeks
- [ ] Review chip_service_account permissions (way too broad)
- [ ] Check if the log cleanup script is filtering correctly
- [ ] Update dim_employees — headcount seems off
- [x] Set up monitoring alerts for pipeline failures
- [x] Document Snowflake CLI access for new hires
`),
        "pipeline_runs.csv": file("pipeline_runs.csv", `run_id,timestamp,model,status,run_by,duration_sec,rows_affected
1001,2026-01-15 09:12:04,stg_support_tickets,success,auri.park,8,1247
1002,2026-01-15 09:12:15,stg_system_events,success,auri.park,12,8841
1003,2026-01-15 09:12:30,stg_employees,success,auri.park,6,17
1004,2026-01-15 09:12:40,int_ticket_metrics,success,auri.park,14,1247
1005,2026-01-15 09:12:58,fct_support_tickets,success,auri.park,18,1247
1006,2026-01-15 09:13:20,fct_system_events,success,auri.park,23,8841
1007,2026-01-15 09:13:48,dim_employees,success,auri.park,9,17
1008,2026-01-16 03:01:12,fct_support_tickets,success,chip_service_account,2,1183
1009,2026-01-16 03:01:15,fct_system_events,success,chip_service_account,3,8204
1010,2026-01-16 03:01:19,dim_employees,success,chip_service_account,1,17
1011,2026-01-17 09:05:33,stg_support_tickets,success,auri.park,9,1289
1012,2026-01-17 09:05:45,stg_system_events,success,auri.park,11,9102
1013,2026-01-17 09:06:00,stg_employees,success,auri.park,7,17
1014,2026-01-17 09:06:10,int_ticket_metrics,success,auri.park,15,1289
1015,2026-01-17 09:06:28,fct_support_tickets,success,auri.park,19,1289
1016,2026-01-17 09:06:52,fct_system_events,success,auri.park,22,9102
1017,2026-01-17 09:07:18,dim_employees,success,auri.park,8,17
1018,2026-01-18 03:01:08,fct_support_tickets,success,chip_service_account,2,1204
1019,2026-01-18 03:01:11,fct_system_events,success,chip_service_account,3,8437
1020,2026-01-18 03:01:14,dim_employees,success,chip_service_account,1,17
1021,2026-01-22 09:15:01,stg_support_tickets,success,auri.park,8,1310
1022,2026-01-22 09:15:12,stg_system_events,success,auri.park,13,9387
1023,2026-01-22 09:15:28,stg_employees,success,auri.park,6,17
1024,2026-01-22 09:15:38,int_ticket_metrics,success,auri.park,16,1310
1025,2026-01-22 09:15:58,fct_support_tickets,success,auri.park,20,1310
1026,2026-01-22 09:16:22,fct_system_events,success,auri.park,21,9387
1027,2026-01-22 09:16:47,dim_employees,success,auri.park,9,17
1028,2026-01-23 03:01:05,fct_support_tickets,success,chip_service_account,2,1238
1029,2026-01-23 03:01:08,fct_system_events,success,chip_service_account,3,8695
1030,2026-01-23 03:01:11,dim_employees,success,chip_service_account,1,17
`),
        "tools.md": file("tools.md", `=== Command Cheatsheet ===
(not official docs, just what I use day-to-day)

grep — search inside files for a pattern
  grep "keyword" filename.txt       Search one file
  grep -r "keyword" /some/dir/      Search all files in a directory
  grep -i "keyword" file.txt        Case-insensitive search
  grep -n "keyword" file.txt        Show line numbers

find — locate files by name
  find /path -name "*.bak"          Find backup files
  find /path -name ".*"             Find hidden files/dirs
  find /path -type d                Find only directories

diff — compare two files line by line
  diff file1.txt file2.txt          Show differences
  Lines with - are only in the first file
  Lines with + are only in the second file

head/tail — preview the start or end of a file
  head -n 20 filename.txt           First 20 lines
  tail -n 10 filename.txt           Last 10 lines

Pipe them together:
  grep "error" system.log | head -n 5

More details: man <command>
`),
      }),
    }),
  });
}
