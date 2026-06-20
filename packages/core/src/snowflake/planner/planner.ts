import * as AST from "../parser/ast";
import * as Plan from "./plan";

export interface PlannerContext {
  currentDatabase: string;
  currentSchema: string;
  cteScopes?: Map<string, AST.SelectStatement>;
}

/**
 * Translate a SelectStatement AST into a LogicalPlan tree.
 * Non-select statements (DDL, DML) are executed directly by the executor — they don't need planning.
 */
export function planSelect(stmt: AST.SelectStatement, ctx: PlannerContext): Plan.LogicalPlan {
  // Register CTEs
  const cteScopes = new Map(ctx.cteScopes);
  if (stmt.ctes) {
    for (const cte of stmt.ctes) {
      cteScopes.set(cte.name.toUpperCase(), cte.query);
    }
  }
  const innerCtx = { ...ctx, cteScopes };

  let plan: Plan.LogicalPlan;

  // FROM clause
  if (stmt.from) {
    plan = planTableRef(stmt.from, innerCtx);
  } else {
    plan = { kind: "empty" };
  }

  // WHERE
  if (stmt.where) {
    plan = { kind: "filter", source: plan, condition: stmt.where };
  }

  // GROUP BY + HAVING
  if (stmt.groupBy || hasAggregates(stmt.items)) {
    plan = { kind: "aggregate", source: plan, groupBy: stmt.groupBy ?? [], having: stmt.having };
  }

  // SELECT (projection)
  plan = {
    kind: "project",
    source: plan,
    expressions: stmt.items.map((i) => ({ expr: i.expr, alias: i.alias })),
  };

  // QUALIFY is handled in executeSelect after window functions — not here

  // DISTINCT
  if (stmt.distinct) {
    plan = { kind: "distinct", source: plan };
  }

  // ORDER BY
  if (stmt.orderBy) {
    plan = { kind: "sort", source: plan, orderBy: stmt.orderBy };
  }

  // LIMIT / OFFSET / TOP
  if (stmt.limit || stmt.offset || stmt.top) {
    plan = {
      kind: "limit",
      source: plan,
      count: stmt.limit ?? (stmt.top ? { kind: "number_literal", value: stmt.top } : undefined),
      offset: stmt.offset,
    };
  }

  // Set operations are handled in executeSelect after projection — not here

  return plan;
}

function planTableRef(ref: AST.TableRef, ctx: PlannerContext): Plan.LogicalPlan {
  switch (ref.kind) {
    case "table_name": {
      const parts = ref.name;
      const upperName = parts[parts.length - 1].toUpperCase();

      // Check CTE scope
      if (parts.length === 1 && ctx.cteScopes?.has(upperName)) {
        const cteQuery = ctx.cteScopes.get(upperName)!;
        return {
          kind: "derived",
          query: withOuterCtes(cteQuery, ctx, upperName),
          alias: ref.alias ?? parts[0],
        };
      }

      let db: string, schema: string, table: string;
      if (parts.length === 3) {
        db = parts[0]; schema = parts[1]; table = parts[2];
      } else if (parts.length === 2) {
        db = ctx.currentDatabase; schema = parts[0]; table = parts[1];
      } else {
        db = ctx.currentDatabase; schema = ctx.currentSchema; table = parts[0];
      }
      return { kind: "scan", database: db.toUpperCase(), schema: schema.toUpperCase(), table: table.toUpperCase(), alias: ref.alias ?? undefined };
    }

    case "subquery_table": {
      return {
        kind: "derived",
        query: withOuterCtes(ref.query, ctx),
        alias: ref.alias ?? undefined,
      };
    }

    case "flatten_table": {
      return {
        kind: "flatten",
        source: { kind: "empty" },
        input: ref.input,
        path: ref.path,
        outer: ref.outer,
        alias: ref.alias ?? undefined,
      };
    }

    case "joined_table": {
      const left = planTableRef(ref.left, ctx);
      const right = planTableRef(ref.right, ctx);
      return { kind: "join", joinType: ref.joinType, left, right, condition: ref.condition };
    }
  }
}

/**
 * The derived query is re-planned from scratch at execution time, so the
 * planner's CTE scope must travel with it: attach the in-scope CTEs as the
 * query's own (unless it already defines some). `excludeName` drops the CTE's
 * own name so a self-reference falls through to table resolution instead of
 * recursing forever.
 */
function withOuterCtes(
  query: AST.SelectStatement,
  ctx: PlannerContext,
  excludeName?: string,
): AST.SelectStatement {
  if (query.ctes || !ctx.cteScopes || ctx.cteScopes.size === 0) return query;
  const ctes: AST.CTE[] = [];
  for (const [name, cteQuery] of ctx.cteScopes) {
    if (name !== excludeName) ctes.push({ name, query: cteQuery });
  }
  if (ctes.length === 0) return query;
  return { ...query, ctes };
}

function hasAggregates(items: AST.SelectItem[]): boolean {
  return items.some((i) => containsAggregate(i.expr));
}

function containsAggregate(expr: AST.Expression): boolean {
  switch (expr.kind) {
    case "aggregate_call":
      return true;
    case "function_call":
      return expr.args.some(containsAggregate);
    case "binary_expr":
      return containsAggregate(expr.left) || containsAggregate(expr.right);
    case "unary_expr":
      return containsAggregate(expr.operand);
    case "case_expr":
      return expr.whenClauses.some((wc) => containsAggregate(wc.when) || containsAggregate(wc.then)) ||
             (expr.elseClause ? containsAggregate(expr.elseClause) : false);
    case "window_call":
      return false; // Window functions aren't aggregates for GROUP BY purposes
    default:
      return false;
  }
}

export type { PlannerContext as PlanContext };
