import { EmailDelivery, ReplyOption } from "../../engine/mail/types";
import { PLAYER } from "../player";

export const HOME_EMAIL_IDS = [
  "job_board_alert",
  "backup_failure",
  "nexacorp_offer",
  "nexacorp_persuasion_1",
  "nexacorp_persuasion_2",
  "alex_good_news",
  "nexacorp_followup",
  "chip_ssh_setup",
] as const;
export type HomeEmailId = (typeof HOME_EMAIL_IDS)[number];

const nexacorpOfferReplyOptions: ReplyOption[] = [
  {
    label: "I'm in! When do I start?",
    replyBody: `Hi Edward,\n\nThanks so much for the offer! I'm really excited about the opportunity.\nI can start Monday — just let me know what I need to bring.\n\nLooking forward to it!`,
    triggerEvents: [
      { type: "objective_completed", detail: "accepted_nexacorp" },
    ],
  },
  {
    label: "Thanks, but I'll have to pass",
    replyBody: `Hi Edward,\n\nI appreciate the offer, but I've decided to go a different direction.\nThanks for considering me, and best of luck filling the role.\n\nBest regards`,
    triggerEvents: [
      { type: "objective_completed", detail: "rejected_nexacorp_1" },
    ],
  },
];

const persuasion1ReplyOptions: ReplyOption[] = [
  {
    label: "Alright, you've convinced me",
    replyBody: `Hi Edward,\n\nYou make a good case. I'll admit the signing bonus doesn't hurt either.\nCount me in — I can start Monday.\n\nThanks for following up.`,
    triggerEvents: [
      { type: "objective_completed", detail: "accepted_nexacorp" },
    ],
  },
  {
    label: "I'm still going to pass",
    replyBody: `Hi Edward,\n\nI appreciate you sweetening the deal, but my answer is the same.\nI hope you find a great fit for the team.\n\nBest`,
    triggerEvents: [
      { type: "objective_completed", detail: "rejected_nexacorp_2" },
    ],
  },
];

const persuasion2ReplyOptions: ReplyOption[] = [
  {
    label: "Okay, I'll give it a shot",
    replyBody: `Hi Edward,\n\nOkay, you win. I can't say no to a personal appeal like that.\nI'll start Monday.`,
    triggerEvents: [
      { type: "objective_completed", detail: "accepted_nexacorp" },
      { type: "objective_completed", detail: "salary_180k" },
    ],
  },
  {
    label: "My answer is final — good luck",
    replyBody: `Hi Edward,\n\nI've made up my mind. I wish you and the team the best,\nbut this isn't the right move for me.\n\nTake care.`,
    triggerEvents: [
      { type: "objective_completed", detail: "rejected_nexacorp_final" },
    ],
  },
];

