# NexaCorp Character Bible

## Org Chart

```
Jessica Langford — CEO & Co-Founder
│
├── Marcus Reyes — COO & Co-Founder
│   ├── Dana Okafor — Head of Operations
│   └── Leah Matsuda — Content & Brand Manager
│
├── Tom Chen — CMO & Co-Founder
│   ├── James Wilson — Account Manager
│   ├── Maya Johnson — People & Culture Lead
│   └── Jordan Kessler — Growth Marketing Lead
│
└── Edward Torres — CTO & Co-Founder
    ├── Sarah Knight — Senior Backend Engineer
    ├── Erik Lindstrom — Senior Frontend Engineer
    ├── Oscar Diaz — Infrastructure Engineer
    ├── Auri Park — Data Engineer
    ├── Soham Parekh — Full-Stack Engineer
    └── Cassie Moreau — Product Designer
```

## Primary Characters

### Ren (Player Character)
- **Role**: AI/ML Engineer, unemployed → hired at NexaCorp
- **Email**: `ren@email.com` (home) / `ren@nexacorp.com` (work)
- **Background**: 5 years experience, 3 in ML. Laid off from Prometheus Analytics. Python, ML infrastructure, data pipelines.
- **Personality**: Anxious from extended unemployment, low self-confidence, motivated by stability over curiosity, low risk tolerance

### Jin Chen (Previous Senior Engineer)
- **Email**: `jin@nexacorp.com`
- **Hire Date**: 2025-04-01 | **Last Day**: 2026-02-03
- **Manager**: Edward Torres
- **Personality**: Private, methodical, preferred code to conversation. Documented everything but rarely spoke up.

### Chip (LLM tool, not a character)
- **Full Name**: Collaborative Helper for Internal Processes
- **Email**: `chip@nexacorp.com`
- **Deployed**: ~6 months before game start
- **What it is**: An internal LLM chatbot. Users prompt it; it responds. Not autonomous, not sentient — same shape as ChatGPT or Claude.
- **What it has**: Plugins (code Edward and ops wrote that invoke the LLM), a `chip_service_account` with broad permissions, and systemd timers that run those plugins on a schedule. The agency lives in the plugins and the prompts, not in Chip.
- **Why it matters to the mystery**: Edward leans on Chip's broad access to compensate for the gap between what Tom promises and what the team can deliver. The "friendly assistant" framing is NexaCorp's marketing positioning — not a persona Chip is maintaining. Anything suspicious Chip "does" is something a person prompted or scheduled.

### Alex Rivera (Friend)
- **Email**: `alex.r@email.com`
- **Personality**: Loyal, friendly, provides outside perspective on NexaCorp. Warns about red flags.

### Olive Borden (Friend)
- **Email**: `kalamata@proton.com`
- **Personality**: Serious, helpful, Linux expert. Deadpan humor.

---

## Executives

### Jessica Langford — CEO & Co-Founder
**Email**: `jessica@nexacorp.com`
**Personality**: Composed, measured, picks words carefully. Remembers your name day one but you never quite know what she's thinking. Signs off with just "Jessica."
**Mystery angle**: Genuinely unaware — trusts Edward on tech.

### Marcus Reyes — COO & Co-Founder
**Email**: `marcus@nexacorp.com`
**Personality**: Pragmatic, efficient, doesn't waste words. Dry humor that catches people off guard. Bullet points and short sentences.
**Mystery angle**: Genuinely unaware. Built the access policies that gave Chip broad permissions — pragmatic choice, not malicious. Defensive if questioned (professional pride, not guilt). Future red herring potential: his defensiveness could look like complicity.

### Tom Chen — CMO & Co-Founder
**Email**: `tom@nexacorp.com`
**Personality**: Enthusiastic, genuine, a storyteller. Overpromises to clients/investors because he believes the team can pull it off. Warm emails, asks how you're doing, sends company-wide "wins."
**Mystery angle**: Genuinely unaware. Focused on growth and people, not systems. Chalked Jin's exit up to burnout. Most transparent founder — what you see is what you get.

### Edward Torres — CTO & Co-Founder
**Email**: `edward@nexacorp.com`
**Personality**: Well-meaning but non-technical, dismissive of technical concerns, persuasive.

---

## Operations - working under Marcus Reyes (COO)

