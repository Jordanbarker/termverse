---
name: email
description: "How the in-game email/mail system works — Maildir filesystem layout, delivery triggers, email definitions, and the mail CLI command. Use this skill whenever adding new emails, modifying email triggers, working on the mail command, touching any files under src/engine/mail/ or src/story/emails/, or adding any kind of player notification or event-triggered message — even if it's triggered by another system like dbt."
---

# Email System

The email system delivers formal/system messages triggered by player actions, using a Maildir-compatible virtual filesystem. **Casual team conversations use Piper (`piper` command) instead** — see the **piper skill** for details.

## Architecture

```
src/engine/mail/
├── types.ts          # Email, EmailDelivery, EmailTrigger, ReplyOption types
├── emails.ts         # Email routing dispatcher: getEmailDefinitions(username, computer?), imports from story/emails/
├── mailUtils.ts      # Filesystem utilities: parse, format, deliver, mark read
└── delivery.ts       # Event-based delivery (checkEmailDeliveries), GameEvent type

src/story/emails/
├── home.ts           # Home PC email definitions: getHomeEmailDefinitions
└── nexacorp.ts       # NexaCorp email definitions: getNexacorpEmailDefinitions

src/engine/prompt/
├── types.ts          # PromptOption, PromptSessionInfo, PromptResult
└── PromptSession.ts  # Inline prompt session (renders, validates, resolves)

src/engine/commands/builtins/mail.ts       # mail command handler (reply options → prompt)
src/story/filesystem/nexacorp/index.ts     # Maildir dir creation + immediate email seeding (NexaCorp)
src/story/filesystem/home/system.ts         # Maildir dir creation + immediate email seeding (Home PC)
src/state/gameStore.ts                     # deliveredEmailIds state + addDeliveredEmails action
src/hooks/useTerminal.ts                   # Delivery trigger + prompt session integration
src/hooks/useSessionRouter.ts              # Processes triggerEvents from prompt sessions (email delivery + story flags)
```

## Data Model

### Core Types (`mail/types.ts`)

```ts
interface Email {
  id: string;       // e.g. "welcome_edward"
  from: string;     // "Edward Torres <edward@nexacorp.com>"
  to: string;       // "ren@nexacorp.com"
  date: string;     // RFC 2822 format
  subject: string;
  body: string;
}

interface ReplyOption {
  label: string;           // Display text shown to the player
  replyBody: string;       // Full text of the player's reply
  triggerEvents?: GameEvent[]; // Game events fired on selection
}

interface EmailDelivery {
  email: Email;
  trigger: EmailTrigger | EmailTrigger[]; // Array = any-of (first match wins)
  replyOptions?: ReplyOption[]; // If set, mail command shows inline prompt
}

type EmailTrigger =
  | { type: "immediate" }
  | { type: "after_file_read"; filePath: string; requireDelivered?: string }
  | { type: "after_email_read"; emailId: string }
  | { type: "after_command"; command: string; requiredFlags?: string[] }
  | { type: "after_objective"; objectiveId: string }
  | { type: "after_story_flag"; flag: string; requiredFlags?: string[] };

type GameEvent =
  | { type: "command_executed"; detail: string }
  | { type: "file_read"; detail: string }
  | { type: "objective_completed"; detail: string }
  | { type: "directory_visit"; detail: string }
  | { type: "directory_created"; detail: string }
  | { type: "piper_delivered"; detail: string };
```

### Parsed Types (`mail/mailUtils.ts`)

```ts
interface ParsedEmail {
  from: string; to: string; date: string;
  subject: string; status: string; body: string;
}

interface MailEntry {
  filename: string;    // e.g. "001_welcome_aboard"
  dir: "new" | "cur";  // new = unread, cur = read
  seq: number;         // sequence number
  parsed: ParsedEmail;
}
```

## Filesystem Layout

```
/var/mail/{username}/
├── new/    # Unread emails (delivered here)
├── cur/    # Read emails (moved from new/ on read)
└── sent/   # Sent messages
```

**Filename pattern**: `{seq:03d}_{slugified_subject}` (e.g. `001_welcome_aboard`)

**File format** (RFC 2822-style):
```
From: Edward Torres <edward@nexacorp.com>
To: ren@nexacorp.com
Date: Mon, 23 Feb 2026 07:45:00
Subject: Welcome aboard!
Status: R

Email body here...
```

## Key Functions

