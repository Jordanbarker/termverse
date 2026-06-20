import type { StoryFlags } from "../state/types";

const EDWARD_BODY = `It got ugly.

Jessica opened with the access-scope question. Edward didn't
have an answer ready. 

Tom pressed. Jessica pressed. Eventually Edward admitted he'd 
never personally reviewed the scope after the initial provisioning. 

Outcome: Edward keeps his title. He does NOT keep ownership of
Chip's access policy. Sarah is taking that over effective
tomorrow. There's an external audit of the chip_service_account
trail starting Monday. Series A due-diligence is paused 30 days
while we get the access story straight.

Edward stormed out before the meeting officially closed. He'll
be in tomorrow. It's going to be a quiet morning.

Thanks for being honest with me. I know that wasn't a fun read
to give. You called it the way it actually is.`;

const SARAH_BODY = `Tough one to write up.

I asked Oscar to spend an hour on Sarah before the meeting. Log
patterns, query history, anything that would back up the read.
He came back with nothing. Her credentials show no out-of-role
access. I owe her an apology. So do you, probably, the next time
you see her.

Here's the part you should know: Edward heard I'd been looking
at Sarah and he ran with it in the room. Tried to frame her as
the problem. Jessica wasn't buying (she's been around long
enough to recognize a deflection) but it muddied the water
enough that the access-scope conversation got tabled to next week.

Outcome: no decisions tonight. Edward bought himself a week. The
chip_service_account trail is still wide open. We're meeting
again next Friday. I'd like a cleaner read by then if you've got
one.

Bring me what you've actually got, not what feels like a fit.`;

const ERIK_BODY = `You were right.

I had Oscar pull the access trail before the meeting and we
walked Jessica through it cold. The evidence is clear that
Erik was using Chip to make Polymarket bets.

Erik denied it twice. Oscar locked out his account, and  
legal is taking it from here. There's enough on the
trail that this isn't an HR conversation anymore.

Edward took it harder than I expected. He hired Erik. He vouched
for him. He's going to need a minute. The board didn't fire him
but he's on a short leash now. His Q1 timeline got shortened by
two weeks and Sarah is taking Chip's access scope.

Series A diligence keeps moving. Jessica wanted me to thank you
directly. You probably saved us the round.`;

const NOBODY_BODY = `You called it. Process failure landed.

I framed it the way you put it: the doors were built that wide,
somebody walked through them, but the door is the problem.
Jessica liked the framing. Tom less so. He wanted a name to put
in front of the board. I told him names without evidence are how
companies turn into Theranos.

Outcome: no firings tonight. External audit of chip_service_account
starts Monday. Sarah is taking ownership of Chip's access policy
effective tomorrow. Edward gets to keep his title and his role,
but he's lost the access scope and he knows why. He didn't say a
word for the last twenty minutes of the meeting.

Series A diligence pauses 30 days while we get a clean access
story. Jessica thinks we'll close anyway. I think she's right.`;


const FOOTER = `

Get some sleep. Tomorrow is a different problem.

- Marcus
`;

export function getMarcusDebrief(flags: StoryFlags): string {
  const body = flags.accused_edward ? EDWARD_BODY
    : flags.accused_erik   ? ERIK_BODY
    : flags.accused_sarah  ? SARAH_BODY
    : NOBODY_BODY;
  return body + FOOTER;
}
