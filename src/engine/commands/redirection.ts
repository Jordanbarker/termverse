import { CommandResult } from "./types";
import { VirtualFS } from "../filesystem/VirtualFS";
import { isDirectory } from "../filesystem/types";
import { resolvePath } from "../../lib/pathUtils";
import { MachineId } from "@tt/core/machine";
import { SecurityPolicy } from "./security";

export interface RedirectTarget {
  file: string;
  append: boolean;
}

export interface ExtractedRedirect {
  /** Pipeline segment with any 2>… and all >/>> tokens removed. */
  command: string;
  /** All stdout redirect targets, in order (zsh multios: output goes to every one). */
  redirects: RedirectTarget[];
  /** Set when a `>` has no target token, e.g. `echo hi >`. */
  parseError?: string;
}

/**
 * Quote-aware extraction of stdout redirection from a raw command segment.
 * - Recognises `2>&1`, `2>/dev/null`, `2>>file`, and bare `2>token` as stderr
 *   redirects and strips them (the engine silences stderr by design).
 * - Collects every *unquoted* `>>` or `>` stdout redirect (zsh has multios on
 *   by default, so output is written to all targets).
 * - Returns the segment with both stderr and stdout-redirect tokens removed.
 */
export function extractStdoutRedirect(raw: string): ExtractedRedirect {
  let stripped = "";
  let inSingle = false;
  let inDouble = false;
  const redirects: RedirectTarget[] = [];
  let parseError: string | undefined;
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
      // Stdout redirect
      if (raw[i] === ">") {
        const isAppend = raw[i + 1] === ">";
        let j = i + (isAppend ? 2 : 1);
        while (j < raw.length && raw[j] === " ") j++;
        let target = "";
        while (j < raw.length && raw[j] !== " " && raw[j] !== "'" && raw[j] !== '"' &&
               raw[j] !== "|" && raw[j] !== "&" && raw[j] !== ";") {
          target += raw[j];
          j++;
        }
        if (target === "") {
          parseError = "zsh: parse error near `\\n'";
        } else {
          redirects.push({ file: target, append: isAppend });
        }
        i = j;
        continue;
      }
    }

    stripped += ch;
    i++;
  }

  return {
    command: stripped.trim(),
    redirects,
    ...(parseError !== undefined && { parseError }),
  };
}

/**
 * Validate redirect targets before the command runs (zsh opens redirect files
 * before exec, so a bad target means the command never executes).
 * Returns a zsh-style error message for the first failing target, or null.
 */
export function precheckRedirects(
  redirects: RedirectTarget[],
  currentCwd: string,
  homeDir: string,
  fs: VirtualFS,
): string | null {
  for (const redirect of redirects) {
    const absPath = resolvePath(redirect.file, currentCwd, homeDir);
    if (absPath === "/dev/null") continue;

    const node = fs.getNode(absPath);
    if (node && isDirectory(node)) {
      return `zsh: is a directory: ${redirect.file}`;
    }
    if (!node) {
      const parent = absPath.slice(0, absPath.lastIndexOf("/")) || "/";
      const parentNode = fs.getNode(parent);
      if (!parentNode || !isDirectory(parentNode)) {
        return `zsh: no such file or directory: ${redirect.file}`;
      }
    }
  }
  return null;
}

/** Apply output redirection: write command output to every target file (multios) and return updated FS + result. */
export function applyRedirection(
  redirects: RedirectTarget[],
  lastResult: CommandResult,
  currentCwd: string,
  homeDir: string,
  currentFs: VirtualFS,
  computerId: MachineId,
  security?: SecurityPolicy,
): { result: CommandResult; fs: VirtualFS } {
  let fs = currentFs;
  const mergedEvents = [...(lastResult.triggerEvents ?? [])];
  let securityViolation = lastResult.securityViolation;

  for (const redirect of redirects) {
    const absPath = resolvePath(redirect.file, currentCwd, homeDir);

    // /dev/null: suppress output without writing
    if (absPath === "/dev/null") continue;

    const existedBefore = !!fs.getNode(absPath);

    let content = lastResult.output;
    if (redirect.append) {
      const existing = fs.readFile(absPath);
      if (existing.content !== undefined && existing.content !== "") {
        content = existing.content.endsWith("\n")
          ? existing.content + content
          : existing.content + "\n" + content;
      }
    }

    const writeResult = fs.writeFile(absPath, content);
    if (!writeResult.fs) {
      // Target became unwritable mid-pipeline (precheck normally catches this).
      const message = writeResult.error?.includes("Is a directory")
        ? `zsh: is a directory: ${redirect.file}`
        : `zsh: no such file or directory: ${redirect.file}`;
      return {
        result: { ...lastResult, output: message, exitCode: 1, triggerEvents: mergedEvents, securityViolation },
        fs,
      };
    }
    fs = writeResult.fs;

    mergedEvents.push(
      existedBefore
        ? { type: "file_modified" as const, detail: absPath }
        : { type: "file_created" as const, detail: absPath },
    );

    securityViolation =
      securityViolation ??
      (computerId === "nexacorp" && security?.isLogTamperPath(absPath)
        ? {
            kind: "log_tampering" as const,
            path: absPath,
            command: `${redirect.append ? ">>" : ">"} ${redirect.file}`,
            descendantCount: 1,
          }
        : undefined);
  }

  return {
    result: { ...lastResult, output: "", triggerEvents: mergedEvents, securityViolation },
    fs,
  };
}
