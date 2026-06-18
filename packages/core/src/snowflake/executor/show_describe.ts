import { SnowflakeState } from "../state";
import * as AST from "../parser/ast";
import { QueryResult, ResultSet } from "../formatter/result_types";
import { SessionContext } from "../session/context";
import { resolveThreePart, tableNotFoundError } from "./resolve";
import { isValidRole, canReadSchema, AVAILABLE_ROLES, getRoleDef } from "../session/permissions";

export function executeShow(stmt: AST.ShowStatement, state: SnowflakeState, ctx: SessionContext): QueryResult {
  switch (stmt.objectType) {
    case "DATABASES": {
      const dbs = state.listDatabases();
      const rs: ResultSet = {
        columns: [
          { name: "name", type: "VARCHAR" },
          { name: "created_on", type: "TIMESTAMP" },
        ],
        rows: dbs.map((d) => [d, new Date("2026-02-03")]),
        rowCount: dbs.length,
      };
      return { type: "resultset", data: rs };
    }

    case "SCHEMAS": {
      const columns = [
        { name: "name", type: "VARCHAR" as const },
        { name: "database_name", type: "VARCHAR" as const },
      ];
      const rows: (string | number | null)[][] = [];
      const dbs = stmt.inAccount
        ? state.listDatabases()
        : [(stmt.inDatabase ?? ctx.currentDatabase).toUpperCase()];
      for (const db of dbs) {
        for (const s of state.listSchemas(db)) {
          if (stmt.like && !likeMatch(s, stmt.like)) continue;
          rows.push([s, db]);
        }
      }
      return { type: "resultset", data: { columns, rows, rowCount: rows.length } };
    }

    case "TABLES": {
      const columns = [
        { name: "name", type: "VARCHAR" as const },
        { name: "database_name", type: "VARCHAR" as const },
        { name: "schema_name", type: "VARCHAR" as const },
        { name: "rows", type: "NUMBER" as const },
      ];
      const rows: (string | number | null)[][] = [];
      const targets = resolveShowTargets(stmt, state, ctx);
      for (const [db, schema] of targets) {
        if (!canReadSchema(ctx.currentRole, db, schema)) continue;
        for (const t of state.listTables(db, schema)) {
          if (stmt.like && !likeMatch(t.name, stmt.like)) continue;
          rows.push([t.name, db, schema, t.rows.length]);
        }
      }
      return { type: "resultset", data: { columns, rows, rowCount: rows.length } };
    }

    case "VIEWS": {
      const columns = [
        { name: "name", type: "VARCHAR" as const },
        { name: "database_name", type: "VARCHAR" as const },
        { name: "schema_name", type: "VARCHAR" as const },
      ];
      const rows: (string | number | null)[][] = [];
      const targets = resolveShowTargets(stmt, state, ctx);
      for (const [db, schema] of targets) {
        if (!canReadSchema(ctx.currentRole, db, schema)) continue;
        for (const v of state.listViews(db, schema)) {
          if (stmt.like && !likeMatch(v.name, stmt.like)) continue;
          rows.push([v.name, db, schema]);
        }
      }
      return { type: "resultset", data: { columns, rows, rowCount: rows.length } };
    }

    case "COLUMNS": {
      const db = (stmt.inDatabase ?? ctx.currentDatabase).toUpperCase();
      const schema = (stmt.inSchema ?? ctx.currentSchema).toUpperCase();
      if (!canReadSchema(ctx.currentRole, db, schema)) {
        return { type: "resultset", data: { columns: [], rows: [], rowCount: 0 } };
      }
      const tables = state.listTables(db, schema);
      const rows: (string | number | null)[][] = [];
      for (const t of tables) {
        for (const col of t.columns) {
          rows.push([t.name, col.name, col.type, col.nullable ? "Y" : "N"]);
        }
      }
      return {
        type: "resultset",
        data: {
          columns: [
            { name: "table_name", type: "VARCHAR" },
            { name: "column_name", type: "VARCHAR" },
            { name: "data_type", type: "VARCHAR" },
            { name: "is_nullable", type: "VARCHAR" },
          ],
          rows,
          rowCount: rows.length,
        },
      };
    }

    case "WAREHOUSES": {
      const whs = state.listWarehouses();
      const rs: ResultSet = {
        columns: [
          { name: "name", type: "VARCHAR" },
          { name: "size", type: "VARCHAR" },
          { name: "state", type: "VARCHAR" },
        ],
        rows: whs.map((w) => [w.name, w.size, w.state]),
        rowCount: whs.length,
      };
      return { type: "resultset", data: rs };
    }

    case "ROLES": {
      const rs: ResultSet = {
        columns: [
          { name: "name", type: "VARCHAR" },
          { name: "is_current", type: "VARCHAR" },
          { name: "comment", type: "VARCHAR" },
          { name: "created_on", type: "TIMESTAMP" },
        ],
        rows: AVAILABLE_ROLES.map((name) => {
          const def = getRoleDef(name)!;
          return [name, name === ctx.currentRole ? "Y" : "N", def.comment, def.createdOn];
        }),
        rowCount: AVAILABLE_ROLES.length,
      };
      return { type: "resultset", data: rs };
    }

    case "GRANTS": {
      const def = getRoleDef(ctx.currentRole);
      if (!def) {
        return { type: "resultset", data: { columns: [], rows: [], rowCount: 0 } };
      }
      const columns = [
        { name: "privilege", type: "VARCHAR" as const },
        { name: "granted_on", type: "VARCHAR" as const },
        { name: "name", type: "VARCHAR" as const },
        { name: "granted_to", type: "VARCHAR" as const },
        { name: "grantee_name", type: "VARCHAR" as const },
        { name: "grant_option", type: "VARCHAR" as const },
      ];
      if (def.isAdmin) {
        return {
          type: "resultset",
          data: {
            columns,
            rows: [["ALL PRIVILEGES", "ACCOUNT", "NEXACORP", "ROLE", def.name, "Y"]],
            rowCount: 1,
          },
        };
      }
      const rows: (string | number | null)[][] = [];
      for (const [schemaKey, level] of Object.entries(def.grants)) {
        rows.push(["USAGE", "SCHEMA", schemaKey, "ROLE", def.name, "N"]);
        rows.push(["SELECT", "SCHEMA", schemaKey, "ROLE", def.name, "N"]);
        if (level === "WRITE") {
          rows.push(["INSERT", "SCHEMA", schemaKey, "ROLE", def.name, "N"]);
          rows.push(["UPDATE", "SCHEMA", schemaKey, "ROLE", def.name, "N"]);
          rows.push(["DELETE", "SCHEMA", schemaKey, "ROLE", def.name, "N"]);
          rows.push(["CREATE TABLE", "SCHEMA", schemaKey, "ROLE", def.name, "N"]);
        }
      }
      return { type: "resultset", data: { columns, rows, rowCount: rows.length } };
    }

    default: {
      return { type: "resultset", data: { columns: [], rows: [], rowCount: 0 } };
    }
  }
}

