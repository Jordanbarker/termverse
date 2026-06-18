import { SnowflakeState } from "@tt/core/snowflake/state";
import { Column, Row } from "@tt/core/snowflake/types";
import { execute } from "@tt/core/snowflake/executor/executor";
import { SessionContext } from "@tt/core/snowflake/session/context";
import { ResultSet } from "@tt/core/snowflake/formatter/result_types";

const TARGET_DB = "NEXACORP_PROD";
const TARGET_SCHEMA = "ANALYTICS";
const DBT_ROLE = "TRANSFORMER";

/** Override session role to the dbt service role (matches dbt profile config). */
function dbtCtx(ctx: SessionContext): SessionContext {
  return { ...ctx, currentRole: DBT_ROLE };
}

export interface ModelExecutionResult {
  status: "success" | "error";
  rowsAffected?: number;
  message?: string;
  newState: SnowflakeState;
}

export interface TestExecutionResult {
  status: "pass" | "warn" | "error";
  rowCount?: number;
  message?: string;
}

/**
 * Execute a compiled model SQL and materialize the result.
 */
export function executeModel(
  compiledSql: string,
  modelName: string,
  materialization: "view" | "table",
  state: SnowflakeState,
  sessionCtx: SessionContext,
): ModelExecutionResult {
  const tableName = modelName.toUpperCase();

  try {
    if (materialization === "view") {
      return executeViewModel(compiledSql, tableName, state, sessionCtx);
    }
    return executeTableModel(compiledSql, tableName, state, sessionCtx);
  } catch (e) {
    return { status: "error", message: (e as Error).message, newState: state };
  }
}

function executeTableModel(
  compiledSql: string,
  tableName: string,
  state: SnowflakeState,
  sessionCtx: SessionContext,
): ModelExecutionResult {
  const { results, state: execState } = execute(compiledSql, state, dbtCtx(sessionCtx));

  // Find the resultset
  const resultSet = results.find((r) => r.type === "resultset");
  if (!resultSet || resultSet.type !== "resultset") {
    const errorResult = results.find((r) => r.type === "error");
    const message = errorResult && errorResult.type === "error" ? errorResult.message : "No result set returned";
    return { status: "error", message, newState: execState };
  }

  const rs = resultSet.data;

  // Drop existing table
  let s = execState.dropTable(TARGET_DB, TARGET_SCHEMA, tableName);

  // Create table from result columns
  const columns: Column[] = rs.columns.map((rc) => ({
    name: rc.name.toUpperCase(),
    type: rc.type,
    nullable: true,
  }));
  s = s.createTable(TARGET_DB, TARGET_SCHEMA, tableName, columns);

  // Insert result rows
  const rows: Row[] = rs.rows.map((valueRow) => {
    const row: Row = {};
    rs.columns.forEach((col, i) => {
      row[col.name.toUpperCase()] = valueRow[i];
    });
    return row;
  });
  if (rows.length > 0) {
    s = s.insertRows(TARGET_DB, TARGET_SCHEMA, tableName, rows);
  }

  return { status: "success", rowsAffected: rs.rowCount, newState: s };
}

function executeViewModel(
  compiledSql: string,
  tableName: string,
  state: SnowflakeState,
  sessionCtx: SessionContext,
): ModelExecutionResult {
  // Execute SELECT to get row count for output
  const { results } = execute(compiledSql, state, dbtCtx(sessionCtx));
  const resultSet = results.find((r) => r.type === "resultset");
  if (!resultSet || resultSet.type !== "resultset") {
    const errorResult = results.find((r) => r.type === "error");
    const message = errorResult && errorResult.type === "error" ? errorResult.message : "No result set returned";
    return { status: "error", message, newState: state };
  }

  // Store the view definition directly (bypass SQL CREATE VIEW)
  const viewDef = { name: tableName, columns: [], query: compiledSql };
  let s = state.dropView(TARGET_DB, TARGET_SCHEMA, tableName);
  s = s.createView(TARGET_DB, TARGET_SCHEMA, viewDef);

  return { status: "success", rowsAffected: resultSet.data.rowCount, newState: s };
}

/**
 * Execute a compiled test SQL and determine pass/warn/error.
 * Tests that return 0 rows pass; tests that return rows warn.
 */
export function executeTest(
  compiledSql: string,
  state: SnowflakeState,
  sessionCtx: SessionContext,
): TestExecutionResult {
  try {
    const { results } = execute(compiledSql, state, dbtCtx(sessionCtx));
    const resultSet = results.find((r) => r.type === "resultset");
    if (!resultSet || resultSet.type !== "resultset") {
      const errorResult = results.find((r) => r.type === "error");
      const message = errorResult && errorResult.type === "error" ? errorResult.message : "Execution failed";
      return { status: "error", message };
    }

    const rowCount = resultSet.data.rowCount;
    if (rowCount === 0) {
      return { status: "pass", rowCount: 0 };
    }
    return { status: "warn", rowCount };
  } catch (e) {
    return { status: "error", message: (e as Error).message };
  }
}

/**
 * Query a materialized model and return the result set for `dbt show`.
 */
export function queryModel(
  modelName: string,
  state: SnowflakeState,
  sessionCtx: SessionContext,
  limit: number = 5,
): ResultSet | null {
  const tableName = modelName.toUpperCase();
  const sql = `SELECT * FROM ${TARGET_DB}.${TARGET_SCHEMA}.${tableName} LIMIT ${limit}`;

  const { results } = execute(sql, state, dbtCtx(sessionCtx));
  const resultSet = results.find((r) => r.type === "resultset");
  if (!resultSet || resultSet.type !== "resultset") return null;
  return resultSet.data;
}

/**
 * Get total row count for a materialized model.
 */
export function getModelRowCount(
  modelName: string,
  state: SnowflakeState,
  sessionCtx: SessionContext,
): number | null {
  const tableName = modelName.toUpperCase();
  const sql = `SELECT COUNT(*) AS CNT FROM ${TARGET_DB}.${TARGET_SCHEMA}.${tableName}`;

  const { results } = execute(sql, state, dbtCtx(sessionCtx));
  const resultSet = results.find((r) => r.type === "resultset");
  if (!resultSet || resultSet.type !== "resultset") return null;
  if (resultSet.data.rows.length === 0) return null;
  return Number(resultSet.data.rows[0][0]) || 0;
}
