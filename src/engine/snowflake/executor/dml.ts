import { SnowflakeState } from "../state";
import { Row, Value } from "../types";
import * as AST from "../parser/ast";
import { QueryResult } from "../formatter/result_types";
import { evaluate, toBool, EvalContext, evalContextFromSession } from "./evaluator";
import { SessionContext } from "../session/context";
import { execute as executeSql } from "./executor";
import { resolveThreePart, tableNotFoundError } from "./resolve";
import { checkPermission } from "../session/permissions";

export function executeDML(stmt: AST.Statement, state: SnowflakeState, ctx: SessionContext): { result: QueryResult; state: SnowflakeState } {
  const evalCtx = evalContextFromSession(ctx);
  switch (stmt.kind) {
    case "insert": return executeInsert(stmt, state, ctx, evalCtx);
    case "update": return executeUpdate(stmt, state, ctx, evalCtx);
    case "delete": return executeDelete(stmt, state, ctx, evalCtx);
    case "merge": return executeMerge(stmt, state, ctx, evalCtx);
    default:
      return { result: { type: "error", message: `Unsupported DML: ${(stmt as { kind: string }).kind}` }, state };
  }
}

function executeInsert(stmt: AST.InsertStatement, state: SnowflakeState, ctx: SessionContext, evalCtx: EvalContext): { result: QueryResult; state: SnowflakeState } {
  const [db, schema, table] = resolveThreePart(stmt.table, ctx);
  checkPermission(ctx.currentRole, db, schema, "WRITE");
  const tbl = state.getTable(db, schema, table);
  if (!tbl) return { result: { type: "error", message: tableNotFoundError(stmt.table.join(".")) }, state };

  const columns = stmt.columns ?? tbl.columns.map((c) => c.name);

  if (!stmt.values) {
    // INSERT ... SELECT — execute the SELECT and insert resulting rows
    if (!stmt.select) {
      return { result: { type: "status", data: { message: "Statement executed successfully.", rowsAffected: 0 } }, state };
    }
    const { results } = executeSql("", state, ctx, [stmt.select]);
    const selectResult = results[0];
    if (!selectResult || selectResult.type !== "resultset") {
      return { result: selectResult ?? { type: "error", message: "INSERT...SELECT failed." }, state };
    }
    const newRows: Row[] = selectResult.data.rows.map((valueRow) => {
      const row: Row = {};
      for (let i = 0; i < columns.length && i < valueRow.length; i++) {
        row[columns[i].toUpperCase()] = valueRow[i];
      }
      return row;
    });
    const newState = state.insertRows(db, schema, table, newRows);
    return {
      result: { type: "status", data: { message: `${newRows.length} Row(s) affected.`, rowsAffected: newRows.length } },
      state: newState,
    };
  }

  const newRows: Row[] = [];
  for (const valueRow of stmt.values) {
    const row: Row = {};
    for (let i = 0; i < columns.length; i++) {
      const colName = columns[i].toUpperCase();
      const val = i < valueRow.length ? evaluate(valueRow[i], {}, evalCtx) : null;
      row[colName] = val;
    }
    newRows.push(row);
  }

  const newState = state.insertRows(db, schema, table, newRows);
  return {
    result: { type: "status", data: { message: `${newRows.length} Row(s) affected.`, rowsAffected: newRows.length } },
    state: newState,
  };
}

function executeUpdate(stmt: AST.UpdateStatement, state: SnowflakeState, ctx: SessionContext, evalCtx: EvalContext): { result: QueryResult; state: SnowflakeState } {
  const [db, schema, table] = resolveThreePart(stmt.table, ctx);
  checkPermission(ctx.currentRole, db, schema, "WRITE");
  const tbl = state.getTable(db, schema, table);
  if (!tbl) return { result: { type: "error", message: tableNotFoundError(stmt.table.join(".")) }, state };

  const predicate = (row: Row): boolean => {
    if (!stmt.where) return true;
    return toBool(evaluate(stmt.where, row, evalCtx));
  };

  // Evaluate SET expressions per-row against the current row
  let affected = 0;
  let newState = state;
  for (let i = 0; i < tbl.rows.length; i++) {
    if (!predicate(tbl.rows[i])) continue;
    affected++;
    const updates: Record<string, Value> = {};
    for (const { column, value } of stmt.set) {
      updates[column.toUpperCase()] = evaluate(value, tbl.rows[i], evalCtx);
    }
    const targetRow = tbl.rows[i];
    newState = newState.updateRows(db, schema, table, (r) => r === targetRow, updates);
  }

  return {
    result: { type: "status", data: { message: `${affected} Row(s) affected.`, rowsAffected: affected } },
    state: newState,
  };
}

