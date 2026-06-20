"use client";

import { useEffect } from "react";

/**
 * Shows the browser's "Leave site?" confirmation while enabled, so an
 * accidental Ctrl+W (which browsers reserve for closing the tab on
 * Windows/Linux) doesn't silently end the game.
 */
export function useBeforeUnloadGuard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [enabled]);
}
