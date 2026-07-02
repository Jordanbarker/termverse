---
name: piper
description: "How the Piper team messaging system works — channels, DMs, message delivery, reply options, and the interactive session. Use this skill whenever adding new Piper messages, modifying Piper triggers, working on the piper command, or touching files under src/engine/piper/ or src/story/piper/."
---

# Piper Messaging System

NexaCorp's Slack-style team chat — casual colleague conversations (quick asks, tool intros, help). Email handles formal/system comms.

Code map: `src/engine/piper/` (`types.ts` — all types, read them there; `delivery.ts` = `checkPiperDeliveries`/`seedImmediatePiper`/`getConversationHistory`/`getPendingReply`/`getVisibleChannels`; `timestamp.ts`; `render.ts`; `PiperSession.ts`). Content in `src/story/piper/`: `channels.ts` (`PIPER_CHANNELS`), `messages.ts` (auto-includes all per-character files in `messages/` — one per character). Command registration `commands/builtins/piper.ts`.

## Storage

State-based, not FS-based. `deliveredPiperIds: string[]` (Zustand) tracks arrivals, chosen replies (`reply:{deliveryId}:{optionIndex}`), and unread markers (`seen:{channelId}:{count}`). Content is static in `story/piper/messages/`.

## Delivery flow

Player action → `GameEvent` → `computeEffects()` calls `checkPiperDeliveries(event, deliveredIds, username)` → matches added to `newDeliveredPiperIds` → `useTerminal` syncs + toasts "You have new messages on Piper" → player runs `piper`.

## Traps and gating

- **Set `computer: "home"` on the delivery, not just the channel.** `checkPiperDeliveries` filters by `delivery.computer ?? "nexacorp"`, so a home-side channel with a delivery that omits `computer` silently fails to fire on home.
- DMs are visible only after ≥1 delivery reaches them (`getVisibleChannels()` filters empty channels). Channel/DM roster is `PIPER_CHANNELS` in `channels.ts` — read it there.
- Gating: NexaCorp `piper` is behind `piper_unlocked` (set on reading `welcome_edward`), via `NEXACORP_GATED`. Home `piper` is in `HOME_COMMANDS` (available from start; Olive/Alex live there). Not in the dev container. On `erik-pc` it short-circuits with a libsecret/gnome-keyring D-Bus error (OAuth-token tool over SSH, no desktop session). Edward's Chip onboarding DM chain (`edward_chip_intro`→`_error`→`_fix`) unlocks `chip` + `printenv`/`env`; the `dm_anon` USB-tip DM (`anon_usb_tip`) unlocks `mount`/`umount` via `accepted_usb_drive`, both reply options resolving `anon_tip_dm_resolved`.

## Interactive session

Two views (channel list ↔ conversation); arrows/number keys, Enter select, `q` back/exit. On exit, collected trigger events + updated `deliveredPiperIds` (replies + seen markers) sync back via `useSessionRouter`. Selecting a reply adds the reply ID to `deliveredPiperIds`, collects its trigger events, and re-renders with the player's message inline.

**Multi-digit menu selection** (`consumeDigit()` in `PiperSession.ts`) — the menu can exceed 9 items. A digit `d` commits when `(buffer+d)*10 > menuLength` (no longer selection reachable); otherwise it's buffered until Enter or another digit. Any non-digit/non-Enter clears the buffer. Footer shows the in-progress buffer as `[NN_]`. Same rule for the reply menu.

## Dynamic timestamps — segment interpolation

Timestamps are computed at render time in `getConversationHistory()` (set `timestamp: ""` in definitions). `timestamp.ts` defines five fixed **time segments**; deliveries are bucketed into a segment and linearly interpolated within its clock window, so end-of-day messages always land near the segment end regardless of how many quests the player did.

| Segment | Clock | Window | Calendar | Boundary trigger |
|---|---|---|---|---|
| `nexacorp_day1` | nexacorp | 8:30 AM–6:15 PM | Mon Feb 23 | (initial) |
| `nexacorp_day2` | nexacorp | 8:30 AM–6:00 PM | Tue Feb 24 | `ssh_day2` |
| `home_pre_work` | home | 2:00–4:00 PM | Sat Feb 21 | (initial) |
| `home_post_work` | home | 6:15–9:00 PM | Mon Feb 23 | `returned_home_day1` |
| `home_day2` | home | 6:30–9:00 AM | Tue Feb 24 | `day1_shutdown` |

Key exports: `interpolateDeliveries` (shared by `getConversationHistory` + `getGameTime`; returns `deliveryMinutes` map + `lastSegment` per clock), `computeTimestamp` (formats minutes, `+floor(msgIndex/2)` for within-delivery pairing), `getGameTime` (time + calendar for `date` and, via `gameNowFor()`, SQL date functions), plus `SEGMENTS`/`SEGMENT_BOUNDARIES`/`INITIAL_SEGMENTS`. Algorithm: bucket by detecting `after_story_flag` boundary flags in `deliveredIds`; interpolate `start + (i/max(N-1,1))*duration`; reply follow-ups land at `parentTime + 2min`.

## Adding messages

1. Add to the **per-character file** in `messages/` (each exports `get*Deliveries(username): PiperDelivery[]`; `messages.ts` includes them automatically) — a `PiperDelivery` with `id`, `channelId`, `messages`, `trigger`, optional `replyOptions`.
2. New channel/DM → add to `PIPER_CHANNELS` in `channels.ts` (and set `computer: "home"` on both channel and deliveries for home-side ones).
3. Trigger types match email triggers plus `after_piper_reply`. For per-reply branching, see the narrative skill.
