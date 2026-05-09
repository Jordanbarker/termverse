import { StoryFlagName } from "./storyFlags";

/** Full set of commands available on the home PC. */
export const HOME_COMMANDS: ReadonlySet<string> = new Set([
  "ls",
  "cd",
  "cat",
  "pwd",
  "clear",
  "help",
  "mail",
  "nano",
  "piper",
  "save",
  "load",
  "newgame",
  "cheat",
  "history",
  "python",
  "python3",
  "bash",
  "sh",
  "zsh",
  "source",
  ".",
  "printenv",
  "env",
  "export",
  "alias",
  "unalias",
  // Shell builtins for command lookup — always available alongside `which` (which itself is gated)
  "command",
  "type",
]);

/** NexaCorp commands gated behind colleague emails. */
export const NEXACORP_GATED: Record<string, StoryFlagName> = {
  grep: "search_tools_unlocked",
  find: "search_tools_unlocked",
  diff: "search_tools_unlocked",
  head: "inspection_tools_unlocked",
  tail: "inspection_tools_unlocked",
  wc: "inspection_tools_unlocked",
  sort: "processing_tools_unlocked",
  uniq: "processing_tools_unlocked",
  coder: "coder_unlocked",
  chip: "chip_unlocked",
  printenv: "printenv_unlocked",
  env: "printenv_unlocked",
  piper: "piper_unlocked",
  chmod: "chmod_unlocked",
  sudo: "apt_unlocked",
  apt: "apt_unlocked",
};

/** Commands that should never be available on the home PC. */
export const NEXACORP_ONLY: ReadonlySet<string> = new Set([
  "coder", "chip",
]);

/** Commands that should only be available on the home PC. */
export const HOME_ONLY: ReadonlySet<string> = new Set(["pdftotext"]);

/** Commands only available inside the dev container. */
export const DEVCONTAINER_ONLY: ReadonlySet<string> = new Set([
  "git", "snow", "dbt",
]);

/** Commands available in the Coder dev container. */
export const DEVCONTAINER_COMMANDS: ReadonlySet<string> = new Set([
  "ls", "cd", "cat", "pwd", "clear", "help", "nano", "python", "python3", "dbt",
  "snow", "chip", "grep", "find", "diff", "head", "tail", "wc",
  "sort", "uniq", "echo", "whoami", "hostname", "file", "tree",
  "date", "which", "command", "type", "man", "mkdir", "rm", "mv", "cp", "touch", "chmod",
  "history", "exit", "save", "load", "newgame", "cheat", "git", "bash", "sh", "zsh",
  "source", ".",
  "printenv", "env", "export",
  "alias", "unalias",
  "ssh", "ssh-add",
]);

/** Home PC commands gated behind story flags. */
export const HOME_GATED: Record<string, StoryFlagName> = {
  ssh: "ssh_unlocked",
  sudo: "apt_unlocked",
  apt: "apt_unlocked",
  pdftotext: "pdftotext_unlocked",
  tree: "tree_installed",
  mkdir: "basic_tools_unlocked",
  rm: "basic_tools_unlocked",
  mv: "basic_tools_unlocked",
  cp: "basic_tools_unlocked",
  touch: "basic_tools_unlocked",
  echo: "basic_tools_unlocked",
  whoami: "basic_tools_unlocked",
  hostname: "basic_tools_unlocked",
  date: "basic_tools_unlocked",
  which: "basic_tools_unlocked",
  man: "basic_tools_unlocked",
  file: "basic_tools_unlocked",
  grep: "returned_home_day1",
  find: "returned_home_day1",
  wc: "returned_home_day1",
  sort: "returned_home_day1",
  uniq: "returned_home_day1",
  head: "returned_home_day1",
  tail: "returned_home_day1",
  diff: "returned_home_day1",
  shutdown: "returned_home_day1",
};
