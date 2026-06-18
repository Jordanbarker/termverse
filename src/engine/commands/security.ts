/**
 * Security policy seam (core, story-agnostic).
 *
 * The engine knows that some filesystem operations can trip a "tripwire" and
 * produce a SecurityViolation, but it does NOT know which paths are protected
 * or on which machine the rules apply. That knowledge is injected as a
 * SecurityPolicy via CommandContext.security. When no policy is present (the
 * default, and the case for any non-story game built on this engine), no
 * operation is ever flagged.
 *
 * The turmoil app supplies its NexaCorp policy from src/story/security.ts.
 */
import { VirtualFS } from "../filesystem/VirtualFS";
import type { MachineId } from "../machine";

export type SecurityViolationKind = "log_tampering" | "leadership_destruction" | "exfiltration";

export interface SecurityViolation {
  kind: SecurityViolationKind;
  path: string;
  /** Populated only for cp/mv exfiltration so an alert can name both endpoints. */
  destPath?: string;
  /** Short reconstruction of the offending command line, e.g. `rm -rf /srv/leadership/`. */
  command: string;
  /** Number of paths the offending op walked over (covers rm/chmod/cp/mv recursion). */
  descendantCount: number;
}

/** Inputs an rm/cp/mv check needs beyond the filesystem + root path. */
export interface SecurityOpContext {
  computerId: MachineId;
  homeDir: string;
  destPath?: string;
  /** Short command summary recorded on any violation (e.g. `rm -rf /srv/leadership/`). */
  command: string;
}

/**
 * Returns true iff `newPerms` removes any r or w bit that was set in `oldPerms`,
 * for any class (owner/group/other). Adding permissions or changing only x bits
 * does not count as restrictive. Pure helper, used by chmod to decide whether a
 * permission change is worth checking against the policy.
 */
export function chmodIsRestrictive(oldPerms: string, newPerms: string): boolean {
  if (oldPerms.length !== 9 || newPerms.length !== 9) return false;
  // Positions: 0=ur, 1=uw, 2=ux, 3=gr, 4=gw, 5=gx, 6=or, 7=ow, 8=ox.
  // We only care about r/w removal.
  const rwIndices = [0, 1, 3, 4, 6, 7];
  return rwIndices.some((i) => oldPerms[i] !== "-" && newPerms[i] === "-");
}

/**
 * Injected per-game security rules. The engine calls these; the app decides
 * what they mean. Absent => nothing is ever flagged.
 */
export interface SecurityPolicy {
  /** rm/cp/mv: walk descendants of `rootPath` and return a violation, or null. */
  checkPathOp(
    fs: VirtualFS,
    rootPath: string,
    opKind: "rm" | "cp" | "mv",
    ctx: SecurityOpContext,
  ): SecurityViolation | null;
  /** chmod: when a restrictive change lands on `path`, what kind of violation (or none)? */
  classifyChmodTarget(path: string): Exclude<SecurityViolationKind, "exfiltration"> | null;
  /** Output redirection (`>`/`>>`): is writing to `path` log tampering? */
  isLogTamperPath(path: string): boolean;
}
