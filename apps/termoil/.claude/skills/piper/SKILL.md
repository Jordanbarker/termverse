---
name: piper
description: "How the Piper team messaging system works — channels, DMs, message delivery, reply options, and the interactive session. Use this skill whenever adding new Piper messages, modifying Piper triggers, working on the piper command, or touching files under src/engine/piper/ or src/story/piper/."
---

# Piper Messaging System

NexaCorp's Slack-style team chat — casual colleague conversations (quick asks, tool intros, help). Email handles formal/system comms.

Code map: `src/engine/piper/` (`types.ts` — all types, read them there; `delivery.ts` = `checkPiperDeliveries`/`seedImmediatePiper`/`getConversationHistory`/`getPendingReplies`/`getVisibleChannels`; `timestamp.ts`; `render.ts`; `PiperSession.ts` — `pickVisibleReply`/`consumeDigit`; `deliverPiperAndCascade` in `delivery.ts` is the transition-time entry point). Pacing constants are `src/lib/timing.ts`. Content in `src/story/piper/`: `channels.ts` (`PIPER_CHANNELS`), `messages.ts` (auto-includes all per-character files in `messages/` — one per character). Command registration `src/engine/commands/builtins/piper.ts` (app-side, like the rest of the story builtins).

## Storage

State-based, not FS-based. `deliveredPiperIds: string[]` (Zustand) tracks arrivals, chosen replies (`reply:{deliveryId}:{optionIndex}`), and unread markers (`seen:{channelId}:{count}`). Content is static in `story/piper/messages/`.

It is **set-like**: a repeated id replays the message in the conversation, so `addDeliveredPiperMessages` de-dupes against current state. Call sites (transitions, `seedImmediatePiper`, session exit) may pass ids that were already delivered without filtering first. `seen:` markers are the exception: adding one drops any earlier marker for the same channel.

## Delivery flow

Same shape as email's (see the **email** skill): player action → `GameEvent` → `computeEffects()` → `checkPiperDeliveries(event, deliveredIds, username, computerId?, storyFlags?)` → matches added to `newDeliveredPiperIds` → `useTerminal` syncs + notifies "You have new messages on Piper" → player runs `piper`.

**Deferred notice (`pendingPiperNotification`).** Messages can arrive while the player is on a box with no `piper` (devcontainer, chipinfra, erik-pc). The store flag holds the notice; `useComputerTransitions.ts` flushes it on arrival at any machine where `isCommandAvailable("piper", ...)` passes, using the same gate as the live notification sites. It is persisted — see the **save** skill.

## Traps and gating

- **Set `computer: "home"` on the delivery, not just the channel.** `checkPiperDeliveries` filters by `delivery.computer ?? "nexacorp"`, so a home-side channel with a delivery that omits `computer` silently fails to fire on home.
- DMs are visible only after ≥1 delivery reaches them (`getVisibleChannels()` filters empty channels). Channel/DM roster is `PIPER_CHANNELS` in `channels.ts` — read it there.
- Gating: NexaCorp `piper` is behind `piper_unlocked` (set on reading `welcome_edward`), via `NEXACORP_GATED`. Home `piper` is in `HOME_COMMANDS` (available from start; Olive/Alex live there). Not in the dev container. On `erik-pc` it short-circuits with a libsecret/gnome-keyring D-Bus error (OAuth-token tool over SSH, no desktop session). Edward's Chip onboarding DM chain (`edward_chip_intro`→`_error`→`_fix`) unlocks `chip` + `printenv`/`env`; the `dm_anon` USB-tip DM (`anon_usb_tip`) unlocks `mount`/`umount` via `accepted_usb_drive`, both reply options resolving `anon_tip_dm_resolved`.

## Interactive session

Two views (channel list ↔ conversation); arrows/number keys, Enter select, `q` back/exit. On exit, collected trigger events + updated `deliveredPiperIds` (replies + seen markers) sync back via `useSessionRouter`. Selecting a reply adds the reply ID to `deliveredPiperIds`, collects its trigger events, and re-renders with the player's message inline.

**A channel can hold several unanswered reply prompts at once**, and every one of them stays answerable. `getPendingReplies` lists them oldest-first (delivery order, not definition order); `pickVisibleReply` in `PiperSession.ts` takes the oldest whose options aren't all gated away, and answering it surfaces the next. Never assume a delivery supersedes an earlier prompt in the same channel: reply-gated unlocks (Oscar's `search_tools_accepted`, Auri's `inspection_tools_accepted`) are only reachable through their own prompt, so a "newest wins" rule silently deletes them from the game.

**Multi-digit menu selection** (`consumeDigit()` in `PiperSession.ts`) — the menu can exceed 9 items. A digit `d` commits when `(buffer+d)*10 > menuLength` (no longer selection reachable); otherwise it's buffered until Enter or another digit. `consumeDigit` itself **preserves** the buffer on a non-digit or out-of-range key (it only ever returns a commit or the extended buffer); clearing on a stray key is the session's job, in the fall-through after `consumeDigit` declines. Footer shows the in-progress buffer as `[NN_]`. Same rule for the reply menu.

## Dynamic timestamps — segment interpolation

Timestamps are computed at render time in `getConversationHistory()` (set `timestamp: ""` in definitions). `timestamp.ts`'s `SEGMENTS` is five fixed windows (two nexacorp workdays, three home stretches), each with a clock key, a start minute, a duration, and a calendar date — **read the array, don't mirror it**. `SEGMENT_BOUNDARIES` maps a boundary story flag to the segment it advances its clock into; `INITIAL_SEGMENTS` names each clock's starting one.

Algorithm (`interpolateDeliveries`): bucket every delivered id by detecting boundary flags in `deliveredIds` as it walks them, then place the `i`th delivery in a segment at `start + (i / (totalDeliveriesInSegment - 1)) * duration`. **The denominator is the segment's total *possible* deliveries, not how many actually landed** — so a player who did few quests gets early-in-the-day timestamps rather than a compressed run to the segment end. Reply follow-ups land at `parentTime + 2min`.

Key exports: `interpolateDeliveries` (returns a `deliveryMinutes` map + `lastSegment` per clock), `computeTimestamp` (formats minutes, `+floor(msgIndex/2)` for within-delivery pairing), and `getGameTime` (time + calendar), which is what `story/clock.ts` wraps into the `ctx.clock` seam so `date` and SQL date functions agree with Piper.

## Adding messages

1. Add to the **per-character file** in `messages/` (each exports `get*Deliveries(username): PiperDelivery[]`; `messages.ts` includes them automatically) — a `PiperDelivery` with `id`, `channelId`, `messages`, `trigger`, optional `replyOptions`.
2. New channel/DM → add to `PIPER_CHANNELS` in `channels.ts` (and set `computer: "home"` on both channel and deliveries for home-side ones).
3. Trigger types match email triggers plus `after_piper_reply`. For per-reply branching, see the narrative skill.
