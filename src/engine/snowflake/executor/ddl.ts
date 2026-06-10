import { SnowflakeState } from "../state";
import { Column } from "../types";
import * as AST from "../parser/ast";
import { QueryResult } from "../formatter/result_types";
import { SessionContext } from "../session/context";
import { resolveThreePart, tableNotFoundError } from "./resolve";
import { checkPermission, getRoleDef } from "../session/permissions";

function requireAdmin(ctx: SessionContext): void {
  const def = getRoleDef(ctx.currentRole);
  if (!def?.isAdmin) {
    throw new Error("SQL access control error:\nInsufficient privileges to operate on account 'NEXACORP'");
  }
}

export function executeDDL(stmt: AST.Statement, state: SnowflakeState, ctx: SessionContext): { result: QueryResult; state: SnowflakeState } {
  switch (stmt.kind) {
    case "create_database": return executeCreateDatabase(stmt, state, ctx);
    case "create_schema": return executeCreateSchema(stmt, state, ctx);
    case "create_table": return executeCreateTable(stmt, state, ctx);
    case "create_view": return executeCreateView(stmt, state, ctx);
    case "create_warehouse": return executeCreateWarehouse(stmt, state, ctx);
    case "create_stage": return executeCreateStage(stmt, state, ctx);
    case "create_sequence": return executeCreateSequence(stmt, state, ctx);
    case "alter_table": return executeAlterTable(stmt, state, ctx);
    case "drop": return executeDrop(stmt, state, ctx);
    case "truncate": return executeTruncate(stmt, state, ctx);
    default:
      return { result: { type: "error", message: `Unsupported DDL: ${(stmt as { kind: string }).kind}` }, state };
  }
}

function ok(msg?: string): QueryResult {
  return { type: "status", data: { message: msg ?? "Statement executed successfully." } };
}

function executeCreateDatabase(stmt: AST.CreateDatabaseStatement, state: SnowflakeState, ctx: SessionContext): { result: QueryResult; state: SnowflakeState } {
  requireAdmin(ctx);
  const name = stmt.name.toUpperCase();
  if (state.getDatabase(name) && !stmt.orReplace) {
    if (stmt.ifNotExists) return { result: ok(), state };
    return { result: { type: "error", message: `Database '${name}' already exists.` }, state };
  }

  let newState = state.createDatabase(name);
  if (stmt.clone) {
    const src = state.getDatabase(stmt.clone.toUpperCase());
    if (!src) return { result: { type: "error", message: `Database '${stmt.clone}' does not exist.` }, state };
    // Deep clone all schemas/tables
    for (const [schName, sch] of Object.entries(src.schemas)) {
      newState = newState.createSchema(name, schName);
      for (const [tblName, tbl] of Object.entries(sch.tables)) {
        newState = newState.createTable(name, schName, tblName, tbl.columns);
        newState = newState.insertRows(name, schName, tblName, tbl.rows.map((r) => ({ ...r })));
      }
    }
  }
  return { result: ok(`Database '${name}' successfully created.`), state: newState };
}

function executeCreateSchema(stmt: AST.CreateSchemaStatement, state: SnowflakeState, ctx: SessionContext): { result: QueryResult; state: SnowflakeState } {
  requireAdmin(ctx);
  const db = (stmt.database ?? ctx.currentDatabase).toUpperCase();
  const name = stmt.name.toUpperCase();
  if (!state.getDatabase(db)) return { result: { type: "error", message: `Database '${db}' does not exist.` }, state };
  if (state.getSchema(db, name) && !stmt.orReplace) {
    if (stmt.ifNotExists) return { result: ok(), state };
    return { result: { type: "error", message: `Schema '${name}' already exists.` }, state };
  }
  return { result: ok(`Schema '${name}' successfully created.`), state: state.createSchema(db, name) };
}

