import { CommandResult } from "./types";
import { VirtualFS } from "../filesystem/VirtualFS";
import { resolvePath } from "../../lib/pathUtils";

export interface ExtractedRedirect {
  /** Pipeline segment with any 2>… and the chosen >/>> token removed. */
  command: string;
  redirectFile: string | null;
  redirectAppend: boolean;
}

/**
 * Quote-aware extraction of stdout redirection from a raw command segment.
 * - Recognises `2>&1`, `2>/dev/null`, `2>>file`, and bare `2>token` as stderr
 *   redirects and strips them (the engine silences stderr by design).
 * - Finds the first *unquoted* `>>` or `>` for stdout redirection.
 * - Returns the segment with both stderr and stdout-redirect tokens removed,
 *   plus the redirect target file (or null if none).
 */
export function extractStdoutRedirect(raw: string): ExtractedRedirect {
  let stripped = "";
  let inSingle = false;
  let inDouble = false;
  let redirectFile: string | null = null;
  let redirectAppend = false;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];

    if (ch === "'" && !inDouble) { inSingle = !inSingle; stripped += ch; i++; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; stripped += ch; i++; continue; }

    if (!inSingle && !inDouble) {
      // 2>&1
      if (raw.slice(i, i + 4) === "2>&1") { i += 4; continue; }
      // 2>> or 2>
      if (raw[i] === "2" && raw[i + 1] === ">") {
        let j = i + 2;
        if (raw[j] === ">") j++;
        // Consume optional whitespace then the target token (until whitespace or quote)
        while (j < raw.length && raw[j] === " ") j++;
        while (j < raw.length && raw[j] !== " " && raw[j] !== "'" && raw[j] !== '"' &&
               raw[j] !== "|" && raw[j] !== "&" && raw[j] !== ";") {
          j++;
        }
        i = j;
        continue;
      }
      // Stdout redirect (first one wins, per shell semantics for this engine)
      if (redirectFile === null && raw[i] === ">") {
        const isAppend = raw[i + 1] === ">";
        let j = i + (isAppend ? 2 : 1);
        while (j < raw.length && raw[j] === " ") j++;
        let target = "";
        while (j < raw.length && raw[j] !== " " && raw[j] !== "'" && raw[j] !== '"' &&
               raw[j] !== "|" && raw[j] !== "&" && raw[j] !== ";") {
          target += raw[j];
          j++;
        }
        redirectFile = target;
        redirectAppend = isAppend;
        i = j;
        continue;
      }
    }

    stripped += ch;
    i++;
  }

  return {
    command: stripped.trim(),
    redirectFile: redirectFile ? redirectFile : null,
    redirectAppend,
  };
}

/** Apply output redirection: write command output to a file and return updated FS + result. */
export function applyRedirection(
  redirectFile: string,
  redirectAppend: boolean,
  lastResult: CommandResult,
  currentCwd: string,
  homeDir: string,
  currentFs: VirtualFS,
): { result: CommandResult; fs: VirtualFS } {
  const absPath = resolvePath(redirectFile, currentCwd, homeDir);

  // /dev/null: suppress output without writing
  if (absPath === "/dev/null") {
    return { result: { ...lastResult, output: "" }, fs: currentFs };
  }

  const existedBefore = !!currentFs.getNode(absPath);

  let content = lastResult.output;
  if (redirectAppend) {
    const existing = currentFs.readFile(absPath);
    if (existing.content !== undefined) {
      content = existing.content + "\n" + content;
    }
  }
  const writeResult = currentFs.writeFile(absPath, content);
  const newFs = writeResult.fs ?? currentFs;

  const redirectEvent = existedBefore
    ? { type: "file_modified" as const, detail: absPath }
    : { type: "file_created" as const, detail: absPath };
  const mergedEvents = [...(lastResult.triggerEvents ?? []), redirectEvent];

  return {
    result: { ...lastResult, output: "", triggerEvents: mergedEvents },
    fs: newFs,
  };
}