export function executeDescribe(stmt: AST.DescribeStatement, state: SnowflakeState, ctx: SessionContext): QueryResult {
  switch (stmt.objectType) {
    case "TABLE": case "VIEW": {
      const [db, schema, name] = resolveThreePart(stmt.name, ctx);
      const tbl = state.getTable(db, schema, name);
      if (!tbl) return { type: "error", message: tableNotFoundError(stmt.name.join(".")) };

      const rs: ResultSet = {
        columns: [
          { name: "name", type: "VARCHAR" },
          { name: "type", type: "VARCHAR" },
          { name: "kind", type: "VARCHAR" },
          { name: "null?", type: "VARCHAR" },
          { name: "default", type: "VARCHAR" },
          { name: "primary key", type: "VARCHAR" },
        ],
        rows: tbl.columns.map((c) => [
          c.name,
          c.type,
          "COLUMN",
          c.nullable ? "Y" : "N",
          c.defaultValue != null ? String(c.defaultValue) : null,
          c.primaryKey ? "Y" : "N",
        ]),
        rowCount: tbl.columns.length,
      };
      return { type: "resultset", data: rs };
    }

    case "DATABASE": {
      const name = stmt.name[0].toUpperCase();
      const db = state.getDatabase(name);
      if (!db) return { type: "error", message: `Database '${name}' does not exist.` };
      return { type: "resultset", data: { columns: [{ name: "name", type: "VARCHAR" }], rows: [[name]], rowCount: 1 } };
    }

    case "SCHEMA": {
      const parts = stmt.name;
      const db = (parts.length === 2 ? parts[0] : ctx.currentDatabase).toUpperCase();
      const schema = parts[parts.length - 1].toUpperCase();
      if (!state.getSchema(db, schema)) return { type: "error", message: `Schema '${schema}' does not exist.` };
      return { type: "resultset", data: { columns: [{ name: "name", type: "VARCHAR" }], rows: [[schema]], rowCount: 1 } };
    }

    default:
      return { type: "error", message: `Cannot describe ${stmt.objectType}` };
  }
}

