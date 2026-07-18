import { CursorPosition } from "../editor/types";
import { MotionKey } from "./motions";

/** Pending visual-mode input: an optional count plus a g/f/t continuation. */
export interface VisualPending {
  count: string;
  prefix: null | "g" | { charFor: "f" | "t" };
}

export const EMPTY_VISUAL_PENDING: VisualPending = { count: "", prefix: null };

export type VisualCommand =
  | { kind: "move"; motion: MotionKey; count: number | null; char?: string }
  | { kind: "operate"; op: "d" | "y" | "c" }
  | { kind: "swapEnds" }
  | { kind: "setWise"; linewise: boolean }
  | { kind: "exit" };

const MOTION_CHARS = new Set<string>(["h", "l", "j", "k", "w", "b", "e", "^", "$", "G"]);

type Step = { pending: VisualPending; command: VisualCommand | null };

const reset = (command: VisualCommand | null = null): Step => ({
  pending: EMPTY_VISUAL_PENDING,
  command,
});

function motionStep(p: VisualPending, motion: MotionKey, char?: string): Step {
  const count = p.count === "" ? null : parseInt(p.count, 10);
  return reset({ kind: "move", motion, count, char });
}

/** Feed one printable visual-mode key into the pending state machine. */
export function stepVisual(p: VisualPending, ch: string): Step {
  if (p.prefix !== null && typeof p.prefix === "object") {
    return motionStep({ ...p, prefix: null }, p.prefix.charFor, ch);
  }
  if (p.prefix === "g") {
    if (ch === "g") return motionStep({ ...p, prefix: null }, "gg");
    return reset();
  }

  if (/[0-9]/.test(ch)) {
    if (ch !== "0" || p.count !== "") {
      return { pending: { ...p, count: p.count + ch }, command: null };
    }
    return motionStep(p, "0");
  }

  if (MOTION_CHARS.has(ch)) return motionStep(p, ch as MotionKey);
  if (ch === "g") return { pending: { ...p, prefix: "g" }, command: null };
  if (ch === "f" || ch === "t") {
    return { pending: { ...p, prefix: { charFor: ch } }, command: null };
  }

  switch (ch) {
    case "d":
    case "x":
      return reset({ kind: "operate", op: "d" });
    case "y":
      return reset({ kind: "operate", op: "y" });
    case "c":
      return reset({ kind: "operate", op: "c" });
    case "o":
      return reset({ kind: "swapEnds" });
    case "v":
      return reset({ kind: "setWise", linewise: false });
    case "V":
      return reset({ kind: "setWise", linewise: true });
    default:
      return reset();
  }
}

/** Order two positions so start <= end in (row, col) document order. */
export function orderedRange(
  a: CursorPosition,
  b: CursorPosition
): { start: CursorPosition; end: CursorPosition } {
  if (a.row < b.row || (a.row === b.row && a.col <= b.col)) {
    return { start: a, end: b };
  }
  return { start: b, end: a };
}