### `mailUtils.ts`
| Function | Purpose |
|----------|---------|
| `getMailDir(username)` | Returns `/var/mail/{username}` |
| `getNewDir(username)` / `getCurDir` / `getSentDir` | Subdirectory paths |
| `slugify(subject)` | Subject to filename-safe string |
| `formatEmailContent(email, read)` | Email object to RFC 2822 string |
| `parseEmailContent(content)` | RFC 2822 string to ParsedEmail |
| `getMailEntries(fs)` | All mail entries sorted by seq |
| `markAsRead(fs, filename)` | Move new/ to cur/, set Status: R |
| `deliverEmail(fs, email, seq)` | Write email file to new/ |

### `delivery.ts`
| Function | Purpose |
|----------|---------|
| `checkEmailDeliveries(fs, event, deliveredIds, computer?, storyFlags?)` | Check triggers, deliver matching emails, return `{ fs, newDeliveries }`. Routes to home or nexacorp definitions based on `computer` (defaults to "nexacorp"); returns empty for `"devcontainer"` (no mail system). The optional `storyFlags` param is passed through to `matchesCommonTrigger()` for `after_story_flag` triggers. |

## Mail Command (`mail.ts`)

| Usage | Action |
|-------|--------|
| `mail` | List inbox (unread count, message table) |
| `mail <number>` | Read message by seq number (marks as read) |
| `mail -s "subject" recipient` | Send/compose a message |

## Delivery Flow

1. Player executes a command in terminal
2. `useTerminal` hook calls `checkEmailDeliveries()` with appropriate `GameEvent`
3. System matches pending `EmailDelivery` definitions against trigger conditions
4. Matching emails are written to `/var/mail/{username}/new/` via `deliverEmail()`
5. `deliveredEmailIds` in Zustand state prevents duplicate delivery
6. Player sees notification: `"You have new mail in /var/mail/{username}"`

## Adding a New Email

1. **Define the email** in the appropriate file:
   - **NexaCorp emails**: `story/emails/nexacorp.ts` inside `getNexacorpEmailDefinitions()`
   - **Home PC emails**: `story/emails/home.ts` inside `getHomeEmailDefinitions()`
   ```ts
   {
     email: {
       id: "unique_id",
       from: "Sender <sender@nexacorp.com>",
       to: `${username}@nexacorp.com`,
       date: "Mon, 23 Feb 2026 10:00:00",
       subject: "Subject line",
       body: "Email body text...",
     },
     trigger: { type: "after_file_read", filePath: "/path/to/file" },
   }
   ```
2. Choose the appropriate trigger type based on when the email should arrive.
3. Immediate emails are seeded via `buildInitialMailFiles()` in `story/filesystem/nexacorp/index.ts` (NexaCorp) or `buildHomeMailFiles()` in `story/filesystem/home/system.ts` (home).

## Character Reference

When writing email content, read `docs/characters.md` for each character's personality, writing style, email tone, and mystery angle. Match their voice — e.g., Sarah is casual and direct ("hey", "lmk"), Maya is warm with genuine exclamation points, Marcus uses bullet points and short sentences.

## Reply Options & Inline Prompt System

Emails can define `replyOptions` to present numbered choices when the player reads them. This integrates with the generic prompt system in `src/engine/prompt/`.

### Architecture

```
src/engine/prompt/
├── types.ts          # PromptOption, PromptSessionInfo, PromptResult
└── PromptSession.ts  # Renders prompt, validates input, resolves selection
```

### How It Works

1. `mail <n>` reads an email; the mail command checks `getEmailDefinitions()` for matching `replyOptions`
2. If found, numbered options are appended to the message output and a `promptSession` is returned in `CommandResult`
3. `useTerminal` creates a `PromptSession` and routes input to it
4. Player types a number + Enter; the session saves a reply to `sent/`, fires `triggerEvents`, and returns to normal prompt
5. Ctrl+C cancels without sending

### Adding Reply Options to an Email

Add `replyOptions` to any `EmailDelivery` in `emails.ts`:
```ts
{
  email: { id: "welcome_edward", ... },
  trigger: { type: "immediate" },
  replyOptions: [
    { label: "Option A", replyBody: "Reply text for option A..." },
    { label: "Option B", replyBody: "Reply text for option B...",
      triggerEvents: [{ type: "objective_completed", detail: "some_objective" }] },
  ],
}
```

### Story Flag Processing via `useSessionRouter`

