/**
 * Split text into lines, dropping the single empty element a trailing
 * newline produces ("a\nb\n" → ["a", "b"], not ["a", "b", ""]).
 * An empty string yields no lines, matching how Unix tools treat empty files.
 */
export function splitLines(content: string): string[] {
  if (content === "") return [];
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
