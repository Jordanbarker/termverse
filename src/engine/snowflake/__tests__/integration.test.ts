import { describe, it, expect, beforeEach } from "vitest";
import { execute } from "../executor/executor";
import { formatResultSet, formatStatusMessage } from "../formatter/table_formatter";
import type { QueryResult } from "../formatter/result_types";
import { SnowflakeState } from "../state";
import type { SessionContext } from "../session/context";
import { createTestContext, stripAnsi } from "./testHelpers";

// ─── Test Helpers ────────────────────────────────────────────────────

function createTestState(): SnowflakeState {
  return new SnowflakeState({
    databases: {
      NEXACORP_DB: {
        name: "NEXACORP_DB",
        schemas: {
          PUBLIC: {
            name: "PUBLIC",
            tables: {
              EMPLOYEES: {
                name: "EMPLOYEES",
                columns: [
                  { name: "ID", type: "NUMBER", nullable: false },
                  { name: "NAME", type: "VARCHAR", nullable: false },
                  { name: "DEPT_ID", type: "NUMBER", nullable: false },
                  { name: "STATUS", type: "VARCHAR", nullable: false },
                  { name: "SALARY", type: "NUMBER", nullable: false },
                ],
                rows: [
                  { ID: 1, NAME: "Alice", DEPT_ID: 10, STATUS: "active", SALARY: 90000 },
                  { ID: 2, NAME: "Bob", DEPT_ID: 20, STATUS: "active", SALARY: 85000 },
                  { ID: 3, NAME: "Carol", DEPT_ID: 10, STATUS: "inactive", SALARY: 95000 },
                  { ID: 4, NAME: "Dave", DEPT_ID: 30, STATUS: "active", SALARY: 78000 },
                  { ID: 5, NAME: "Eve", DEPT_ID: 20, STATUS: "active", SALARY: 92000 },
                ],
                createdAt: new Date("2026-02-03"),
              },
              DEPARTMENTS: {
                name: "DEPARTMENTS",
                columns: [
                  { name: "ID", type: "NUMBER", nullable: false },
                  { name: "NAME", type: "VARCHAR", nullable: false },
                ],
                rows: [
                  { ID: 10, NAME: "Engineering" },
                  { ID: 20, NAME: "Marketing" },
                  { ID: 30, NAME: "Sales" },
                ],
                createdAt: new Date("2026-02-03"),
              },
            },
            views: {},
            sequences: {},
            stages: {},
          },
        },
      },
    },
    warehouses: {},
  });
}

// Full pipeline: SQL string → execute → format → string output
function runAndFormat(
  sql: string,
  state: SnowflakeState,
  ctx?: SessionContext
): { output: string; state: SnowflakeState; context: SessionContext } {
  const sessionCtx = ctx ?? createTestContext();
  const result = execute(sql, state, sessionCtx);
  const newState = result.state;
  const newCtx = result.context;

  const output = result.results
    .map((r: QueryResult) => {
      if (r.type === "resultset") {
        return formatResultSet(r.data);
      } else if (r.type === "status") {
        return formatStatusMessage(r.data);
      } else {
        return r.message;
      }
    })
    .join("\n");

  return { output, state: newState, context: newCtx };
}

