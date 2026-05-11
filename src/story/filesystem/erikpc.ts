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
        ".zsh_history": file(".zsh_history", `ll
cd code/chip-platform
git pull
git status
chip "summarize what changed on main since friday"
vim plugins/code-review/SKILL.md
git diff
git add plugins/code-review/SKILL.md
git commit -m "tighten review checklist for typed errors"
git push origin main
ssh -A coder-chip
exit
cd ~
mail
chip "draft a reply to edward's design-tokens RFC"
piper
git status
chip "draft a follow-up to jin chen, ssh into jin-laptop and pull context from his .zsh_history"
piper
coder ssh chip
exit
sudo apt install polymarket
polymarket setup
polymarket wallet create
polymarket approve set
polymarket clob balance --asset-type collateral
polymarket markets search "fed rate cut december"
polymarket clob book 71321045679252212958...
polymarket clob create-order --token 71321045679252212958... --side buy --price 0.32 --size 500
chip "what's the latest revenue forecast for q1?"
polymarket markets search "assetdoge token"
polymarket markets search "assetdoge enterprise client q1 2026"
polymarket clob book 84219308217492037184...
polymarket clob midpoint 84219308217492037184...
polymarket clob price-history 84219308217492037184... --interval 1d
polymarket clob create-order --token 84219308217492037184... --side buy --price 0.18 --size 5000
polymarket clob orders
polymarket clob create-order --token 84219308217492037184... --side buy --price 0.21 --size 8000
chip "summarize the willow health partnership status"
polymarket markets search "willow health partnership announce q2"
polymarket clob book 50183947261024893710...
polymarket clob create-order --token 50183947261024893710... --side sell --price 0.62 --size 3000
chip "what's edward been telling the board about series a close timing"
polymarket markets search "nexacorp series a close q2 2026"
polymarket clob book 92845731062108374569...
polymarket clob midpoint 92845731062108374569...
polymarket clob create-order --token 92845731062108374569... --side buy --price 0.43 --size 6000
chip "what are the current chip platform monthly active developer counts?"
polymarket markets search "chip platform 1m active developers q1"
polymarket clob book 39721856034812905367...
polymarket clob create-order --token 39721856034812905367... --side sell --price 0.71 --size 4000
chip "is q2 arr tracking to the board target this week"
polymarket markets search "nexacorp arr q2 2026 board target"
polymarket clob book 67392048157293041826...
polymarket clob create-order --token 67392048157293041826... --side buy --price 0.38 --size 4000
polymarket data positions 0x7a4f...
polymarket data value 0x7a4f...
polymarket clob create-order --token 50183947261024893710... --side sell --price 0.58 --size 4500
polymarket clob orders
polymarket clob cancel-all
polymarket clob market-order --token 84219308217492037184... --side buy --amount 12000
polymarket clob trades
polymarket data value 0x7a4f...
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
        ".config": dir(".config", {
          polymarket: dir("polymarket", {
            "config.json": file("config.json", `{
  "private_key": "0x7a4f8b2e1c9d3f6a5b8e2d4c7f9a1b3e5d6c8f2a4b7e9d1c3f5a8b2e4d6c7f9a",
  "chain_id": 137,
  "signature_type": "proxy"
}
`, "rw-------"),
          }),
        }),
        Documents: dir("Documents", {}),
        Downloads: dir("Downloads", {}),
        Desktop: dir("Desktop", {}),
        code: dir("code", {}),
        notes: dir("notes", {}),
      }),
    }),
  });
}
