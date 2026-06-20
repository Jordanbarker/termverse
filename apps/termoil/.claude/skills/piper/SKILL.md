---
name: piper
description: "How the Piper team messaging system works — channels, DMs, message delivery, reply options, and the interactive session. Use this skill whenever adding new Piper messages, modifying Piper triggers, working on the piper command, or touching files under src/engine/piper/ or src/story/piper/."
---

# Piper Messaging System

Piper is NexaCorp's Slack-style team chat. It handles casual colleague conversations — quick asks, tool introductions, back-and-forth help requests. Email handles formal/system communications.

## Architecture

```
src/engine/piper/
├── types.ts           # PiperMessage, PiperDelivery, PiperTrigger, PiperChannel, PiperSessionInfo, PiperReplyOption
├── delivery.ts        # checkPiperDeliveries(), seedImmediatePiper(), getConversationHistory(), getPendingReply(), getVisibleChannels()
├── timestamp.ts       # Segment definitions, interpolateDeliveries(), computeTimestamp(), getGameTime()
├── render.ts          # Terminal rendering (header, channel list, conversation, reply menu, footer)
├── PiperSession.ts    # Interactive session (ISession impl, channel list ↔ conversation views)
└── __tests__/
    ├── delivery.test.ts
    └── timestamp.test.ts

src/story/piper/
├── channels.ts        # PIPER_CHANNELS array (channel/DM definitions)
├── messages.ts        # getPiperDeliveries(username) — re-exports all deliveries from messages/
└── messages/
    ├── home.ts        # Alex Rivera + Olive Borden (home PC)
    ├── onboarding.ts  # Edward, IT, HR (early NexaCorp)
    ├── oscar.ts       # Oscar Diaz
    ├── dana.ts        # Dana Okafor
    ├── auri.ts        # Auri Park
    ├── sarah.ts       # Sarah Knight
    ├── cassie.ts      # Cassie Moreau
    ├── jordan.ts      # Jordan Kessler
    ├── maya.ts        # Maya Johnson
    ├── marcus.ts      # Marcus Reyes — Chapter 3 accusation endgame
    ├── edward.ts      # Edward Torres (Chip onboarding DM chain + Chapter 3 plugin quest)
    ├── anon.ts        # Anonymous sender (Sabu) — `dm_anon` USB-tip on Day 2 morning at home
    └── ambient.ts     # Ambient channel chatter (general, engineering)

src/engine/commands/builtins/piper.ts  # Command registration
src/state/gameStore.ts                 # deliveredPiperIds state + addDeliveredPiperMessages action
```

## Data Model

### Core Types (`piper/types.ts`)

```ts
interface PiperMessage {
  id: string;              // "oscar_hey_1"
  from: string;            // "Oscar Diaz"
  timestamp: string;       // Computed dynamically at render time (set to "" in definitions)
  body: string;
  isPlayer?: boolean;
}

interface PiperReplyOption {
  label: string;
  messageBody: string;
  triggerEvents?: GameEvent[];
  visibleWhen?: { flag: string };  // only show option if this story flag is set
  hiddenWhen?: { flag: string };   // hide option if this story flag is set
}

interface PiperDelivery {
  id: string;              // unique delivery ID
  channelId: string;       // which channel ("general", "dm_oscar")
  messages: PiperMessage[];
  trigger: PiperTrigger | PiperTrigger[];
  replyOptions?: PiperReplyOption[];
}

type PiperTrigger =
  | { type: "immediate" }
  | { type: "after_file_read"; filePath: string; requireDelivered?: string }
  | { type: "after_email_read"; emailId: string }
  | { type: "after_piper_reply"; deliveryId: string }
  | { type: "after_command"; command: string }
  | { type: "after_objective"; objectiveId: string }
  | { type: "after_story_flag"; flag: string; requireDelivered?: string };
```

## Storage

State-based, not filesystem-based. `deliveredPiperIds: string[]` in Zustand tracks which deliveries have arrived and which replies the player chose. Message content is defined statically in `story/piper/messages.ts`.

### Special IDs in deliveredPiperIds

