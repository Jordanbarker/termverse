/**
 * Pure tmux session-lifecycle model shared by both apps: a detached session is
 * just the saved shape of its windows (same `SavedWindowState` round-trip as
 * save/load), so panes come back with fresh shells on reattach. "Server
 * running" is derived (attached session or any detached snapshot exists) —
 * never stored.
 */

import type { SavedWindowState, WindowState } from "./paneTypes";
import { rebuildWindow, serializeWindow } from "./paneTypes";

export interface TmuxSessionSnapshot {
  name: string;
  windows: SavedWindowState[];
  activeWindowIndex: number;
  /** Epoch ms, only used to render the `(created ...)` column of `tmux ls`. */
  createdAt: number;
}

/** Real tmux default naming: the lowest unused non-negative integer. */
export function nextSessionName(existing: string[]): string {
  const taken = new Set(existing);
  let n = 0;
  while (taken.has(String(n))) n++;
  return String(n);
}

/** Serialize the live client (detach). */
export function snapshotSession(
  name: string,
  windows: WindowState[],
  activeWindowId: string,
  createdAt: number,
): TmuxSessionSnapshot {
  const idx = windows.findIndex((w) => w.id === activeWindowId);
  return {
    name,
    windows: windows.map(serializeWindow),
    activeWindowIndex: idx >= 0 ? idx : 0,
    createdAt,
  };
}

/** Rebuild live windows from a snapshot (attach) — fresh pane ids, fresh shells. */
export function restoreSession(snapshot: TmuxSessionSnapshot): {
  windows: WindowState[];
  activeWindowId: string;
} {
  const windows = snapshot.windows.map(rebuildWindow);
  const idx = Math.min(Math.max(0, snapshot.activeWindowIndex), windows.length - 1);
  return { windows, activeWindowId: windows[idx].id };
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Real tmux ctime-style stamp: `Fri Jul  4 09:12:00 2026` (day space-padded). */
function formatCreated(epochMs: number): string {
  const d = new Date(epochMs);
  const day = String(d.getDate()).padStart(2, " ");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${DOW[d.getDay()]} ${MONTHS[d.getMonth()]} ${day} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getFullYear()}`;
}

export interface TmuxLsEntry {
  name: string;
  windowCount: number;
  createdAt: number;
  attached: boolean;
}

/** `tmux ls` body, one line per session, matching real tmux formatting. */
export function formatTmuxLs(entries: TmuxLsEntry[]): string {
  return entries
    .map(
      (e) =>
        `${e.name}: ${e.windowCount} window${e.windowCount === 1 ? "" : "s"} (created ${formatCreated(e.createdAt)})${e.attached ? " (attached)" : ""}`,
    )
    .join("\n");
}