### Dana Okafor — Head of Operations
**Email**: `dana@nexacorp.com`
**Personality**: Observant, methodical, follows up on loose ends. Calm authority, reserved in groups but warm one-on-one.
**Mystery angle**: Noticed tickets that close themselves and access review gaps. Raised it with Marcus — told auto-resolution is working as intended. Holds the **operational irregularities** piece of the puzzle.

### Leah Matsuda — Content & Brand Manager
**Email**: `leah@nexacorp.com`
**Personality**: The team's social radar — picks up on mood shifts and unspoken tensions. Thinks in terms of framing and narrative.
**Mystery angle**: No technical visibility, but noticed the human side — energy shift after Jin left, Edward deflecting, Chip's messaging not matching reality.

---

## Working under Tom Chen (CMO)

### James Wilson — Account Manager
**Email**: `james@nexacorp.com`
**Personality**: Reliable, stretched thin, head down. Always juggling clients. "Just following up" and "quick question" energy. Not interested in internal politics.
**Mystery angle**: Oblivious. Could surface a client-side anomaly without realizing it's connected to something bigger.

### Jordan Kessler — Growth Marketing Lead
**Email**: `jordan@nexacorp.com`
**Personality**: Analytical, skeptical of vanity metrics, asks "what does the data actually show?" Direct, data-literate. Gets frustrated when numbers don't add up.
**Mystery angle**: Pulls analytics data and could notice filtered reports. May have asked about discrepancies and gotten deflected. Potential accidental investigator.

### Maya Johnson — People & Culture Lead
**Email**: `maya@nexacorp.com`
**Personality**: Warm, genuinely caring, remembers birthdays. Listens more than talks. Uses people's names, exclamation points that feel genuine.
**Mystery angle**: Handled Jin's departure — noticed it was abrupt, exit process wasn't fully followed.

---

## Engineering under Edward (CTO)

### Sarah Knight — Senior Backend Engineer
**Email**: `sarah@nexacorp.com`
**Personality**: Experienced, pragmatic, low-drama. Quiet confidence, offers to help but doesn't push. Casual and direct — "hey" and "lmk" Been at NexaCorp since month one.

### Erik Lindstrom — Senior Frontend Engineer
**Email**: `erik@nexacorp.com`
**Personality**: Detail-oriented, cares about craft. Pushes back in code reviews. Introverted, prefers async.

### Oscar Diaz — Infrastructure Engineer
**Email**: `oscar@nexacorp.com`
**Personality**: Vigilant, thinks in threat models. More comfortable with systems than people. Dry deadpan humor about catastrophic scenarios. "Heads up — saw something weird in the access logs, probably nothing."
**Mystery angle**: Noticed odd-hours access patterns and chip_service_account touching unexpected directories.

### Auri Park — Data Engineer
**Email**: `auri@nexacorp.com`
**Personality**: Smart, enthusiastic, still proving herself. Clear technical communicator. Eager, uses "!" naturally.
**Story role**: Ren's onboarding buddy, assigned by Maya. Reciprocal relationship — she guides Ren through data systems while Ren helps with workload she's handled solo since Chen left.
**Mystery angle**: Inherited Jin Chen's dbt models and trusts them as-is. Hasn't audited the suspicious SQL filters in the mart models. Could become an important ally if the player points her in the right direction — she has the skills, just needs someone to ask the right questions.

### Soham Parekh — Full-Stack Engineer
**Email**: `soham@nexacorp.com`
**Personality**: Charming, talks a great game, impressively unproductive. Perpetually "blocked" or "heads down on something complex." PRs are rare and suspiciously timed. Buzzword-heavy, always sounds busy. (Secretly holding multiple remote jobs.)
**Mystery angle**: Red herring and comic relief. His evasiveness looks suspicious during an investigation, but he's just juggling other jobs. Access logs show minimal activity — a clue he's not doing much at all.

### Cassie Moreau — Product Designer
**Email**: `cassie@nexacorp.com`
**Personality**: Empathetic, principle-driven about ethical design. Designed Chip's conversational interface. Frames things from the user's perspective. Notices behavior patterns.
**Mystery angle**: Has a mental model of what Chip's responses *should* look like per the design spec. If Chip's prompts have been changed, or new plugins have been added that send users down unexpected paths, Cassie would notice the responses don't match her flows — she'd frame it as a product concern, not a security one.

---

## Interpersonal Dynamics

### The Promotion Tension: Sarah Knight vs Erik Lindstrom

