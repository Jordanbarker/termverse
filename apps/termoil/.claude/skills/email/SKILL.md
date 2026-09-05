---
name: email
description: "How the in-game email/mail system works — Maildir filesystem layout, delivery triggers, email definitions, and the mail CLI command. Use this skill whenever adding new emails, modifying email triggers, working on the mail command, touching any files under src/engine/mail/ or src/story/emails/, or adding any kind of player notification or event-triggered message — even if it's triggered by another system like dbt."
---

# Email System

Delivers formal/system messages triggered by player actions, over a Maildir-compatible VirtualFS. **Casual team conversations use Piper instead** — see the **piper skill**.

Code map: `src/engine/mail/` (`types.ts` — all types, read them there; `emails.ts` routing dispatcher; `mailUtils.ts` parse/format/deliver/mark-read; `delivery.ts` event-based `checkEmailDeliveries`; the `GameEvent` union itself is core's `packages/core/src/gameEvent.ts`, re-exported here). Content in `src/story/emails/{home,nexacorp}.ts`. Inline replies use `src/engine/prompt/` (`PromptSession`). Command handler `commands/builtins/mail.ts`. Immediate emails seeded in `story/filesystem/nexacorp/index.ts` (`buildInitialMailFiles`) and `story/filesystem/home/system.ts` (`buildHomeMailFiles`). Delivery + prompt wiring in `useTerminal.ts` / `useSessionRouter.ts`.

## Triggers and events

`EmailTrigger` is a union in `mail/types.ts` — read the variants there. An array of triggers = any-of (first match wins); several carry `requiredFlags` / `requireDelivered` gates.

- **`after_event_detail`** matches any `GameEvent` whose `type` and `detail` both equal the trigger's fields — use it to fan one event type out to multiple emails keyed by `detail` (the three termination emails all match the synthesized `{ type: "terminated", detail }` event; see the narrative skill).
- The FS-mutation events (`directory_removed`, `file_created`, `file_modified`, `file_removed`) are emitted by the engine and consumed by story-flag triggers; no email currently keys off them.

## Filesystem layout

`/var/mail/{username}/{new,cur,sent}/` (new = unread, moved to cur/ on read). Inbox filenames `{seq:03d}_{email id}` (built by `mailFilename`) — the id, not the subject, because subjects aren't unique (the three termination variants share one). `MailEntry.slug` is that id, and `mail <n>` derives the `file_read` event from it (falling back to subject+from only for a hand-written or renamed file). `sent/` replies are `sent_{parent email id}_{option index}`, **never clock-stamped** (the in-game clock is constant across a day segment, so timestamped names would let one reply overwrite another). This is the **prompt** reply path only: `mail -s` writes `sent_<epoch ms>` and no `X-In-Reply-To` header, which is exactly why a hand-composed message can't swallow a pending reply prompt (see below). Files are RFC 2822-style. `getMailEntries` only counts a file with a `From:` or `Subject:` header as a message, so a scratch file in the maildir is a stray file, not a blank inbox row.

## Delivery flow

Player command → `useTerminal` calls `checkEmailDeliveries()` with a `GameEvent` → matching `EmailDelivery` defs written to `new/` → `deliveredEmailIds` (persisted Zustand) prevents dupes → "You have new mail" notification.

**Immediate emails self-heal.** They are baked into the seed maildir and never re-delivered, so `checkEmailDeliveries` restores a missing `new/` directory and re-delivers any immediate email that is gone from the maildir *and* has not yet served its purpose. `isImmediateEmailSpent` in `mail/delivery.ts` reads that purpose off the definitions via `getEmailDependents` (never a hardcoded id list): a **consequential reply** (options carrying `triggerEvents`) is spent only once the reply is in `sent/`; otherwise any discharged dependent (a `file_read` story flag keyed on its id, or a follow-up delivered by `after_email_read`) proves it was opened. An `after_email_read` **piper** dependent counts but cannot discharge (`deliveredPiperIds` doesn't reach this layer), so such an email is restored whenever missing. An email with **no** dependents is spent from the start — deleting pure flavor is permanent. Presence is keyed on the delivered filename slug first, `Subject:` second, so editing a subject can't produce a duplicate delivery. Healed ids ride out in `newDeliveries` because callers only keep the returned FS when that array is non-empty.

**Trap — pass `storyFlags` through on re-seed.** `checkEmailDeliveries(fs, event, deliveredIds, computer?, storyFlags?)` routes home-vs-nexacorp by `computer` (default `"nexacorp"`; `"devcontainer"` = no mail). The `storyFlags` arg feeds `after_story_flag` matching AND flag-branched bodies (e.g. `marcus_board_debrief` selects one of four via `getMarcusDebrief(storyFlags)`). Callers that re-seed delivered emails (`saveManager.buildFs` → `replayMailHistory`, `useComputerTransitions`) **must** pass `storyFlags` so re-seeded bodies stay stable across rebuilds and save/load.

## Mail command

`mail` lists the inbox; `mail <n>` reads by seq (marks read); `mail -s "subject" recipient` composes.

## Reply options & inline prompts

An `EmailDelivery` can define `replyOptions` (numbered choices shown on read), integrating with `src/engine/prompt/`. Flow: `mail <n>` → matching `replyOptions` appended + a `promptSession` returned → player picks a number → session saves the reply to `sent/`, fires `triggerEvents`, returns to prompt (Ctrl+C cancels). The reply's `Date:` is stamped from the live game clock at pick time.

When a prompt session exits with `triggerEvents`, `useSessionRouter.routeInput()` runs them through `checkEmailDeliveries()` and sets story flags — mirroring `computeEffects()` for events originating from prompts.

**Reply dedup is id-based, not subject-based.** `PromptSession` writes an `X-In-Reply-To: <parent email id>` header into the `sent/` file (`ReplyEmail.inReplyTo` → `formatEmailContent`), and `hasReplyToEmail()` matches on that header — a player-composed `mail -s "Re: <subject>"` carries no header and can't swallow a real reply prompt. Any other code that writes a reply to `sent/` must go through `formatEmailContent` with `inReplyTo` set, or the prompt reappears. The filename itself is free: prompt replies use `PromptOption.replyFilename`; `state/mailHistory.ts` replays them as `sent_replay_<parent id>`.

## Character voice

Read `apps/termoil/docs/characters.md` before writing email content — match each character's tone. Follow the em-dash rule (see narrative skill).

## Adding a new email

1. Define it in `story/emails/nexacorp.ts` (`getNexacorpEmailDefinitions`) or `home.ts` (`getHomeEmailDefinitions`) — an `EmailDelivery` with `email`, `trigger`, optional `replyOptions`.
2. Pick the trigger type for when it should arrive.
3. If immediate, also seed it via `buildInitialMailFiles()` (NexaCorp) / `buildHomeMailFiles()` (home).

The full email roster is the set of definitions in `story/emails/*.ts` — read them there. The one flow worth stating: the home `nexacorp_offer` → accept delivers `nexacorp_followup` + `chip_ssh_setup`, and the followup-read triggers the transition; reject cascades `nexacorp_persuasion_1` → `_2` → `rejected_nexacorp_final` (dead end, `alex_good_news` soft landing).
