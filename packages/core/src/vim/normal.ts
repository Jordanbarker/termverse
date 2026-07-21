import { MotionKey, MOTION_CHARS } from "./motions";

export type Operator = "d" | "c" | "y";

/** Multi-key continuation: "g" awaits gg; charFor awaits the argument of f/t/r. */
export type PendingPrefix = null | "g" | { charFor: "f" | "t" | "r" };

/**
 * Accumulated-but-incomplete normal-mode input, per vim's grammar:
 * {count1} [operator {count2}] motion. Counts multiply (2d3w = 6 words).
 */
export interface PendingState {
  count1: string;
  op: Operator | null;
  count2: string;
  prefix: PendingPrefix;
}

export const EMPTY_PENDING: PendingState = { count1: "", op: null, count2: "", prefix: null };

export type NormalCommand =
  | { kind: "move"; motion: MotionKey; count: number | null; char?: string }
  | { kind: "operate"; op: Operator; motion: MotionKey | "line"; count: number | null; char?: string }
  | { kind: "deleteChar"; count: number }
  | { kind: "replaceChar"; char: string; count: number }
  | { kind: "put"; before: boolean; count: number }
  | { kind: "openLine"; above: boolean }
  | { kind: "insert"; variant: "i" | "a" | "I" | "A" }
  | { kind: "visual"; linewise: boolean }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "cmdline"; prefix: ":" | "/" | "?" }
  | { kind: "searchNext"; reverse: boolean };

/**
 * Upper bound on a resolved count. Game buffers are tiny, so any larger count is a
 * fat-fingered `999999999p`; capping keeps paste/motion loops from hanging or
 * OOM-crashing the tab while leaving every realistic count untouched.
 */
export const MAX_COUNT = 100000;

function totalCount(p: PendingState): { count: number; given: boolean } {
  const c1 = p.count1 === "" ? 1 : parseInt(p.count1, 10);
  const c2 = p.count2 === "" ? 1 : parseInt(p.count2, 10);
  return { count: Math.min(c1 * c2, MAX_COUNT), given: p.count1 !== "" || p.count2 !== "" };
}

type Step = { pending: PendingState; command: NormalCommand | null };

const reset = (command: NormalCommand | null = null): Step => ({ pending: EMPTY_PENDING, command });

function motionStep(p: PendingState, motion: MotionKey, char?: string): Step {
  const { count, given } = totalCount(p);
  const resolvedCount = given ? count : null;
  if (p.op) {
    return reset({ kind: "operate", op: p.op, motion, count: resolvedCount, char });
  }
  return reset({ kind: "move", motion, count: resolvedCount, char });
}

/**
 * Feed one printable normal-mode key into the pending state machine.
 * Esc and control keys are handled by the session before reaching here.
 */
export function stepNormal(p: PendingState, ch: string): Step {
  // A prefix key is waiting for its argument.
  if (p.prefix !== null && typeof p.prefix === "object") {
    const { charFor } = p.prefix;
    if (charFor === "r") {
      const { count } = totalCount(p);
      return reset({ kind: "replaceChar", char: ch, count });
    }
    return motionStep({ ...p, prefix: null }, charFor, ch);
  }
  if (p.prefix === "g") {
    if (ch === "g") return motionStep({ ...p, prefix: null }, "gg");
    return reset();
  }

  // Count digits. A leading 0 is the line-start motion instead.
  if (/[0-9]/.test(ch)) {
    const buf = p.op ? p.count2 : p.count1;
    if (ch !== "0" || buf !== "") {
      return p.op
        ? { pending: { ...p, count2: buf + ch }, command: null }
        : { pending: { ...p, count1: buf + ch }, command: null };
    }
    return motionStep(p, "0");
  }

  // Operators. Doubling one (dd/yy/cc) targets whole lines.
  if (ch === "d" || ch === "c" || ch === "y") {
    if (p.op === ch) {
      const { count, given } = totalCount(p);
      return reset({ kind: "operate", op: ch, motion: "line", count: given ? count : null });
    }
    if (p.op) return reset();
    return { pending: { ...p, op: ch }, command: null };
  }

  if (MOTION_CHARS.has(ch)) return motionStep(p, ch as MotionKey);
  if (ch === "g") return { pending: { ...p, prefix: "g" }, command: null };
  if (ch === "f" || ch === "t") {
    return { pending: { ...p, prefix: { charFor: ch } }, command: null };
  }
  if (ch === "r") {
    if (p.op) return reset();
    return { pending: { ...p, prefix: { charFor: "r" } }, command: null };
  }

  // Standalone commands are invalid while an operator is pending.
  if (p.op) return reset();
  const { count } = totalCount(p);
  switch (ch) {
    case "x":
      return reset({ kind: "deleteChar", count });
    case "p":
      return reset({ kind: "put", before: false, count });
    case "P":
      return reset({ kind: "put", before: true, count });
    case "o":
      return reset({ kind: "openLine", above: false });
    case "O":
      return reset({ kind: "openLine", above: true });
    case "i":
    case "a":
    case "I":
    case "A":
      return reset({ kind: "insert", variant: ch });
    case "v":
      return reset({ kind: "visual", linewise: false });
    case "V":
      return reset({ kind: "visual", linewise: true });
    case "u":
      return reset({ kind: "undo" });
    case ":":
    case "/":
    case "?":
      return reset({ kind: "cmdline", prefix: ch });
    case "n":
      return reset({ kind: "searchNext", reverse: false });
    case "N":
      return reset({ kind: "searchNext", reverse: true });
    default:
      return reset();
  }
}

/** The partial-command echo shown at the right of the command line (vim's showcmd). */
export function showcmd(p: PendingState): string {
  let prefix = "";
  if (p.prefix === "g") prefix = "g";
  else if (p.prefix !== null && typeof p.prefix === "object") prefix = p.prefix.charFor;
  return p.count1 + (p.op ?? "") + p.count2 + prefix;
}
