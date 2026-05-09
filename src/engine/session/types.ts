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

export interface ISession {
  enter(): void | SessionResult | Promise<void>;
  handleInput(data: string): SessionResult | null;
  /** Returns false if the session has unsaved state and should not be closed. Defaults to true. */
  canClose?(): boolean;
  /** Re-read terminal dimensions and re-render (e.g. after tab switch / resize). */
  resize?(): void;
}
