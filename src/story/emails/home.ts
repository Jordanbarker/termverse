import { EmailDelivery, ReplyOption } from "../../engine/mail/types";
import { PLAYER } from "../player";
import { StoryFlags } from "../../state/types";
import { getMarcusDebrief } from "../marcusDebrief";

export const HOME_EMAIL_IDS = [
  "job_board_alert",
  "backup_failure",
  "nexacorp_offer",
  "nexacorp_persuasion_1",
  "nexacorp_persuasion_2",
  "alex_good_news",
  "nexacorp_followup",
  "chip_ssh_setup",
  "marcus_board_debrief",
  "hr_security_freeze",
  "termination_log_tampering",
  "termination_leadership_destruction",
  "termination_exfiltration",
] as const;
export type HomeEmailId = (typeof HOME_EMAIL_IDS)[number];

const nexacorpOfferReplyOptions: ReplyOption[] = [
  {
    label: "I'm in! When do I start?",
    replyBody: `Hi Edward,\n\nThanks so much for the offer! I'm really excited about the opportunity.\nI can start Monday. Just let me know what I need to bring.\n\nLooking forward to it!`,
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
    replyBody: `Hi Edward,\n\nYou make a good case. I'll admit the signing bonus doesn't hurt either.\nCount me in. I can start Monday.\n\nThanks for following up.`,
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
    label: "My answer is final. Good luck",
    replyBody: `Hi Edward,\n\nI've made up my mind. I wish you and the team the best,\nbut this isn't the right move for me.\n\nTake care.`,
    triggerEvents: [
      { type: "objective_completed", detail: "rejected_nexacorp_final" },
    ],
  },
];

const chipSshSetupReplyOptions: ReplyOption[] = [
  {
    label: "Thanks, looking forward to it!",
    replyBody: `Hi Chip,\n\nThanks for the setup info. I'll get connected.`,
  },
  {
    label: "Can you send me the host key fingerprint so I can verify?",
    replyBody: `Hi Chip,\n\nBefore I connect, can you send me the SHA256 host key\nfingerprint for nexacorp-ws01.nexacorp.internal so I can\nverify it matches what the prompt shows? I'd rather not\ntype "yes" without checking.\n\nThanks`,
  },
];