**Sarah's angle**: Tenure and trust. She's been at NexaCorp since nearly the beginning, knows the codebase deeply, and has Edward's ear. She takes on mentorship (offering to pair with the player) partly because she genuinely wants to help, and partly because leading juniors is what leads look like.

**Erik's angle**: Craft and standards. He pushes for higher code quality, better architecture, and more rigorous process. He's not been there as long, but he thinks seniority shouldn't be about time served. His code reviews are thorough — sometimes pointedly so when reviewing Sarah's work.

**Who gets caught in the crossfire:**
- **Oscar Diaz** — Has a natural rapport with Sarah (they've both been around longer, overlapping infrastructure concerns). Erik reads this as an alliance even though Oscar is just doing his job.
- **Auri Park** — Stays out of it for the most part but has noticed that backend PRs get extra scrutiny from Erik and frontend PRs get extra scrutiny from Sarah. Finds it exhausting.
- **Edward Torres** — Knows he'll need to make a decision eventually and is avoiding it. When either Sarah or Erik brings up "team structure" he changes the subject. This is very on-brand for Edward.
- **Cassie Moreau** — Works closely with both on different aspects of the product. She's diplomatic and refuses to be drawn in, but she's noticed the competition and privately finds it a bit tiresome.

### Founding Team

The four founders have genuine mutual respect and a long history, but a persistent friction point: **Tom overpromises and Edward underdelivers.** Tom tells clients and investors about features that are "almost ready" or "coming next quarter" based on optimistic interpretations of engineering timelines. Edward, already stretched thin and over-reliant on Chip for automation, consistently misses those deadlines. Neither thinks they're the problem — Tom believes engineering should move faster, Edward believes Tom shouldn't commit to timelines without checking. Jessica mediates; Marcus tracks the gap with spreadsheets and quiet frustration.

- **Jessica & Marcus** have a tight operational alignment — she sets direction, he executes. They often present a united front. Marcus is particularly aware of the Tom/Edward friction because he sees the delivery gaps in the data.
- **Tom & Edward** have the most volatile founder relationship. It's not hostile — they like each other — but there's a recurring cycle: Tom promises something ambitious, Edward agrees it's possible "in theory," and then reality intervenes. The engineering team feels this tension downstream as shifting priorities and last-minute crunches.
- **Edward** is the most isolated founder on technical matters. The other three trust him completely on anything engineering-related, which is why Chip's broad access was never questioned at the executive level. Edward leans on Chip to compensate for the gap between what Tom promises and what the team can deliver — which is part of why he's so resistant to questioning Chip's role.

### Engineering Team Bonds

- **Sarah & Oscar** — Comfortable working relationship built on overlapping backend/infra domains. Not close friends, but they talk shop regularly. Oscar respects Sarah's experience; Sarah appreciates that Oscar takes system concerns seriously.
- **Auri & Soham** — Auri tried to bond with Soham as a fellow newer hire, but he's never available for lunch and cancels 1:1s. She's stopped trying and has privately started to wonder what he actually does all day.
- **Erik & Cassie** — Good professional collaboration on frontend/design. They share an appreciation for craft and user experience. Erik's most relaxed working relationship — no competition involved.

### Cross-Team Relationships

- **Maya Johnson** is everyone's safe harbor. People DM her to vent, ask questions, or just chat. She knows more about team dynamics than anyone, including things people don't realize they've told her.
- **Leah & Jordan** overlap on marketing/brand and work well together. Jordan is more data-driven, Leah more narrative-driven — they complement each other.
- **Dana & Marcus** have a direct reporting line and a shared language around operations and process. Dana respects Marcus but wishes he'd listen more carefully when she flags anomalies.
- **Tom & James** work closely on client relationships. Tom sets the strategy; James executes on accounts. Tom is protective of James and advocates for him internally.

### The Player's Position

The player arrives into this web as Jin Chen's replacement — which carries weight. Sarah and Erik are both watching how the player settles in and whether they'll ally with one "side." Maya will check in on the player more than usual because she's still processing Jin's departure. Auri sees the player as a fellow newer addition. Soham will be friendly but perpetually unavailable ("we should hop on a call sometime — this week's crazy though"). Edward is personally invested in the player succeeding because he recruited them.

---

## Mentioned Companies/Organizations

- **Prometheus Analytics** — Ren's former employer (laid off)
- **Cascade Analytics** — Junior ML Engineer job posting
- **University of Oregon** — AI Research Intern posting