- `reply:{deliveryId}:{optionIndex}` — Player chose a reply option
- `seen:{channelId}:{count}` — Unread tracking marker

## Delivery Flow

1. Player action triggers a `GameEvent` (file read, command, objective)
2. `computeEffects()` in `applyResult.ts` calls `checkPiperDeliveries(event, deliveredIds, username)`
3. Matching deliveries are added to `newDeliveredPiperIds` in effects
4. `useTerminal.ts` syncs to Zustand and shows toast: "You have new messages on Piper"
5. Player runs `piper` to open the interactive session

## Interactive Session

Two views: **channel list** and **conversation**.

**Navigation**: Arrow keys or number keys, Enter to select, `q` to go back/exit.

**Multi-digit menu selection** (`consumeDigit()` in `PiperSession.ts`): the menu can grow past 9 items (up to ~15 channels+DMs), so digit input is buffered. Rule: a digit `d` becomes a commit when `(buffer+d) * 10 > menuLength` — meaning no longer selection is reachable. Otherwise it's held in `digitBuffer` until Enter or another digit. Effects with `max = 15`:
- `2`–`9` commit immediately (since `20 > 15`).
- `1` is buffered (since `10 ≤ 15`).
- `1` then `0`–`5` commits 10–15.
- `1` then `6`–`9` rejects the second digit; buffer stays `"1"`; Enter opens item 1.
- Any non-digit / non-Enter input clears the buffer.

The footer surfaces the in-progress buffer as `[NN_]` next to the hint line. The same rule applies to the reply menu in conversation view.

**Reply flow**: When the player selects a reply in a conversation, the reply ID is added to `deliveredPiperIds`, trigger events are collected, and the conversation re-renders with the player's message shown inline.

On session exit, collected trigger events and updated `deliveredPiperIds` (replies + seen markers) are synced back to the store via `useSessionRouter`.

## Dynamic Timestamps — Segment-Based Interpolation

Piper message timestamps are computed dynamically at render time in `getConversationHistory()` (delivery.ts), not hardcoded in message definitions (set timestamps to `""` in definitions).

`timestamp.ts` defines five **time segments** with fixed clock windows. Deliveries are bucketed into segments and linearly interpolated within each segment's time range, ensuring end-of-day messages always land near the segment's end time regardless of how many quests the player completes.

### Segments

| Segment | Clock | Start | End | Calendar | Boundary trigger |
|---------|-------|-------|-----|----------|-----------------|
| `nexacorp_day1` | nexacorp | 8:30 AM | 6:15 PM | Mon Feb 23 | (initial) |
| `nexacorp_day2` | nexacorp | 8:30 AM | 6:00 PM | Tue Feb 24 | `ssh_day2` flag |
| `home_pre_work` | home | 2:00 PM | 4:00 PM | Sat Feb 21 | (initial) |
| `home_post_work` | home | 6:15 PM | 9:00 PM | Mon Feb 23 | `returned_home_day1` flag |
| `home_day2` | home | 6:30 AM | 9:00 AM | Tue Feb 24 | `day1_shutdown` flag |

### Key exports from `timestamp.ts`

- `interpolateDeliveries(deliveredIds, defMap)` — shared by `getConversationHistory` and `getGameTime`. Returns `deliveryMinutes` map (delivery ID → absolute minutes from midnight) and `lastSegment` (clockKey → current segment ID for calendar lookups)
- `computeTimestamp(absoluteMinutes, messageIndex)` — formats absolute minutes as "h:mm AM/PM", adding `floor(messageIndex/2)` for within-delivery pairing
- `getGameTime(deliveredPiperIds, defMap, computer)` — returns time + calendar for the `date` command and (via the `gameNowFor()` bridge in `src/engine/snowflake/session/gameClock.ts`) for SQL `CURRENT_DATE()`/`NOW()`/etc.
- `SEGMENTS`, `SEGMENT_BOUNDARIES`, `INITIAL_SEGMENTS` — segment configuration

### Algorithm

