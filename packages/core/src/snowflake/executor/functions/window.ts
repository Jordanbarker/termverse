import { Value, Row } from "../../types";
import { Expression, WindowSpec } from "../../parser/ast";
import { evaluate, compareValues, EvalContext } from "../evaluator";

export interface WindowResult {
  key: string;
  values: Value[];
}

/**
 * Compute window function results for a set of rows.
 */
export function computeWindowFunction(
  funcName: string,
  funcArgs: Expression[],
  over: WindowSpec,
  rows: Row[],
  ctx: EvalContext
): Value[] {
  const name = funcName.toUpperCase();

  // Group rows into partitions
  const partitions = partitionRows(rows, over.partitionBy, ctx);
  const results: Value[] = new Array(rows.length);

  for (const partition of partitions) {
    // Sort partition if ORDER BY specified
    let sortedIndices = partition;
    if (over.orderBy.length > 0) {
      sortedIndices = [...partition].sort((a, b) => {
        for (const ob of over.orderBy) {
          const va = evaluate(ob.expr, rows[a], ctx);
          const vb = evaluate(ob.expr, rows[b], ctx);
          const cmp = compareValues(va, vb);
          if (cmp !== 0) return ob.direction === "DESC" ? -cmp : cmp;
        }
        return 0;
      });
    }

    switch (name) {
      case "ROW_NUMBER":
        for (let i = 0; i < sortedIndices.length; i++) {
          results[sortedIndices[i]] = i + 1;
        }
        break;

      case "RANK": {
        let rank = 1;
        for (let i = 0; i < sortedIndices.length; i++) {
          if (i > 0 && !orderByEqual(rows[sortedIndices[i]], rows[sortedIndices[i - 1]], over.orderBy, ctx)) {
            rank = i + 1;
          }
          results[sortedIndices[i]] = rank;
        }
        break;
      }

      case "DENSE_RANK": {
        let rank = 1;
        for (let i = 0; i < sortedIndices.length; i++) {
          if (i > 0 && !orderByEqual(rows[sortedIndices[i]], rows[sortedIndices[i - 1]], over.orderBy, ctx)) {
            rank++;
          }
          results[sortedIndices[i]] = rank;
        }
        break;
      }

      case "NTILE": {
        const n = funcArgs.length > 0 ? Number(evaluate(funcArgs[0], rows[0], ctx)) : 1;
        const size = sortedIndices.length;
        for (let i = 0; i < size; i++) {
          results[sortedIndices[i]] = Math.floor(i * n / size) + 1;
        }
        break;
      }

      case "LAG": {
        const offset = funcArgs.length > 1 ? Number(evaluate(funcArgs[1], rows[0], ctx)) : 1;
        const defaultVal = funcArgs.length > 2 ? evaluate(funcArgs[2], rows[0], ctx) : null;
        for (let i = 0; i < sortedIndices.length; i++) {
          if (i - offset >= 0) {
            results[sortedIndices[i]] = funcArgs.length > 0
              ? evaluate(funcArgs[0], rows[sortedIndices[i - offset]], ctx)
              : null;
          } else {
            results[sortedIndices[i]] = defaultVal;
          }
        }
        break;
      }

      case "LEAD": {
        const offset = funcArgs.length > 1 ? Number(evaluate(funcArgs[1], rows[0], ctx)) : 1;
        const defaultVal = funcArgs.length > 2 ? evaluate(funcArgs[2], rows[0], ctx) : null;
        for (let i = 0; i < sortedIndices.length; i++) {
          if (i + offset < sortedIndices.length) {
            results[sortedIndices[i]] = funcArgs.length > 0
              ? evaluate(funcArgs[0], rows[sortedIndices[i + offset]], ctx)
              : null;
          } else {
            results[sortedIndices[i]] = defaultVal;
          }
        }
        break;
      }

      case "FIRST_VALUE": {
        const firstVal = funcArgs.length > 0
          ? evaluate(funcArgs[0], rows[sortedIndices[0]], ctx)
          : null;
        for (const idx of sortedIndices) {
          results[idx] = firstVal;
        }
        break;
      }

      case "LAST_VALUE": {
        const lastVal = funcArgs.length > 0
          ? evaluate(funcArgs[0], rows[sortedIndices[sortedIndices.length - 1]], ctx)
          : null;
        for (const idx of sortedIndices) {
          results[idx] = lastVal;
        }
        break;
      }

      case "SUM": case "COUNT": case "AVG": case "MIN": case "MAX": {
        // Running aggregate over window frame
        for (let i = 0; i < sortedIndices.length; i++) {
          const frameRows = getFrameRows(sortedIndices, i, over);
          const vals = frameRows
            .map((fi) => funcArgs.length > 0 ? evaluate(funcArgs[0], rows[fi], ctx) : 1)
            .filter((v) => v !== null);
          results[sortedIndices[i]] = computeAggregateValue(name, vals);
        }
        break;
      }

      default:
        for (const idx of sortedIndices) {
          results[idx] = null;
        }
    }
  }

  return results;
}