When a prompt session exits with `triggerEvents`, `useSessionRouter.routeInput()` processes them:
1. Checks each event against `checkEmailDeliveries()` to deliver follow-up emails
2. Processes matching events to set story flags

This mirrors the story flag processing in `computeEffects()` (`applyResult.ts`) but handles events originating from prompt sessions rather than commands.

### `PromptSession` Input Handling

- **Digits**: Echoed to terminal, buffered
- **Enter**: Validates selection (1-N), resolves or shows error + re-prompts
- **Backspace**: Deletes last digit
- **Ctrl+C**: Cancels, returns to normal prompt

## Design Patterns

- **Immutable FS**: All mutations return new `VirtualFS` instances
- **Pure functions**: Utilities have no side effects
- **Event-driven delivery**: `GameEvent` union type triggers emails
- **Duplication prevention**: `deliveredIds` array tracked in persisted Zustand state
- **Maildir standard**: RFC-compatible layout (new/cur/sent)

## Narrative Email Reference

### NexaCorp Emails (`story/emails/nexacorp.ts`)

| ID | From | Trigger | Narrative Purpose |
|----|------|---------|-------------------|
| `welcome_edward` | Edward Torres | immediate | Establish CTO, mention Piper + Jin Chen |
| `it_provisioned` | NexaCorp IT | immediate | Teach `mail` command usage |
| `oscar_coder_setup` | Oscar Diaz | after reading `/srv/engineering/onboarding.md` | Unlocks the `coder` command (sets `coder_unlocked`) |
| `edward_paranoid` | Edward Torres | after reading `/srv/engineering/chen-handoff/notes.txt` | Casual check-in, supportive |
| `maya_welcome` | Maya Johnson | after reading `it_provisioned` | HR welcome, team culture |
| `edward_end_of_day` | Edward Torres | (complex trigger after Day 1 progress) | End-of-day debrief, hooks Chapter 3 |
| `jessica_welcome` | Jessica Liu | after reading `welcome_edward` | Cross-team welcome from another department |
| `tom_welcome` | Tom Park | after reading `welcome_edward` | Cross-team welcome from another department |

*Casual colleague interactions (Sarah, Oscar, Dana, Auri, Jordan) live primarily in Piper — see the piper skill.*

### Home PC Emails (`story/emails/home.ts`)

| ID | From | Trigger | Narrative Purpose |
|----|------|---------|-------------------|
| `job_board_alert` | Indeed Job Alerts | immediate | Job listings, NexaCorp featured |
| `backup_failure` | systemd | immediate | Surfaces a real bug in `~/scripts/backup.sh` for the backup quest (delivered via systemd `OnFailure=` notify template) |
| `nexacorp_offer` | Edward Torres | immediate | The job offer (accept/reject reply options) |
| `nexacorp_persuasion_1` | Edward Torres | after `rejected_nexacorp_1` objective | Sweetened deal after first rejection |
| `nexacorp_persuasion_2` | Edward Torres | after `rejected_nexacorp_2` objective | Final personal pitch after second rejection |
| `alex_good_news` | Alex Rivera | after `rejected_nexacorp_final` objective | Friend congratulates the player on (any) decision — soft landing for the dead end |
| `nexacorp_followup` | Edward Torres | after `accepted_nexacorp` objective | Triggers transition to NexaCorp |
| `chip_ssh_setup` | Edward Torres | after `accepted_nexacorp` objective | SSH onboarding instructions; reading it sets `ssh_unlocked` |

### Home PC Reply Flow (Offer → Rejection → Persuasion Chain)

The `nexacorp_offer` has two reply options: accept or reject.

**Accept path** (at any stage): triggers `accepted_nexacorp` → delivers `nexacorp_followup` and `chip_ssh_setup` → reading the followup triggers the home→NexaCorp transition.

**Rejection chain:**
1. **`nexacorp_offer`**: "I'm in! When do I start?" (`accepted_nexacorp`) / "Thanks, but I'll have to pass" (`rejected_nexacorp_1`)
2. **`nexacorp_persuasion_1`**: "Alright, you've convinced me" (`accepted_nexacorp`) / "I'm still going to pass" (`rejected_nexacorp_2`)
3. **`nexacorp_persuasion_2`**: "Okay, I'll give it a shot" (`accepted_nexacorp` + `salary_180k`) / "My answer is final — good luck" (`rejected_nexacorp_final`)

If the player rejects all three times (`rejected_nexacorp_final`), `alex_good_news` arrives as the soft landing — the recruitment thread closes but no transition happens.
