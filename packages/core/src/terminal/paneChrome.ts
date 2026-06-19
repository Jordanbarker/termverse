/** Shared visual chrome for an xterm pane container, used by games' renderers. */
export const PANE_CHROME = {
  /** Inner gap between the pane border and the terminal content. */
  padding: "8px",
  /** Outline on the active pane (only shown when >1 pane is visible). */
  activeOutline: "1px solid #e6b450",
  /** Pulls the outline inside the container edge so it isn't clipped. */
  outlineOffset: "-1px",
} as const;
