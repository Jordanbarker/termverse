/**
 * Default `~/.zshrc` and `~/.tmux.conf` shipped in the Settings editor. 
 * They are real, working configs (parsed by the shared `@tt/core` parsers)
 */

export const DEFAULT_TMUX_CONF = `# Prefix key. Supported: C-Space or C-<letter>.
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

export const DEFAULT_ZSHRC = `# Navigation
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
