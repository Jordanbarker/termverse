import { DirectoryNode } from "../../../engine/filesystem/types";
import { file, dir } from "../../../engine/filesystem/builders";

/**
 * /home for the chipinfra workspace. This is a SHARED workspace —
 * multiple Chip platform team engineers SSH in. Adjacent context (history
 * files, dated notes) carries the "this user was recently here" signal,
 * since VirtualFS does not model file ownership.
 */
export function buildHomeDirectory(username: string): DirectoryNode {
  return dir("home", {
    [username]: dir(username, {
      ".zshrc": file(".zshrc", `# ~/.zshrc - Chip platform workspace (chip)
PROMPT='%B%F{green}%n@coder-chip%f:%F{blue}%~%f%b%# '
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
`),
      // Fresh provisioned home on a shared platform workspace. The README
      // is the standard Coder template welcome; nothing else is here yet
      // because the player has just SSH'd in for the first time.
      "README.md": file("README.md", `# Chip Platform Workspace (coder-chip)

You're in your home directory on the SHARED Chip platform workspace.
Plugins, the RAG corpus, and Chip's runtime do not live in /home/ —
they live elsewhere on the box. Quick reference:

  cd /opt/chip/plugins/    # plugin tree (registry.json + per-plugin dirs)
  cd /srv/ai/rag/          # RAG corpus (engineering, hr, it docs)
  cd /srv/chip/            # runtime data (embeddings, prompts, cache, logs)

This is NOT your personal coder workspace — that's \`coder ssh ai\`.
Multiple Chip platform engineers use this box. Be tidy, don't leave
secrets on disk.

If you're authoring a plugin, scaffold it next to the existing ones —
one directory per plugin, named after the plugin:

  /opt/chip/plugins/<plugin-name>/
    plugin.json
    SKILL.md

Add an entry to /opt/chip/plugins/registry.json when it's working.

Maintainer: edward@nexacorp.com (CTO, owner of Chip)
Infra:      oscar@nexacorp.com
`),
      // Auto-provisioned by the Coder workspace template (see
      // /opt/chip/config/settings.json's `auth.token_file`). The token is
      // injected at workspace start, not authored by the user.
      ".config": dir(".config", {
        chip: dir("chip", {
          token: file("token", `nxa_chip_client_2.4.1_<redacted>\n`),
        }),
      }),
    }),

    // Other Chip-platform team engineers who use this workspace. Their home
    // dirs are populated lightly to make the "shared" framing land — players
    // who poke around will see their .zsh_history, dotfiles, etc.

    erik: dir("erik", {
      ".zsh_history": file(".zsh_history", `cd /opt/chip/plugins
ls
git pull
vim code-review/SKILL.md
git status
git add code-review/SKILL.md
git commit -m "tighten review checklist for typed errors"
git push origin main
cd ~/notes
cat plugin-ideas.md
chip
ssh -A coder-chip
cd /opt/chip/plugins/code-review
vim plugin.json
exit
`),
      ".zshrc": file(".zshrc", `# erik's chipinfra zsh config
export EDITOR=vim
export CHIP_ENDPOINT=https://chip.platform.internal
alias plugins='cd /opt/chip/plugins'
alias rag='cd /srv/ai/rag'
`),
      ".ssh": dir(".ssh", {
        config: file("config", `# erik's chipinfra ssh config
Host erik-laptop
  HostName erik-laptop.nexa.internal
  User erik
  ForwardAgent yes
  IdentityFile ~/.ssh/id_ed25519

Host *.nexa.internal
  User erik
  ForwardAgent yes
  IdentityFile ~/.ssh/id_ed25519

Host github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
`),
        known_hosts: file("known_hosts", `nexacorp-ws01,10.20.0.42 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIErIK0NEKACOM
chip-coder,10.20.0.18 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIErIK1NEKACOM
github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabMS5cs4LO
`),
      }),
      notes: dir("notes", {
        "plugin-ideas.md": file("plugin-ideas.md", `# Plugin ideas (erik)

- code-review: tighten the typed-error checklist (DONE 5/8)
- design-tokens: lint Figma exports against the brand-voice palette
- standup-summary: weekly digest from #engineering for Edward
- pr-greeter: friendlier first-touch on new contributor PRs
`),
      }),
    }),

    oscar: dir("oscar", {
      ".zsh_history": file(".zsh_history", `cd /srv/chip/logs
tail -n 200 inference.log
cd /opt/chip/plugins
ls
exit
`),
      "README.md": file("README.md", `Infra checks only. Heavy lifting happens on ws01.
`),
    }),
  });
}
