// Parsing of the `.zsh_history` HISTFILE into an ordered command list.
//
// The `.zsh_history` file is the single source of truth for shell history
// (up-arrow recall, the `history` command, and autosuggestions). The game
// writes and seeds it in plain format — one command per line, oldest first —
// so parsing is just splitting on newlines and dropping blanks.
//
// (Real zsh can use EXTENDED_HISTORY, `: <start>:<elapsed>;<command>`, but the
// game never sets that opt, so we don't parse it. If extended seeds are ever
// added, strip the `: \d+:\d+;` prefix here.)
export function parseZshHistory(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

// Append a submitted command to the HISTFILE content, zsh-style: skip blank
// input, dedupe against the immediately preceding entry (HIST_IGNORE_DUPS),
// and keep the file newline-terminated. Returns the content unchanged when
// nothing should be appended.
export function appendZshHistory(content: string, input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return content;
  const lastLine = content.trimEnd().split("\n").pop() ?? "";
  if (lastLine === trimmed) return content;
  const sep = content === "" || content.endsWith("\n") ? "" : "\n";
  return content + sep + trimmed + "\n";
}
