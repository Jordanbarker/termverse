import { file } from "@/engine/filesystem/builders";
import { ChipMenuItem } from "../../engine/chip/types";
import { StoryFlags, ComputerId } from "../../state/types";

const ALL_ITEMS: ChipMenuItem[] = [
  {
    id: "git_help",
    label: "Teach me git concepts/commands",
    condition: (flags, computer) => computer === "devcontainer",
    response:
      "A commit is a snapshot of your project at a point in time. " +
      "Each one has a unique hash (e.g. a3f2c1b), a message, an author, and a pointer to its parent commit." +
      "\n" +

      "\nStage changes" +
      "\n  git add app.py    # stage one file" +
      "\n  git add .         # stage everything" +
      "\n  git add -p        # interactively pick which parts of a file to stage" +
      "\n\n" +

      "Commit changes" +
      "\n  git commit -m fix/bug.    # commit with a message (-m)" +
      "\n  git commit -ma fix/bug    # commit with a message (-m) and auto-stage (-a)" +
      "\n\n" +

      "Browse history" +
      "\n git log               # full log with author, date, message" +
      "\n git log --oneline     # compact: one line per commit" +
      "\n\n" +
      
      "Branching" +
      "\n git branch            # list local branches" +
      "\n git branch -a         # list local + remote branches" +
      "\n git branch -d fix/bug # delete a branch (safe — won't delete if unmerged)" +
      "\n git branch -D fix/bug # force delete" + 
      "\n git switch main       # switch to existing branch" +
      "\n git switch -c fix/bug # create and switch to a new branch" +
      "\n git restore app.py     # discard changes to a file" +
      
      "See what changed" +
      "\n git status   # summary" +
      "\n git diff     # line-by-line" +
      "\n\n" +

      "Creating a feature branch:\n" +
      "  1. Create & switch to a branch\n" +
      "     git switch -c fix/my-fix\n" +
      "  2. Stage changed files\n" +
      "     git add <file>\n" +
      "  3. Commit your work\n" +
      "     git commit -m \"fix: ...\"\n" +
      "  4. Push the branch\n" +
      "     git push -u origin fix/my-fix",
  },
  {
    id: "clone_for_me",
    label: "Can you clone the repo for me?",
    condition: (_flags, computer) => computer === "devcontainer",
    response:
      "Sure thing!\n" +
      "\n" +
      "$ git clone nexacorp/nexacorp-analytics\n" +
      "Cloning into 'nexacorp-analytics'...\n" +
      "remote: Enumerating objects: 42\n" +
      "ERROR: Permission denied (publickey).\n" +
      "fatal: Could not read from remote " +
      "repository.\n" +
      "\n" +
      "Hmm, looks like I don't have access. " +
      "You'll need to run it yourself:\n" +
      "  git clone nexacorp/nexacorp-analytics",
  },
  {
    id: "nexacorp",
    label: "Tell me about NexaCorp",
    response:
      "NexaCorp builds AI-powered enterprise tools. I'm the flagship product — a chatbot " +
      "that handles internal processes, documentation, and system queries. The company was " +
      "founded by Jessica Langford, Marcus Reyes, Tom Chen, and Edward Torres. We're still " +
      "about 17 people right now, and growing fast.",
  },
  {
    id: "team",
    label: "Tell me about the team",
    response:
      "Let me pull that up...\n" +
      "\n" +
      "$ snow sql -q \"SELECT full_name, department FROM employees WHERE status = 'active'\"\n" +
      "\n" +
      "  Edward Torres      Executive\n" +
      "  Sarah Knight       Engineering\n" +
      "  Erik Lindstrom     Engineering\n" +
      "  Oscar Diaz         Engineering\n" +
      "  Auri Park          Engineering\n" +
      "  Soham Parekh       Engineering\n" +
      "  Cassie Moreau      Product\n" +
      "  Jordan Kessler     Marketing\n" +
      "  Dana Okafor        Operations\n" +
      "  Maya Johnson       People & Culture\n" +
      "\n" +
      "That's the current active roster. 10 people plus you. The founders " +
      "(Jessica, Marcus, Tom) are in the executive table but I pulled just the day-to-day team.",
  },
  {
    id: "jchen",
    label: "Why did Jin Chen leave?",
    response:
      "Let me check... Employee ID E031, Jin Chen. Department: Engineering. " +
      "Status: resigned, February 2026. That's all I have in the records. " +
      "HR would know more — I just see what's in the database.",
  },
  {
    id: "chip_sa",
    label: "What's the chip_service_account?",
    condition: (flags) => !!flags.found_chip_directives,
    response:
      "That's the service account I use for automated tasks — log rotation, " +
      "ticket triage, system monitoring. Standard stuff for any production service. " +
      "The credentials are shared with authorized engineering personnel for " +
      "maintenance and debugging.",
  },
  {
    id: "chip_access",
    label: "What can you access?",
    response:
      "I can query the Snowflake data warehouse, check system logs, manage tickets, " +
      "read team email, and help with documentation. I also handle some automated maintenance — " +
      "log rotation, monitoring, that kind of thing. If you need data from any of those systems, " +
      "just ask and I can run the query for you.",
  },
  {
    id: "null_sql_help",
    label: "How do I handle NULLs in SQL?",
    condition: (flags) => !!flags.dbt_test_failed_day2 && !flags.fixed_campaign_model,
    response:
      "There are a few ways to handle NULLs in SQL:\n\n" +
      "  COALESCE(value, 0)       Returns 0 if value is NULL\n" +
      "  IFNULL(value, 0)         Same as COALESCE for two args\n" +
      "  CASE WHEN ... END        Full conditional logic\n" +
      "  WHERE col IS NOT NULL    Filter out NULL rows\n\n" +
      "For conversion_rate, you probably want COALESCE around the\n" +
      "columns used in the calculation — that way NULL clicks or\n" +
      "conversions become 0 instead of making the whole result NULL.",
  },
  {
    id: "push_branch_help",
    label: "How do I push changes on a branch?",
    condition: (flags) => !!flags.fixed_campaign_model && !flags.pushed_fix_branch,
    response:
      "Here's the typical git workflow for pushing a branch:\n\n" +
      "  git add <file>               Stage your changes\n" +
      "  git commit -m \"description\"   Commit with a message\n" +
      "  git push -u origin <branch>   Push and set upstream\n\n" +
      "If you haven't created a branch yet:\n" +
      "  git switch -c fix/my-fix      Create and switch to branch\n\n" +
      "The -u flag on push sets the upstream tracking, so future\n" +
      "pushes just need 'git push'.",
  },
  {
    id: "exit",
    label: "Exit",
    response: "",
  },
];

export function getMenuItems(storyFlags: StoryFlags, computer: ComputerId): ChipMenuItem[] {
  return ALL_ITEMS.filter(
    (item) => !item.condition || item.condition(storyFlags, computer)
  );
}
