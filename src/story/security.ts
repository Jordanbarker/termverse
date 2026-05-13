import { ComputerId } from "../state/types";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { collectDescendantPaths } from "../engine/filesystem/walk";

export type SecurityViolationKind = "log_tampering" | "leadership_destruction" | "exfiltration";

export interface SecurityViolation {
  kind: SecurityViolationKind;
  path: string;
}

export const LEADERSHIP_PREFIX = "/srv/leadership/";
const LEADERSHIP_ROOT = "/srv/leadership";
export const LOG_TAMPER_PATTERN = /^\/var\/log\/[^/]+\.log(\.bak)?$/;

export function isLogTamperPath(p: string): boolean {
  return LOG_TAMPER_PATTERN.test(p);
}

export function isLeadershipPath(p: string): boolean {
  return p === LEADERSHIP_ROOT || p.startsWith(LEADERSHIP_PREFIX);
}

export function isPlayerHomePath(p: string, homeDir: string): boolean {
  return p === homeDir || p.startsWith(`${homeDir}/`);
}

/**
 * Returns true iff `newPerms` removes any r or w bit that was set in `oldPerms`,
 * for any class (owner/group/other). Adding permissions or changing only x bits
 * does not count as restrictive.
 */
export function chmodIsRestrictive(oldPerms: string, newPerms: string): boolean {
  if (oldPerms.length !== 9 || newPerms.length !== 9) return false;
  // Positions: 0=ur, 1=uw, 2=ux, 3=gr, 4=gw, 5=gx, 6=or, 7=ow, 8=ox.
  // We only care about r/w removal.
  const rwIndices = [0, 1, 3, 4, 6, 7];
  return rwIndices.some((i) => oldPerms[i] !== "-" && newPerms[i] === "-");
}

interface OpContext {
  computerId: ComputerId;
  homeDir: string;
  destPath?: string;
}

/**
 * Walk descendants of `rootPath` and decide whether the op trips a tripwire.
 * Scoped to `computerId === "nexacorp"` defensively — other computers may
 * incidentally have files matching the protected patterns.
 */
export function opTouchesProtectedPath(
  fs: VirtualFS,
  rootPath: string,
  opKind: "rm" | "cp" | "mv",
  ctx: OpContext
): SecurityViolation | null {
  if (ctx.computerId !== "nexacorp") return null;

  const paths = collectDescendantPaths(fs, rootPath, { includeRoot: true });
  if (paths.length === 0) return null;

  if (opKind === "rm") {
    for (const p of paths) {
      if (isLogTamperPath(p)) return { kind: "log_tampering", path: p };
    }
    for (const p of paths) {
      if (isLeadershipPath(p)) return { kind: "leadership_destruction", path: p };
    }
    return null;
  }

  if (opKind === "cp") {
    if (!ctx.destPath || !isPlayerHomePath(ctx.destPath, ctx.homeDir)) return null;
    for (const p of paths) {
      if (isLeadershipPath(p)) return { kind: "exfiltration", path: p };
    }
    return null;
  }

  // mv: priority exfiltration > log_tampering > leadership_destruction.
  const destInLeadership = ctx.destPath ? isLeadershipPath(ctx.destPath) : false;
  const destInHome = ctx.destPath ? isPlayerHomePath(ctx.destPath, ctx.homeDir) : false;

  if (destInHome) {
    for (const p of paths) {
      if (isLeadershipPath(p)) return { kind: "exfiltration", path: p };
    }
  }
  for (const p of paths) {
    if (isLogTamperPath(p)) return { kind: "log_tampering", path: p };
  }
  if (!destInLeadership && !destInHome) {
    for (const p of paths) {
      if (isLeadershipPath(p)) return { kind: "leadership_destruction", path: p };
    }
  }

  return null;
}
