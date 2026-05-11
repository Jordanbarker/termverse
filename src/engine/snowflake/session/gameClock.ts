import { ComputerId } from "../../../state/types";
import { getGameTime } from "../../piper/timestamp";
import { getPiperDeliveries } from "../../../story/piper/messages";

const MONTH_INDEX: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/**
 * Resolve the in-game "now" as a JS Date for the SQL executor.
 * Mirrors the construction in src/engine/commands/builtins/date.ts so
 * `select current_date()` and the `date` command agree.
 */
export function gameNowFor(
  deliveredPiperIds: string[],
  username: string,
  computer: ComputerId,
): Date {
  const defMap = new Map(getPiperDeliveries(username).map((d) => [d.id, d]));
  const t = getGameTime(deliveredPiperIds, defMap, computer);
  return new Date(
    Number(t.year),
    MONTH_INDEX[t.month] ?? 0,
    Number(t.day),
    Number(t.hour),
    Number(t.minute),
    Number(t.second),
  );
}
