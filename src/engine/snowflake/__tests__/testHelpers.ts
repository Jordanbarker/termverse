import { execute } from "../executor/executor";
import type { ExecutionResult } from "../executor/executor";
import { SnowflakeState } from "../state";
import { createDefaultContext } from "../session/context";
import type { SessionContext } from "../session/context";
import type { ResultSet } from "../formatter/result_types";
import type { Value } from "../types";

export function createTestContext(overrides?: Partial<SessionContext>): SessionContext {
  return {
    ...createDefaultContext(),
    currentDatabase: "NEXACORP_DB",
    currentSchema: "PUBLIC",
    currentRole: "SYSADMIN",
    ...overrides,
  };
}

export function executeQuery(
  sql: string,
  state: SnowflakeState,
  ctx?: SessionContext,
): ExecutionResult {
  return execute(sql, state, ctx ?? createTestContext());
}

export function getResultSet(result: ExecutionResult, index = 0): ResultSet {
  const qr = result.results[index];
  if (qr.type !== "resultset")
    throw new Error(`Expected resultset at index ${index}, got ${qr.type}`);
  return qr.data;
}

export function rows(result: ExecutionResult, index = 0): Record<string, Value>[] {
  const rs = getResultSet(result, index);
  return rs.rows.map((row) => {
    const obj: Record<string, Value> = {};
    rs.columns.forEach((col, i) => {
      obj[col.name] = row[i];
    });
    return obj;
  });
}

export function singleValue(result: ExecutionResult): Value {
  const r = rows(result);
  if (r.length !== 1) throw new Error(`Expected 1 row, got ${r.length}`);
  const keys = Object.keys(r[0]);
  return r[0][keys[0]];
}

export function columnValues(result: ExecutionResult, col: string): Value[] {
  return rows(result).map((r) => r[col]);
}

export function expectError(result: ExecutionResult, substring: string): void {
  const qr = result.results[0];
  if (qr.type !== "error")
    throw new Error(`Expected error, got ${qr.type}`);
  if (!qr.message.toLowerCase().includes(substring.toLowerCase()))
    throw new Error(`Error message "${qr.message}" does not contain "${substring}"`);
}

 
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
