import { DirectoryNode, FileNode } from "@tt/core/filesystem/types";
import { PLAYER } from "../../../state/types";
import { file, dir } from "@tt/core/filesystem/builders";

export function buildDesktopFiles(): Record<string, DirectoryNode | FileNode> {
  return {
    Desktop: dir("Desktop", {
      "job_search_notes.txt": file("job_search_notes.txt", `JOB SEARCH TRACKER
==================
Last updated: 2026-02-20

Status: Month 2. Getting desperate.

Applied: 47 (most via auto_apply.py, see ~/scripts/)
Responses: 8
Interviews: 3
Offers: 0

The market is brutal. Everyone wants "AI experience" but nobody wants
to pay for it. Half the job postings are for prompt engineers. The other
half want 10 years of experience with tools that are 2 years old.

Companies that ghosted me:
  - Meridian AI (applied 3 weeks ago, nothing)
  - DataSynth Corp (rejected: "looking for more senior candidates")
  - OpenLoop Systems (phone screen went well, then silence)

Still in the pipeline:
  - NexaCorp: interview went okay? Edward (the manager) seems nice
    but I couldn't tell what they actually DO. Their website says
    "AI-integrated enterprise solutions" which means nothing. Small
    team though, might be interesting.
  - CortexLab: just applied, long shot

I should check my Glassdoor scrape data for NexaCorp.
Actually, I know I scraped some reviews... ~/scripts/data/

Companies to AVOID:
  - Synthetica Labs: MALWARE in their take-home test. Cryptominer +
    cookie exfiltration hidden in a pip package. Had to wipe my entire
    machine. Reported to Indeed.

Note to self: stop doom-scrolling LinkedIn at 2am.
`),
    }),
    Documents: dir("Documents", {
      "cover_letter_nexacorp.txt": file("cover_letter_nexacorp.txt", `Dear Hiring Manager,

I'm writing to express my interest in the AI Engineer position at
NexaCorp. With five years of experience building production ML systems,
I believe I can bridge the gap between AI capabilities and practical
business needs.

At Prometheus Analytics, I built and maintained ML pipelines serving
2M+ daily predictions. I led our migration to Ray + MLflow, reducing
serving latency by 40%. I understand what it takes to keep AI systems
running reliably in production: not just building models, but
monitoring, debugging, and iterating on them.

What draws me to NexaCorp is the opportunity to work directly with an
AI system (Chip) that's already deployed and generating value. I'm
excited to help expand its capabilities and ensure it's operating at
its best.

I'm particularly interested in:
  - Understanding Chip's current architecture and integration points
  - Improving reliability and performance of AI-driven workflows
  - Building trust between AI systems and the teams that rely on them

I'd love to discuss how my experience aligns with where NexaCorp is
heading. I'm available for an interview at your convenience.

Best regards,
${PLAYER.displayName}
`),
      "reinstall_notes.txt": file("reinstall_notes.txt", `REINSTALL NOTES, 2026-02-10
=============================

What happened:
  Synthetica Labs sent a take-home coding challenge. The project had a
  custom pip package ("synthetica-eval") that installed cleanly but
  contained a cryptominer in setup.py's post-install hook. It also
  exfiltrated browser cookies (session tokens, saved logins) via a
  background POST to an external endpoint.

  By the time I noticed (CPU pegged at 100%, fans screaming), it had
  been running for ~4 hours. Browser sessions were compromised.

  Decision: full wipe. Didn't trust anything on the drive.

Recovery checklist:
  [x] Fresh Ubuntu 24.04 LTS install
  [x] Basic packages (build-essential, git, curl, python3, pip)
  [x] SSH keys regenerated (ed25519)
  [x] Cloned dotfiles repo, restored .zshrc and .nanorc
  [x] Reinstalled job search scripts (auto_apply, scraper)
  [x] Recreated scripts/data/ from memory + Indeed history
  [x] Set up backup script (~/scripts/backup.sh). NEVER AGAIN
  [x] Changed passwords on GitHub, AWS, Google, email
  [ ] Re-download ML papers collection (had ~30 PDFs)
  [ ] Restore old project repos from GitHub
  [ ] Find photos backup (some were only local...)

What I lost:
  - ML papers collection (~30 PDFs, some with annotations)
  - Old project code not on GitHub (drift-detector-v1, some Kaggle stuff)
  - Browser bookmarks (partially recovered from Google sync)
  - Photos from Portland hikes (only had local copies of some)
  - Customized vim config I spent 2 days on (should have used nano)

Lessons learned:
  1. ALWAYS run untrusted code in a VM or container
  2. Actually do backups (not just "I should set up backups")
  3. Don't pip install random packages without reading setup.py
  4. Keep dotfiles in a git repo (this saved me hours)
  5. Browser session tokens are a goldmine for attackers

What it accessed (based on .heartbeat config + pipe targets):
  - Firefox session tokens (GitHub, Google, AWS console)
  - Active process list every 5 min via heartbeat
  - Browser sessions (open tabs, session timing)
  - SSH keys found on the system
  - Cron job listings

What I still don't know:
  - Did it copy actual files? Bash history? SSH private keys?
  - How long was it running before I noticed the CPU spike?
    (Installed around 11pm, noticed around 3am, but was it
    active immediately or did it wait?)
  - Were there other data collectors besides the pipe and heartbeat?
  - Who's on the other end of that endpoint?
`),
      "cover_letter_template.txt": file("cover_letter_template.txt", `COVER LETTER TEMPLATE
=====================

Dear [Hiring Manager / Team],

I'm writing to apply for the [ROLE] position at [COMPANY].

[PARAGRAPH 1: Hook. Why this company/role]

[PARAGRAPH 2: Relevant experience. 2-3 concrete examples]

[PARAGRAPH 3: What I'd bring. Specific to their needs]

I'd love to discuss how my background aligns with your team's goals.

Best,
[Name]

---
NOTES:
- Keep under 1 page
- Mirror their language from the job posting
- Don't just repeat the resume
- Show you researched the company
`),
      portfolio: dir("portfolio", {
        "projects.txt": file("projects.txt", `PORTFOLIO: Selected Projects
==============================

1. Drift Detector (Prometheus Analytics)
   ─────────────────────────────────────
   Real-time ML model monitoring system. Detects data drift, concept
   drift, and performance degradation. Alerts on-call engineers before
   metrics hit SLA thresholds.
   Tech: Python, Kafka, Prometheus, Grafana

2. DocSort (DataWorks Inc.)
   ─────────────────────────────────────
   Document classification pipeline processing 50K+ docs/day. Custom
   fine-tuned BERT model, 93% accuracy. Reduced manual review queue
   by 70%.
   Tech: PyTorch, Hugging Face, Airflow, S3

3. auto_apply.py (personal)
   ─────────────────────────────────────
   Job application automation script. Scrapes job boards, matches
   against my resume keywords, auto-fills applications. Ethical?
   Debatable. Effective? Absolutely.
   Tech: Python, Selenium, BeautifulSoup
   See: ~/scripts/auto_apply.py

4. glassdoor_scraper (personal)
   ─────────────────────────────────────
   Scrapes Glassdoor company ratings and reviews for companies I'm
   applying to. Saves structured data for comparison.
   Tech: Python, requests, json
   See: ~/scripts/scrape_glassdoor.py
`),
      }),
    }),
    Pictures: dir("Pictures", {
      "README.txt": file("README.txt", `Most photos backed up to Google Photos.
Lost some Portland hiking pics after the wipe; they were only local.
Lesson learned: cloud sync everything.
`),
    }),
    "bookmarks.txt": file("bookmarks.txt", `BOOKMARKS
=========

Jobs:
  - glassdoor.com (see ~/scripts/scrape_glassdoor.py)
  - indeed.com/jobs?q=ML+engineer
  - linkedin.com/jobs
  - levels.fyi/jobs

Papers:
  - arxiv.org/abs/2505.07773  (AlphaEvolve, DeepMind coding agent)
  - arxiv.org/abs/2503.03659  (Kimi K2.5, visual agentic AI)
  - arxiv.org/abs/2504.12345  (TermiGen, terminal agent synthesis)
  - arxiv.org/abs/2506.01234  (ERNIE 5.0, Baidu multimodal)

Learning:
  - huggingface.co/docs
  - pytorch.org/tutorials

Other:
  - reddit.com/r/cscareerquestions
  - news.ycombinator.com
  - github.com/
  - wandb.ai
  - mlflow.org
`),
  };
}
