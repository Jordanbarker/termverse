import { DirectoryNode } from "../../engine/filesystem/types";
import { file, dir } from "../../engine/filesystem/builders";

/**
 * Erik's personal Linux laptop (`erik-laptop`). Reachable from chipinfra by
 * abusing the forwarded ssh-agent socket Erik left behind in /tmp.
 *
 * This is a placeholder scaffold. It models a senior frontend engineer's
 * laptop convincingly enough that `ls -la` looks lived-in, but does not yet
 * contain investigation payload — that gets layered in later.
 */
export function createErikpcFilesystem(_playerUsername: string): DirectoryNode {
  return dir("/", {
    home: dir("home", {
      erik: dir("erik", {
        ".zshrc": file(".zshrc", `# ~/.zshrc - erik-laptop
PROMPT='%B%F{green}%n@erik-laptop%f:%F{blue}%~%f%b%# '
bindkey -e

setopt HIST_IGNORE_DUPS SHARE_HISTORY AUTO_CD

HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000

autoload -Uz compinit && compinit

alias ll='ls -la'
alias la='ls -A'
alias l='ls -CF'
alias ..='cd ..'
alias gs='git status'
alias gd='git diff'

export EDITOR=vim
export CHIP_ENDPOINT=https://chip.platform.internal
`),
        ".zsh_history": file(".zsh_history", `cd ~/code/chip-platform
git pull
vim plugins/code-review/SKILL.md
git status
git add plugins/code-review/SKILL.md
git commit -m "tighten review checklist for typed errors"
git push origin main
ssh -A coder-chip
`),
        ".ssh": dir(".ssh", {
          config: file("config", `# ~/.ssh/config

Host coder-chip
  HostName chip-coder.nexa.internal
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
          known_hosts: file("known_hosts", `chip-coder.nexa.internal,10.20.0.18 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIErIK1NEKACOM
nexacorp-ws01.nexacorp.internal,10.20.0.42 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIErIK0NEKACOM
github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabMS5cs4LO
`),
        }),
        ".gitconfig": file(".gitconfig", `[user]
\tname = Erik Lindstrom
\temail = erik@nexacorp.com
[core]
\teditor = vim
[pull]
\trebase = true
[init]
\tdefaultBranch = main
`),
        Documents: dir("Documents", {}),
        Downloads: dir("Downloads", {}),
        Desktop: dir("Desktop", {}),
        code: dir("code", {}),
        notes: dir("notes", {}),
      }),
    }),
  });
}
