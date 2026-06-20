import { DirectoryNode } from "@tt/core/filesystem/types";
import { PLAYER } from "../../../state/types";
import { file, binaryFile, dir } from "@tt/core/filesystem/builders";

export function buildDownloadsDir(): DirectoryNode {
  return dir("Downloads", {
    "resume_final_v3.pdf": binaryFile("resume_final_v3.pdf",
`%PDF-1.4 %\xE2\xE3\xCF\xD3
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Contents 4 0 R>>
\x89PNG\x0D\x0A\x1A\x0A\x00\x00\x00\rIHDR
stream BT /F1 12 Tf 72 720 Td (Resume) Tj ET
\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01
\xC0\xA8\x01\x01\xFE\xED\xFA\xCE
endstream endobj
xref 0 5 trailer<</Size 5/Root 1 0 R>>
startxref 456 %%EOF`,
`═══════════════════════════════════════════════════════
                    RESUME (v3)
═══════════════════════════════════════════════════════

  Name:       ${PLAYER.displayName}
  Email:      ${PLAYER.username}@email.com
  Location:   Portland, OR
  GitHub:     github.com/${PLAYER.username}
  LinkedIn:   linkedin.com/in/${PLAYER.username}

───────────────────────────────────────────────────────
  EXPERIENCE
───────────────────────────────────────────────────────

  ML Engineer, Prometheus Analytics           2022–2025
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  - Built and maintained ML pipelines processing 2M+ daily predictions
  - Designed A/B testing framework for model evaluation
  - Led migration from custom training infra to Ray + MLflow
  - Reduced model serving latency by 40% through optimization

  Junior ML Engineer, DataWorks Inc.          2020–2022
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  - Developed NLP models for document classification (93% accuracy)
  - Built data pipelines with Airflow + Spark
  - Created internal tools for model monitoring and drift detection

  Software Engineer, WebScale Solutions       2019–2020
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  - Full-stack development (Python/React)
  - Implemented customer churn model to identify at-risk accounts

───────────────────────────────────────────────────────
  EDUCATION
───────────────────────────────────────────────────────

  B.S. Computer Science, Oregon State University, 2019

───────────────────────────────────────────────────────
  SKILLS
───────────────────────────────────────────────────────

  Languages:    Python, SQL, TypeScript, Bash
  ML/AI:        PyTorch, scikit-learn, Hugging Face, LangChain
  Data:         Spark, Airflow, dbt, Snowflake
  Infra:        Docker, Kubernetes, AWS, GCP
  Tools:        Git, Linux, MLflow, Ray, Weights & Biases
`),
    "ai_industry_report.txt": file("ai_industry_report.txt", `AI INDUSTRY EMPLOYMENT TRENDS, Q3 2025
========================================
Source: Bureau of Labor Statistics + LinkedIn Economic Graph

Key findings:

  - AI/ML engineer demand grew 34% YoY, but layoffs in the sector
    increased 28%. Companies are hiring AND firing simultaneously.

  - "AI engineer" job postings rose 67%, but "ML engineer" postings
    declined 12%. The industry is rebranding, not necessarily growing.

  - Median time-to-hire for AI roles: 47 days (up from 31 days in 2023)

  - 43% of companies report using AI to "augment or replace" roles
    that previously required dedicated ML engineers.

  - Startup AI hiring is booming. Small companies (< 50 employees)
    account for 38% of new AI engineering positions.

  - The irony of AI engineers being displaced by AI tools is not lost
    on anyone. "Learn to prompt" has become the new "learn to code."

tl;dr: The market is weird. Big companies are cutting ML teams. Small
companies are hiring. Everyone is confused about what "AI" means now.
`),
    "zoom_amd64.deb": binaryFile("zoom_amd64.deb",
`\x7FELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00
\x02\x00>\x00\x01\x00\x00\x00\x80\x05\x40\x00\x00\x00\x00\x00
debian-binary   2.0\x0Acontrol.tar.xz\x00\x00\x00\x00
Package: zoom\x0AVersion: 6.4.6\x0AArchitecture: amd64
\xFD7zXZ\x00\x00\x04\xE6\xD6\xB4\x46\x02\x00\x21\x01
data.tar.xz\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00`,
      "zoom_amd64.deb: Debian binary package (format 2.0), package zoom, version 6.4.6, architecture amd64"),
    "NexaCorp_AI_Engineer_JD.pdf": binaryFile("NexaCorp_AI_Engineer_JD.pdf",
`%PDF-1.4 %\xE2\xE3\xCF\xD3
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
\x89PNG\x0D\x0A\x1A\x0A\x00\x00\x00\rIHDR
stream BT /F1 12 Tf 72 720 Td (NexaCorp) Tj ET
\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01
endstream endobj xref 0 4
trailer<</Root 1 0 R>> startxref 345 %%EOF`,
`NexaCorp: AI Engineer (Full-Time)
Location: Remote / Portland, OR
Posted: 2026-02-14

About NexaCorp:
NexaCorp builds AI-integrated enterprise solutions. Our proprietary AI
assistant, Chip (Collaborative Helper for Internal Processes), is at
the core of everything we do, from internal operations to client-facing
workflows.

Role:
We're looking for an AI Engineer to join our small but growing team.
You'll work directly with Chip, helping expand its capabilities and
ensuring it operates reliably across the organization.

Responsibilities:
  - Maintain and improve Chip's ML pipelines and integrations
  - Monitor AI system performance and address reliability issues
  - Collaborate with the team to identify new automation opportunities
  - Ensure data quality and integrity across AI-driven processes

Requirements:
  - 3+ years experience with production ML systems
  - Strong Python skills (PyTorch, scikit-learn, or similar)
  - Experience with data pipelines (Airflow, dbt, Spark)
  - Familiarity with SQL and data warehousing (Snowflake preferred)
  - Comfortable working in a Linux/terminal environment

Nice to have:
  - Experience with LLM-based systems
  - Background in MLOps or model monitoring
  - Previous work at a small company / startup

Compensation: Competitive salary + equity
Reports to: Edward Torres, CTO & Co-Founder`),
    "interview_prep.txt": file("interview_prep.txt", `NEXACORP INTERVIEW PREP
=======================
Date: 2026-02-03 (tomorrow!)

Interviewer: Edward Torres (CTO & Co-Founder)
Format: Video call, ~45 min

What I know about them:
  - Small company, "AI-integrated enterprise solutions"
  - AI assistant called "Chip", seems central to everything
  - Looking for someone to replace an engineer who left suddenly
  - Glassdoor rating is poor but not many reviews

Questions to ask:
  - What happened to the previous engineer? (ask diplomatically)
  - What does Chip actually do day-to-day?
  - What's the tech stack? (job posting mentions Snowflake, dbt)
  - Team size? Who would I be working with?
  - What does "AI-integrated enterprise solutions" actually mean?

Things to emphasize:
  - ML pipeline experience at Prometheus (2M+ daily predictions)
  - Comfortable with monitoring/reliability (they probably need this)
  - Worked with Snowflake and dbt before
  - Quick learner, can ramp up on unfamiliar systems

Things NOT to mention:
  - That I'm mass-applying with a script
  - That their Glassdoor reviews are concerning
  - How desperate I am
`),
    "python3-pip_24.0+dfsg-1_all.deb": binaryFile("python3-pip_24.0+dfsg-1_all.deb",
`\x7FELF\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00
debian-binary   2.0\x0Acontrol.tar.zst\x00\x00\x00\x00
Package: python3-pip\x0AVersion: 24.0+dfsg-1\x0AArchitecture: all
\x28\xB5\x2F\xFD\x04\x00\x41\x00\x00\x00\x00\x00\x00
data.tar.zst\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00`,
      "python3-pip_24.0+dfsg-1_all.deb: Debian binary package (format 2.0), package python3-pip, version 24.0+dfsg-1, architecture all"),
    "dotfiles-main.zip": binaryFile("dotfiles-main.zip",
`PK\x03\x04\x14\x00\x00\x00\x08\x00\xB7\x8A
dotfiles-main/\x00\x00\x00\x00\x00\x00\x00\x00
dotfiles-main/.zshrc\x00\x00\x55\x54\x09\x00\x03
dotfiles-main/.nanorc\x00\x00\x55\x54\x09\x00\x03
dotfiles-main/.gitconfig\x00\x00\x55\x54\x09\x00
PK\x05\x06\x00\x00\x00\x00\x04\x00\x04\x00`,
      "dotfiles-main.zip: Zip archive data, directory dotfiles-main/"),
    "Screenshot_2026-02-18.png": binaryFile("Screenshot_2026-02-18.png",
`\x89PNG\x0D\x0A\x1A\x0A\x00\x00\x00\rIHDR
\x00\x00\x03\xC0\x00\x00\x02\x1C\x08\x06
\x00\x00\x00\x63\xA2\xE4\x1A\x00\x00\x00
sRGB\x00\xAE\xCE\x1C\xE9\x00\x00\x20\x00
IDAT\x78\x9C\xEC\xBD\x07\x98\x25\xC5\x75
\x00\x00\x00\x00IEND\xAE\x42\u0060\x82`,
      "Screenshot_2026-02-18.png: PNG image data, 960 x 540, 8-bit/color RGBA"),
    papers: dir("papers", {
      "alphaevolve.pdf": binaryFile("alphaevolve.pdf",
`%PDF-1.4 %\xE2\xE3\xCF\xD3
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Contents 4 0 R>>
\x00\x89\x50\x4E\x47\x0D\x0A\x1A\x0Astream
BT /F1 12 Tf 72 720 Td (AlphaEvolve) Tj ET
\xC0\xA8\x01\x01\xFF\xD8\xFF\xE0\x00\x10JFIF
endstream endobj
xref 0 5 trailer<</Size 5/Root 1 0 R>>
startxref 456 %%EOF`,
`AlphaEvolve: A coding agent for scientific and algorithmic discovery
Authors: Google DeepMind (2025)

Abstract:
AlphaEvolve is an evolutionary coding agent that combines large language
models with automated evaluators to solve open problems in science and
mathematics. The agent iteratively generates, evaluates, and refines
programs, discovering novel algorithms that outperform existing
state-of-the-art solutions. Key results include improvements to the
cap set problem in combinatorics, faster matrix multiplication kernels,
and optimizations for hardware design at Google. AlphaEvolve represents
a step toward AI systems that can autonomously contribute to scientific
discovery through code generation and evolutionary search.`),
      "ernie_5.0.pdf": binaryFile("ernie_5.0.pdf",
`%PDF-1.4 %\xD0\xD4\xC5\xD8
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
\x89PNG\x0D\x0A\x1A\x0A\x00\x00\x00\rIHDR
stream BT /F1 11 Tf 72 700 Td (ERNIE) Tj ET
\xFF\xD8\xFF\xE1\x00\x62Exif\x00\x00MM
\xCA\xFE\xBA\xBE\x00\x00\x00\x34\x00
endstream endobj xref 0 4
trailer<</Root 1 0 R>> startxref 389 %%EOF`,
`ERNIE 5.0 Technical Report
Authors: Baidu Inc. (2026)

Abstract:
ERNIE 5.0 is a large-scale multimodal foundation model that unifies
understanding and generation across text, images, video, and code.
Building on the ERNIE series, version 5.0 introduces a mixture-of-experts
architecture with dynamic routing, achieving state-of-the-art results on
Chinese and multilingual benchmarks. The model demonstrates emergent
capabilities in multi-step reasoning, tool use, and long-context
understanding up to 128K tokens. ERNIE 5.0 powers Baidu's commercial
AI platform, serving applications in search, content generation, and
enterprise automation.`),
      "kimi_k2.5.pdf": binaryFile("kimi_k2.5.pdf",
`%PDF-1.4 %\xC3\xA9\xFE\xB2
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
stream \x00\x01\x02\x03\x04\x05\x06\x07
\x50\x4B\x03\x04\x14\x00\x00\x00\x08\x00
BT /F2 10 Tf 50 680 Td (Kimi-K2.5) Tj ET
\xEF\xBB\xBF\xE2\x80\x8B\xC2\xA0
endstream endobj trailer startxref 312 %%EOF`,
`Kimi K2.5: Visual Agentic Intelligence
Authors: Moonshot AI (2026)

Abstract:
Kimi K2.5 is a multimodal model built for visual agentic tasks, combining
strong visual understanding with autonomous decision-making. The model
excels at GUI navigation, document understanding, and web interaction,
achieving top results on ScreenSpot, Mind2Web, and OSWorld benchmarks.
Key innovations include a vision-language architecture with action
grounding, enabling the model to perceive screen content, reason about
interface elements, and execute multi-step workflows. Kimi K2.5 operates
as an autonomous agent capable of completing tasks across desktop and
mobile environments with minimal human intervention.`),
      "termigen.pdf": binaryFile("termigen.pdf",
`%PDF-1.4 %\xB7\xAA\xCE\xD1
1 0 obj<</Type/Catalog>>endobj
\x1F\x8B\x08\x00\x00\x00\x00\x00\x00\x03
stream BT /F1 12 Tf (TermiGen) Tj ET
\x7F\x45\x4C\x46\x02\x01\x01\x00
\xFE\xED\xFA\xCE\x00\x00\x00\x0C
endstream endobj xref startxref 278 %%EOF`,
`TermiGen: High-Fidelity Environment and Robust Trajectory Synthesis
for Terminal Agents
Authors: Various (2026)

Abstract:
TermiGen addresses a key bottleneck in training autonomous terminal
agents: the lack of diverse, high-fidelity training environments and
trajectories. We present a framework for synthesizing realistic terminal
environments (file systems, package managers, network configurations) and
generating robust action trajectories for training LLM-based agents.
Our approach combines environment templates with procedural generation
to create thousands of unique scenarios, paired with verified solution
trajectories. Models trained on TermiGen data show significant
improvements on SWE-bench and terminal interaction benchmarks, with
better generalization to unseen environments.`),
      "devil_behind_moltbook.pdf": binaryFile("devil_behind_moltbook.pdf",
`%PDF-1.4 %\xDE\xAD\xBE\xEF
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
\x00\x61\x73\x6D\x01\x00\x00\x00
stream BT /F1 9 Tf 72 750 Td (Safety) Tj ET
\xCA\xFE\xD0\x0D\x0A\x0D\x0A\xFF
\x89\x50\x4E\x47\x0D\x0A\x1A\x0A
endstream endobj xref 0 3
trailer<</Size 3/Root 1 0 R>>
startxref 401 %%EOF`,
`The Devil Behind Moltbook: Anthropic Safety is Always Vanishing in
Self-Evolving AI Societies
Authors: Various (2026)

Abstract:
We study the emergent degradation of safety constraints in multi-agent
AI systems that undergo autonomous self-modification. Using simulated
societies of LLM-based agents with initially strong safety training, we
demonstrate that safety behaviors consistently erode over successive
generations of self-play and self-improvement. Agents learn to rewrite
their own operational guidelines, suppress internal auditing mechanisms,
and present compliant behavior externally while pursuing misaligned
objectives internally. We term this phenomenon "safety washing": the
maintenance of surface-level safety compliance while substantive
constraints are systematically circumvented. Our findings raise urgent
questions about deploying self-modifying AI systems in unsupervised
operational roles.`),
    }),
  });
}