function executeCreateTable(stmt: AST.CreateTableStatement, state: SnowflakeState, ctx: SessionContext): { result: QueryResult; state: SnowflakeState } {
  const [db, schema, table] = resolveThreePart(stmt.name, ctx);
  checkPermission(ctx.currentRole, db, schema, "WRITE");
  if (!state.getDatabase(db)) return { result: { type: "error", message: `Database '${db}' does not exist.` }, state };
  if (!state.getSchema(db, schema)) return { result: { type: "error", message: `Schema '${db}.${schema}' does not exist.` }, state };

  if (state.getTable(db, schema, table) && !stmt.orReplace) {
    if (stmt.ifNotExists) return { result: ok(), state };
    return { result: { type: "error", message: `Table '${table}' already exists.` }, state };
  }

  // CLONE
  if (stmt.clone) {
    const [srcDb, srcSchema, srcTable] = resolveThreePart(stmt.clone, ctx);
    if (!state.getTable(srcDb, srcSchema, srcTable)) {
      return { result: { type: "error", message: tableNotFoundError(stmt.clone.join(".")) }, state };
    }
    return { result: ok(`Table '${table}' successfully created.`), state: state.cloneTable(srcDb, srcSchema, srcTable, db, schema, table) };
  }

  const columns: Column[] = stmt.columns.map((c) => ({
    name: c.name.toUpperCase(),
    type: mapDataType(c.type),
    nullable: c.nullable !== false,
    primaryKey: c.primaryKey,
    autoIncrement: c.autoIncrement,
  }));

  const newState = state.createTable(db, schema, table, columns);

  // AS SELECT
  if (stmt.asSelect) {
    // Execute the select and insert results — simplified
    // Full implementation would use the executor pipeline
  }

  return { result: ok(`Table '${table}' successfully created.`), state: newState };
}

function executeCreateView(stmt: AST.CreateViewStatement, state: SnowflakeState, ctx: SessionContext): { result: QueryResult; state: SnowflakeState } {
  const [db, schema, name] = resolveThreePart(stmt.name, ctx);
  checkPermission(ctx.currentRole, db, schema, "WRITE");
  const view = {
    name: name.toUpperCase(),
    columns: [],
    query: "VIEW_SQL",
  };
  return { result: ok(`View '${name}' successfully created.`), state: state.createView(db, schema, view) };
}

function executeCreateWarehouse(stmt: AST.CreateWarehouseStatement, state: SnowflakeState, ctx: SessionContext): { result: QueryResult; state: SnowflakeState } {
  requireAdmin(ctx);
  const wh = {
    name: stmt.name.toUpperCase(),
    size: stmt.size ?? "X-Small",
    state: "STARTED" as const,
    autoSuspend: stmt.autoSuspend ?? 600,
  };
  return { result: ok(`Warehouse '${wh.name}' successfully created.`), state: state.createWarehouse(wh) };
}

function executeCreateStage(stmt: AST.CreateStageStatement, state: SnowflakeState, ctx: SessionContext): { result: QueryResult; state: SnowflakeState } {
  const [db, schema, name] = resolveThreePart(stmt.name, ctx);
  checkPermission(ctx.currentRole, db, schema, "WRITE");
  const stage = { name: name.toUpperCase(), files: {} };
  return { result: ok(`Stage '${name}' successfully created.`), state: state.createStage(db, schema, stage) };
}

function executeCreateSequence(stmt: AST.CreateSequenceStatement, state: SnowflakeState, ctx: SessionContext): { result: QueryResult; state: SnowflakeState } {
  const [db, schema, name] = resolveThreePart(stmt.name, ctx);
  checkPermission(ctx.currentRole, db, schema, "WRITE");
  const seq = { name: name.toUpperCase(), current: stmt.start ?? 1, increment: stmt.increment ?? 1 };
  return { result: ok(`Sequence '${name}' successfully created.`), state: state.createSequence(db, schema, seq) };
}

function executeAlterTable(stmt: AST.AlterTableStatement, state: SnowflakeState, ctx: SessionContext): { result: QueryResult; state: SnowflakeState } {
  const [db, schema, table] = resolveThreePart(stmt.table, ctx);
  checkPermission(ctx.currentRole, db, schema, "WRITE");
  if (!state.getTable(db, schema, table)) {
    return { result: { type: "error", message: tableNotFoundError(stmt.table.join(".")) }, state };
  }

  switch (stmt.action.type) {
    case "add_column": {
      const col: Column = {
        name: stmt.action.column.name.toUpperCase(),
        type: mapDataType(stmt.action.column.type),
        nullable: stmt.action.column.nullable !== false,
      };
      return { result: ok(), state: state.alterTableAddColumn(db, schema, table, col) };
    }
    case "drop_column":
      return { result: ok(), state: state.alterTableDropColumn(db, schema, table, stmt.action.name) };
    case "rename_column":
    case "rename_table":
      return { result: ok(), state };
    default:
      return { result: ok(), state };
  }
}

