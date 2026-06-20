import { Row } from "../types";
import { Expression } from "../parser/ast";
import { evaluate, toBool, EvalContext } from "./evaluator";

/**
 * Nested loop join — sufficient for game-scale data (< 1000 rows).
 */
export function nestedLoopJoin(
  left: Row[],
  right: Row[],
  joinType: "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS" | "NATURAL",
  condition: Expression | undefined,
  ctx: EvalContext,
  rightColumns?: string[]
): Row[] {
  if (joinType === "CROSS") {
    return crossJoin(left, right);
  }

  const results: Row[] = [];
  const rightMatched = new Set<number>();

  for (const leftRow of left) {
    let matched = false;

    for (let ri = 0; ri < right.length; ri++) {
      const rightRow = right[ri];
      const combined = mergeRows(leftRow, rightRow);

      if (!condition || toBool(evaluate(condition, combined, ctx))) {
        results.push(combined);
        matched = true;
        rightMatched.add(ri);
      }
    }

    // LEFT / FULL: unmatched left rows
    if (!matched && (joinType === "LEFT" || joinType === "FULL")) {
      const cols = rightColumns ?? Object.keys(right[0] ?? {});
      // Only pad columns that don't exist in the left row to avoid overwriting left values
      const nonConflicting = cols.filter((c) => !(c in leftRow));
      const nullRight = createNullRow(nonConflicting);
      results.push(mergeRows(leftRow, nullRight));
    }
  }

  // RIGHT / FULL: unmatched right rows
  if (joinType === "RIGHT" || joinType === "FULL") {
    const leftColumns = Object.keys(left[0] ?? {});
    for (let ri = 0; ri < right.length; ri++) {
      if (!rightMatched.has(ri)) {
        // Only pad columns that don't exist in the right row to avoid overwriting right values
        const nonConflicting = leftColumns.filter((c) => !(c in right[ri]));
        const nullLeft = createNullRow(nonConflicting);
        results.push(mergeRows(nullLeft, right[ri]));
      }
    }
  }

  return results;
}

function crossJoin(left: Row[], right: Row[]): Row[] {
  const results: Row[] = [];
  for (const l of left) {
    for (const r of right) {
      results.push(mergeRows(l, r));
    }
  }
  return results;
}

function mergeRows(a: Row, b: Row): Row {
  return { ...a, ...b };
}

function createNullRow(columns: string[]): Row {
  const row: Row = {};
  for (const col of columns) {
    row[col] = null;
  }
  return row;
}