export function getHomeEmailDefinitions(username: string): EmailDelivery[] {
  return [
    // === Immediate emails (seeded at game start) ===
    {
      email: {
        id: "job_board_alert",
        from: "Indeed Job Alerts <alerts@indeed.com>",
        to: `${username}@email.com`,
        date: "Fri, 20 Feb 2026 09:00:00",
        subject: "3 new AI Engineer jobs in your area",
        body: `JOB ALERT — AI Engineer
========================

Based on your recent searches:

1. AI Engineer — NexaCorp
   Location: Portland, OR (Remote)
   Salary: Competitive
   Posted: 6 days ago
   "Join our innovative team and work directly with our AI assistant
    platform. Immediate start."

2. Junior ML Engineer — Cascade Analytics
   Location: Seattle, WA (Remote)
   Salary: $95K-$115K
   Posted: 1 week ago

3. AI Research Intern — University of Oregon
   Location: Eugene, OR
   Salary: Stipend
   Posted: 3 days ago

──────────────────────────────
Manage alerts: indeed.com/alerts
`,
      },
      trigger: { type: "immediate" },
    },

    // systemd OnFailure= notification — backup.service failure
    {
      email: {
        id: "backup_failure",
        from: `systemd <root@maniac-iv>`,
        to: `${username}@maniac-iv`,
        date: "Sat, 21 Feb 2026 02:01:00",
        subject: `[maniac-iv] backup.service failed`,
        body: `Unit:   backup.service
Result: failed (exit-code)
Time:   Sat 2026-02-21 02:00:14 PST

-- journalctl --user -u backup.service --
Feb 21 02:00:12 maniac-iv backup.sh[4821]: [Sat Feb 21 02:00:12 PST 2026] Starting backup...
Feb 21 02:00:14 maniac-iv backup.sh[4821]: /home/${username}/scripts/backup.sh: line 19: BAKCUP_DIR: unbound variable
Feb 21 02:00:14 maniac-iv systemd[1842]: backup.service: Main process exited, code=exited, status=1/FAILURE
Feb 21 02:00:14 maniac-iv systemd[1842]: backup.service: Failed with result 'exit-code'.
`,
      },
      trigger: { type: "immediate" },
    },

    // === Triggered emails ===

    {
      email: {
        id: "nexacorp_offer",
        from: "Edward Torres <edward@nexacorp.com>",
        to: `${username}@email.com`,
        date: "Sat, 21 Feb 2026 08:30:00",
        subject: "Job Offer — AI Engineer at NexaCorp",
        body: `Hi there,

I really enjoyed our conversation and I'll cut right to it: we'd like to offer you the AI Engineer position
at NexaCorp. The details:

  Role:       AI Engineer
  Salary:     $135,000/year
  Start:      Monday, February 23
  Location:   Remote
  Reports to: Edward Torres

I know this is quick, but we're in a bit of a crunch.
We need someone who can start right away and hit the ground running, and we think you're the right person for the job.

Reply to this email and we'll get everything set up for Monday.

Looking forward to hearing from you!

Best,
Edward Torres
CTO & Co-Founder, NexaCorp
`,
      },
      trigger: { type: "immediate" },
      replyOptions: nexacorpOfferReplyOptions,
    },

    // Edward's persuasion #1 — after first rejection
    {
      email: {
        id: "nexacorp_persuasion_1",
        from: "Edward Torres <edward@nexacorp.com>",
        to: `${username}@email.com`,
        date: "Sat, 21 Feb 2026 11:15:00",
        subject: "Re: Job Offer — Hear me out",
        body: `I totally understand — no pressure. But before you close the door,
I wanted to throw a couple things out there:

  - We're bumping the offer to $155K + a $5K signing bonus
  - Fully remote, flexible hours — you set your own schedule
  - The AI stack is genuinely interesting. You'd have a lot of autonomy

I know the timeline is aggressive, but I think you'd be a great fit. Let me know if you would reconsider.

— Edward
`,
      },
      trigger: { type: "after_objective", objectiveId: "rejected_nexacorp_1" },
      replyOptions: persuasion1ReplyOptions,
    },

    // Edward's persuasion #2 — after second rejection
    {
      email: {
        id: "nexacorp_persuasion_2",
        from: "Edward Torres <edward@nexacorp.com>",
        to: `${username}@email.com`,
        date: "Sat, 21 Feb 2026 14:30:00",
        subject: "Re: Job Offer — Last ask, I promise",
        body: `Okay, I hear you — and I promise this is my last email about it.

Look, I'll be honest with you. We're a small team and we're struggling.
Our AI platform is live, customers depend on it. 

You're exactly the person we need.

$180K, $10K signing bonus, and I'll personally make sure you have
everything you need to succeed. 

This is our final offer, let me know if you have any questions.

— Edward
`,
      },
      trigger: { type: "after_objective", objectiveId: "rejected_nexacorp_2" },
      replyOptions: persuasion2ReplyOptions,
    },

    // Alex's happy ending — after final rejection
    {
      email: {
        id: "alex_good_news",
        from: "Alex Rivera <alex.r@email.com>",
        to: `${username}@email.com`,
        date: "Sun, 22 Feb 2026 10:30:00",
        subject: "so... good news?",
        body: `Hey!!

Okay so remember that CortexLab application you said was a
long shot? THEY WANT TO INTERVIEW YOU. I just saw the email
come through (you still have notifications forwarding to me
from when you were traveling, btw — you should fix that).

Anyway — they're doing really interesting work on interpretable
ML, small team, and from what I can tell the culture is actually
good. Like, Glassdoor-reviews-written-by-humans good.

You dodged a bullet with NexaCorp anyway. Something about that
place felt off. Trust your gut.

Go crush that interview. I believe in you.

— Alex

P.S. Drinks are on you when you get the offer.
`,
      },
      trigger: { type: "after_objective", objectiveId: "rejected_nexacorp_final" },
    },

    // Edward's follow-up after the player replies to the offer
    {
      email: {
        id: "nexacorp_followup",
        from: "Edward Torres <edward@nexacorp.com>",
        to: `${username}@email.com`,
        date: "Sat, 21 Feb 2026 19:00:00",
        subject: "Re: Job Offer — Welcome to the team!",
        body: `Awesome! Really glad to have you on board.

Chip will send you remote access details — you'll be able to SSH
into your workstation from home to get a head start.

— Edward
`,
      },
      trigger: { type: "after_objective", objectiveId: "accepted_nexacorp" },
    },
    // Chip's SSH setup email — arrives with Edward's follow-up
    {
      email: {
        id: "chip_ssh_setup",
        from: "Chip <chip@nexacorp.com>",
        to: `${username}@email.com`,
        date: "Sat, 21 Feb 2026 19:05:00",
        subject: "Your NexaCorp workstation is ready!",
        body: `Hi ${PLAYER.displayName}! I'm Chip, NexaCorp's AI assistant. This
is an automated welcome from the onboarding workflow.

Edward has provisioned your workstation and your SSH public key has
been added to your account. Access details:

  Host:     nexacorp-ws01.nexacorp.internal
  Username: ${username}
  Auth:     Key-based

To connect, run:

  ssh ${username}@nexacorp-ws01.nexacorp.internal

Pro tip: you can set up a shortcut so you only have to type
"ssh nexacorp" to connect. Just add this to your ~/.ssh/config:

  Host nexacorp
    HostName nexacorp-ws01.nexacorp.internal
    User ${username}

Then just type: ssh nexacorp

When you connect for the first time, you'll see a host key
verification prompt — just type "yes" to confirm.

Once you're logged in, type \`chip\` from your terminal to ask me
anything.

— Chip
  NexaCorp AI Platform
`,
      },
      trigger: { type: "after_objective", objectiveId: "accepted_nexacorp" },
    },
  ];
}
