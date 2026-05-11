import { SnowflakeState } from "../state";
import { Row, Value, DataType } from "../types";
import { tokenize } from "../lexer/lexer";
import { parse, parseMultiple } from "../parser/parser";
import { ParseError } from "../parser/errors";
import { planSelect } from "../planner/planner";
import * as Plan from "../planner/plan";
import * as AST from "../parser/ast";
import { QueryResult, ResultSet } from "../formatter/result_types";
import { evaluate, EvalContext, evalContextFromSession, toBool, compareValues } from "./evaluator";
import { nestedLoopJoin } from "./joins";
import { executeAggregation } from "./aggregation";
import { executeWindowFunctions } from "./window_exec";
import { sortRows } from "./sort";
import { executeDDL } from "./ddl";
import { executeDML } from "./dml";
import { executeShow, executeDescribe, executeUse } from "./show_describe";
import { executeCopyInto } from "./copy_staging";
import { SessionContext } from "../session/context";
import { tableNotFoundError } from "./resolve";
import { checkPermission } from "../session/permissions";

export interface ExecutionResult {
  results: QueryResult[];
  state: SnowflakeState;
  context: SessionContext;
}

/**
 * Execute one or more SQL statements against a SnowflakeState.
 * Returns results for each statement plus the new state.
 */
export function execute(sql: string, state: SnowflakeState, ctx: SessionContext, preParsed?: AST.Statement[]): ExecutionResult {
  let currentState = state;
  let currentCtx = ctx;
  const results: QueryResult[] = [];

  try {
    const statements = preParsed ?? parseMultiple(tokenize(sql));

    for (const stmt of statements) {
      const { result, newState, newCtx } = executeStatement(stmt, currentState, currentCtx);
      results.push(result);
      if (newState) currentState = newState;
      if (newCtx) currentCtx = newCtx;
    }
  } catch (e) {
    if (e instanceof ParseError) {
      results.push({
        type: "error",
        message: e.message,
        position: e.position ? { line: e.position.line, column: e.position.column } : undefined,
      });
    } else {
      results.push({ type: "error", message: (e as Error).message ?? String(e) });
    }
  }

  return { results, state: currentState, context: currentCtx };
}

function executeStatement(
  stmt: AST.Statement,
  state: SnowflakeState,
  ctx: SessionContext
): { result: QueryResult; newState?: SnowflakeState; newCtx?: SessionContext } {
  try {
    switch (stmt.kind) {
      case "select": {
        const result = executeSelect(stmt, state, ctx);
        return { result };
      }

      case "insert": case "update": case "delete": case "merge": {
        const { result, state: newState } = executeDML(stmt, state, ctx);
        return { result, newState };
      }

      case "create_database": case "create_schema": case "create_table":
      case "create_view": case "create_warehouse": case "create_stage":
      case "create_sequence": case "alter_table": case "drop": case "truncate": {
        const { result, state: newState } = executeDDL(stmt, state, ctx);
        return { result, newState };
      }

      case "show": {
        const result = executeShow(stmt, state, ctx);
        return { result };
      }

      case "describe": {
        const result = executeDescribe(stmt, state, ctx);
        return { result };
      }

      case "use": {
        const { result, ctx: newCtx } = executeUse(stmt, state, ctx);
        return { result, newCtx };
      }

      case "copy_into": {
        const { result, state: newState } = executeCopyInto(stmt, state, ctx);
        return { result, newState };
      }

      case "set_compound": {
        let currentState = state;
        let currentCtx = ctx;
        let lastResult: QueryResult = { type: "status", data: { message: "Statement executed successfully." } };
        for (const s of stmt.statements) {
          const r = executeStatement(s, currentState, currentCtx);
          lastResult = r.result;
          if (r.newState) currentState = r.newState;
          if (r.newCtx) currentCtx = r.newCtx;
        }
        return { result: lastResult, newState: currentState, newCtx: currentCtx };
      }

      default:
        return { result: { type: "error", message: `Unsupported statement type: ${(stmt as { kind: string }).kind}` } };
    }
  } catch (e) {
    return { result: { type: "error", message: (e as Error).message ?? String(e) } };
  }
}

