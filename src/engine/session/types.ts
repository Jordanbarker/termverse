import { VirtualFS } from "../filesystem/VirtualFS";
import { GameEvent } from "../mail/delivery";
import { SnowflakeState } from "../snowflake/state";
import type { ComputerId } from "../../state/types";

export interface SessionResult {
  type: "continue" | "exit";
  newFs?: VirtualFS;
  newState?: SnowflakeState;
  output?: string;
  triggerEvents?: GameEvent[];
  /** When set, the router should run a computer transition to this target after the session exits. */
  transitionTo?: ComputerId;
}

/** Session types that take over the full screen via xterm's alternate buffer. */
export const ALT_SCREEN_SESSION_TYPES = new Set(["editor", "less", "piper"]);

/** True if the session renders on the alternate screen buffer (vs inline in the normal buffer). */
export function sessionUsesAltScreen(type: string | null | undefined): boolean {
  return type != null && ALT_SCREEN_SESSION_TYPES.has(type);
}

export interface ISession {
  enter(): void | SessionResult | Promise<void>;
  handleInput(data: string): SessionResult | null;
  /** Returns false if the session has unsaved state and should not be closed. Defaults to true. */
  canClose?(): boolean;
  /** Re-read terminal dimensions and re-render (e.g. after tab switch / resize). */
  resize?(): void;
}
