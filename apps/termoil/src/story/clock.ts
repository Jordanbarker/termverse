/**
 * Termoil game-clock factory. Builds a GameClock (CommandContext.clock) whose
 * in-game "now" advances with Piper delivery progression, so `date`, git commit
 * timestamps, dbt logs, and Snowflake `current_timestamp()` all agree.
 *
 * This is the app-side implementation of the engine's GameClock seam; it owns
 * the dependency on Piper delivery definitions + the segment timeline.
 */
import { ComputerId } from "../state/types";
import { GameClock, GameTime } from "@tt/core/commands/clock";
import { MachineId } from "@tt/core/machine";
import { getGameTime } from "../engine/piper/timestamp";
import { getPiperDeliveries } from "./piper/messages";

const MONTH_INDEX: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** Construct a Date from a GameTime using local-time field semantics. */
function gameTimeToDate(t: GameTime): Date {
  return new Date(
    Number(t.year),
    MONTH_INDEX[t.month] ?? 0,
    Number(t.day),
    Number(t.hour),
    Number(t.minute),
    Number(t.second),
  );
}

/**
 * Build a GameClock scoped to the current delivery state, user, and machine.
 * Methods recompute from the live inputs each call (cheap; mirrors the old
 * gameNowFor/gameTsFor/date construction).
 */
export function createGameClock(
  deliveredPiperIds: string[],
  username: string,
  computer: MachineId,
): GameClock {
  const compute = (): GameTime => {
    const defMap = new Map(getPiperDeliveries(username).map((d) => [d.id, d]));
    // The engine hands an opaque MachineId; in termoil it is always a ComputerId.
    return getGameTime(deliveredPiperIds, defMap, computer as ComputerId);
  };
  return {
    time: compute,
    now: () => gameTimeToDate(compute()),
    ts: () => {
      const t = compute();
      return `${t.hour}:${t.minute}:${t.second}`;
    },
  };
}
