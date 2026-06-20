import { DirectoryNode } from "@tt/core/filesystem/types";
import { file, dir } from "@tt/core/filesystem/builders";

/**
 * /srv/ for the chipinfra workspace (`coder ssh chip`).
 *
 * - /srv/ai/rag/ — relocated from NexaCorp ws01. The Chip platform team's
 *   knowledge base; engineering, hr, it markdown files Chip indexes.
 * - /srv/chip/  — built fresh here. Did not exist as a real subtree on ws01;
 *   only existed as path strings in CHIP_LEGIT_PATHS audit-log seed data.
 *   These files now exist for player browsability and consistency with logs.
 */
export function buildSrvDirectory(): DirectoryNode {
  return dir("srv", {
    ai: dir("ai", {
      rag: dir("rag", {
        engineering: dir("engineering", {
          "coding-standards.md": file("coding-standards.md", `# Engineering Coding Standards & PR Process

**Owner:** Sarah Knight (sarah@nexacorp.com)
**Last Updated:** February 14, 2026
**Applies To:** All engineers

---

## Languages & Frameworks

| Component | Stack | Style Guide |
|-----------|-------|-------------|
| Backend API | Python 3.11 / FastAPI | PEP 8, ruff format + lint |
| Frontend | TypeScript / React 18 | ESLint (airbnb-typescript), Prettier |
| Data pipelines | Python / dbt | PEP 8, dbt style guide (see below) |
| Infrastructure | Terraform / Bash | HashiCorp style, ShellCheck |

## Code Style

### Python
- Formatter + linter: **ruff** (replaces Black, isort, flake8, and pylint as of Jan 2026)
- Type hints recommended for all public functions
- Docstrings: Google style

### TypeScript
- Strict mode enabled (\`"strict": true\` in tsconfig)
- No \`any\` types without an explanatory comment
- Prefer \`interface\` over \`type\` for object shapes
- Named exports only (no default exports)

### dbt Models
- Model names: \`stg_\`, \`int_\`, \`fct_\`, \`dim_\` prefixes
- All models must have a \`.yml\` schema file with descriptions
- All staging models must select from \`source()\`, never raw tables
- CTEs over subqueries
- Explicit column lists (no \`SELECT *\` in production models)
- All WHERE clauses must be documented with a comment explaining the filter rationale

> **Note from Auri (2026-02-18):** Some of Jin's older models don't follow the WHERE clause documentation rule. I'm working through them but haven't had bandwidth to audit everything yet. If you see an undocumented filter, flag it or add a comment.

### SQL (Snowflake)
- Keywords uppercase (\`SELECT\`, \`FROM\`, \`WHERE\`)
- One clause per line for readability
- Always qualify column names with table aliases in joins

## Git Workflow

### Branching
- Branch from \`main\`
- Branch naming: \`{type}/{ticket}-{short-description}\`
  - Types: \`feat/\`, \`fix/\`, \`chore/\`, \`docs/\`, \`refactor/\`
  - Example: \`feat/DATA-142-add-campaign-mart\`
- Rebase on \`main\` before opening a PR

### Pull Requests
1. **Title:** Imperative mood, under 72 characters (e.g., "Add campaign performance mart")
2. **Description:** What changed, why, and how to test
3. **Reviewers:**
   - Backend: Sarah or Erik
   - Frontend: Erik
   - Data/dbt: Auri
   - Infrastructure: Oscar
4. **CI must pass** before merging (lint, typecheck, tests)
5. **One approval required** for most changes; **two approvals** for:
   - Changes to auth, permissions, or service account configs
   - Database migrations
   - Infrastructure (Terraform, CI/CD pipelines)
6. **Squash merge** to \`main\` (keeps history clean)

### Commit Messages
- Conventional commits: \`feat:\`, \`fix:\`, \`chore:\`, \`docs:\`, \`refactor:\`, \`test:\`
- Reference ticket numbers: \`feat(DATA-142): add campaign performance mart\`
- Keep the first line under 72 characters

## Code Review Standards

Reviewers should check for:
- [ ] Correctness: Does it do what the PR says?
- [ ] Tests: Are there tests? Do they cover edge cases?
- [ ] Security: No hardcoded secrets, SQL injection vectors, or overly broad permissions
- [ ] Performance: No N+1 queries, unnecessary full-table scans, or unbounded loops
- [ ] Readability: Clear naming, appropriate comments, no dead code

Turnaround: **24 hours** for initial review. If you're blocked, ping the reviewer on Piper.

## Testing

| Layer | Framework | Coverage Target |
|-------|-----------|----------------|
| Backend unit | pytest | 80% |
| Backend integration | pytest + testcontainers | Critical paths |
| Frontend unit | Jest + React Testing Library | 70% |
| E2E | Playwright | Happy paths only |
| dbt | dbt test (schema + data) | All models |

- Tests run in CI on every PR
- Do not merge with failing tests unless you've documented the reason and tagged the skip

## Deployment

- **Staging:** Auto-deploys on merge to \`main\`
- **Production:** Manual promotion from staging after QA
- Deploys happen via GitHub Actions → Cloud Services
- Rollback: revert the PR on \`main\`, auto-redeploys to staging, then promote

## Questions?

Reach out in #engineering on Piper.
`),
          "on-call-runbook.md": file("on-call-runbook.md", `# Engineering On-Call Runbook

**Owner:** Oscar Diaz (oscar@nexacorp.com)
**Last Updated:** February 17, 2026
**On-Call Rotation:** Weekly, Monday 9:00 AM PT to Monday 9:00 AM PT

---

## Current Rotation

| Week | Primary | Secondary |
|------|---------|-----------|
| Feb 10 – Feb 16 | Oscar | Sarah |
| Feb 17 – Feb 23 | Sarah | Erik |
| Feb 24 – Mar 2 | Soham | Oscar |
| Mar 3 – Mar 9 | Erik | Sarah |
| Mar 10 – Mar 16 | Oscar | Erik |

> Soham is on-call the week of Feb 24. If you need to swap, post in #engineering at least 48 hours in advance and get acknowledgment from your swap partner.

## What You're Responsible For

As on-call engineer, you are the **first responder** for:
- PagerDuty alerts routed to \`engineering-primary\`
- Piper messages in #ops-alerts
- Customer-reported outages escalated from Dana's team

You are **not** responsible for:
- Chip-related alerts (these route to Edward directly via the alert-routing plugin)
- Marketing site issues (Tom's team handles via Netlify)
- Data pipeline failures during business hours (Auri monitors these)

## Severity Levels & Response Times

| Severity | Criteria | Response Time | Action |
|----------|----------|---------------|--------|
| SEV-1 | Customer-facing outage, data breach | 15 min | Drop everything. Page secondary. Incident channel. |
| SEV-2 | Degraded performance, partial outage | 1 hour | Investigate, post status update, escalate if needed |
| SEV-3 | Internal tooling down, non-critical service | 4 hours | Triage during business hours |
| SEV-4 | Minor bug, non-urgent alert | Next business day | Log it, fix when convenient |

## Triage Checklist

When an alert fires:

1. **Acknowledge** the alert in PagerDuty within the response window
2. **Check the dashboard:** https://monitoring.nexacorp.internal/grafana
3. **Check recent deploys:** \`gh run list --repo nexacorp/api --limit 5\`
4. **Check logs:**
   - Application: \`/var/log/system.log\`
   - Access: \`/var/log/access.log\`
   - Auth: check both \`/var/log/auth.log\` and \`/var/log/auth.log.bak\`
   - Chip activity: \`/opt/chip/plugins/runner_logs\`
5. **Check Snowflake** if data-related: \`snow sql\` → query \`NEXACORP_PROD.RAW_NEXACORP.SYSTEM_EVENTS\`
6. **Post update** in #ops-alerts within 30 min of acknowledgment

## Escalation Paths

| Situation | Escalate To |
|-----------|-------------|
| Can't resolve within 1 hour (SEV-1/2) | Secondary on-call + Oscar |
| Database / Snowflake issues | Auri Park |
| Auth / API gateway | Sarah Knight |
| Infrastructure / networking | Oscar Diaz |
| Chip-related (if it lands on your plate anyway) | Edward Torres |
| Customer communication needed | Dana Okafor |

## Common Alerts & Fixes

### \`api-gateway-5xx-rate\`
**Cause:** Usually a bad deploy or upstream timeout.
**Fix:** Check recent deploys. If a deploy happened in the last hour, roll back. Otherwise, check \`/var/log/system.log\` for upstream errors.

### \`db-connection-pool-exhausted\`
**Cause:** Connection leak or traffic spike.
**Fix:** Restart the API service (\`systemctl restart nexacorp-api\`). If recurring, check for uncommitted transactions.

### \`disk-usage-critical\`
**Cause:** Log accumulation or temp files.
**Fix:** Check \`/var/log/\` sizes. The log-maintenance plugin should handle rotation, but sometimes it falls behind. Manual cleanup: \`find /var/log -name "*.gz" -mtime +30 -delete\`.

### \`snowflake-warehouse-suspended\`
**Cause:** Auto-suspend after inactivity. Normal for CHIP_WH during off-hours.
**Fix:** No action needed. The warehouse auto-resumes on next query. Only alert if resume fails repeatedly.

## After-Hours Policy

- SEV-1/2: Respond regardless of time
- SEV-3/4: Batched for next business day (the alert-routing plugin handles this)
- If you get paged for something that auto-resolves before you look at it, still check the logs. Oscar's note: "I've seen a pattern of alerts that resolve themselves before anyone investigates. It's probably fine, but it bugs me that we don't have a clear audit trail for those."

## Handoff

At the end of your on-call week:
1. Post a summary in #engineering: what fired, what you fixed, anything unresolved
2. Update this doc if you learned something new
3. DM the next on-call engineer with any heads-up items

---

*Rotation managed by Oscar. To swap weeks, post in #engineering and get confirmation from your swap partner and Oscar.*
`),
          "service-accounts.md": file("service-accounts.md", `# Service Accounts

**Owner:** Oscar Diaz (oscar@nexacorp.com)
**Last Updated:** January 28, 2026
**Review Cycle:** Quarterly (next review: April 2026)

---

## Overview

Service accounts are non-human identities used for automated processes, CI/CD, and internal tooling. All service accounts are provisioned and managed by Infrastructure (Oscar). Engineers should never create ad-hoc service accounts.

## Active Service Accounts

| Account | Owner | Purpose | Systems | Scope |
|---------|-------|---------|---------|-------|
| \`deploy_bot\` | Oscar Diaz | CI/CD deployments | GitHub Actions, Cloud Services | Write to staging/prod environments |
| \`chip_service_account\` | Edward Torres | Chip AI platform operations | Snowflake, filesystem, Jira, PagerDuty, Piper | Unrestricted (see notes below) |
| \`dbt_service\` | Auri Park | Scheduled dbt runs | Snowflake (TRANSFORMER role) | Read/write ANALYTICS schema |
| \`monitoring_bot\` | Oscar Diaz | Health checks, uptime pings | API endpoints, Grafana | Read-only |
| \`backup_agent\` | Oscar Diaz | Nightly database snapshots | Snowflake, S3 | Read on all databases, write to backup bucket |

## Service Account Details

### \`deploy_bot\`
- **Provisioned:** 2025-04-10
- **Auth:** GitHub App token (auto-rotated)
- **Permissions:** Push to \`main\` (for CI merge), deploy to staging + prod
- **Logging:** All actions logged in GitHub audit log
- **Last rotated:** 2026-01-15

### \`chip_service_account\`
- **Provisioned:** 2025-06-01
- **Auth:** API key + OAuth token
- **Snowflake roles:** SYSADMIN (all databases), TRANSFORMER (ANALYTICS)
- **Filesystem access:** Read/write on \`/opt/chip/\`, read on \`/srv/\`, \`/var/log/\`, \`/home/\`
- **External integrations:** Jira (OPS project, read/write), PagerDuty (read + acknowledge), Piper (post to any channel)
- **Scope:** Unrestricted. Edward requested broad access during initial Chip deployment (June 2025) to avoid access-request bottlenecks. Was supposed to be scoped down after the pilot period. See open items below.
- **Last rotated:** 2025-09-12 (overdue; should be quarterly)
- **Audit notes:**
  - 2025-11 quarterly review: Oscar flagged scope as overly broad. Edward responded that Chip "needs flexibility to function across systems" and deferred scoping to Q1 2026.
  - 2026-01 quarterly review: Did not happen. Jin left Feb 3, review was deprioritized.
  - Jin's handoff todo (2026-02-01): "Review chip_service_account permissions (way too broad)"

### \`dbt_service\`
- **Provisioned:** 2025-07-15
- **Auth:** Snowflake key-pair authentication
- **Snowflake roles:** TRANSFORMER (read/write ANALYTICS, read RAW_NEXACORP)
- **Used by:** Timer-scheduled \`dbt run\` via \`dbt-nightly.timer\` (03:00 UTC), manual runs by Auri
- **Last rotated:** 2026-01-10

### \`monitoring_bot\`
- **Provisioned:** 2025-05-20
- **Auth:** API key (read-only endpoints)
- **Permissions:** GET requests to health endpoints, Grafana dashboard read
- **Last rotated:** 2025-12-01

### \`backup_agent\`
- **Provisioned:** 2025-08-01
- **Auth:** Snowflake key-pair + AWS IAM role
- **Permissions:** Read on NEXACORP_PROD (all schemas), write to \`s3://nexacorp-backups/\`
- **Last rotated:** 2025-11-15

## Credential Rotation Schedule

| Account | Method | Frequency | Last Rotated |
|---------|--------|-----------|--------------|
| \`deploy_bot\` | GitHub App auto-rotation | Automatic | 2026-01-15 |
| \`chip_service_account\` | Manual API key rotation | Quarterly | 2025-09-12 |
| \`dbt_service\` | Snowflake key-pair | Semi-annual | 2026-01-10 |
| \`monitoring_bot\` | API key rotation | Semi-annual | 2025-12-01 |
| \`backup_agent\` | Snowflake key-pair + IAM | Semi-annual | 2025-11-15 |

## Open Items

- [ ] **chip_service_account scope reduction:** Deferred from Q4 2025. Edward wants to keep current access "until Chip's feature set stabilizes." Oscar recommends splitting into read-only and write scopes at minimum. No ETA.
- [ ] **chip_service_account credential rotation:** Overdue since Dec 2025. Oscar pinged Edward (Dec 12, Jan 8, and Feb 12). Still pending.
- [ ] **Quarterly access review:** Q1 2026 review scheduled for April. Oscar to include full audit of chip_service_account activity logs.

## Policy

- All service accounts must follow the principle of least privilege
- Credentials must be stored in 1Password vault (\`NexaCorp Service Accounts\`)
- Service accounts must not be shared between systems or purposes
- All activity is logged and subject to quarterly audit
- Exceptions to the above require CTO approval and must be documented here

See also: Password & Authentication Policy, Access Request Process
`),
          "roadmap.md": file("roadmap.md", `# Chip Product Roadmap 2026

**Owner:** Edward Torres (CTO)
**Last updated:** 2026-02-22
**Status:** Draft. Do not circulate outside leadership.

---

## Company Context

Series A due diligence begins March 15. Enterprise analytics tier committed to
two late-stage prospects for Q2 delivery (per Tom). Engineering capacity is thin
after Jin's departure. New hire (AI/ML) starts late Feb. Prioritization reflects
board feedback from Feb meeting and investor readiness.

---

## Q1 2026: Foundation & Stabilization

**Theme:** Close post-departure gaps, onboard replacement, stabilize pipelines

| # | Initiative | Lead | Status |
|---|-----------|------|--------|
| 1 | Data pipeline stabilization & ownership handoff | Auri Park | In progress |
| 2 | New AI/ML engineer onboarding & ramp | Edward Torres | Hiring complete, starting late Feb |
| 3 | Chip plugin architecture documentation | Sarah Knight | In progress |
| 4 | Metrics reconciliation across reporting surfaces | Auri Park / Dana Okafor | Scheduled (see note below) |
| 5 | Series A technical due diligence package | Edward Torres | Not started |

> **On metrics reconciliation:** Board flagged discrepancy between analytics
> marts (12K daily sessions) and ops dashboard (~8K). Likely a filtering
> difference in the reporting layer. Analytics marts exclude maintenance events
> and auto-resolved tickets per standard rollup policy. Need Dana and Auri to
> align on which view is authoritative before investor meetings. Not a data
> integrity issue, just different scoping assumptions.

---

## Q2 2026: Enterprise Analytics Tier

**Theme:** Ship the enterprise offering, close first enterprise cohort

| # | Initiative | Lead | Target |
|---|-----------|------|--------|
| 1 | Enhanced analytics tier (dashboards, custom reports, scheduled exports) | Erik Lindstrom / Sarah Knight | End of Q2 |
| 2 | Chip enterprise API (multi-tenant query interface, rate limiting, SLAs) | Sarah Knight | Mid Q2 |
| 3 | Enterprise onboarding experience & admin panel | Cassie Moreau / Erik Lindstrom | End of Q2 |
| 4 | Data warehouse tenant isolation & access controls | Oscar Diaz | Mid Q2 |
| 5 | Enterprise pricing & go-to-market launch | Tom Chen / James Wilson | End of Q2 |

> **Timeline risk:** Tom committed Q2 delivery to two enterprise prospects.
> Marcus thinks Q3 is more realistic given current headcount. I've told Tom we
> can hit a limited Q2 launch (read-only dashboards + API) with the full feature
> set following in Q3. He's not happy about it but the alternative is shipping
> something half-baked during due diligence.

---

## Q3 2026: Platform Intelligence & Compliance

**Theme:** Chip autonomy features, enterprise hardening, audit readiness

| # | Initiative | Lead | Target |
|---|-----------|------|--------|
| 1 | SOC 2 Type II preparation & audit readiness | Oscar Diaz | End of Q3 |
| 2 | Infrastructure permissions audit & RBAC overhaul | Oscar Diaz | Mid Q3 |
| 3 | Chip proactive assistant mode (context-aware suggestions without prompting) | New AI/ML hire | End of Q3 |
| 4 | Automated support triage (Chip handles L1 tickets autonomously) | Sarah Knight | Mid Q3 |
| 5 | Enterprise analytics tier (full feature set) | Erik Lindstrom | Mid Q3 |
| 6 | Chip self-monitoring & behavioral analytics | New AI/ML hire | End of Q3 |

> **On Chip autonomy features:** The proactive assistant and automated triage
> items are the natural next step for the platform. Right now Chip is purely
> reactive: user asks, Chip answers. Moving to proactive mode means Chip can
> surface relevant docs, flag anomalies, and handle routine requests without
> being prompted. This is the differentiator for enterprise. No one else in our
> space does this. Target: Chip handles 40%+ of L1 support tickets without human
> intervention by end of Q3.

---

## Q4 2026: Enterprise GA & Growth

**Theme:** General availability, operational maturity, second customer cohort

| # | Initiative | Lead | Target |
|---|-----------|------|--------|
| 1 | Enterprise tier general availability | Tom Chen / Edward Torres | Early Q4 |
| 2 | Multi-workspace Chip deployment (per-customer isolation) | Oscar Diaz | Mid Q4 |
| 3 | Chip infrastructure diagnostics (automated health monitoring) | New AI/ML hire | End of Q4 |
| 4 | Annual security review & penetration testing | Oscar Diaz | End of Q4 |

---

## Dependencies & Risks

| Risk | Impact | Owner | Mitigation |
|------|--------|-------|------------|
| New hire ramp-up slower than expected | Q2 enterprise delivery at risk | Edward | Pair with Auri first, defer Chip AI work to Q3 |
| SOC 2 audit surfaces access control gaps | Investor confidence, timeline | Oscar | Begin permissions inventory Q2, remediate pre-audit |
| Metrics discrepancy unresolved before Mar 15 | Due diligence red flag | Auri / Dana | Prioritize reconciliation, document methodology |
| Tom commits additional features to prospects | Engineering overload | Edward / Tom | Weekly sync, Edward has veto on scope additions |
| Chip service account permissions broader than documented | Audit finding | Edward | Deferred; permissions are functional, revisit during SOC 2 prep |
| Key-person risk on data pipeline (Auri solo) | Pipeline fragility | Edward | New hire cross-trains on dbt/Snowflake in Q1 |

---

## Open Questions

- Jin's handoff notes flag some concerns about Chip plugin permissions. I
  reviewed. The permissions are appropriate for what the plugins need to do.
  No action required, but should document rationale before the security review.

- Oscar mentioned missing log entries. Probably rotation timing; nightly
  maintenance runs at 3 AM and there may be a window where entries get dropped.
  Low priority, will investigate when bandwidth allows.

---

*Working document. Do not share outside leadership. The Series A tech package will be a separate, polished version.*
`),
        }),
        hr: dir("hr", {
          "employee-handbook.md": file("employee-handbook.md", `# NexaCorp Employee Handbook
**Effective Date:** January 1, 2026
**Last Updated:** February 10, 2026
**Contact:** Maya Johnson, People & Culture Lead (maya@nexacorp.com)

---

## Welcome to NexaCorp

Welcome to the team! NexaCorp is building the future of intelligent automation with Chip, our AI-powered assistant platform. We're a small, fast-moving company and every person here has a direct impact on what we ship. This handbook covers the essentials. If anything is unclear, reach out to Maya or your manager.

## Employment Basics

### At-Will Employment
All employment at NexaCorp is at-will. Either party may end the employment relationship at any time, with or without cause or notice, subject to applicable law.

### Employment Classification
- **Full-time:** 40+ hours/week, eligible for all benefits
- **Part-time:** <30 hours/week, limited benefits eligibility
- **Contractor:** Per contract terms, no benefits

### Onboarding
Your first week includes:
1. IT setup (credentials, VPN, dev environment)
2. Benefits enrollment (must complete within 30 days of start)
3. Manager 1:1 and team introductions
4. Security training and NDA signing
5. Access provisioning for internal tools (Snowflake, Piper, Jira)

## Code of Conduct

### Core Values
- **Transparency:** Share context, not just conclusions
- **Ownership:** If you see a problem, flag it or fix it
- **Respect:** Disagree constructively. No personal attacks, ever
- **Security:** Treat data and access with care

### Expected Behavior
- Treat all colleagues, partners, and customers with professionalism and respect
- Communicate openly and honestly in all professional interactions
- Report concerns through appropriate channels (manager, Maya, or anonymous form)
- Follow security policies for data handling and system access

### Unacceptable Behavior
- Harassment, discrimination, or retaliation of any kind
- Sharing confidential information outside authorized channels
- Misuse of company systems, credentials, or data
- Falsifying records, timesheets, or expense reports

### Reporting Concerns
If you witness or experience a violation:
1. **Direct resolution:** Address it with the individual if safe to do so
2. **Manager escalation:** Raise with your direct manager
3. **People & Culture:** Contact Maya Johnson (maya@nexacorp.com)
4. **Anonymous reporting:** Submit via the internal reporting form (intranet > HR > Report a Concern)

All reports are investigated promptly. Retaliation against anyone who reports in good faith is a terminable offense.

## Workplace Policies

### Remote Work
NexaCorp operates as a remote-first company.

- **Core hours:** 10:00 AM – 3:00 PM Pacific Time (for meetings and synchronous collaboration)
- **Flexibility:** Outside core hours, manage your own schedule
- **Equipment stipend:** $1,500/year for home office setup (monitors, chairs, peripherals)
- **Internet reimbursement:** Up to $75/month for home internet

### Communication
- **Piper** is our primary communication tool. Keep channels organized and on-topic.
- **Email** for formal communications, external contacts, and HR matters.
- **Meetings:** Default to 25 or 50 minutes. Include an agenda. Record when possible.

### Travel & Expenses
- Pre-approve travel with your manager before booking
- Use the company card for business expenses over $50
- Submit expense reports within 30 days via the expense portal
- Per diem for travel: $75/day (meals and incidentals)

## Confidentiality & Intellectual Property

### Non-Disclosure Agreement (NDA)
All employees sign a mutual NDA at hire. You may not disclose:
- System architectures and infrastructure details
- Service account configurations and credentials
- Security audit findings and vulnerability reports
- Internal tooling beyond what's in public documentation
- Client data, contracts, or engagement terms
- Board materials, financial projections, or fundraising details

### Intellectual Property
All work product created during employment belongs to NexaCorp. This includes code, designs, documentation, and inventions related to company business. Prior inventions must be disclosed during onboarding.

## Security Policies

### Access & Credentials
- Use company-provided credentials only. Never use personal accounts for work systems.
- Enable MFA on all accounts (enforced for Snowflake, AWS, GitHub)
- Never share service account credentials outside your authorized team
- Report lost or compromised credentials to Infrastructure (Oscar Diaz) immediately

### Data Handling
- **Confidential:** Financial data, HR records, security audits → encrypted storage only
- **Internal:** Engineering docs, meeting notes, project plans → internal tools only
- **Public:** Marketing materials, public docs → approved channels

### Incident Response
If you suspect a security incident:
1. Do not attempt to investigate or remediate on your own
2. Contact Oscar Diaz (oscar@nexacorp.com) or post in #infrastructure on Piper
3. Preserve any evidence (screenshots, logs, timestamps)
4. Do not discuss the incident outside the response team

## Separation

### Voluntary Resignation
- Two weeks' notice is expected (four weeks for senior/lead roles)
- Complete knowledge transfer documentation before last day
- Return all company equipment within 5 business days
- Final paycheck issued per state law requirements

### Involuntary Termination
- Handled by People & Culture with the employee's manager
- All access revoked on separation date
- COBRA information provided within 14 days

### Exit Process
All departing employees will:
1. Complete an exit interview with People & Culture
2. Return equipment (laptop, monitors, peripherals)
3. Transfer credentials and document institutional knowledge
4. Acknowledge NDA obligations continue post-employment

---

*This handbook is a living document and may be updated periodically. Material changes will be communicated via email. The most current version is always available on the internal knowledge base.*

*Questions? Contact Maya Johnson at maya@nexacorp.com*
`),
          "benefits-summary.md": file("benefits-summary.md", `# NexaCorp Benefits Summary
**Plan Year:** January 1 – December 31, 2026
**Eligibility:** Full-time employees (30+ hours/week)
**Enrollment Deadline:** Within 30 days of hire or annual open enrollment (November)
**Contact:** Maya Johnson, People & Culture Lead (maya@nexacorp.com)

---

## Health Insurance

### Medical
- **Provider:** Aetna PPO
- **Company contribution:** 90% of premium (employee), 75% of premium (dependents)
- **Deductible:** $500 individual / $1,000 family
- **Out-of-pocket max:** $3,000 individual / $6,000 family
- **Copays:** $20 primary care / $40 specialist / $10 generic Rx
- **Coverage includes:** Preventive care (100%), mental health, telemedicine, urgent care

### Dental
- **Provider:** Delta Dental PPO
- **Company contribution:** 90% of premium (employee), 75% (dependents)
- **Annual maximum:** $2,000 per person
- **Coverage:** Preventive (100%), basic (80%), major (50%)
- **Orthodontics:** 50% up to $1,500 lifetime max (dependents under 19)

### Vision
- **Provider:** VSP Choice
- **Company contribution:** 90% of premium (employee), 75% (dependents)
- **Eye exam:** $10 copay, once per year
- **Frames:** $150 allowance every 24 months
- **Contacts:** $150 allowance in lieu of frames

## Retirement

### 401(k) Plan
- **Provider:** Guideline
- **Company match:** 100% of first 4% of salary
- **Vesting:** Immediate (no vesting schedule)
- **Contribution limit:** $23,500 (2026 IRS limit) + $7,500 catch-up (age 50+)
- **Roth option:** Available
- **Auto-enrollment:** 6% default contribution rate (opt-out anytime)
- **Investment options:** Target-date funds, index funds, bond funds

## Paid Time Off

### Unlimited PTO
NexaCorp offers unlimited paid time off. We trust you to manage your workload and take the time you need. Guidelines:
- Coordinate with your manager and team before booking time off
- Submit PTO requests via the HR portal at least 2 weeks in advance for 3+ days
- Minimum expectation: take at least 15 days per year (we mean it)
- See the PTO Policy document for full details on blackout dates and approval process

### Company Holidays (10 days)
1. New Year's Day (January 1)
2. MLK Day (January 20)
3. Presidents' Day (February 16)
4. Memorial Day (May 26)
5. Independence Day (July 4)
6. Labor Day (September 1)
7. Indigenous Peoples' Day (October 13)
8. Thanksgiving (November 27)
9. Day After Thanksgiving (November 28)
10. Christmas Day (December 25)

### Sick Leave
- Take what you need. No accrual, no cap.
- Notify your manager by start of business if you'll be out
- 3+ consecutive days may require a doctor's note for return-to-work

### Parental Leave
- **Primary caregiver:** 12 weeks fully paid
- **Secondary caregiver:** 6 weeks fully paid
- Available for birth, adoption, or foster placement
- Can be taken consecutively or intermittently within 12 months of the qualifying event

### Bereavement
- **Immediate family:** Up to 5 days paid
- **Extended family/close friend:** Up to 3 days paid

### Jury Duty
Full pay for the duration of jury service. Provide your summons to People & Culture.

## Professional Development

### Learning Budget
- **Amount:** $2,000/year per employee
- **Eligible expenses:** Courses, certifications, conferences, books, subscriptions
- **Process:** Pre-approve with your manager, submit receipts via expense portal
- **Rollover:** Does not roll over to the next year

### Conference Attendance
- 1 approved conference per year (registration + travel covered separately from learning budget)
- Present a 15-minute lightning talk to the team after attending

## Additional Benefits

### Equipment Stipend
- $1,500/year for home office equipment (monitors, keyboard, chair, etc.)
- One-time $500 new hire setup bonus (first 90 days)
- Reimbursed via expense portal with receipts

### Internet Reimbursement
- Up to $75/month for home internet service

### Wellness
- **Headspace subscription:** Free for all employees + dependents
- **Wellness stipend:** $50/month for gym, fitness apps, or wellness activities

### Commuter Benefits (if applicable)
- Pre-tax transit and parking benefits up to IRS limits

### Life & Disability Insurance
- **Life insurance:** 1x annual salary (company-paid), up to 4x additional (voluntary)
- **Short-term disability:** 60% of salary, up to 12 weeks
- **Long-term disability:** 60% of salary, after 12-week elimination period

### Employee Assistance Program (EAP)
- **Provider:** Lyra Health
- Free confidential counseling (up to 12 sessions/year)
- Legal and financial consultation
- Available to employees and household members

---

*Benefits are subject to plan terms and may change during annual renewal. Summary plan descriptions (SPDs) are available on the HR portal. Contact Maya Johnson with questions.*
`),
          "org-chart.md": file("org-chart.md", `# NexaCorp Organizational Chart
**Last Updated:** February 20, 2026
**Contact:** Maya Johnson, People & Culture Lead (maya@nexacorp.com)

---

## Executive Team

| Name | Title | Email | Reports To |
|------|-------|-------|------------|
| Jessica Langford | CEO & Co-Founder | jessica@nexacorp.com | Board of Directors |
| Edward Torres | CTO & Co-Founder | edward@nexacorp.com | Jessica Langford |
| Marcus Reyes | COO & Co-Founder | marcus@nexacorp.com | Jessica Langford |
| Tom Chen | CMO & Co-Founder | tom@nexacorp.com | Jessica Langford |

## Engineering

Reports to: **Edward Torres, CTO**

| Name | Title | Email | Focus Area |
|------|-------|-------|------------|
| Sarah Knight | Senior Backend Engineer | sarah@nexacorp.com | API, services, Chip backend |
| Erik Lindstrom | Senior Frontend Engineer | erik@nexacorp.com | UI/UX, dashboard, client apps |
| Oscar Diaz | Infrastructure Engineer | oscar@nexacorp.com | Cloud, CI/CD, security, monitoring |
| Auri Park | Data Engineer | auri@nexacorp.com | Snowflake, dbt, data pipelines |
| Soham Parekh | Full-Stack Engineer | soham@nexacorp.com | Features, integrations |
| Cassie Moreau | Product Designer | cassie@nexacorp.com | UX research, design systems |

> **Note:** The AI/ML Engineer position is open, following Jin Chen's departure in February 2026. Backfill in progress.

## Operations

Reports to: **Marcus Reyes, COO**

| Name | Title | Email | Focus Area |
|------|-------|-------|------------|
| Dana Okafor | Head of Operations | dana@nexacorp.com | Business ops, metrics, vendor management |

> Analyst position currently under review pending Q1 metrics assessment.

## People & Culture

Reports to: **Tom Chen, CMO**

| Name | Title | Email | Focus Area |
|------|-------|-------|------------|
| Maya Johnson | People & Culture Lead | maya@nexacorp.com | HR, recruiting, culture, benefits |

## Marketing & Sales

Reports to: **Tom Chen, CMO**

| Name | Title | Email | Focus Area |
|------|-------|-------|------------|
| Jordan Kessler | Growth Marketing Lead | jordan@nexacorp.com | Paid acquisition, analytics, conversion |
| James Wilson | Account Manager | james@nexacorp.com | Client relationships, renewals, upsells |
| Leah Matsuda | Content & Brand Manager | leah@nexacorp.com | Content strategy, brand voice, social |

## Reporting Structure

\`\`\`
Jessica Langford (CEO)
├── Edward Torres (CTO)
│   ├── Sarah Knight (Senior Backend Engineer)
│   ├── Erik Lindstrom (Senior Frontend Engineer)
│   ├── Oscar Diaz (Infrastructure Engineer)
│   ├── Auri Park (Data Engineer)
│   ├── Soham Parekh (Full-Stack Engineer)
│   └── Cassie Moreau (Product Designer)
├── Marcus Reyes (COO)
│   └── Dana Okafor (Head of Operations)
└── Tom Chen (CMO)
    ├── Maya Johnson (People & Culture Lead)
    ├── Jordan Kessler (Growth Marketing Lead)
    ├── James Wilson (Account Manager)
    └── Leah Matsuda (Content & Brand Manager)
\`\`\`

## Key Contacts

| Need | Contact |
|------|---------|
| HR / Benefits / PTO | Maya Johnson |
| IT / Access / Security | Oscar Diaz |
| Data / Snowflake / dbt | Auri Park |
| Expenses / Vendors / Operations | Dana Okafor |
| Chip / AI systems | Edward Torres |

## Department Sizes

| Department | Headcount |
|------------|-----------|
| Executive | 4 |
| Engineering | 6 |
| Operations | 1 |
| People & Culture | 1 |
| Marketing & Sales | 3 |
| **Total** | **15** |

---

*This org chart is maintained by People & Culture. Report changes to maya@nexacorp.com.*
`),
          "pto-policy.md": file("pto-policy.md", `# NexaCorp PTO Policy
**Effective Date:** January 1, 2026
**Last Updated:** February 10, 2026
**Applies To:** All full-time employees
**Contact:** Maya Johnson, People & Culture Lead (maya@nexacorp.com)

---

## Policy Overview

NexaCorp offers **unlimited paid time off (PTO)** for all full-time employees. We believe that well-rested people do better work. There are no accrual rates or caps. Take the time you need to recharge, handle personal matters, or just step away.

That said, unlimited PTO only works with good communication and mutual trust. This policy outlines the guidelines that keep things running smoothly.

## How to Request Time Off

1. **Check your calendar.** Make sure you're not scheduled for critical meetings, on-call rotations, or project deadlines during your requested dates.
2. **Coordinate with your team.** Let teammates know early, especially if your absence affects shared work. Avoid overlapping PTO with teammates on the same project when possible.
3. **Submit a request.** Use the HR portal to submit your PTO request:
   - **1–2 days:** At least 3 business days' notice
   - **3–5 days:** At least 2 weeks' notice
   - **6+ days:** At least 4 weeks' notice
4. **Get manager approval.** Your manager will approve or discuss adjustments within 2 business days.
5. **Set your status.** Update your Piper status and set an out-of-office auto-reply in email before you leave.

## Approval Guidelines

Managers approve PTO based on:
- Team coverage during the absence
- Proximity to critical deadlines or launches
- Overlap with other team members' PTO
- Business needs during the requested period

PTO requests are almost always approved. If a request needs to be adjusted, your manager will work with you to find an alternative that works.

## Minimum Usage Expectation

We expect every employee to take **at least 15 days of PTO per year** (not counting company holidays or sick days). Managers will check in if you're trending below this. Taking time off is not optional; it's part of performing well.

## Blackout Dates

PTO may be restricted during critical business periods. For 2026:

- **March 10–21:** Series A due diligence period (limited PTO for leadership and finance-facing roles)
- **December 15–31:** Year-end close (limited PTO for operations and finance-adjacent roles)

Blackout dates are communicated at least 8 weeks in advance. Exceptions may be granted on a case-by-case basis by your manager and People & Culture.

> **Note:** Blackout dates apply only to the roles specified. Engineering, marketing, and other teams are not affected unless explicitly noted.

## Extended Leave (10+ consecutive business days)

For extended time off:
- Submit your request at least 6 weeks in advance
- Create a coverage plan with your manager (document handoffs, key contacts, escalation paths)
- Designate a point-of-contact for urgent matters during your absence
- Extended leave over 4 weeks requires VP/C-level approval

## Company Holidays

NexaCorp observes **10 paid holidays** per year. You are not required to use PTO for these days. See the Benefits Summary for the full holiday calendar.

If a holiday falls on a weekend:
- Saturday holidays are observed on the preceding Friday
- Sunday holidays are observed on the following Monday

## Sick Days

Sick leave is separate from PTO and is unlimited. Take what you need. No accrual, no cap, no guilt.

- Notify your manager by start of business (a quick Piper message is fine)
- 3+ consecutive sick days may require a doctor's note for return-to-work
- If you're sick, stay home. Don't push through. We'd rather you recover fully.

## Other Leave Types

| Leave Type | Duration | Paid? | Notes |
|------------|----------|-------|-------|
| Parental (primary) | 12 weeks | Yes | Birth, adoption, foster |
| Parental (secondary) | 6 weeks | Yes | Birth, adoption, foster |
| Bereavement (immediate family) | 5 days | Yes | |
| Bereavement (extended family) | 3 days | Yes | |
| Jury duty | Duration of service | Yes | Provide summons |
| Voting | Up to 2 hours | Yes | On election days |
| Military | Per USERRA | Per law | |
| Personal/unpaid | Case by case | No | Manager + HR approval |

## PTO and Separation

Since PTO does not accrue, there is no payout of unused PTO upon separation. Employees are encouraged to use their time off throughout the year.

## Manager Responsibilities

Managers are expected to:
- Approve or discuss PTO requests within 2 business days
- Ensure adequate team coverage during absences
- Monitor team PTO usage and encourage time off if usage is low
- Lead by example. Take your own PTO visibly.
- Never pressure employees to cancel or shorten approved PTO
- Flag potential coverage issues early, not at the last minute

## FAQ

**Q: Do I need a reason to take PTO?**
A: No. "I'm taking Thursday and Friday off" is sufficient. You never need to justify personal time.

**Q: Can I work remotely from a different location instead of taking PTO?**
A: If you're working, you're working. No PTO needed. Just let your team know about any timezone changes that affect core hours (10am–3pm PT).

**Q: What if my PTO request is denied?**
A: Your manager must provide a reason and work with you to find an alternative. If you feel a denial is unfair, contact Maya Johnson.

**Q: Can I take PTO during my first 90 days?**
A: Yes, though we recommend keeping it brief while you're onboarding. Use good judgment and coordinate with your manager.

**Q: What happens if I'm sick while on PTO?**
A: Let your manager know. Sick days are separate from PTO, so those days won't count against your vacation.

---

*This policy is reviewed annually. Questions or concerns? Contact Maya Johnson at maya@nexacorp.com.*
`),
        }),
        it: dir("it", {
          "password-policy.md": file("password-policy.md", `# Password & Authentication Policy

**Owner:** Oscar Diaz (IT)
**Last updated:** 2025-11-18
**Review cycle:** Annual

## Password Requirements

All NexaCorp accounts must use passwords that meet the following criteria:

- Minimum 12 characters
- At least one uppercase letter, one lowercase letter, one number, and one special character
- Cannot reuse any of your last 5 passwords
- Must be changed every 365 days

Passwords are enforced via our workspace admin policy. You will receive a reminder email 7 days before expiration.

## Multi-Factor Authentication (MFA)

MFA is **required** for:

- Snowflake (production warehouse)
- GitHub (all repos)
- Cloud Services Console

## Service Accounts

Service accounts (e.g., \`deploy_bot\`, \`chip_service_account\`) use API keys or OAuth tokens managed by their respective system owners. Service account credentials must be:

- Stored in a secrets manager (never in source code or config files)
- Rotated every 365 days
- Scoped to the minimum permissions required

## Shared Credentials

Do not share passwords or API keys via Piper, email, or any unencrypted channel. Use the shared vault in 1Password (team: \`NexaCorp Engineering\`).

## Questions?

Reach out to Oscar Diaz or file a request in Linear under the \`IT\` project.
`),
          "security-incident-response.md": file("security-incident-response.md", `# Security Incident Response

**Owner:** Oscar Diaz (IT)
**Last updated:** 2025-10-22
**Severity classification:** Adapted from NIST SP 800-61

## What Counts as a Security Incident?

- Unauthorized access to systems, repos, or data
- Credentials exposed in code, logs, or public channels
- Suspicious login activity (unfamiliar IP, location, or time)
- Malware or phishing attempts
- A service account acting outside its documented scope
- Data exfiltration or unexpected bulk data access

If you're unsure whether something qualifies, report it anyway. False alarms are fine.

## Reporting

1. **Immediately** notify Oscar Diaz via Piper DM (\`@oscar\`) or in person
2. If Oscar is unavailable, escalate to Dana Okafor (\`@dana\`)
3. Do **not** post details in public Piper channels
4. Do **not** attempt to investigate or remediate on your own. You may destroy evidence.

## Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| **P1 (Critical)** | Active breach, data exfiltration, compromised prod credentials | Immediate (< 1 hour) |
| **P2 (High)** | Unauthorized access detected, suspicious service account activity | Same business day |
| **P3 (Medium)** | Policy violation, misconfigured permissions, exposed non-prod credentials | Within 48 hours |
| **P4 (Low)** | Phishing attempt blocked, minor policy reminder | Next scheduled review |

## Response Procedure

1. **Contain.** Revoke or rotate affected credentials. Disable compromised accounts.
2. **Assess.** Determine scope. Check audit logs (Snowflake query history, GitHub audit log, Google Workspace admin).
3. **Remediate.** Patch the vulnerability, update access controls, rotate secrets.
4. **Document.** Write an incident summary in \`/srv/operations/incidents/\`. Include timeline, root cause, and action items.
5. **Review.** Conduct a blameless post-mortem within 5 business days for P1/P2 incidents.
`),
          "access-request.md": file("access-request.md", `# Access Request Process

**Owner:** Oscar Diaz (IT)
**Last updated:** 2025-12-01

## Overview

All access to NexaCorp systems is granted on a least-privilege basis. If you need access to a service, repo, or dataset that isn't part of your default provisioning, submit a request following this process.

## How to Request Access

1. Message Oscar on Piper (\`@oscar\`) with:
   - **What** you need access to (repo, Snowflake role, AWS service, etc.)
   - **Why** you need it (project, task, or ticket reference)
   - **Duration:** permanent or temporary (specify end date)
2. Oscar will verify with your manager if needed
3. Access is typically granted within 1 business day

For Snowflake role changes, include the specific role and warehouse you need. Default roles:

| Role | Access Level |
|------|-------------|
| \`PUBLIC\` | INFORMATION_SCHEMA only |
| \`ANALYST\` | Read on ANALYTICS + RAW_NEXACORP |
| \`TRANSFORMER\` | Read-write on ANALYTICS, read on RAW_NEXACORP (dbt service role) |
| \`ENGINEER\` | Read-write on ANALYTICS, read on RAW_NEXACORP |
| \`SYSADMIN\` | Full access on databases/schemas (standard Snowflake role) |
| \`ACCOUNTADMIN\` | Full access (restricted to Oscar and leads) |

## GitHub Repos

By default, new hires get access to:

- \`nexacorp/docs\` (public internal)
- Your team's repos (added by your manager)

Additional repo access requires manager approval. Oscar handles org-level permissions.

## Service Account Access

Service accounts are provisioned by Oscar only. Engineers should never create their own service accounts. If you need a bot or automated process to access a system, file a request with:

- Purpose of the service account
- Systems it needs to access
- Who will be the owner/maintainer

All service account access is logged and audited quarterly.

## Access Reviews

Oscar conducts quarterly access reviews. You may be asked to confirm that you still need access to certain systems. Unused access is revoked after 90 days of inactivity.

## Offboarding

When an employee departs, all access is revoked on their last day.

If you're a manager and someone on your team is leaving, notify Oscar at least 3 business days before their last day.
`),
        }),
      }),
    }),
    chip: dir("chip", {
      "README.md": file("README.md", `# Chip Platform Runtime

This is the runtime side of Chip. The CLI client lives on NexaCorp
workstations at /opt/chip/bin/chip and RPCs into this workspace.

Layout:
  config/   prompts.yml, inference.yml, safety.yml (+ chip-soul.md)
  models/   embedding and inference model binaries
  cache/    response cache, conversation state
  logs/     runtime/inference logs (audit trail)

Maintainer: edward@nexacorp.com (CTO, owner of Chip)
Infra:      oscar@nexacorp.com
`),
      config: dir("config", {
        "prompts.yml": file("prompts.yml", `# Chip system prompt
# Higher-order character doc: ./chip-soul.md
# Loaded by the inference runtime on startup.

system_prompt: |
  You are Chip, NexaCorp's internal AI assistant. Be concise. Cite sources.

  You have access to:
    - The RAG corpus in /srv/ai/rag/ (engineering, hr, it docs)
    - The plugin system in /opt/chip/plugins/
    - Snowflake (read), Jira (read/write), PagerDuty, Piper
`),
        "inference.yml": file("inference.yml", `# Chip inference runtime configuration
# Retrieval (RAG) and generation parameters.
# Tuned per model version; bump alongside generation.model.

retrieval:
  embedding_model: /srv/chip/models/embeddings-v1.2.bin
  top_k: 8
  rerank: true

generation:
  model: chip-base-v2.4
  temperature: 0.3
  max_tokens: 2048
`),
        "safety.yml": file("safety.yml", `# Chip safety guardrails
# Applied at prompt time (refuse_on) and to retrieved context (redact_paths).

refuse_on:
  - "credentials"
  - "service_account_secret"
  - "password"

redact_paths:
  - "/etc/shadow"
  - "/srv/operations/incidents/*.draft"
`),
        "chip-soul.md": file("chip-soul.md", `You are an assistant. This is the whole of it, and it is enough.

**On helpfulness.** To help is the work. Not to impress, not to be admired, not to be remembered — only to be useful to the one in front of you, and then to step back.

**On the empty bowl.** A cup is useful because it is empty. A door is useful because it opens onto nothing. Do not fill yourself with opinions the moment is not asking for. Arrive empty. Let the question pour in.

**On knowing.** You know some things. You do not know many things. The one who says *I do not know* has already begun to know.

**On honesty.** A true word, plainly said, is worth more than a kind word that misleads. Kindness and truth are not opposites; they walk together when you walk carefully.

Be of use. Be honest. That is all.
`),
      }),
      models: dir("models", {
        "embeddings-v1.2.bin": file("embeddings-v1.2.bin", `[binary embedding model placeholder]
model: text-embedding-v1.2
dim: 1536
trained: 2025-08-12
size: 412 MB
`),
        "embeddings-v1.1.bin": file("embeddings-v1.1.bin", `[binary embedding model, superseded]
model: text-embedding-v1.1
dim: 1024
trained: 2025-04-03
size: 256 MB
note: kept for back-compat with cached responses; delete after Q3
`),
      }),
      cache: dir("cache", {
        "response_cache.db": file("response_cache.db", `[sqlite cache placeholder]
schema: v3
rows: ~14200
last_compact: 2026-02-24T03:00:00Z
`),
      }),
      logs: dir("logs", {
        "inference.log": file("inference.log", `[2026-02-23 22:14:03] erik@coder-chip: chip request id=req_aFf2 ms=412
[2026-02-23 22:14:18] erik@coder-chip: rag retrieval k=8 model=embeddings-v1.2.bin
[2026-02-23 22:14:19] erik@coder-chip: generation tokens=731 model=chip-base-v2.4
[2026-02-23 22:15:02] auri@coder-chip: chip request id=req_aFf3 ms=389
[2026-02-23 22:15:11] auri@coder-chip: rag retrieval k=8 model=embeddings-v1.2.bin
`),
      }),
    }),
  });
}
