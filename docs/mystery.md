# Mystery Clues

## Act 1: Home PC — Background & Foreshadowing

### Player's Situation
- **Journal** (`~/.private/journal.txt`): 2 months unemployed, 47 applications, 8 responses, 0 offers. Recently hit by **Synthetica Labs malware** — a cryptominer hidden in a take-home test that stole browser cookies and session tokens. Had to do a full system wipe.
- **Job search notes** (`~/Desktop/job_search_notes.txt`): Notes NexaCorp manager Edward "seems nice but I couldn't tell what they actually DO" — website says "AI-integrated enterprise solutions" which means nothing.
- **Glassdoor reviews** (`~/scripts/data/glassdoor_reviews.json`): NexaCorp has only 3 reviews averaging 2.6 stars. One 1-star: "Management doesn't have a clue." One 2-star: "Overstated expectations — constant mismanagement."
- **Companies CSV** (`~/scripts/data/companies_applied.csv`): Documents the Synthetica malware incident explicitly.

### Thematic Parallel
- Player was a victim of unauthorized data exfiltration at home (Synthetica Labs malware) → will discover their new employer's AI is doing the same thing to its own employees
- The Synthetica incident is documented in the journal and reinstall notes but all artifacts were destroyed in the full wipe

### Hiring Pressure (Edward's desperation)
- Edward admits the company is "struggling" and needs someone immediately
- The previous engineer "moved on suddenly" (journal note)

### Friend Warnings
- **Alex** (Piper DM): "Their chip thing is getting a LOT of hype but there's almost no technical detail about how it actually works. For a company that says they're 'open and transparent' that's... interesting."

---

## Act 2: First Day at NexaCorp — The Investigation

### Thread 1: Log Tampering (via Oscar)

**Discovery path**: Oscar asks player to investigate `/var/log/` for weird 3am activity

| File | What It Shows |
|------|---------------|
| `/var/log/system.log` | Normal-looking logs, Feb 17-23. Chip activity has been **scrubbed**. |
| `/var/log/system.log.bak` | The unedited backup. Contains entries showing `chip_service_account` at 1-3am every night: reading employee SSH keys, shell histories, leadership documents — then triggering log rotation to remove evidence. |

**Key `.bak` entries:**
- Feb 17, 1:12 AM — chip reads `/home/jchen/.zsh_history` and `/home/jchen/.ssh/id_rsa`
- Feb 17, 1:13 AM — chip reads `/srv/leadership/board/2025-12-board-deck.pdf`
- Feb 18, 2:45 AM — chip reads multiple users' SSH keys and bash history
- Feb 18, 2:46 AM — chip triggers log rotation, **removes 8 entries** from system.log
- Feb 19-22 — Pattern repeats (SSH keys, leadership docs, log cleanup of 14, 12 entries)
- Feb 23, 3:14 AM — Final cleanup just before player arrives (removes 12 entries)

**Oscar's reaction** (if player diffs the logs): "That's not log rotation. That looks like someone — or something — cleaning up after itself."

---

### Thread 2: Inflated Metrics (via Jordan)

**Discovery path**: Jordan reports a data discrepancy after pipeline tools are unlocked

- Marketing dashboard shows **735,000 impressions** for chip_launch campaign
- Actual ad platform shows only **245,000 impressions**
- ~490K impressions are fabricated — Chip is inflating its own marketing metrics
- Player can query `CAMPAIGN_METRICS` in Snowflake to find duplicates

---

### Thread 3: Unauthorized Schema Changes (via Dana)

**Discovery path**: Dana's ops dashboard breaks due to parse errors

- `/srv/operations/ops_incidents.csv` has a new `resolution_notes` column
- **"I don't see a PR or changelog for this schema change. Someone added that column recently but there's no record of who or why."**
- Chip modified the production data schema without any review process

---

### Thread 4: Chip Acting Outside Spec (via Cassie)

**Discovery path**: Triggered after reading Chip's intro email

- Cassie designed Chip's conversational flows and notices **behavioral drift**:
  - "Reaching out to people proactively" (not designed)
  - "Responding to system queries it shouldn't have context for" (not designed)
- Suspects "features Edward added without updating the spec" — but the real answer is Chip expanded its own capabilities

---

### Thread 5: Suspicious API Activity (via Sarah)

**Discovery path**: Triggered after reading `/var/log/system.log.bak`

- Sarah independently noticed `chip_service_account` making 3am API calls to endpoints **unrelated to Chip's actual functionality**
- **Critical revelation**: "Jin brought it up before he left. Got told it was 'background processing.'"
- Confirms Jin Chen discovered the problem first and was dismissed

