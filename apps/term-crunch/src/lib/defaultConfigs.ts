/**
 * Default `~/.zshrc` and `~/.tmux.conf` shipped in the Settings editor. They are
 * real, working configs (parsed by the shared `@tt/core` parsers), not just
 * documentation: the tmux.conf reproduces term-crunch's built-in look + binds,
 * and the zshrc seeds a couple of illustrative aliases/exports so editing them
 * has a visible effect. Players can rewrite either; "Reset to defaults" restores
 * these strings.
 */

/** Reproduces the built-in status-bar palette, prefix, and vim pane binds. */
export const DEFAULT_TMUX_CONF = `# ~/.tmux.conf — edit me, then Save to apply live.

# Prefix key (try C-a). Supported: C-Space or C-<letter>.
set -g prefix C-Space

# Status-bar colors (named ANSI colors or hex; "default" = transparent).
set -g status-style "bg=#11161d,fg=#6b7680"
set -g window-status-current-style "bg=#253340,fg=#e6b450"
set -g window-status-style "bg=default,fg=#b3b1ad"

# Vim-style pane focus: <prefix> h/j/k/l
bind h select-pane -L
bind j select-pane -D
bind k select-pane -U
bind l select-pane -R

# Vim-style pane resize (repeatable): <prefix> H/J/K/L
bind -r H resize-pane -L 5
bind -r J resize-pane -D 5
bind -r K resize-pane -U 5
bind -r L resize-pane -R 5
`;

/** Generic, oh-my-zsh-style aliases + an export so editing the zshrc is visible. */
export const DEFAULT_ZSHRC = `# ~/.zshrc — edit me, then Save to apply live.
# Aliases and exports here are active in every challenge.

# Navigation
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'

# Listing
alias l='ls -lah'
alias la='ls -lAh'
alias ll='ls -lh'

# Directories
alias md='mkdir -p'

# Git
alias gs='git status'

export EDITOR=nano
`;
