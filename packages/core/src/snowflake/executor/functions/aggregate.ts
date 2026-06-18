import { Value, Row } from "../../types";
import { Expression } from "../../parser/ast";
import { evaluate, EvalContext } from "../evaluator";

export type AggregateAccumulator = {
  name: string;
  distinct: boolean;
  values: Value[];
};

export function initAccumulator(name: string, distinct: boolean): AggregateAccumulator {
  return { name: name.toUpperCase(), distinct, values: [] };
}

export function feedAccumulator(acc: AggregateAccumulator, arg: Expression | null, row: Row, ctx: EvalContext): void {
  if (arg === null) {
    // COUNT(*)
    acc.values.push(1);
    return;
  }
  const val = evaluate(arg, row, ctx);
  acc.values.push(val);
}

export function finalizeAccumulator(acc: AggregateAccumulator): Value {
  let values = acc.values;

  // For COUNT(*), just count all
  if (acc.name === "COUNT" && values.length > 0 && values[0] === 1 && !acc.distinct) {
    // This was COUNT(*) — values are all 1s
    // But we need to check — if all values are literally 1, it might be COUNT(*)
    // Better: check if arg was null in the accumulator
  }

  // Filter NULLs for non-COUNT aggregates
  if (acc.name !== "COUNT") {
    values = values.filter((v) => v !== null);
  }

  // Apply DISTINCT
  if (acc.distinct) {
    const seen = new Set<string>();
    values = values.filter((v) => {
      if (v === null) return false;
      const key = JSON.stringify(v);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  switch (acc.name) {
    case "COUNT":
      if (acc.distinct) return values.length;
      // COUNT with an arg (not *) filters nulls
      return values.filter((v) => v !== null).length;

    case "SUM": {
      if (values.length === 0) return null;
      return values.reduce((sum: number, v) => sum + Number(v), 0);
    }

    case "AVG": {
      if (values.length === 0) return null;
      const total = values.reduce((sum: number, v) => sum + Number(v), 0);
      return total / values.length;
    }

    case "MIN": {
      if (values.length === 0) return null;
      return values.reduce((min: Value, v) => {
        if (min === null) return v;
        if (typeof v === "number" && typeof min === "number") return v < min ? v : min;
        return String(v) < String(min) ? v : min;
      }, null as Value);
    }

    case "MAX": {
      if (values.length === 0) return null;
      return values.reduce((max: Value, v) => {
        if (max === null) return v;
        if (typeof v === "number" && typeof max === "number") return v > max ? v : max;
        return String(v) > String(max) ? v : max;
      }, null as Value);
    }

    case "LISTAGG": {
      if (values.length === 0) return null;
      return values.map(String).join(",");
    }

    case "ARRAY_AGG": {
      return values;
    }

    default:
      return null;
  }
}
