---
name: email
description: "How the in-game email/mail system works — Maildir filesystem layout, delivery triggers, email definitions, and the mail CLI command. Use this skill whenever adding new emails, modifying email triggers, working on the mail command, touching any files under src/engine/mail/ or src/story/emails/, or adding any kind of player notification or event-triggered message — even if it's triggered by another system like dbt."
---

# Email System

Delivers formal/system messages triggered by player actions, over a Maildir-compatible VirtualFS. **Casual team conversations use Piper instead** — see the **piper skill**.

Code map: `src/engine/mail/` (`types.ts` — all types, read them there; `emails.ts` routing dispatcher; `mailUtils.ts` parse/format/deliver/mark-read; `delivery.ts` event-based `checkEmailDeliveries` + the `GameEvent` union). Content in `src/story/emails/{home,nexacorp}.ts`. Inline replies use `src/engine/prompt/` (`PromptSession`). Command handler `commands/builtins/mail.ts`. Immediate emails seeded in `story/filesystem/nexacorp/index.ts` (`buildInitialMailFiles`) and `story/filesystem/home/system.ts` (`buildHomeMailFiles`). Delivery + prompt wiring in `useTerminal.ts` / `useSessionRouter.ts`.

## Triggers and events

`EmailTrigger` (union in `mail/types.ts`): `immediate`, `after_file_read`, `after_email_read`, `after_command`, `after_objective`, `after_story_flag`, `after_event_detail`. An array of triggers = any-of (first match wins). Several carry `requiredFlags` / `requireDelivered` gates.

- **`after_event_detail`** matches any `GameEvent` whose `type` and `detail` both equal the trigger's fields. Use it to fan one event type out to multiple emails keyed by `detail` — the three home termination emails all match the synthesized `{ type: "terminated", detail }` event fired by `runTerminationTransition` (see the narrative skill).
- The FS-mutation events (`directory_removed`, `file_created`, `file_modified`, `file_removed`) are emitted by the engine and consumed by story-flag triggers (e.g. `cleared_erik_known_hosts`); no email currently keys off them.

## Filesystem layout

`/var/mail/{username}/{new,cur,sent}/` (new = unread, moved to cur/ on read). Filenames `{seq:03d}_{slugified_subject}`; files are RFC 2822-style (`From:`/`To:`/`Date:`/`Subject:`/`Status:` + blank line + body).

## Delivery flow

Player command → `useTerminal` calls `checkEmailDeliveries()` with a `GameEvent` → matching `EmailDelivery` defs written to `new/` → `deliveredEmailIds` (persisted Zustand) prevents dupes → "You have new mail" notification.

**Trap — pass `storyFlags` through on re-seed.** `checkEmailDeliveries(fs, event, deliveredIds, computer?, storyFlags?)` routes home-vs-nexacorp by `computer` (default `"nexacorp"`; `"devcontainer"` = no mail). The `storyFlags` arg feeds `after_story_flag` matching AND flag-branched bodies (e.g. `marcus_board_debrief` selects one of four via `getMarcusDebrief(storyFlags)`). Callers that re-seed delivered emails (`gameStore.buildFs`'s `seedDeliveredEmails`, `useComputerTransitions`) **must** pass `storyFlags` so re-seeded bodies stay stable across FS rebuilds and save/load.

## Mail command

`mail` lists the inbox; `mail <n>` reads by seq (marks read); `mail -s "subject" recipient` composes.

## Reply options & inline prompts

An `EmailDelivery` can define `replyOptions` (numbered choices shown on read), integrating with `src/engine/prompt/`. Flow: `mail <n>` → mail command finds matching `replyOptions` → appends numbered options + returns a `promptSession` → `useTerminal` routes input → player picks a number → session saves the reply to `sent/`, fires `triggerEvents`, returns to prompt (Ctrl+C cancels). The reply's `Date:` is stamped from the live game clock (`gameNowFor()`) at pick time, not the original email's date.

When a prompt session exits with `triggerEvents`, `useSessionRouter.routeInput()` runs them through `checkEmailDeliveries()` (follow-up emails) and sets story flags — mirroring `computeEffects()` for events originating from prompts rather than commands.

## Character voice

Read `docs/characters.md` before writing email content — match each character's tone (Sarah casual/direct, Maya warm, Marcus bulleted/terse). Follow the em-dash rule (see narrative skill).

## Adding a new email

1. Define it in `story/emails/nexacorp.ts` (`getNexacorpEmailDefinitions`) or `home.ts` (`getHomeEmailDefinitions`) — an `EmailDelivery` with `email`, `trigger`, optional `replyOptions`.
2. Pick the trigger type for when it should arrive.
3. If it should arrive immediately, also seed it via `buildInitialMailFiles()` (NexaCorp) / `buildHomeMailFiles()` (home).

The full email roster (IDs, senders, triggers, narrative purpose) is the set of definitions in `story/emails/*.ts` — read them there rather than a mirror. The one flow worth stating: the home `nexacorp_offer` → accept (any stage) delivers `nexacorp_followup` + `chip_ssh_setup` and the followup-read triggers the transition; reject cascades through `nexacorp_persuasion_1` → `_2` → `rejected_nexacorp_final` (dead end, `alex_good_news` soft landing).
