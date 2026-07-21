import { CursorPosition } from "../editor/types";
import { PendingState } from "./normal";
import { VisualPending } from "./visual";

export type VimMode = "normal" | "insert" | "visual" | "visual-line";

/**
 * The single unnamed register. Charwise text is stored as segments: one entry
 * per buffer line the yank/delete touched. Linewise text is whole lines.
 */
export interface Register {
  text: string[];
  linewise: boolean;
}

export interface UndoSnapshot {
  lines: string[];
  cursor: CursorPosition;
}

export interface CmdlineState {
  prefix: ":" | "/" | "?";
  input: string;
}

/** desiredCol sentinel: the cursor sticks to end-of-line across j/k (set by $). */
export const STICKY_EOL = Number.MAX_SAFE_INTEGER;

export interface VimState {
  lines: string[];
  cursor: CursorPosition;
  /** vi "curswant": the column vertical motions try to return to. */
  desiredCol: number;
  scrollOffset: number;
  mode: VimMode;
  pending: PendingState;
  visualPending: VisualPending;
  /** Fixed end of the visual selection (the cursor is the free end). */
  visualAnchor: CursorPosition | null;
  register: Register | null;
  undoStack: UndoSnapshot[];
  redoStack: UndoSnapshot[];
  cmdline: CmdlineState | null;
  lastSearch: { term: string; backward: boolean } | null;
  filePath: string;
  fileName: string;
  readOnly: boolean;
  modified: boolean;
  message: string | null;
}
