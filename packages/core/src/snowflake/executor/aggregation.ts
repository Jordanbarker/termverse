import { Row } from "../types";
import { Expression, SelectItem } from "../parser/ast";
import { evaluate, EvalContext, aggregateKey } from "./evaluator";
import { initAccumulator, feedAccumulator, finalizeAccumulator } from "./functions/aggregate";

/**
 * Execute GROUP BY + aggregation.
 * Returns grouped/aggregated rows.
 */
export function executeAggregation(
  rows: Row[],
  groupBy: Expression[],
  items: SelectItem[],
  ctx: EvalContext
): Row[] {
  // Find all aggregate expressions in select items
  const aggExprs = collectAggregates(items);

  if (groupBy.length === 0 && rows.length > 0) {
    // No GROUP BY — entire result is one group
    return [computeGroupRow(rows, [], aggExprs, items, ctx)];
  }

  if (groupBy.length === 0 && rows.length === 0) {
    // No rows, no GROUP BY — produce one row with default aggregate values
    return [computeGroupRow([], [], aggExprs, items, ctx)];
  }

  // Group rows by GROUP BY expressions
  const groups = new Map<string, Row[]>();
  const groupOrder: string[] = [];

  for (const row of rows) {
    const key = groupBy.map((e) => JSON.stringify(evaluate(e, row, ctx))).join("|");
    if (!groups.has(key)) {
      groups.set(key, []);
      groupOrder.push(key);
    }
    groups.get(key)!.push(row);
  }

  // Produce one output row per group
  return groupOrder.map((key) => {
    const groupRows = groups.get(key)!;
    return computeGroupRow(groupRows, groupBy, aggExprs, items, ctx);
  });
}

interface AggExprInfo {
  key: string;
  name: string;
  arg: Expression | null;
  distinct: boolean;
}

function collectAggregates(items: SelectItem[]): AggExprInfo[] {
  const aggs: AggExprInfo[] = [];
  const seen = new Set<string>();

  function walk(expr: Expression) {
    if (expr.kind === "aggregate_call") {
      const key = aggregateKey(expr);
      if (!seen.has(key)) {
        seen.add(key);
        aggs.push({ key, name: expr.name, arg: expr.arg, distinct: expr.distinct ?? false });
      }
    }
    if (expr.kind === "window_call") {
      // Don't collect window function's inner aggregate as a GROUP BY aggregate
      return;
    }
    // Recurse into sub-expressions
    if (expr.kind === "binary_expr") { walk(expr.left); walk(expr.right); }
    if (expr.kind === "unary_expr") walk(expr.operand);
    if (expr.kind === "function_call") expr.args.forEach(walk);
    if (expr.kind === "case_expr") {
      expr.whenClauses.forEach((wc) => { walk(wc.when); walk(wc.then); });
      if (expr.elseClause) walk(expr.elseClause);
    }
  }

  for (const item of items) walk(item.expr);
  return aggs;
}

function computeGroupRow(
  groupRows: Row[],
  groupBy: Expression[],
  aggExprs: AggExprInfo[],
  items: SelectItem[],
  ctx: EvalContext
): Row {
  const result: Row = {};

  // Copy group-by values from first row
  const representative = groupRows[0] ?? {};
  for (const expr of groupBy) {
    if (expr.kind === "column_ref") {
      const key = expr.table ? `${expr.table}.${expr.column}` : expr.column;
      result[key] = evaluate(expr, representative, ctx);
      // Also store without table prefix
      result[expr.column] = evaluate(expr, representative, ctx);
    }
  }

  // Compute aggregates
  for (const agg of aggExprs) {
    const acc = initAccumulator(agg.name, agg.distinct);
    for (const row of groupRows) {
      feedAccumulator(acc, agg.arg, row, ctx);
    }
    result[agg.key] = finalizeAccumulator(acc);
  }

  // Evaluate non-aggregate expressions using representative row + aggregate results
  for (const item of items) {
    const alias = item.alias ?? exprLabel(item.expr);
    const mergedRow = { ...representative, ...result };
    result[alias] = evaluate(item.expr, mergedRow, ctx);
  }

  return result;
}

function exprLabel(expr: Expression): string {
  switch (expr.kind) {
    case "column_ref": return expr.column;
    case "aggregate_call": return aggregateKey(expr);
    case "function_call": return `${expr.name}(...)`;
    default: return "?column?";
  }
}