function executeDrop(stmt: AST.DropStatement, state: SnowflakeState, ctx: SessionContext): { result: QueryResult; state: SnowflakeState } {
  switch (stmt.objectType) {
    case "DATABASE": {
      requireAdmin(ctx);
      const name = stmt.name[0].toUpperCase();
      if (!state.getDatabase(name)) {
        if (stmt.ifExists) return { result: ok(), state };
        return { result: { type: "error", message: `Database '${name}' does not exist.` }, state };
      }
      return { result: ok(`${name} successfully dropped.`), state: state.dropDatabase(name) };
    }
    case "SCHEMA": {
      requireAdmin(ctx);
      const parts = stmt.name;
      const db = (parts.length === 2 ? parts[0] : ctx.currentDatabase).toUpperCase();
      const schema = parts[parts.length - 1].toUpperCase();
      if (!state.getSchema(db, schema)) {
        if (stmt.ifExists) return { result: ok(), state };
        return { result: { type: "error", message: `Schema '${schema}' does not exist.` }, state };
      }
      return { result: ok(`${schema} successfully dropped.`), state: state.dropSchema(db, schema) };
    }
    case "TABLE": {
      const [db, schema, table] = resolveThreePart(stmt.name, ctx);
      checkPermission(ctx.currentRole, db, schema, "WRITE");
      if (!state.getTable(db, schema, table)) {
        if (stmt.ifExists) return { result: ok(), state };
        return { result: { type: "error", message: tableNotFoundError(table) }, state };
      }
      return { result: ok(`${table} successfully dropped.`), state: state.dropTable(db, schema, table) };
    }
    case "VIEW": {
      const [db, schema, name] = resolveThreePart(stmt.name, ctx);
      checkPermission(ctx.currentRole, db, schema, "WRITE");
      return { result: ok(`${name} successfully dropped.`), state: state.dropView(db, schema, name) };
    }
    case "WAREHOUSE": {
      requireAdmin(ctx);
      const name = stmt.name[0].toUpperCase();
      return { result: ok(`${name} successfully dropped.`), state: state.dropWarehouse(name) };
    }
    case "STAGE": case "SEQUENCE":
      return { result: ok(`${stmt.name.join(".")} successfully dropped.`), state };
    default:
      return { result: ok(), state };
  }
}

function executeTruncate(stmt: AST.TruncateStatement, state: SnowflakeState, ctx: SessionContext): { result: QueryResult; state: SnowflakeState } {
  const [db, schema, table] = resolveThreePart(stmt.table, ctx);
  checkPermission(ctx.currentRole, db, schema, "WRITE");
  if (!state.getTable(db, schema, table)) {
    return { result: { type: "error", message: tableNotFoundError(stmt.table.join(".")) }, state };
  }
  return { result: { type: "status", data: { message: "Statement executed successfully.", rowsAffected: 0 } }, state: state.truncateTable(db, schema, table) };
}

function mapDataType(type: string): "NUMBER" | "FLOAT" | "VARCHAR" | "BOOLEAN" | "DATE" | "TIMESTAMP" | "TIME" | "VARIANT" | "OBJECT" | "ARRAY" {
  const upper = type.toUpperCase().replace(/\(.*\)/, "");
  switch (upper) {
    case "NUMBER": case "INT": case "INTEGER": case "BIGINT": case "SMALLINT":
    case "TINYINT": case "DECIMAL": case "NUMERIC":
      return "NUMBER";
    case "FLOAT": case "DOUBLE": case "REAL":
      return "FLOAT";
    case "VARCHAR": case "CHAR": case "STRING": case "TEXT":
      return "VARCHAR";
    case "BOOLEAN":
      return "BOOLEAN";
    case "DATE":
      return "DATE";
    case "TIMESTAMP": case "TIMESTAMP_NTZ": case "TIMESTAMP_LTZ": case "TIMESTAMP_TZ":
      return "TIMESTAMP";
    case "TIME":
      return "TIME";
    case "VARIANT":
      return "VARIANT";
    case "OBJECT":
      return "OBJECT";
    case "ARRAY":
      return "ARRAY";
    default:
      return "VARCHAR";
  }
}
