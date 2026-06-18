import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { collectDescendantPaths } from "../engine/filesystem/walk";
import { colorize, ansi } from "../lib/ansi";
import {
  SecurityViolation,
  SecurityViolationKind,
  SecurityOpContext,
  SecurityPolicy,
  chmodIsRestrictive,
} from "../engine/commands/security";

// Re-export the core security types/helpers so existing app-side importers
// (hooks, builtins, tests) can keep importing them from story/security.
export type { SecurityViolation, SecurityViolationKind, SecurityOpContext, SecurityPolicy };
export { chmodIsRestrictive };

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
 * Walk descendants of `rootPath` and decide whether the op trips a tripwire.
 * Scoped to `computerId === "nexacorp"` defensively — other computers may
 * incidentally have files matching the protected patterns.
 */
export function opTouchesProtectedPath(
  fs: VirtualFS,
  rootPath: string,
  opKind: "rm" | "cp" | "mv",
  ctx: SecurityOpContext
): SecurityViolation | null {
  if (ctx.computerId !== "nexacorp") return null;

  const paths = collectDescendantPaths(fs, rootPath, { includeRoot: true });
  if (paths.length === 0) return null;

  const count = paths.length;

  if (opKind === "rm") {
    for (const p of paths) {
      if (isLogTamperPath(p)) {
        return { kind: "log_tampering", path: p, command: ctx.command, descendantCount: count };
      }
    }
    for (const p of paths) {
      if (isLeadershipPath(p)) {
        return { kind: "leadership_destruction", path: p, command: ctx.command, descendantCount: count };
      }
    }
    return null;
  }

  if (opKind === "cp") {
    if (!ctx.destPath || !isPlayerHomePath(ctx.destPath, ctx.homeDir)) return null;
    for (const p of paths) {
      if (isLeadershipPath(p)) {
        return {
          kind: "exfiltration",
          path: p,
          destPath: ctx.destPath,
          command: ctx.command,
          descendantCount: count,
        };
      }
    }
    return null;
  }

  // mv: priority exfiltration > log_tampering > leadership_destruction.
  const destInLeadership = ctx.destPath ? isLeadershipPath(ctx.destPath) : false;
  const destInHome = ctx.destPath ? isPlayerHomePath(ctx.destPath, ctx.homeDir) : false;

  if (destInHome) {
    for (const p of paths) {
      if (isLeadershipPath(p)) {
        return {
          kind: "exfiltration",
          path: p,
          destPath: ctx.destPath,
          command: ctx.command,
          descendantCount: count,
        };
      }
    }
  }
  for (const p of paths) {
    if (isLogTamperPath(p)) {
      return { kind: "log_tampering", path: p, command: ctx.command, descendantCount: count };
    }
  }
  if (!destInLeadership && !destInHome) {
    for (const p of paths) {
      if (isLeadershipPath(p)) {
        return { kind: "leadership_destruction", path: p, command: ctx.command, descendantCount: count };
      }
    }
  }

  return null;
}

/**
 * Pre-formatted (color-applied) corp-sec alert lines that stream during the
 * termination cinematic. Lines are violation-specific so the player sees the
 * actual path they tripped on, not a generic banner.
 */
export function getTerminationAlertLines(violation: SecurityViolation, pid: number): string[] {
  const tag = colorize("[corp-sec]", ansi.red, ansi.dim);
  switch (violation.kind) {
    case "log_tampering":
      return [
        `${tag} audit: write to ${violation.path} flagged`,
        `${tag} PID ${pid} — session marked for review`,
        `${tag} forwarding workstation telemetry to security@nexacorp.io`,
      ];
    case "leadership_destruction":
      return [
        `${tag} dlp: destructive op on ${violation.path}`,
        `${tag} PID ${pid} — confidential records affected`,
        `${tag} forwarding workstation telemetry to security@nexacorp.io`,
      ];
    case "exfiltration": {
      const dest = violation.destPath ?? "unknown destination";
      return [
        `${tag} dlp: confidential file transfer detected`,
        `${tag} source: ${violation.path} → ${dest}`,
        `${tag} forwarding workstation telemetry to security@nexacorp.io`,
      ];
    }
  }
}

/**
 * The turmoil security policy, injected into CommandContext.security when the
 * player is on the NexaCorp workstation. Bundles the protected-path rules above
 * behind the engine's story-agnostic SecurityPolicy interface.
 */
export const NEXACORP_SECURITY_POLICY: SecurityPolicy = {
  checkPathOp: (fs, rootPath, opKind, ctx) => opTouchesProtectedPath(fs, rootPath, opKind, ctx),
  classifyChmodTarget: (p) =>
    isLogTamperPath(p) ? "log_tampering" : isLeadershipPath(p) ? "leadership_destruction" : null,
  isLogTamperPath,
};