function executeDelete(stmt: AST.DeleteStatement, state: SnowflakeState, ctx: SessionContext, evalCtx: EvalContext): { result: QueryResult; state: SnowflakeState } {
  const [db, schema, table] = resolveThreePart(stmt.table, ctx);
  checkPermission(ctx.currentRole, db, schema, "WRITE");
  const tbl = state.getTable(db, schema, table);
  if (!tbl) return { result: { type: "error", message: tableNotFoundError(stmt.table.join(".")) }, state };

  let affected = 0;
  const predicate = (row: Row): boolean => {
    if (!stmt.where) return true;
    const match = toBool(evaluate(stmt.where, row, evalCtx));
    if (match) affected++;
    return match;
  };

  // Count first
  for (const row of tbl.rows) {
    if (!stmt.where || toBool(evaluate(stmt.where, row, evalCtx))) affected++;
  }

  const deletePredicate = (row: Row): boolean => {
    if (!stmt.where) return true;
    return toBool(evaluate(stmt.where, row, evalCtx));
  };

  const newState = state.deleteRows(db, schema, table, deletePredicate);
  return {
    result: { type: "status", data: { message: `${affected} Row(s) affected.`, rowsAffected: affected } },
    state: newState,
  };
}

function executeMerge(stmt: AST.MergeStatement, state: SnowflakeState, ctx: SessionContext, evalCtx: EvalContext): { result: QueryResult; state: SnowflakeState } {
  const [db, schema, table] = resolveThreePart(stmt.target, ctx);
  checkPermission(ctx.currentRole, db, schema, "WRITE");
  const tbl = state.getTable(db, schema, table);
  if (!tbl) return { result: { type: "error", message: tableNotFoundError(stmt.target.join(".")) }, state };

  // Get source rows
  let sourceRows: Row[] = [];
  if (stmt.source.kind === "table_name") {
    const [sDb, sSch, sTbl] = resolveThreePart(stmt.source.name, ctx);
    checkPermission(ctx.currentRole, sDb, sSch, "READ");
    const srcTable = state.getTable(sDb, sSch, sTbl);
    if (srcTable) sourceRows = srcTable.rows;
  }

  let newState = state;
  let affected = 0;

  const targetAlias = stmt.targetAlias;
  const sourceAlias = stmt.source.kind === "table_name" ? stmt.source.alias : undefined;

  for (const srcRow of sourceRows) {
    // Check each target row for match
    let matched = false;
    for (const targetRow of tbl.rows) {
      const combined = {
        ...prefixRow(targetRow, targetAlias),
        ...prefixRow(srcRow, sourceAlias),
      };
      if (toBool(evaluate(stmt.condition, combined, evalCtx))) {
        matched = true;
        // Execute WHEN MATCHED clauses
        for (const clause of stmt.clauses) {
          if (!clause.matched) continue;
          if (clause.condition && !toBool(evaluate(clause.condition, combined, evalCtx))) continue;

          if (clause.action === "UPDATE" && clause.set) {
            const updates: Record<string, Value> = {};
            for (const { column, value } of clause.set) {
              // Strip target alias prefix from column name (e.g. "t.name" -> "NAME")
              const colName = column.includes(".")
                ? column.split(".").pop()!.toUpperCase()
                : column.toUpperCase();
              updates[colName] = evaluate(value, combined, evalCtx);
            }
            newState = newState.updateRows(db, schema, table, (r) => r === targetRow, updates);
            affected++;
          } else if (clause.action === "DELETE") {
            newState = newState.deleteRows(db, schema, table, (r) => r === targetRow);
            affected++;
          }
          break;
        }
        break;
      }
    }

    if (!matched) {
      // Execute WHEN NOT MATCHED clauses
      for (const clause of stmt.clauses) {
        if (clause.matched) continue;
        if (clause.action === "INSERT" && clause.values) {
          const row: Row = {};
          const cols = clause.columns ?? tbl.columns.map((c) => c.name);
          const combined = {
            ...prefixRow(srcRow, sourceAlias),
          };
          for (let i = 0; i < cols.length; i++) {
            row[cols[i].toUpperCase()] = i < clause.values.length ? evaluate(clause.values[i], combined, evalCtx) : null;
          }
          newState = newState.insertRows(db, schema, table, [row]);
          affected++;
        }
        break;
      }
    }
  }

  return {
    result: { type: "status", data: { message: `${affected} Row(s) affected.`, rowsAffected: affected } },
    state: newState,
  };
}

function prefixRow(row: Row, alias?: string): Row {
  if (!alias) return row;
  const result: Row = { ...row };
  for (const [k, v] of Object.entries(row)) {
    result[`${alias}.${k}`] = v;
  }
  return result;
}