1. **Bucket** deliveries into segments: iterate `deliveredIds`, detect `after_story_flag` triggers matching boundary flags, switch to next segment. Reply follow-ups (`after_piper_reply`) tracked separately.
2. **Interpolate**: For N non-reply deliveries in a segment: `time = startMinutes + (i / max(N-1, 1)) * duration`
3. **Reply follow-ups**: `parentDeliveryTime + 2 min`

## Channels

Defined in `src/story/piper/channels.ts`. Each channel/DM has a `computer` field — `"home"` shows it on Home PC, omitted means NexaCorp.

**Important:** `checkPiperDeliveries` filters by `delivery.computer ?? "nexacorp"` — **set `computer: "home"` on the delivery itself**, not just the channel. A home-side channel with a delivery that omits `computer` will silently fail to fire on home (the filter defaults to nexacorp).

### Home PC

| ID | Name | Type |
|----|------|------|
| `openclam` | `#OpenClam` | channel |
| `bubble_buddies` | `#BubbleBuddies` | channel |
| `dm_alex` | Alex Rivera | dm |
| `dm_olive` | Olive Borden | dm |
| `dm_anon` | `Sabu` | dm (anonymous sender; `anon_usb_tip` delivers off `after_story_flag: day1_shutdown`) |

### NexaCorp

| ID | Name | Type |
|----|------|------|
| `general` | `#general` | channel |
| `engineering` | `#engineering` | channel |
| `dm_oscar` | Oscar Diaz | dm |
| `dm_dana` | Dana Okafor | dm |
| `dm_auri` | Auri Park | dm |
| `dm_jordan` | Jordan Kessler | dm |
| `dm_maya` | Maya Johnson | dm |
| `dm_sarah` | Sarah Knight | dm |
| `dm_cassie` | Cassie Moreau | dm |
| `dm_edward` | Edward Torres | dm |
| `dm_marcus` | Marcus Reyes | dm (Chapter 3 accusation endgame; opens off `reported_plugin_to_edward`) |

DMs are visible only after at least one delivery has reached them. `getVisibleChannels()` (delivery.ts) filters out channels with no messages.

## Gating

- On NexaCorp, `piper` is unlocked by the `piper_unlocked` story flag (set when the player reads the `welcome_edward` email). Gated in `story/commandGates.ts` via `NEXACORP_GATED`.
- On Home PC, `piper` is part of `HOME_COMMANDS` and available from the start — Olive's quest lines and Alex's chats live there.
- Edward's Chip onboarding DM chain (`edward_chip_intro` → `edward_chip_error` → `edward_chip_fix`) unlocks `chip`, teaches the API key puzzle, and unlocks `printenv`/`env`.
- The `dm_anon` "Anonymous Tip" DM (`anon_usb_tip`) on home PC unlocks `mount`/`umount` via `accepted_usb_drive` when the player picks "Plug it in." The sister flag `declined_usb_tip` keeps the arc dormant. Both reply options resolve `anon_tip_dm_resolved` so the parent quest's "Check Piper" child completes either way.
- Not available in the dev container. On `erik-pc`, `piper` short-circuits with a libsecret/gnome-keyring D-Bus error — realistic Linux behavior for an OAuth-token tool invoked over SSH without an active desktop session (see `src/engine/commands/builtins/piper.ts`).

## Adding New Messages

1. Add the message to the **per-character file** in `story/piper/messages/` (e.g., `oscar.ts` for Oscar Diaz messages). Each file exports a `get*Deliveries(username: string): PiperDelivery[]` function. `messages.ts` automatically includes all sub-files; no need to register the new delivery there:
   ```ts
   {
     id: "unique_delivery_id",
     channelId: "dm_oscar",
     messages: [
       { id: "msg_1", from: "Oscar Diaz", timestamp: "", body: "Message text" },
     ],
     trigger: { type: "after_objective", objectiveId: "some_flag" },
     replyOptions: [
       { label: "Sure!", messageBody: "On it.", triggerEvents: [...] },
     ],
   }
   ```
2. If adding a new channel/DM, add it to `PIPER_CHANNELS` in `story/piper/channels.ts`
3. Choose trigger type — same options as email triggers plus `after_piper_reply`