function partitionRows(rows: Row[], partitionBy: Expression[], ctx: EvalContext): number[][] {
  if (partitionBy.length === 0) {
    return [rows.map((_, i) => i)];
  }

  const groups = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const key = partitionBy.map((e) => JSON.stringify(evaluate(e, rows[i], ctx))).join("|");
    const group = groups.get(key) ?? [];
    group.push(i);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

function orderByEqual(a: Row, b: Row, orderBy: { expr: Expression }[], ctx: EvalContext): boolean {
  for (const ob of orderBy) {
    const va = evaluate(ob.expr, a, ctx);
    const vb = evaluate(ob.expr, b, ctx);
    if (compareValues(va, vb) !== 0) return false;
  }
  return true;
}

function frameBoundOffset(expr: Expression | undefined): number {
  if (!expr) return 0;
  if (expr.kind === "number_literal") return expr.value;
  // Fallback: try to evaluate as a constant
  return Number(evaluate(expr, {}, {} as EvalContext)) || 0;
}

function getFrameRows(sortedIndices: number[], currentPos: number, over: WindowSpec): number[] {
  if (!over.frame) {
    // Default frame: RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    return sortedIndices.slice(0, currentPos + 1);
  }

  let start = 0;
  let end = sortedIndices.length - 1;

  const frame = over.frame;
  switch (frame.start.type) {
    case "UNBOUNDED_PRECEDING": start = 0; break;
    case "CURRENT_ROW": start = currentPos; break;
    case "PRECEDING": start = Math.max(0, currentPos - frameBoundOffset(frame.start.value)); break;
    case "FOLLOWING": start = Math.min(sortedIndices.length - 1, currentPos + frameBoundOffset(frame.start.value)); break;
    default: break;
  }

  if (frame.end) {
    switch (frame.end.type) {
      case "UNBOUNDED_FOLLOWING": end = sortedIndices.length - 1; break;
      case "CURRENT_ROW": end = currentPos; break;
      case "PRECEDING": end = Math.max(0, currentPos - frameBoundOffset(frame.end.value)); break;
      case "FOLLOWING": end = Math.min(sortedIndices.length - 1, currentPos + frameBoundOffset(frame.end.value)); break;
      default: break;
    }
  } else {
    end = currentPos;
  }

  return sortedIndices.slice(start, end + 1);
}

function computeAggregateValue(name: string, vals: Value[]): Value {
  if (vals.length === 0) return name === "COUNT" ? 0 : null;
  switch (name) {
    case "COUNT": return vals.length;
    case "SUM": return vals.reduce((s: number, v) => s + Number(v), 0);
    case "AVG": return vals.reduce((s: number, v) => s + Number(v), 0) / vals.length;
    case "MIN": return vals.reduce((m, v) => (compareValues(v, m) < 0 ? v : m));
    case "MAX": return vals.reduce((m, v) => (compareValues(v, m) > 0 ? v : m));
    default: return null;
  }
}
