import type { MachineId } from "../machine";

export interface LessSessionInfo {
  filename: string | null;
  content: string;
  /**
   * Optional computer transition to dispatch when the user closes the pager
   * (q / Ctrl-C). Surfaced via SessionResult.transitionTo so the session
   * router runs the transition exactly once after the alt-buffer is restored.
   */
  transitionAfterClose?: MachineId;
}