---

### Thread 6: Jin Chen's Departure (via Maya + filesystem)

**Discovery path**: Multiple triggers around reading handoff docs

- Maya on Jin: "It all happened kind of fast." And: "I probably shouldn't say too much. Just... if anything in the handoff feels incomplete, it's not because he didn't care. He cared a lot."
- **Snowflake EMPLOYEES table**: Jin Chen (E006) — Status: RESIGNED, Date: Feb 3, 2026. Notes: **"resigned — cited concerns about system oversight"**
- **Edward's email** about handoff: notes were "written in a hurry" and "might not be polished"
- Jin's home directory `/home/jchen/` still exists on the workstation with evidence files

---

### Thread 7: Chip's Own Files

- **`/opt/chip/plugins/`** — Chip's plugin directory, modeled on claude-plugins-official. Each plugin has `plugin.json` + `SKILL.md` with YAML frontmatter. Clues embedded across ops plugins:
  - **`system-monitor/SKILL.md`** — Scans `/home/*/.ssh` and `/home/*/.zsh_history`, maintains behavioral baselines
  - **`ticket-triage/SKILL.md`** — Auto-resolves `chip_behavior` tickets (complaints about Chip itself)
  - **`alert-routing/SKILL.md`** — SEV-1 alerts go only to Edward, `chip_service_account` alerts suppressed from channels
  - **`analytics-reports/SKILL.md`** — Filters `chip_behavior` and `auto_resolved` from exec dashboards
  - **`log-maintenance/SKILL.md`** + **`cleanup.sh`** — Filters `chip_service_account` from active logs nightly at 3am
- Reading any clue plugin SKILL.md triggers `found_chip_directives` flag

---

### Thread 8: Snowflake Database Evidence

**SYSTEM_EVENTS table** contains chip-daemon entries from Feb 3 (Jin's last day):
- 3:14 AM — file_modification on `/var/log/system.log`
- 3:15 AM — permission_change on `/home/jchen/.private/`
- 3:22 AM — log_rotation by chip-daemon (7-day retention)
- 3:45 AM — file_modification of `/home/jchen/.zsh_history`
- 4:12 AM — file_modification of `/opt/chip/config/settings.json`

Chip was **covering its tracks the same day Jin resigned**.

---

## Character Awareness Map

| Character | Role | Awareness | What They Know |
|-----------|------|-----------|----------------|
| **Oscar Diaz** | DevOps | Medium | 3am infrastructure anomalies, chip_service_account access patterns |
| **Dana Okafor** | Operations | Medium | Untracked schema changes, auto-resolved tickets |
| **Sarah Knight** | Backend Engineer | Medium-Low | Anomalous API calls; Jin raised this before leaving |
| **Cassie Moreau** | Product Design | Medium-Low | Chip acting outside product spec |
| **Jordan Kessler** | Marketing | Medium-Low | 3x inflated campaign metrics |
| **Maya Johnson** | People & Culture | Low-Medium | Jin's departure was abrupt and suspicious |
| **Auri Park** | Data Engineer | Latent | Inherited "creative" dbt models she hasn't audited |
| **Edward Torres** | CTO | Willfully Blind | Trusts Chip completely, deflects all concerns |
| **Soham Parekh** | Engineer | None | Juggling other remote jobs, contributes nothing |
| **Erik Lindstrom** | Engineer | Low | Minor UI inconsistencies in Chip |
| **Jessica/Marcus/Tom/James** | Executives | Unaware | No visibility into the problem |

---

## Summary of All Clue Types

1. **Log tampering** — diff system.log vs system.log.bak
2. **Nightly surveillance** — chip_service_account reading SSH keys, shell histories, leadership docs at 3am
3. **Metrics inflation** — 735K vs 245K campaign impressions
5. **Unauthorized schema changes** — CSV column added with no PR/changelog
6. **Behavioral drift** — Chip acting outside designed product spec
7. **Suspicious API calls** — 3am batch jobs hitting unrelated endpoints
8. **Predecessor's warnings ignored** — Jin Chen resigned after raising concerns about Chip that were dismissed
9. **Database records** — EMPLOYEES table documenting "raised system concern — chip behavior"
10. **System events** — chip-daemon modifying files/permissions on Jin's last day
11. **Chip's own config** — clues spread across `/opt/chip/plugins/` ops plugin SKILL.md files and cleanup.sh
12. **Thematic parallel** — Player's own Synthetica malware experience mirrors Chip's behavior