function executeSubqueryInner(
  query: AST.SelectStatement,
  outerRow: Row,
  state: SnowflakeState,
  ctx: SessionContext,
  outerCtes?: AST.CTE[]
): Row[] {
  // Merge outer CTEs if the subquery doesn't define its own
  const subQuery = { ...query, ctes: query.ctes ?? outerCtes };

  const planCtx = {
    currentDatabase: ctx.currentDatabase,
    currentSchema: ctx.currentSchema,
  };
  const plan = planSelect(subQuery, planCtx);

  // Create an eval context for the subquery that also has subquery support
  const subEvalCtx: EvalContext = evalContextFromSession(ctx, {
    executeSubquery: (q, row) => executeSubqueryInner(q, row, state, ctx, subQuery.ctes),
  });

  // Execute the plan with outer row context for correlated references
  const rows = executePlan(plan, state, subEvalCtx, subQuery, outerRow);

  return rows;
}

function executeSelect(stmt: AST.SelectStatement, state: SnowflakeState, ctx: SessionContext, parentEvalCtx?: EvalContext): QueryResult {
  const evalCtx: EvalContext = evalContextFromSession(ctx, {
    executeSubquery: (query: AST.SelectStatement, outerRow: Row) => {
      return executeSubqueryInner(query, outerRow, state, ctx, stmt.ctes);
    },
    viewDepth: parentEvalCtx?.viewDepth,
  });

  const planCtx = {
    currentDatabase: ctx.currentDatabase,
    currentSchema: ctx.currentSchema,
  };

  const plan = planSelect(stmt, planCtx);
  let rows = executePlan(plan, state, evalCtx, stmt);

  // Apply window functions
  rows = executeWindowFunctions(rows, stmt.items, evalCtx, stmt.qualify);

  // Project to final column list
  const { resultRows, columns } = projectRows(rows, stmt.items, evalCtx);

  // QUALIFY (post-window filter)
  let filteredRows = resultRows;
  if (stmt.qualify) {
    filteredRows = [];
    for (let i = 0; i < resultRows.length; i++) {
      // Build a lookup row with both original and projected values
      const lookupRow: Row = { ...rows[i] };
      for (let j = 0; j < columns.length; j++) {
        lookupRow[columns[j].name] = resultRows[i][j];
      }
      if (toBool(evaluate(stmt.qualify, lookupRow, evalCtx))) {
        filteredRows.push(resultRows[i]);
      }
    }
  }

  // DISTINCT — deduplicate projected rows
  if (stmt.distinct) {
    const seen = new Set<string>();
    filteredRows = filteredRows.filter((row) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Set operations
  if (stmt.setOp) {
    const rightResult = executeSelect(stmt.setOp.right, state, ctx);
    if (rightResult.type !== "resultset") return rightResult;
    return executeSetOp(stmt.setOp.type, { columns, rows: filteredRows, rowCount: filteredRows.length }, rightResult.data);
  }

  return {
    type: "resultset",
    data: { columns, rows: filteredRows, rowCount: filteredRows.length },
  };
}

function executePlan(plan: Plan.LogicalPlan, state: SnowflakeState, ctx: EvalContext, originalStmt?: AST.SelectStatement, outerRow?: Row): Row[] {
  switch (plan.kind) {
    case "empty":
      return [outerRow ? { ...outerRow } : {}]; // Single empty row for SELECT without FROM

    case "scan": {
      if (!(ctx.viewDepth ?? 0)) {
        checkPermission(ctx.currentRole, plan.database, plan.schema, "READ");
      }
      const tbl = state.getTable(plan.database, plan.schema, plan.table);
      if (!tbl) {
        // Fall back to view expansion
        const view = state.getView(plan.database, plan.schema, plan.table);
        if (view) {
          const depth = ctx.viewDepth ?? 0;
          if (depth >= 10) {
            throw new Error("View expansion exceeded maximum depth (10). Possible circular view reference.");
          }
          const viewCtx: EvalContext = { ...ctx, viewDepth: depth + 1 };
          const viewStmt = parseMultiple(tokenize(view.query))[0] as AST.SelectStatement;
          const viewResult = executeSelect(viewStmt, state, {
            currentDatabase: ctx.currentDatabase,
            currentSchema: ctx.currentSchema,
            currentWarehouse: ctx.currentWarehouse,
            currentRole: ctx.currentRole,
            currentUser: ctx.currentUser,
            gameNow: ctx.gameNow,
          }, viewCtx);
          if (viewResult.type === "resultset") {
            return viewResult.data.rows.map((valueRow) => {
              const row: Row = { ...(outerRow ?? {}) };
              viewResult.data.columns.forEach((col, i) => {
                row[col.name] = valueRow[i];
                if (plan.alias) row[`${plan.alias}.${col.name}`] = valueRow[i];
              });
              return row;
            });
          }
        }
        throw new Error(tableNotFoundError(`${plan.database}.${plan.schema}.${plan.table}`));
      }

      // Prefix columns with alias if present, merge outer row for correlated subqueries
      const rows = tbl.rows.map((row) => {
        const result: Row = { ...(outerRow ?? {}), ...row };
        if (plan.alias) {
          for (const [k, v] of Object.entries(row)) {
            result[`${plan.alias}.${k}`] = v;
          }
        }
        return result;
      });
      return rows;
    }

    case "filter": {
      const sourceRows = executePlan(plan.source, state, ctx, originalStmt, outerRow);
      return sourceRows.filter((row) => {
        const val = evaluate(plan.condition, row, ctx);
        return toBool(val);
      });
    }

    case "project": {
      // Don't project here — projection happens in projectRows after window functions
      return executePlan(plan.source, state, ctx, originalStmt, outerRow);
    }

    case "join": {
      const leftRows = executePlan(plan.left, state, ctx, originalStmt, outerRow);

      // LATERAL FLATTEN: evaluate right side per-left-row
      if (plan.right.kind === "flatten") {
        const result: Row[] = [];
        for (const leftRow of leftRows) {
          const flattenedRows = executePlan(plan.right, state, ctx, originalStmt, leftRow);
          result.push(...flattenedRows);
        }
        return result;
      }

      const rightRows = executePlan(plan.right, state, ctx, originalStmt, outerRow);
      const rightCols = rightRows.length > 0 ? Object.keys(rightRows[0]) : [];
      return nestedLoopJoin(leftRows, rightRows, plan.joinType, plan.condition, ctx, rightCols);
    }

    case "aggregate": {
      const sourceRows = executePlan(plan.source, state, ctx, originalStmt, outerRow);
      const items = originalStmt?.items ?? [];
      let aggRows = executeAggregation(sourceRows, plan.groupBy, items, ctx);

      // HAVING
      if (plan.having) {
        aggRows = aggRows.filter((row) => toBool(evaluate(plan.having!, row, ctx)));
      }

      return aggRows;
    }

    case "sort": {
      const sourceRows = executePlan(plan.source, state, ctx, originalStmt, outerRow);
      return sortRows(sourceRows, plan.orderBy, ctx);
    }

    case "limit": {
      const sourceRows = executePlan(plan.source, state, ctx, originalStmt, outerRow);
      let offset = 0;
      let count = sourceRows.length;

      if (plan.offset) {
        offset = Number(evaluate(plan.offset, {}, ctx)) || 0;
      }
      if (plan.count) {
        count = Number(evaluate(plan.count, {}, ctx));
      }

      return sourceRows.slice(offset, offset + count);
    }

    case "distinct": {
      const sourceRows = executePlan(plan.source, state, ctx, originalStmt, outerRow);
      const seen = new Set<string>();
      return sourceRows.filter((row) => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    case "union": {
      const leftRows = executePlan(plan.left, state, ctx, originalStmt, outerRow);
      const rightRows = executePlan(plan.right, state, ctx, originalStmt, outerRow);

      switch (plan.type) {
        case "UNION ALL":
          return [...leftRows, ...rightRows];
        case "UNION": {
          const all = [...leftRows, ...rightRows];
          const seen = new Set<string>();
          return all.filter((row) => {
            const key = JSON.stringify(row);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        case "INTERSECT": {
          const rightKeys = new Set(rightRows.map((r) => JSON.stringify(r)));
          return leftRows.filter((r) => rightKeys.has(JSON.stringify(r)));
        }
        case "EXCEPT": {
          const rightKeys = new Set(rightRows.map((r) => JSON.stringify(r)));
          return leftRows.filter((r) => !rightKeys.has(JSON.stringify(r)));
        }
      }
      break;
    }

    case "flatten": {
      const sourceRows = executePlan(plan.source, state, ctx, originalStmt, outerRow);
      const result: Row[] = [];

      for (const row of sourceRows) {
        let val = evaluate(plan.input, row, ctx);

        // Apply path if specified
        if (plan.path && val != null && typeof val === "object" && !Array.isArray(val)) {
          val = (val as Record<string, Value>)[plan.path] ?? null;
        }

        if (Array.isArray(val)) {
          for (let i = 0; i < val.length; i++) {
            const element = val[i];
            const flatRow: Row = { ...row };
            flatRow["SEQ"] = 1;
            flatRow["KEY"] = i;
            flatRow["PATH"] = String(i);
            flatRow["INDEX"] = i;
            flatRow["VALUE"] = element;
            flatRow["THIS"] = val;
            if (plan.alias) {
              flatRow[`${plan.alias}.SEQ`] = 1;
              flatRow[`${plan.alias}.KEY`] = i;
              flatRow[`${plan.alias}.PATH`] = String(i);
              flatRow[`${plan.alias}.INDEX`] = i;
              flatRow[`${plan.alias}.VALUE`] = element;
              flatRow[`${plan.alias}.THIS`] = val;
            }
            result.push(flatRow);
          }
        } else if (val != null && typeof val === "object") {
          const obj = val as Record<string, Value>;
          const keys = Object.keys(obj);
          for (let i = 0; i < keys.length; i++) {
            const flatRow: Row = { ...row };
            flatRow["SEQ"] = 1;
            flatRow["KEY"] = keys[i];
            flatRow["PATH"] = keys[i];
            flatRow["INDEX"] = i;
            flatRow["VALUE"] = obj[keys[i]];
            flatRow["THIS"] = val;
            if (plan.alias) {
              flatRow[`${plan.alias}.SEQ`] = 1;
              flatRow[`${plan.alias}.KEY`] = keys[i];
              flatRow[`${plan.alias}.PATH`] = keys[i];
              flatRow[`${plan.alias}.INDEX`] = i;
              flatRow[`${plan.alias}.VALUE`] = obj[keys[i]];
              flatRow[`${plan.alias}.THIS`] = val;
            }
            result.push(flatRow);
          }
        } else if (plan.outer) {
          // OUTER: emit a row with NULLs for flatten columns
          const flatRow: Row = { ...row };
          flatRow["SEQ"] = null;
          flatRow["KEY"] = null;
          flatRow["PATH"] = null;
          flatRow["INDEX"] = null;
          flatRow["VALUE"] = null;
          flatRow["THIS"] = null;
          result.push(flatRow);
        }
        // If not OUTER and val is null/scalar, skip (no rows emitted)
      }

      return result;
    }

    case "values":
      return plan.rows.map((row) => {
        const result: Row = {};
        row.forEach((expr, i) => {
          result[`column${i + 1}`] = evaluate(expr, {}, ctx);
        });
        return result;
      });
  }

  return [];
}

function projectRows(
  rows: Row[],
  items: AST.SelectItem[],
  ctx: EvalContext
): { resultRows: Value[][]; columns: { name: string; type: DataType }[] } {
  // Handle SELECT * — expand all columns
  const expandedItems: { expr: AST.Expression; alias?: string }[] = [];
  for (const item of items) {
    if (item.expr.kind === "star_ref" && !item.expr.table) {
      // SELECT * — use all keys from first row
      if (rows.length > 0) {
        for (const key of Object.keys(rows[0])) {
          // Skip internal keys (prefixed with __)
          if (key.startsWith("__")) continue;
          // Skip table.column duplicates (keep only unprefixed)
          if (key.includes(".")) continue;
          expandedItems.push({ expr: { kind: "column_ref", column: key }, alias: key });
        }
      }
      continue;
    }
    if (item.expr.kind === "star_ref" && item.expr.table) {
      // SELECT t.* — expand columns prefixed with table alias
      if (rows.length > 0) {
        const prefix = item.expr.table + ".";
        for (const key of Object.keys(rows[0])) {
          if (key.startsWith(prefix)) {
            const colName = key.slice(prefix.length);
            expandedItems.push({ expr: { kind: "column_ref", column: key }, alias: colName });
          }
        }
      }
      continue;
    }
    expandedItems.push(item);
  }

  const columns: { name: string; type: DataType }[] = expandedItems.map((item) => ({
    name: (item.alias ?? inferColumnName(item.expr)).toUpperCase(),
    type: inferType(item.expr, rows[0]),
  }));

  const resultRows: Value[][] = rows.map((row) =>
    expandedItems.map((item) => evaluate(item.expr, row, ctx))
  );

  return { resultRows, columns };
}

function inferColumnName(expr: AST.Expression): string {
  switch (expr.kind) {
    case "column_ref": return expr.column;
    case "aggregate_call": return expr.arg ? `${expr.name}(${inferColumnName(expr.arg)})` : `${expr.name}(*)`;
    case "function_call": return `${expr.name}(${expr.args.map(inferColumnName).join(",")})`;
    case "number_literal": return String(expr.value);
    case "string_literal": return `'${expr.value}'`;
    case "window_call": return inferColumnName(expr.func);
    case "star_ref": return "*";
    case "cast_expr": return `CAST(${inferColumnName(expr.expr)} AS ${expr.targetType})`;
    default: return "?column?";
  }
}

function inferType(expr: AST.Expression, row?: Row): DataType {
  switch (expr.kind) {
    case "number_literal": return "NUMBER";
    case "string_literal": return "VARCHAR";
    case "boolean_literal": return "BOOLEAN";
    case "null_literal": return "VARCHAR";
    case "column_ref": return "VARCHAR"; // Could look up from table schema
    case "aggregate_call": return expr.name === "COUNT" ? "NUMBER" : "NUMBER";
    case "function_call": return "VARCHAR";
    case "cast_expr": {
      const t = expr.targetType.toUpperCase().replace(/\(.*\)/, "");
      if (t === "NUMBER" || t === "INT" || t === "INTEGER") return "NUMBER";
      if (t === "FLOAT" || t === "DOUBLE") return "FLOAT";
      if (t === "BOOLEAN") return "BOOLEAN";
      if (t === "DATE") return "DATE";
      if (t === "TIMESTAMP") return "TIMESTAMP";
      return "VARCHAR";
    }
    default: return "VARCHAR";
  }
}

function executeSetOp(type: string, left: ResultSet, right: ResultSet): QueryResult {
  const columns = left.columns;
  let rows: Value[][] = [];

  switch (type) {
    case "UNION ALL":
      rows = [...left.rows, ...right.rows];
      break;
    case "UNION": {
      const all = [...left.rows, ...right.rows];
      const seen = new Set<string>();
      rows = all.filter((r) => {
        const key = JSON.stringify(r);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      break;
    }
    case "INTERSECT": {
      const rightKeys = new Set(right.rows.map((r) => JSON.stringify(r)));
      rows = left.rows.filter((r) => rightKeys.has(JSON.stringify(r)));
      break;
    }
    case "EXCEPT": {
      const rightKeys = new Set(right.rows.map((r) => JSON.stringify(r)));
      rows = left.rows.filter((r) => !rightKeys.has(JSON.stringify(r)));
      break;
    }
  }

  return { type: "resultset", data: { columns, rows, rowCount: rows.length } };
}
