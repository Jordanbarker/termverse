import { describe, it, expect } from "vitest";
import { parseAliases, initAliasesForComputer } from "../env";

describe("parseAliases", () => {
  it("parses single-quoted alias", () => {
    expect(parseAliases("alias ll='ls -la'")).toEqual({ ll: "ls -la" });
  });

  it("parses double-quoted alias", () => {
    expect(parseAliases('alias ll="ls -la"')).toEqual({ ll: "ls -la" });
  });

  it("parses unquoted alias", () => {
    expect(parseAliases("alias ll=ls")).toEqual({ ll: "ls" });
  });

  it("parses multiple aliases", () => {
    const input = `alias ll='ls -la'
alias la='ls -A'
alias l='ls -CF'`;
    expect(parseAliases(input)).toEqual({
      ll: "ls -la",
      la: "ls -A",
      l: "ls -CF",
    });
  });

  it("skips comments and non-alias lines", () => {
    const input = `# This is a comment
export FOO=bar
setopt HIST_IGNORE_DUPS
alias ll='ls -la'
bindkey -e`;
    expect(parseAliases(input)).toEqual({ ll: "ls -la" });
  });

  it("handles aliases with hyphens in name", () => {
    expect(parseAliases("alias git-log='git log --oneline'")).toEqual({
      "git-log": "git log --oneline",
    });
  });

  it("handles single-dash alias name", () => {
    expect(parseAliases("alias -='cd -'")).toEqual({ "-": "cd -" });
  });

  it("handles dot-only alias names (oh-my-zsh common-aliases)", () => {
    const input = `alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'`;
    expect(parseAliases(input)).toEqual({
      "..": "cd ..",
      "...": "cd ../..",
      "....": "cd ../../..",
    });
  });

  it("returns empty object for no aliases", () => {
    expect(parseAliases("export FOO=bar\nsetopt something")).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseAliases("")).toEqual({});
  });

  it("parses realistic .zshrc content", () => {
    const zshrc = `# ~/.zshrc
PROMPT='%n@home:%~%# '
bindkey -e

setopt HIST_IGNORE_DUPS SHARE_HISTORY AUTO_CD

HISTFILE=~/.zsh_history
HISTSIZE=1000

alias ll='ls -la'
alias py='python3'
alias jobs='cat ~/Desktop/job_search_notes.txt'

export EDITOR=nano`;
    const aliases = parseAliases(zshrc);
    expect(aliases).toEqual({
      ll: "ls -la",
      py: "python3",
      jobs: "cat ~/Desktop/job_search_notes.txt",
    });
  });
});

describe("initAliasesForComputer", () => {
  it("returns aliases from .zshrc", () => {
    const mockFs = {
      readFile: (path: string) => {
        if (path.endsWith(".zshrc")) {
          return { content: "alias ll='ls -la'\nalias la='ls -A'" };
        }
        return { error: "not found" };
      },
    };
    const aliases = initAliasesForComputer("home", "player", mockFs);
    expect(aliases).toEqual({ ll: "ls -la", la: "ls -A" });
  });

  it("returns empty object when .zshrc not found", () => {
    const mockFs = {
      readFile: () => ({ error: "not found" }),
    };
    const aliases = initAliasesForComputer("home", "player", mockFs);
    expect(aliases).toEqual({});
  });
});
