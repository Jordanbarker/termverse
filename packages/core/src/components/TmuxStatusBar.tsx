"use client";

import type { ReactNode } from "react";
import { WindowState } from "../terminal/paneTypes";
import { ANSI_COLORS } from "../terminal/ansiPalette";

const PREFIX_BLUE = ANSI_COLORS.blue;

/** The status-bar colors this component reads. `TabBarTheme` is a superset, so
 *  it is structurally assignable here; term-crunch supplies a static palette. */
export interface StatusBarTheme {
  /** The bar background. */
  statusBg: string;
  /** Right-hint / `+` control text. */
  statusFg: string;
  /** Active tab background + prefix-pending highlight. */
  currentBg: string;
  /** Active tab foreground (also the modal-takeover text color). */
  currentFg: string;
  /** Inactive tab background ("transparent" inherits the bar). */
  windowBg: string;
  /** Inactive tab foreground. */
  windowFg: string;
}

export interface TmuxStatusBarProps {
  windows: WindowState[];
  activeWindowId: string;
  /** Derives each window's tab label (e.g. via `@tt/core/terminal/windowLabel`). */
  label: (win: WindowState) => string;
  onSelectWindow: (windowId: string) => void;
  onCloseWindow: (windowId: string) => void;
  /** True while the tmux prefix key is pending (lights up the PREFIX block). */
  prefixActive: boolean;
  /** Modal takeover text (rename-window / confirm-before-kill); hides tabs when set. */
  modalText?: string | null;
  /** Bar colors, parsed from `~/.tmux.conf` or a static palette. */
  theme: StatusBarTheme;
  /** App-specific new-window control rendered after the tabs (a `+` or a dropdown). */
  trailing?: ReactNode;
}

/**
 * The tmux-style status line shared by both games: a prefix-pending indicator,
 * `idx:label (paneCount)` window tabs with a close affordance, a modal takeover
 * (rename / confirm-before-kill), and an injected trailing new-window control.
 * Store-agnostic — `windows`/`activeWindowId` and all handlers arrive as props.
 */
export default function TmuxStatusBar({
  windows,
  activeWindowId,
  label,
  onSelectWindow,
  onCloseWindow,
  prefixActive,
  modalText,
  theme,
  trailing,
}: TmuxStatusBarProps) {
  return (
    <div
      className="flex items-center border-b font-mono text-xs select-none"
      style={{ backgroundColor: theme.statusBg, borderBottomColor: theme.statusBg }}
    >
      {modalText ? (
        // tmux confirm-before-kill / rename-window takes over the status line.
        <span className="px-2 py-0.5 font-bold" style={{ color: theme.currentFg }}>
          {modalText}
        </span>
      ) : (
        <>
          {/* tmux status-left: prefix-state indicator. Blank (space reserved) at
              rest; "PREFIX" in blue when armed. */}
          <span
            className={`px-2 py-0.5 font-bold transition-colors ${prefixActive ? "animate-pulse" : ""}`}
            style={{
              visibility: prefixActive ? "visible" : "hidden",
              color: PREFIX_BLUE,
            }}
          >
            PREFIX
          </span>
          {windows.map((win, idx) => {
            const isActive = win.id === activeWindowId;
            return (
              <button
                key={win.id}
                onClick={() => onSelectWindow(win.id)}
                className={`relative flex items-center gap-1.5 px-3 py-0.5 transition-opacity ${
                  isActive ? "font-medium" : "opacity-70 hover:opacity-100"
                }`}
                style={
                  isActive
                    ? { backgroundColor: theme.currentBg, color: theme.currentFg }
                    : { backgroundColor: theme.windowBg, color: theme.windowFg }
                }
              >
                <span className="truncate max-w-[220px]">
                  {idx + 1}:{label(win)}
                  {isActive && " *"}
                </span>
                {windows.length > 1 && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseWindow(win.id);
                    }}
                    className="ml-1 hover:text-red-500 transition-colors"
                  >
                    x
                  </span>
                )}
              </button>
            );
          })}
          {trailing}
        </>
      )}
    </div>
  );
}
