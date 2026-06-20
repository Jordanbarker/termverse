import { EmailDelivery } from "../../engine/mail/types";
import { PLAYER } from "../player";

export const NEXACORP_EMAIL_IDS = [
  "welcome_edward",
  "it_provisioned",
  "oscar_coder_setup",
  "edward_paranoid",
  "maya_welcome",
  "edward_end_of_day",
  "jessica_welcome",
  "tom_welcome",
] as const;
export type NexacorpEmailId = (typeof NEXACORP_EMAIL_IDS)[number];

export function getNexacorpEmailDefinitions(username: string): EmailDelivery[] {
  return [
  // === Immediate emails (seeded at game start) ===
  {
    email: {
      id: "welcome_edward",
      from: "Edward Torres <edward@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 07:45:00",
      subject: "Welcome aboard!",
      body: `Hey!

So glad you're here, we've been looking forward to getting you
on board. Your onboarding buddy Auri Park will reach out on
Piper. She's been running the data side of things and will
help you get oriented.

Your first priority is just getting familiar with the system.
Here are a couple things to check out first:

  /srv/engineering/onboarding.md
  /srv/engineering/team-info.md

We use Piper for team chat. Type 'piper' to check it out.

Welcome to the team!

- Edward Torres
  CTO & Co-Founder
  NexaCorp Inc.
`,
    },
    trigger: { type: "immediate" },
    replyOptions: [
      {
        label: "Thanks! Happy to be here.",
        replyBody: `Hey Edward,

Thanks so much! Really excited to get started. The team seems
great and I'm looking forward to diving in.

Let me know when you'd like to chat about that first project!`,
      },
      {
        label: "Anything I should watch out for?",
        replyBody: `Hey Edward,

Appreciate the welcome! Quick question: any unwritten rules,
office quirks, or things I should know that aren't in the
onboarding docs?

Want to make sure I don't step on any landmines my first week.`,
      },
    ],
  },
  {
    email: {
      id: "it_provisioned",
      from: "NexaCorp IT <it@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 08:00:00",
      subject: "Account provisioned",
      body: `Your NexaCorp workstation account has been provisioned.

  Username:     ${username}
  Hostname:     nexacorp-ws01
  Home:         /home/${username}
  Shell:        /bin/zsh
  Mail:         /var/mail/${username}

If you have any issues, email it@nexacorp.com.

— NexaCorp IT Department
`,
    },
    trigger: { type: "immediate" },
  },
  // === Triggered emails ===
  {
    email: {
      id: "oscar_coder_setup",
      from: "Oscar Diaz <oscar@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 09:15:00",
      subject: "Your Coder workspace is ready",
      body: `Hey! I set up your Coder workspace as part of onboarding. Just connect with:

  coder ssh ai

It's got dbt, snow (Snowflake CLI), and python pre-installed.
Auri can walk you through the analytics pipeline when you're ready.

Type 'exit' to disconnect and get back to your workstation.
Let me know if you hit any issues!

- Oscar
`,
    },
    trigger: { type: "after_file_read", filePath: "/srv/engineering/onboarding.md" },
  },
  {
    email: {
      id: "edward_paranoid",
      from: "Edward Torres <edward@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 10:15:00",
      subject: "Handoff notes",
      body: `Hey,

Just wanted to flag: the handoff notes in /srv/engineering/chen-handoff/
were written in kind of a hurry, so they might not be the most
polished. Take them with a grain of salt.

If anything in there is confusing or doesn't match what you're
seeing, just let me know. Happy to fill in context where I can.

- Edward
`,
    },
    trigger: { type: "after_file_read", filePath: `/srv/engineering/chen-handoff/notes.txt` },
  },

  // === New employee welcome emails (staggered after boot) ===
  {
    email: {
      id: "maya_welcome",
      from: "Maya Johnson <maya@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 08:30:00",
      subject: "Welcome from People & Culture!",
      body: `Hi there!

I'm Maya, People & Culture Lead here at NexaCorp. Welcome aboard!

A few onboarding items for your first week:

  [ ] Review the employee handbook (it's in your Documents folder)
  [ ] Benefits enrollment (you have 30 days from your start date).
  [ ] Complete tax documents (I'll send the portal link separately.)

Other things to know:
  - Company town hall is Fridays at noon
  - PTO is flexible after your first 60 days; just give your manager a heads up

One more thing: we pair every new hire with an onboarding buddy
to help you get oriented. I've paired you with Auri Park on the
data engineering team. She'll reach out on Piper to say hi!

I know that's a lot of checkboxes for day one. Don't stress
about it. None of it's due today. Just settle in, meet folks,
and come find me if you need anything. I mean that!

- Maya Johnson
  People & Culture Lead
  NexaCorp Inc.
`,
    },
    trigger: { type: "after_email_read", emailId: "it_provisioned" },
  },

  // === Handoff emails ===
  {
    email: {
      id: "edward_end_of_day",
      from: "Edward Torres <edward@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 17:00:00",
      subject: "End of day 1",
      body: `Hey,

Great first day! Auri mentioned you already ran a full build on
the analytics pipeline. Great to see you getting up to speed
on the data side.

- Edward
`,
    },
    trigger: {
      type: "after_story_flag",
      flag: "auri_dbt_reported",
      requiredFlags: ["read_team_info", "oscar_access_completed"],
    },
  },

  // === Light-tier founder emails (after reading Edward's welcome) ===
  {
    email: {
      id: "jessica_welcome",
      from: "Jessica Langford <jessica@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 08:45:00",
      subject: "Welcome",
      body: `${PLAYER.displayName},

Edward speaks highly of you. Welcome to the team.

Jessica
`,
    },
    trigger: { type: "after_email_read", emailId: "welcome_edward" },
  },
  {
    email: {
      id: "tom_welcome",
      from: "Tom Chen <tom@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 08:50:00",
      subject: "Welcome to NexaCorp!",
      body: `Hey ${PLAYER.displayName}!

Tom here, CMO and co-founder. Just wanted to personally
welcome you aboard. Edward's been singing your praises and
we're thrilled to have you.

We're building something really special here and I think
you're going to love it. If you ever want to grab virtual
coffee and hear the origin story, my door is always open!

Happy first day!
- Tom
`,
    },
    trigger: { type: "after_email_read", emailId: "welcome_edward" },
  },
];
}