export function getHomeEmailDefinitions(username: string, storyFlags?: StoryFlags): EmailDelivery[] {
  return [
    // === Immediate emails (seeded at game start) ===
    {
      email: {
        id: "job_board_alert",
        from: "Indeed Job Alerts <alerts@indeed.com>",
        to: `${username}@email.com`,
        date: "Fri, 20 Feb 2026 09:00:00",
        subject: "3 new AI Engineer jobs in your area",
        body: `JOB ALERT: AI Engineer
========================

Based on your recent searches:

1. AI Engineer at NexaCorp
   Location: Portland, OR (Remote)
   Salary: Competitive
   Posted: 6 days ago
   "Join our innovative team and work directly with our AI assistant
    platform. Immediate start."

2. Junior ML Engineer at Cascade Analytics
   Location: Seattle, WA (Remote)
   Salary: $95K-$115K
   Posted: 1 week ago

3. AI Research Intern at University of Oregon
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
        subject: "Job Offer: AI Engineer at NexaCorp",
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
        subject: "Re: Job Offer, hear me out",
        body: `Before you close the door, let me make the case:

  - $155K + $5K signing bonus
  - Fully remote, flexible hours; you set your own schedule
  - The AI stack is genuinely interesting, and you'd have a lot of autonomy on day one

Aggressive timeline, I know. But this is a real fit. Get back to me by end of week.

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
        subject: "Re: Job Offer, last ask I promise",
        body: `Last one, then I'm out of your inbox.

$180K, $10K signing bonus. Fully remote, flexible hours.

Look, I don't normally chase candidates twice. The AI stack is genuinely good, the autonomy is real, and we need someone in this seat before next quarter. You're the closest match I've seen in a month of looking.

That's the offer. Yes or no, no hard feelings either way.

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
from when you were traveling, btw; you should fix that).

Anyway, they're doing really interesting work on interpretable
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
        subject: "Re: Job Offer, welcome to the team!",
        body: `Awesome! Really glad to have you on board.

Chip will send you remote access details. You'll be able to SSH
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
verification prompt. Just type "yes" to confirm.

Once you're logged in, type \`chip\` from your terminal to ask me
anything.

— Chip
  NexaCorp AI Platform
`,
      },
      trigger: { type: "after_objective", objectiveId: "accepted_nexacorp" },
      replyOptions: chipSshSetupReplyOptions,
    },

    // Marcus's branched board-meeting debrief — arrives after the player runs
    // `exit` from NexaCorp on Day 2 (after accusation_made). Body branches on
    // which suspect was named.
    {
      email: {
        id: "marcus_board_debrief",
        from: "Marcus Reyes <marcus.reyes@nexacorp.io>",
        to: `${username}@email.com`,
        date: "Tue, 24 Feb 2026 21:14:00",
        subject: "tonight's meeting",
        body: getMarcusDebrief(storyFlags ?? {}),
      },
      trigger: {
        type: "after_story_flag",
        flag: "returned_home_day2",
        requiredFlags: ["accusation_made"],
      },
    },

    // IT Security alert — arrives at home alongside marcus_board_debrief if
    // the player pivoted to Erik's PC and left the known_hosts entry on
    // chipinfra. tracks_exposed_chapter4 is set by the content-scan in
    // useComputerTransitions.runExitToHome just before chipinfra teardown.
    // A clean scrub (rm/nano/> on ~/.ssh/known_hosts before logoff) suppresses.
    {
      email: {
        id: "hr_security_freeze",
        from: "NexaCorp IT Security <security@nexacorp.io>",
        to: `${username}@email.com`,
        date: "Tue, 24 Feb 2026 21:18:00",
        subject: "Unusual activity on your workstation: access frozen",
        body: `Hello,

Our SIEM flagged anomalous SSH activity originating from your
NexaCorp dev container (10.20.0.18) earlier today, including a
session to an employee-personal device with no business
justification on file.${storyFlags?.accused_erik ? `

The session targeted the same employee you raised concerns
about with Marcus today, which compounds the review urgency.` : ""}

As a precaution, your workstation access has been suspended
pending review. Please do not attempt to log in until we contact
you tomorrow morning.

If you believe this was triggered in error, reply to this thread.

— NexaCorp IT Security
`,
      },
      trigger: {
        type: "after_story_flag",
        flag: "returned_home_day2",
        requiredFlags: ["pivoted_to_erik_pc", "tracks_exposed_chapter4"],
      },
    },

    // Termination emails — delivered by runTerminationTransition after a
    // security tripwire (rm/chmod/redirect on protected log paths, rm/chmod
    // on /srv/leadership/, or cp/mv of leadership material to player's home).
    // Exactly one fires per playthrough, chosen by the SecurityViolation kind
    // surfaced via the synthesized `terminated` event.
    {
      email: {
        id: "termination_log_tampering",
        from: "NexaCorp HR <hr@nexacorp.io>",
        to: `${username}@email.com`,
        date: "Tue, 24 Feb 2026 14:32:00",
        subject: "Termination of Employment — Effective Immediately",
        body: `${PLAYER.displayName},

This notice confirms the termination of your employment with NexaCorp,
effective immediately. File integrity monitoring on workstation
nexacorp-ws01 recorded unauthorized modification of system audit logs
under /var/log/ earlier today. Tampering with audit records is
categorized as gross misconduct under Section 4.1 of the Employee
Handbook and is grounds for immediate dismissal.

Your workstation, VPN, and Coder credentials have been revoked. A
legal-hold notice covering your personal devices and accounts has
been issued; please preserve all NexaCorp-related material pending
further instruction from outside counsel.

Your final paycheck, including any accrued PTO, will be processed
via ACH within five business days.

HR Department
NexaCorp
`,
      },
      trigger: { type: "after_event_detail", eventType: "terminated", detail: "log_tampering" },
    },

    {
      email: {
        id: "termination_leadership_destruction",
        from: "NexaCorp HR <hr@nexacorp.io>",
        to: `${username}@email.com`,
        date: "Tue, 24 Feb 2026 14:32:00",
        subject: "Termination of Employment — Effective Immediately",
        body: `${PLAYER.displayName},

This notice confirms the termination of your employment with NexaCorp,
effective immediately. Earlier today, NexaCorp recorded the
destruction of confidential corporate records under /srv/leadership/
from your workstation session. This violates Section 4.2 of the
Employee Handbook (Misuse of Company Assets) and constitutes gross
misconduct.

The destroyed materials included investor and board documentation
covered by ongoing securities and audit obligations. Outside counsel
has been engaged to evaluate disclosure requirements; you may be
contacted directly by their office.

Your workstation, VPN, and Coder credentials have been revoked. All
NexaCorp-related material on your personal devices is subject to a
legal hold effective immediately. Final pay and accrued PTO will be
processed via ACH within five business days.

HR Department
NexaCorp
`,
      },
      trigger: { type: "after_event_detail", eventType: "terminated", detail: "leadership_destruction" },
    },

    {
      email: {
        id: "termination_exfiltration",
        from: "NexaCorp HR <hr@nexacorp.io>",
        to: `${username}@email.com`,
        date: "Tue, 24 Feb 2026 14:32:00",
        subject: "Termination of Employment — Effective Immediately",
        body: `${PLAYER.displayName},

This notice confirms the termination of your employment with NexaCorp,
effective immediately. NexaCorp's data loss prevention controls
recorded the transfer of confidential financial and HR materials
from /srv/leadership/ to personal storage on your workstation. This
is a direct violation of the Non-Disclosure Agreement you executed at
hire and Section 6.1 of the Employee Handbook.

Outside counsel has been retained and civil action under the NDA and
applicable trade-secret statutes is under active consideration. You
are directed to preserve, and not to access, copy, transmit, or
delete any of the affected materials pending further instruction.

Your workstation, VPN, and Coder credentials have been revoked.
Final pay and accrued PTO will be processed via ACH within five
business days.

HR Department
NexaCorp
`,
      },
      trigger: { type: "after_event_detail", eventType: "terminated", detail: "exfiltration" },
    },
  ];
}