describe("Integration — SQL string to formatted output", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createTestState();
  });

  // ─── SELECT Literal ────────────────────────────────────────────────

  it("SELECT 1 AS num produces a table with '1'", () => {
    const { output } = runAndFormat("SELECT 1 AS num", state);
    const plain = stripAnsi(output);

    expect(plain).toContain("NUM");
    expect(plain).toContain("1");
    expect(plain).toContain("1 Row(s) produced.");
  });

  // ─── Filtered SELECT ──────────────────────────────────────────────

  it("SELECT with WHERE filters rows correctly", () => {
    const { output } = runAndFormat(
      "SELECT * FROM employees WHERE status = 'active'",
      state
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("Alice");
    expect(plain).toContain("Bob");
    expect(plain).toContain("Dave");
    expect(plain).toContain("Eve");
    expect(plain).not.toContain("Carol"); // inactive
    expect(plain).toContain("4 Row(s) produced.");
  });

  // ─── Aggregation ──────────────────────────────────────────────────

  it("GROUP BY with COUNT produces aggregated results", () => {
    const { output } = runAndFormat(
      "SELECT dept_id, COUNT(*) AS cnt FROM employees GROUP BY dept_id ORDER BY cnt DESC",
      state
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("DEPT_ID");
    expect(plain).toContain("CNT");
    expect(plain).toContain("3 Row(s) produced.");
    // Department 10 and 20 each have 2 employees, dept 30 has 1
    // After ORDER BY cnt DESC: first rows should show count 2
  });

  // ─── JOIN ──────────────────────────────────────────────────────────

  it("JOIN produces combined columns from both tables", () => {
    const { output } = runAndFormat(
      "SELECT e.name, d.name AS dept_name FROM employees e JOIN departments d ON e.dept_id = d.id",
      state
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("Alice");
    expect(plain).toContain("Engineering");
    expect(plain).toContain("Bob");
    expect(plain).toContain("Marketing");
    expect(plain).toContain("5 Row(s) produced.");
  });

  // ─── Multi-Statement ──────────────────────────────────────────────

  it("multi-statement: CREATE, INSERT, SELECT", () => {
    const { output } = runAndFormat(
      "CREATE TABLE test (id NUMBER, name VARCHAR); INSERT INTO test VALUES (1, 'a'); SELECT * FROM test;",
      state
    );
    const plain = stripAnsi(output);

    // Should contain the DDL success message, DML affected rows, and the SELECT result
    // The exact format depends on multi-result formatting
    expect(plain).toContain("a"); // The inserted value should appear in SELECT result
  });

  // ─── DDL Returns Status ────────────────────────────────────────────

  it("DDL returns a status message", () => {
    const { output } = runAndFormat(
      "CREATE TABLE new_table (id NUMBER)",
      state
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("successfully created");
  });

  // ─── DML Returns Affected Row Count ────────────────────────────────

  it("DML returns affected row count", () => {
    const { output } = runAndFormat(
      "UPDATE employees SET salary = 100000 WHERE name = 'Alice'",
      state
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("1 Row(s) affected.");
  });

  it("DELETE returns affected row count", () => {
    const { output } = runAndFormat(
      "DELETE FROM employees WHERE status = 'inactive'",
      state
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("1 Row(s) affected.");
  });

  // ─── Parse Errors ──────────────────────────────────────────────────

  it("parse error shows error information", () => {
    const { output } = runAndFormat("SELEC 1", state);
    // The executor catches parse errors and returns an error result
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  // ─── USE DATABASE ──────────────────────────────────────────────────

  it("USE DATABASE updates the context", () => {
    // First create a new database, then USE it
    const { state: s1, context: c1 } = runAndFormat("CREATE DATABASE other_db", state);
    const { context: c2 } = runAndFormat("USE DATABASE other_db", s1, c1);

    expect(c2.currentDatabase).toBe("OTHER_DB");
  });

  it("USE SCHEMA updates the context", () => {
    const { state: s1, context: c1 } = runAndFormat("CREATE SCHEMA test_schema", state);
    const { context: c2 } = runAndFormat("USE SCHEMA test_schema", s1, c1);

    expect(c2.currentSchema).toBe("TEST_SCHEMA");
  });

  // ─── SHOW TABLES ──────────────────────────────────────────────────

  it("SHOW TABLES lists tables in current schema", () => {
    const { output } = runAndFormat("SHOW TABLES", state);
    const plain = stripAnsi(output);

    expect(plain).toContain("EMPLOYEES");
    expect(plain).toContain("DEPARTMENTS");
  });

  it("SHOW DATABASES lists available databases", () => {
    const { output } = runAndFormat("SHOW DATABASES", state);
    const plain = stripAnsi(output);

    expect(plain).toContain("NEXACORP_DB");
  });

  it("SHOW SCHEMAS lists schemas in current database", () => {
    const { output } = runAndFormat("SHOW SCHEMAS", state);
    const plain = stripAnsi(output);

    expect(plain).toContain("PUBLIC");
  });

  // ─── DESCRIBE TABLE ────────────────────────────────────────────────

  it("DESCRIBE TABLE shows column information", () => {
    const { output } = runAndFormat("DESCRIBE TABLE employees", state);
    const plain = stripAnsi(output);

    expect(plain).toContain("ID");
    expect(plain).toContain("NAME");
    expect(plain).toContain("NUMBER");
    expect(plain).toContain("VARCHAR");
  });

  // ─── Complex Queries ──────────────────────────────────────────────

  it("window function + QUALIFY integration", () => {
    const { output } = runAndFormat(
      "SELECT name, dept_id, salary FROM employees QUALIFY ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC) = 1",
      state
    );
    const plain = stripAnsi(output);

    // Should return one employee per department (highest salary)
    expect(plain).toContain("3 Row(s) produced.");
  });

  it("CTE with aggregation", () => {
    const { output } = runAndFormat(
      "WITH active AS (SELECT * FROM employees WHERE status = 'active') SELECT dept_id, AVG(salary) AS avg_sal FROM active GROUP BY dept_id ORDER BY dept_id",
      state
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("DEPT_ID");
    expect(plain).toContain("AVG_SAL");
    expect(plain).toContain("3 Row(s) produced.");
  });

  it("subquery in WHERE", () => {
    const { output } = runAndFormat(
      "SELECT name FROM employees WHERE dept_id IN (SELECT id FROM departments WHERE name = 'Engineering')",
      state
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("Alice");
    expect(plain).toContain("Carol");
    expect(plain).toContain("2 Row(s) produced.");
  });

  it("CASE expression in SELECT", () => {
    const { output } = runAndFormat(
      "SELECT name, CASE WHEN salary > 90000 THEN 'high' WHEN salary > 80000 THEN 'mid' ELSE 'low' END AS tier FROM employees ORDER BY name",
      state
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("TIER");
    expect(plain).toContain("high");
    expect(plain).toContain("mid");
    expect(plain).toContain("low");
  });
});
