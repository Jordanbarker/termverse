import { Row } from "../types";
import { SelectItem, Expression, OrderByItem } from "../parser/ast";
import { evaluate, compareValues, EvalContext, windowKey } from "./evaluator";
import { computeWindowFunction } from "./functions/window";

/**
 * Process window functions in select items.
 * Adds computed window function values to each row.
 * After computing, sorts rows by the first window function's partition/order
 * so the output order reflects the window ordering.
 */
export function executeWindowFunctions(
  rows: Row[],
  items: SelectItem[],
  ctx: EvalContext,
  qualify?: Expression
): Row[] {
  const windowExprs = collectWindowCalls(items, qualify);
  if (windowExprs.length === 0) return rows;

  // Compute each window function
  let lastOrderBy: OrderByItem[] | undefined;
  for (const wExpr of windowExprs) {
    const expr = wExpr.expr;
    if (expr.kind !== "window_call") continue;

    const func = expr.func;
    const funcName = func.kind === "aggregate_call" ? func.name : func.name;
    const funcArgs = func.kind === "function_call" ? func.args : (func.arg ? [func.arg] : []);

    const values = computeWindowFunction(funcName, funcArgs, expr.over, rows, ctx);
    const key = windowKey(expr);

    for (let i = 0; i < rows.length; i++) {
      rows[i] = { ...rows[i], [key]: values[i] };
    }

    // Track the first window's ORDER BY for post-sort
    if (!lastOrderBy && expr.over.orderBy.length > 0) {
      lastOrderBy = expr.over.orderBy;
    }
  }

  // Sort rows by the first window function's ORDER BY so output reflects window ordering
  if (lastOrderBy) {
    const orderBy = lastOrderBy;
    rows.sort((a, b) => {
      for (const ob of orderBy) {
        const va = evaluate(ob.expr, a, ctx);
        const vb = evaluate(ob.expr, b, ctx);
        const cmp = compareValues(va, vb);
        if (cmp !== 0) return ob.direction === "DESC" ? -cmp : cmp;
      }
      return 0;
    });
  }

  return rows;
}

interface WindowExprInfo {
  expr: Expression;
  key: string;
}

function collectWindowCalls(items: SelectItem[], qualify?: Expression): WindowExprInfo[] {
  const result: WindowExprInfo[] = [];
  const seen = new Set<string>();

  function walk(expr: Expression) {
    if (expr.kind === "window_call") {
      const key = windowKey(expr);
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ expr, key });
      }
      return;
    }
    if (expr.kind === "binary_expr") { walk(expr.left); walk(expr.right); }
    if (expr.kind === "unary_expr") walk(expr.operand);
    if (expr.kind === "function_call") expr.args.forEach(walk);
    if (expr.kind === "case_expr") {
      expr.whenClauses.forEach((wc) => { walk(wc.when); walk(wc.then); });
      if (expr.elseClause) walk(expr.elseClause);
    }
  }

  for (const item of items) walk(item.expr);
  if (qualify) walk(qualify);
  return result;
}
