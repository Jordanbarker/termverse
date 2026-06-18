import { DirectoryNode, FileNode } from "@tt/core/filesystem/types";
import { PLAYER } from "../../../state/types";
import { file, dir } from "@tt/core/filesystem/builders";

export function buildDotfiles(
  username: string
): Record<string, DirectoryNode | FileNode> {
  return {
    ".zshrc": file(".zshrc", `# ~/.zshrc

PROMPT='%B%F{green}%n@home%f:%F{blue}%~%f%b%# '
bindkey -e

setopt HIST_IGNORE_DUPS SHARE_HISTORY AUTO_CD

HISTFILE=~/.zsh_history
HISTSIZE=1000
SAVEHIST=1000

autoload -Uz compinit && compinit

# Navigation
alias -='cd -'
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias .....='cd ../../../..'
alias ......='cd ../../../../..'

# Listing (oh-my-zsh common-aliases)
alias l='ls -lah'
alias la='ls -lAh'
alias ll='ls -lh'
alias lsa='ls -lah'

# Directory
alias md='mkdir -p'

# System
alias df='df -h'
alias up='sudo apt update && sudo apt upgrade'
alias py='python3'

# Job search helpers
alias jobs='cat ~/Desktop/job_search_notes.txt'
alias apply='python3 ~/scripts/auto_apply.py'

# Added 2026-02-10
alias research='cat ~/scripts/data/glassdoor_reviews.json'
`),
    ".zsh_history": file(".zsh_history", `ls
cat Desktop/job_search_notes.txt
cat scripts/.env
python3 scripts/auto_apply.py --status
mail
cat scripts/data/glassdoor_reviews.json
ls Documents/
cat Documents/cover_letter_nexacorp.txt
cat .private/journal.txt
python3 scripts/auto_apply.py --dry-run
mail
ls Downloads/
ls -la
cat Downloads/resume_final_v3.pdf
cd scripts
ls data/
cat data/companies_applied.csv
cd ~
clear
mail
nano terminal_notes.txt
`),
    ".gitconfig": file(".gitconfig", `[user]
\tname = ${PLAYER.displayName}
\temail = ${username}@email.com
[alias]
\tst = status
\tco = checkout
\tlg = log --oneline --graph --decorate
[core]
\teditor = nano
# restored from dotfiles repo after wipe, 2026-02-12
`),
    ".nanorc": file(".nanorc", `# ~/.nanorc, minimal config
# restored from dotfiles repo after wipe

set autoindent
set tabsize 4
set tabstospaces
set linenumbers
set mouse
`),
    ".tmux.conf": file(".tmux.conf", `# ~/.tmux.conf
# Prefix key for terminal tabs. Press the prefix, then:
#   C = new tab   X = close tab   N/P = next/prev   1-5 = jump to tab
#   | = split left/right   - = split top/bottom   o = cycle pane
# Options: C-Space (default)   C-b (tmux default)   C-a (screen-style)
set -g prefix C-Space

# Pane navigation (vim-style): prefix then h/j/k/l (arrow keys also work).
bind h select-pane -L
bind j select-pane -D
bind k select-pane -U
bind l select-pane -R

# Pane resize (repeatable -r: hold the prefix once, then tap H/J/K/L).
bind -r H resize-pane -L 5
bind -r J resize-pane -D 5
bind -r K resize-pane -U 5
bind -r L resize-pane -R 5

# Status bar - seamless dark look (blends into the terminal). Edit freely;
# colors may be named (green, yellow, ...) or hex (#0a0e14).
set -g status-style "bg=#0a0e14,fg=#686868"                # the bar (matches terminal bg)
set -g window-status-current-style "bg=#0a0e14,fg=#e6b450" # active tab (gold text, no block)
set -g window-status-style "bg=#0a0e14,fg=#686868"         # other tabs (dim)
set -g status-left-style "bg=#0a0e14,fg=#686868"           # [session] block (blends)
`),
    ".ssh": dir(".ssh", {
      "known_hosts": file("known_hosts", ""),
      "config": file("config", ""),
    }, "rwx--xr-x"),
    ".cache": dir(".cache", {}),
    ".config": dir(".config", {
      git: dir("git", {
        ignore: file("ignore", `# Global gitignore
.env
.env.local
__pycache__/
*.pyc
.DS_Store
.vscode/
.idea/
*.swp
*~
node_modules/
`),
      }),
      systemd: dir("systemd", {
        user: dir("user", {
          "backup.service": file("backup.service", `[Unit]
Description=Nightly home backup (rsync to /mnt/backup)
Documentation=file:///home/${username}/scripts/backup.sh
OnFailure=notify-failure@%n.service

[Service]
Type=oneshot
ExecStart=/home/${username}/scripts/backup.sh
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
`),
          "backup.timer": file("backup.timer", `[Unit]
Description=Nightly trigger for backup.service
Requires=backup.service

[Timer]
OnCalendar=*-*-* 02:00:00
AccuracySec=5min
Persistent=true
Unit=backup.service

[Install]
WantedBy=timers.target
`),
          "notify-failure@.service": file("notify-failure@.service", `[Unit]
Description=Mail journal output when %i fails
# Templated unit, invoked via OnFailure=notify-failure@%n.service.
# %i expands to the failing unit name (e.g. backup.service).

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'journalctl --user -u %i --since "1 hour ago" --no-pager | mail -s "[$(hostname)] %i failed" ${username}@maniac-iv'
`),
        }),
      }),
    }),
    ".private": dir(".private", {
      "journal.txt": file("journal.txt", `2026-02-10

Got malware'd. By a take-home test. From Synthetica Labs.

Their "coding challenge" had a pip package with a cryptominer buried in the
setup.py. By the time I noticed my fans sounding like a jet engine, it had
already been running for hours. Worse, it also grabbed browser cookies.
Session tokens, saved logins, everything.

I nuked the whole machine. Full wipe, fresh Ubuntu install. Lost a bunch
of stuff I hadn't backed up: photos, some old project code, half my
dotfiles. Lesson learned the hardest possible way.

Setting up backups now. For real this time. External drive + rsync script
on a systemd timer. Should have been doing this all along.

Reported Synthetica to Indeed. Doubt anything will come of it.

---

2026-02-12

Spent the day setting everything back up. Restoring dotfiles, regenerating
SSH keys, changing every password I can think of. The whole time I keep
going back to the .heartbeat file I found before I wiped.

It wasn't just mining. It was phoning home every 5 minutes with hostname,
active processes, browser sessions. It was watching what I was doing and
reporting back. The mining was almost a distraction. Loud, obvious, easy
to spot. But the data collection? That was quiet. That was the point.

It's not the mining that bothers me. It's that something was sitting on
my machine, watching, and I had no idea.

I keep checking my processes now. Every couple hours. top, ps aux, just
making sure nothing's there. I know the drive is clean (I wiped it
myself) but knowing and feeling are different things.

---

2026-02-15

Found remnants in .cache/synthetica/ on the backup drive I almost restored
from. Good thing I didn't. The heartbeat config had more payload fields
than I realized. It wasn't just CPU and browser sessions. It was logging
SSH keys found on the system, cron jobs, everything. It was cataloging me.

I keep wondering what else it sent before I caught it. Four hours is a
long time. How many heartbeats is that at 5-minute intervals? 48. Forty-
eight snapshots of my system, shipped off to whoever's on the other end
of that endpoint.

And there's stuff I'll never know. Did it copy files? Read my shell
history? The pipe config targeted browser cookies, but there could have
been other collectors I didn't find before I wiped. That's the worst
part. I destroyed the evidence when I destroyed the infection.

Can't trust anything about the old install. Can barely trust this one.

---

2026-02-21

NexaCorp offered me the job. Starts Monday.

I should be happy. I AM happy. But I'm also taking it because rent is
due in 10 days and I have $847 in checking. That's not a reason to say
no, but it's not the right reason to say yes either.

Edward mentioned Chip again in the offer call. "You'll love working with
Chip, it's like having a brilliant teammate who never sleeps." Something
about that phrasing bugs me but I can't put my finger on why.

The previous engineer (Jin?) apparently left with zero notice. Edward
brushed it off ("sometimes people just move on") but that's twice now
he's been vague about it. I almost asked for Jin's contact info but
chickened out. What would I even say? "Hey, why'd you run?"

I reported the Synthetica thing everywhere I could think of. Indeed,
LinkedIn, even tried the FTC complaint form. Nobody has responded. Not
even an acknowledgment. Someone else is going to run that package and
the same thing will happen to them, and there's nothing I can do about
it.

I keep thinking about the heartbeat. Something sitting quietly on your
machine, collecting data, phoning home. And you just... don't know. You
go about your day and it goes about its business.

Anyway. NexaCorp it is. Time to stop spiraling and start earning again.

---

2026-02-19

Two months of job searching and I'm starting to lose it. 47 applications.
8 responses. 3 interviews. 0 offers.

The irony of being laid off because "AI is changing how we work" when I
literally BUILD AI systems is not lost on me. My CEO stood on stage and
said we were "embracing the future" while firing the people who actually
understand how any of it works. They replaced our ML pipeline with ChatGPT
API calls wrapped in a Zapier workflow. I give it six months before
everything breaks.

NexaCorp interview went okay I think? The manager, Edward, is clearly
not technical at all, but he was enthusiastic. He kept talking about their
AI assistant "Chip" like it was a coworker. Mentioned their previous
engineer "moved on" suddenly. That's usually a red flag but honestly at
this point I'd take a job at a red flag factory.

The auto-apply script has been running for 3 weeks. Sometimes I wonder if
it's actually hurting my chances. Mass applications can't be great for
personalization. But manually applying to jobs takes HOURS and most of
them ghost you anyway.

I should look at my Glassdoor scrape data for NexaCorp. I think I pulled
some reviews last week.

I miss having somewhere to go in the morning.
`),
    }),
  };
}