export function executeUse(stmt: AST.UseStatement, state: SnowflakeState, ctx: SessionContext): { result: QueryResult; ctx: SessionContext } {
  const name = stmt.name.toUpperCase();
  switch (stmt.objectType) {
    case "DATABASE":
      if (!state.getDatabase(name)) return { result: { type: "error", message: `Database '${name}' does not exist.` }, ctx };
      return { result: { type: "status", data: { message: `Statement executed successfully.` } }, ctx: { ...ctx, currentDatabase: name } };
    case "SCHEMA":
      if (!state.getSchema(ctx.currentDatabase, name)) return { result: { type: "error", message: `Schema '${name}' does not exist.` }, ctx };
      return { result: { type: "status", data: { message: `Statement executed successfully.` } }, ctx: { ...ctx, currentSchema: name } };
    case "WAREHOUSE":
      return { result: { type: "status", data: { message: `Statement executed successfully.` } }, ctx: { ...ctx, currentWarehouse: name } };
    case "ROLE":
      if (!isValidRole(name)) {
        return { result: { type: "error", message: `Role '${name}' does not exist or not authorized.` }, ctx };
      }
      return { result: { type: "status", data: { message: `Statement executed successfully.` } }, ctx: { ...ctx, currentRole: name } };
  }
}

function likeMatch(value: string, pattern: string): boolean {
  const regex = "^" + pattern.replace(/%/g, ".*").replace(/_/g, ".") + "$";
  return new RegExp(regex, "i").test(value);
}

/**
 * Resolves the (database, schema) pairs to scan for SHOW TABLES / SHOW VIEWS.
 * - IN ACCOUNT → every schema in every database
 * - IN DATABASE <db> → every schema in that database
 * - IN SCHEMA [<db>.]<schema> → that single schema
 * - bare → current schema
 */
function resolveShowTargets(
  stmt: AST.ShowStatement,
  state: SnowflakeState,
  ctx: SessionContext
): [string, string][] {
  if (stmt.inAccount) {
    const out: [string, string][] = [];
    for (const db of state.listDatabases()) {
      for (const schema of state.listSchemas(db)) out.push([db, schema]);
    }
    return out;
  }
  if (stmt.inDatabase && !stmt.inSchema) {
    const db = stmt.inDatabase.toUpperCase();
    return state.listSchemas(db).map((schema) => [db, schema] as [string, string]);
  }
  const db = (stmt.inDatabase ?? ctx.currentDatabase).toUpperCase();
  const schema = (stmt.inSchema ?? ctx.currentSchema).toUpperCase();
  return [[db, schema]];
}
