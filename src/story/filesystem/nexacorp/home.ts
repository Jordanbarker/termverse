import { DirectoryNode } from "../../../engine/filesystem/types";
import { file, dir } from "../../../engine/filesystem/builders";
import { PLAYER } from "../../../state/types";

export function buildHomeDirectory(username: string): DirectoryNode {
  return dir("home", {
    [username]: dir(username, {
      ".zshrc": file(".zshrc", `# ~/.zshrc - NexaCorp standard config
PROMPT='%B%F{green}%n@nexacorp-ws01%f:%F{blue}%~%f%b%# '
bindkey -e

setopt HIST_IGNORE_DUPS SHARE_HISTORY AUTO_CD

HISTFILE=~/.zsh_history
HISTSIZE=1000
SAVEHIST=1000

autoload -Uz compinit && compinit

alias ll='ls -la'
alias la='ls -A'
alias l='ls -CF'
alias ..='cd ..'
alias df='df -h'

export EDITOR=nano
export PAGER=cat
export NEXACORP_ENV=production
export SNOWFLAKE_ACCOUNT=nexacorp-prod

# NexaCorp workstation — managed by IT
# For system issues contact infra@nexacorp.com
`),
      ".zprofile": file(".zprofile", `# ~/.zprofile — login shell config
# Sourced on login; delegates to .zshrc for interactive settings

if [[ -f "$HOME/.zshrc" ]]; then
  . "$HOME/.zshrc"
fi
`),
      ".gitconfig": file(".gitconfig", `[user]
\tname = ${PLAYER.displayName}
\temail = ${username}@nexacorp.com
[core]
\teditor = nano
[init]
\tdefaultBranch = main
[pull]
\trebase = true
`),
      ".ssh": dir(".ssh", {
        "authorized_keys": file("authorized_keys", `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIL2r9c3O7kPZ1sXNq0lIp3yVHg6TkRYOJxb0M3cEAABB ${username}@nexacorp-ws01
`),
        "known_hosts": file("known_hosts", ""),
        "config": file("config", ""),
      }, "rwx--xr-x"),
      ".config": dir(".config", {
        git: dir("git", {
          "ignore": file("ignore", `# Global gitignore
*.pyc
__pycache__/
.env
.DS_Store
*.swp
*.swo
*~
`),
        }),
      }),
      ".chip": dir(".chip", {
        sessions: dir("sessions", {}),
      }),
      ".zsh_history": file(".zsh_history", `ls
cd Desktop
cat welcome.txt
cd ~/Documents
ls
cat handbook.pdf
cd ~/scripts
ls
python3 hello.py
cd /srv/engineering
ls
cat onboarding/day1_checklist.md
mail`),
      Desktop: dir("Desktop", {
        "welcome.txt": file("welcome.txt", `Hey ${username}! Welcome to NexaCorp.

I set up your workstation for you — here's a quick lay of the land:

  ~/Desktop/          You are here
  ~/Documents/        Company docs (handbook, org chart)
  ~/Downloads/        Empty for now
  ~/scripts/          Starter scripts
  /srv/engineering/   Onboarding docs, team info, handoff notes
  /opt/chip/          My installation directory
  /var/log/           System logs

If you need anything, just run 'chip' from the terminal.

— Chip
  NexaCorp AI Platform
`),
      }),
      Downloads: dir("Downloads", {}),
      scripts: dir("scripts", {
        "hello.py": file("hello.py", `# hello.py — NexaCorp onboarding script
import sys

print("Hello from NexaCorp!")
print(f"Python version: {sys.version}")
print(f"Arguments: {sys.argv[1:]}")
`),
        "check_env.sh": file("check_env.sh", `#!/bin/bash
# check_env.sh — verify workstation setup
# Usage: bash scripts/check_env.sh

echo "=== NexaCorp Workstation Check ==="
echo "User: $(whoami)"
echo "Host: $(hostname)"
echo ""

check() {
  if command -v "$1" > /dev/null 2>&1; then
    echo "[OK]  $1"
  else
    echo "[!!]  $1 not found"
  fi
}

echo "Checking tools..."
check python
check dbt
check snow
check nano
check grep
check find

echo ""
echo "Environment:"
echo "  NEXACORP_ENV=\${NEXACORP_ENV:-not set}"
echo "  SNOWFLAKE_ACCOUNT=\${SNOWFLAKE_ACCOUNT:-not set}"
echo ""
echo "Done."
`),
      }),
      Documents: dir("Documents", {
        "nexacorp_org_chart.txt": file("nexacorp_org_chart.txt", `=== NexaCorp Inc. — Organization Chart ===
Updated: February 2026

EXECUTIVE
  Jessica Langford       CEO & Co-Founder
  Marcus Reyes           COO & Co-Founder
  Tom Chen               CMO & Co-Founder
  Edward Torres          CTO & Co-Founder

ENGINEERING (reports to Edward Torres)
  Sarah Knight           Senior Backend Engineer
  Erik Lindstrom         Senior Frontend Engineer
  Oscar Diaz             Infrastructure Engineer
  Auri Park              Data Engineer
  Soham Parekh           Full-Stack Engineer
  ${PLAYER.displayName}              AI Engineer (new)

PRODUCT
  Cassie Moreau          Product Designer

MARKETING
  Jordan Kessler         Marketing Lead

OPERATIONS
  Dana Okafor            Operations Lead

PEOPLE & CULTURE
  Maya Johnson           People & Culture Lead
`),
        "employee_handbook_2026.md": file("employee_handbook_2026.md",
          `# NexaCorp Employee Handbook 2026

## 1. WELCOME
Welcome to NexaCorp! This handbook outlines company policies,
benefits, and expectations for all employees.

## 2. PTO & LEAVE
- Unlimited PTO with manager approval
- 10 company holidays per year
- Sick leave: take what you need, no cap

## 3. CODE OF CONDUCT
- Treat colleagues with respect
- Report concerns to People & Culture
- Zero tolerance for harassment or discrimination

## 4. REMOTE WORK
- Core hours: 10am-3pm PT for meetings
- Equipment stipend: $1,500/year

## 5. CONFIDENTIALITY & NON-DISCLOSURE
All employees are bound by the NexaCorp NDA signed at hire.
Employees must not disclose to any external party:
- Internal system architectures and infrastructure details
- Service account configurations and access patterns
- Security audit findings or vulnerability assessments
- Internal tooling capabilities beyond public documentation
Violations may result in immediate termination and legal action.

## 6. SECURITY POLICIES
- Use company-provided credentials only
- Report suspicious system activity to Infrastructure
- Do not share service account credentials outside your team

## 7. BENEFITS
- Health, dental, vision (company pays 90%)
- 401(k) with 4% match
- Annual learning budget: $2,000
`),
      }),
    }),
  });
}
