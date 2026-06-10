import { describe, it, expect, beforeEach } from "vitest";
import { SnowflakeState } from "../state";
import type { SessionContext } from "../session/context";
import type { Row } from "../types";
import { executeQuery, rows, columnValues } from "./testHelpers";

// ─── Test State Factory ──────────────────────────────────────────────

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
                  { name: "SALARY", type: "NUMBER", nullable: true },
                  { name: "HIRE_DATE", type: "VARCHAR", nullable: false },
                ],
                rows: [
                  { ID: 1, NAME: "Alice", DEPT_ID: 10, STATUS: "active", SALARY: 90000, HIRE_DATE: "2022-01-15" },
                  { ID: 2, NAME: "Bob", DEPT_ID: 20, STATUS: "active", SALARY: 85000, HIRE_DATE: "2022-03-20" },
                  { ID: 3, NAME: "Carol", DEPT_ID: 10, STATUS: "inactive", SALARY: 95000, HIRE_DATE: "2021-06-10" },
                  { ID: 4, NAME: "Dave", DEPT_ID: 30, STATUS: "active", SALARY: 78000, HIRE_DATE: "2023-01-05" },
                  { ID: 5, NAME: "Eve", DEPT_ID: 20, STATUS: "active", SALARY: 92000, HIRE_DATE: "2021-11-30" },
                ],
                createdAt: new Date("2026-02-03"),
              },
              DEPARTMENTS: {
                name: "DEPARTMENTS",
                columns: [
                  { name: "ID", type: "NUMBER", nullable: false },
                  { name: "NAME", type: "VARCHAR", nullable: false },
                  { name: "LOCATION", type: "VARCHAR", nullable: false },
                ],
                rows: [
                  { ID: 10, NAME: "Engineering", LOCATION: "Building A" },
                  { ID: 20, NAME: "Marketing", LOCATION: "Building B" },
                  { ID: 30, NAME: "Sales", LOCATION: "Building C" },
                ],
                createdAt: new Date("2026-02-03"),
              },
              EMPTY_TABLE: {
                name: "EMPTY_TABLE",
                columns: [
                  { name: "ID", type: "NUMBER", nullable: false },
                  { name: "VAL", type: "VARCHAR", nullable: false },
                ],
                rows: [],
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

// ─── Helpers ──────────────────────────────────────────────────────────

function run(sql: string, state?: SnowflakeState, ctx?: SessionContext) {
  const result = executeQuery(sql, state ?? createTestState(), ctx);
  return { result, state: result.state };
}

describe("Executor — execute()", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createTestState();
  });

  // ─── SELECT Literal ────────────────────────────────────────────────

  describe("SELECT literal", () => {
    it("returns literal number, string, and boolean", () => {
      const { result } = run("SELECT 1, 'hello', TRUE");
      expect(result.results[0].type).toBe("resultset");
      const r = rows(result);
      expect(r).toHaveLength(1);
      expect(Object.values(r[0])).toEqual([1, "hello", true]);
    });
  });

  // ─── SELECT from Table ────────────────────────────────────────────

  describe("SELECT from table", () => {
    it("returns all rows from a table", () => {
      const { result } = run("SELECT * FROM employees", state);
      expect(rows(result)).toHaveLength(5);
    });

    it("returns specific columns", () => {
      const { result } = run("SELECT name, salary FROM employees", state);
      const r = rows(result);
      expect(r).toHaveLength(5);
      // Each row should only have name and salary
      r.forEach((row) => {
        expect(Object.keys(row)).toHaveLength(2);
      });
    });
  });

  // ─── WHERE Filtering ──────────────────────────────────────────────

  describe("WHERE filtering", () => {
    it("filters by equality", () => {
      const { result } = run("SELECT * FROM employees WHERE status = 'active'", state);
      expect(rows(result)).toHaveLength(4);
    });

    it("filters by comparison", () => {
      const { result } = run("SELECT * FROM employees WHERE salary > 90000", state);
      expect(rows(result)).toHaveLength(2); // Carol (95000), Eve (92000)
    });

    it("filters with AND", () => {
      const { result } = run(
        "SELECT * FROM employees WHERE status = 'active' AND salary > 85000",
        state
      );
      expect(rows(result)).toHaveLength(2); // Alice (90000), Eve (92000)
    });

    it("filters with OR", () => {
      const { result } = run(
        "SELECT * FROM employees WHERE dept_id = 10 OR dept_id = 30",
        state
      );
      expect(rows(result)).toHaveLength(3); // Alice, Carol (dept 10), Dave (dept 30)
    });
  });

  // ─── ORDER BY ──────────────────────────────────────────────────────

  describe("ORDER BY", () => {
    it("orders ASC by default", () => {
      const { result } = run("SELECT * FROM employees ORDER BY salary", state);
      const salaries = columnValues(result, "SALARY");
      expect(salaries).toEqual([78000, 85000, 90000, 92000, 95000]);
    });

    it("orders DESC", () => {
      const { result } = run("SELECT * FROM employees ORDER BY salary DESC", state);
      const salaries = columnValues(result, "SALARY");
      expect(salaries).toEqual([95000, 92000, 90000, 85000, 78000]);
    });

    it("orders by multiple columns", () => {
      const { result } = run(
        "SELECT * FROM employees ORDER BY dept_id ASC, salary DESC",
        state
      );
      const r = rows(result);
      // Dept 10: Carol (95000), Alice (90000); Dept 20: Eve (92000), Bob (85000); Dept 30: Dave (78000)
      expect(r[0].NAME).toBe("Carol");
      expect(r[1].NAME).toBe("Alice");
      expect(r[2].NAME).toBe("Eve");
      expect(r[3].NAME).toBe("Bob");
      expect(r[4].NAME).toBe("Dave");
    });

    it("handles NULLS FIRST and NULLS LAST", () => {
      // Insert a row with NULL salary for this test
      const stateWithNull = createTestState();
      const tbl = stateWithNull.getTable("NEXACORP_DB", "PUBLIC", "EMPLOYEES")!;
      const newRows = [...tbl.rows, { ID: 6, NAME: "Frank", DEPT_ID: 10, STATUS: "active", SALARY: null, HIRE_DATE: "2023-06-01" }];
      const updatedState = new SnowflakeState({
        ...stateWithNull.data,
        databases: {
          ...stateWithNull.data.databases,
          NEXACORP_DB: {
            ...stateWithNull.data.databases.NEXACORP_DB,
            schemas: {
              ...stateWithNull.data.databases.NEXACORP_DB.schemas,
              PUBLIC: {
                ...stateWithNull.data.databases.NEXACORP_DB.schemas.PUBLIC,
                tables: {
                  ...stateWithNull.data.databases.NEXACORP_DB.schemas.PUBLIC.tables,
                  EMPLOYEES: { ...tbl, rows: newRows },
                },
              },
            },
          },
        },
        warehouses: stateWithNull.data.warehouses,
      });
      const { result } = run(
        "SELECT * FROM employees ORDER BY salary ASC NULLS FIRST",
        updatedState
      );
      const salaries = columnValues(result, "SALARY");
      expect(salaries[0]).toBeNull();
    });
  });

  // ─── LIMIT and OFFSET ─────────────────────────────────────────────

  describe("LIMIT and OFFSET", () => {
    it("limits rows", () => {
      const { result } = run("SELECT * FROM employees LIMIT 2", state);
      expect(rows(result)).toHaveLength(2);
    });

    it("offsets rows", () => {
      const { result } = run(
        "SELECT * FROM employees ORDER BY id LIMIT 2 OFFSET 2",
        state
      );
      const r = rows(result);
      expect(r).toHaveLength(2);
      expect(r[0].ID).toBe(3);
      expect(r[1].ID).toBe(4);
    });
  });

  // ─── DISTINCT ──────────────────────────────────────────────────────

  describe("DISTINCT", () => {
    it("removes duplicate rows", () => {
      const { result } = run("SELECT DISTINCT status FROM employees", state);
      const statuses = columnValues(result, "STATUS");
      expect(statuses).toHaveLength(2);
      expect(new Set(statuses)).toEqual(new Set(["active", "inactive"]));
    });
  });

  // ─── Aliases ───────────────────────────────────────────────────────

  describe("column and table aliases", () => {
    it("returns aliased column names", () => {
      const { result } = run("SELECT name AS employee_name FROM employees LIMIT 1", state);
      const r = rows(result);
      expect(r[0]).toHaveProperty("EMPLOYEE_NAME");
    });

    it("table aliases work in queries", () => {
      const { result } = run("SELECT e.name FROM employees e WHERE e.id = 1", state);
      expect(rows(result)).toHaveLength(1);
    });
  });

  // ─── JOINs ─────────────────────────────────────────────────────────

  describe("JOINs", () => {
    it("INNER JOIN returns matching rows", () => {
      const { result } = run(
        "SELECT e.name, d.name AS dept_name FROM employees e JOIN departments d ON e.dept_id = d.id",
        state
      );
      expect(rows(result)).toHaveLength(5);
    });

    it("LEFT JOIN includes unmatched left rows with NULLs", () => {
      // Add an employee with no matching department
      const s = createTestState();
      const updatedState = s.insertRows("NEXACORP_DB", "PUBLIC", "EMPLOYEES", [
        { ID: 6, NAME: "Ghost", DEPT_ID: 99, STATUS: "active", SALARY: 50000, HIRE_DATE: "2023-01-01" },
      ]);
      const { result } = run(
        "SELECT e.name, d.name AS dept_name FROM employees e LEFT JOIN departments d ON e.dept_id = d.id ORDER BY e.id",
        updatedState
      );
      const r = rows(result);
      expect(r).toHaveLength(6);
      const ghost = r.find((row) => row.NAME === "Ghost" || row["E.NAME"] === "Ghost" || row["e.name"] === "Ghost");
      expect(ghost).toBeDefined();
      // The department name should be null for Ghost
      // Find the dept_name column (may be DEPT_NAME, D.NAME, etc)
      const deptCol = Object.keys(ghost!).find((k) => k.toUpperCase().includes("DEPT_NAME") || k === "D.NAME");
      expect(deptCol).toBeDefined();
      expect(ghost![deptCol!]).toBeNull();
    });

    it("RIGHT JOIN includes unmatched right rows with NULLs", () => {
      // All departments have matching employees, so add an unmatched dept
      const s = createTestState();
      const updatedState = new SnowflakeState({
        ...s.data,
        databases: {
          ...s.data.databases,
          NEXACORP_DB: {
            ...s.data.databases.NEXACORP_DB,
            schemas: {
              ...s.data.databases.NEXACORP_DB.schemas,
              PUBLIC: {
                ...s.data.databases.NEXACORP_DB.schemas.PUBLIC,
                tables: {
                  ...s.data.databases.NEXACORP_DB.schemas.PUBLIC.tables,
                  DEPARTMENTS: {
                    ...s.data.databases.NEXACORP_DB.schemas.PUBLIC.tables.DEPARTMENTS,
                    rows: [
                      ...s.data.databases.NEXACORP_DB.schemas.PUBLIC.tables.DEPARTMENTS.rows,
                      { ID: 40, NAME: "HR", LOCATION: "Building D" },
                    ],
                  },
                },
              },
            },
          },
        },
        warehouses: s.data.warehouses,
      });
      const { result } = run(
        "SELECT e.name, d.name AS dept_name FROM employees e RIGHT JOIN departments d ON e.dept_id = d.id",
        updatedState
      );
      const r = rows(result);
      // HR has no employees, so there should be at least one row where dept_name is HR
      const hrRow = r.find(
        (row) => (row.DEPT_NAME === "HR" || row["D.NAME"] === "HR" || row["dept_name"] === "HR")
      );
      expect(hrRow).toBeDefined();
    });

    it("CROSS JOIN returns cartesian product", () => {
      const { result } = run(
        "SELECT * FROM departments CROSS JOIN empty_table",
        state
      );
      // 3 departments x 0 rows = 0 rows
      expect(rows(result)).toHaveLength(0);
    });

    it("FULL OUTER JOIN includes all rows from both sides", () => {
      const s = createTestState();
      // Add unmatched dept and unmatched employee
      const updatedState = new SnowflakeState({
        ...s.data,
        databases: {
          ...s.data.databases,
          NEXACORP_DB: {
            ...s.data.databases.NEXACORP_DB,
            schemas: {
              ...s.data.databases.NEXACORP_DB.schemas,
              PUBLIC: {
                ...s.data.databases.NEXACORP_DB.schemas.PUBLIC,
                tables: {
                  ...s.data.databases.NEXACORP_DB.schemas.PUBLIC.tables,
                  DEPARTMENTS: {
                    ...s.data.databases.NEXACORP_DB.schemas.PUBLIC.tables.DEPARTMENTS,
                    rows: [
                      ...s.data.databases.NEXACORP_DB.schemas.PUBLIC.tables.DEPARTMENTS.rows,
                      { ID: 40, NAME: "HR", LOCATION: "Building D" },
                    ],
                  },
                  EMPLOYEES: {
                    ...s.data.databases.NEXACORP_DB.schemas.PUBLIC.tables.EMPLOYEES,
                    rows: [
                      ...s.data.databases.NEXACORP_DB.schemas.PUBLIC.tables.EMPLOYEES.rows,
                      { ID: 6, NAME: "Ghost", DEPT_ID: 99, STATUS: "active", SALARY: 50000, HIRE_DATE: "2023-01-01" },
                    ],
                  },
                },
              },
            },
          },
        },
        warehouses: s.data.warehouses,
      });
      const { result } = run(
        "SELECT e.name, d.name AS dept_name FROM employees e FULL OUTER JOIN departments d ON e.dept_id = d.id",
        updatedState
      );
      const r = rows(result);
      // Should include all employees + the unmatched HR dept
      expect(r.length).toBeGreaterThanOrEqual(7); // 6 employees + 1 unmatched dept
    });
  });

  // ─── GROUP BY with Aggregates ──────────────────────────────────────

  describe("GROUP BY with aggregates", () => {
    it("COUNT(*)", () => {
      const { result } = run(
        "SELECT dept_id, COUNT(*) AS cnt FROM employees GROUP BY dept_id ORDER BY dept_id",
        state
      );
      const r = rows(result);
      expect(r).toHaveLength(3);
      expect(r[0].CNT).toBe(2); // dept 10
      expect(r[1].CNT).toBe(2); // dept 20
      expect(r[2].CNT).toBe(1); // dept 30
    });

    it("SUM", () => {
      const { result } = run(
        "SELECT dept_id, SUM(salary) AS total FROM employees GROUP BY dept_id ORDER BY dept_id",
        state
      );
      const r = rows(result);
      expect(r[0].TOTAL).toBe(185000); // dept 10: 90000 + 95000
    });

    it("AVG", () => {
      const { result } = run(
        "SELECT dept_id, AVG(salary) AS avg_sal FROM employees GROUP BY dept_id ORDER BY dept_id",
        state
      );
      const r = rows(result);
      expect(r[0].AVG_SAL).toBe(92500); // dept 10: (90000 + 95000) / 2
    });

    it("MIN and MAX", () => {
      const { result } = run(
        "SELECT MIN(salary) AS min_sal, MAX(salary) AS max_sal FROM employees",
        state
      );
      const r = rows(result);
      expect(r[0].MIN_SAL).toBe(78000);
      expect(r[0].MAX_SAL).toBe(95000);
    });
  });

  // ─── HAVING ────────────────────────────────────────────────────────

  describe("HAVING", () => {
    it("filters groups by aggregate condition", () => {
      const { result } = run(
        "SELECT dept_id, COUNT(*) AS cnt FROM employees GROUP BY dept_id HAVING COUNT(*) > 1",
        state
      );
      const r = rows(result);
      expect(r).toHaveLength(2); // depts 10 and 20 have 2 each
    });
  });

  // ─── Subqueries ────────────────────────────────────────────────────

  describe("subqueries", () => {
    it("IN subquery", () => {
      const { result } = run(
        "SELECT * FROM employees WHERE dept_id IN (SELECT id FROM departments WHERE location = 'Building A')",
        state
      );
      expect(rows(result)).toHaveLength(2); // dept 10 employees
    });

    it("EXISTS subquery", () => {
      const { result } = run(
        "SELECT * FROM departments d WHERE EXISTS (SELECT 1 FROM employees e WHERE e.dept_id = d.id)",
        state
      );
      expect(rows(result)).toHaveLength(3); // all departments have employees
    });

    it("scalar subquery", () => {
      const { result } = run(
        "SELECT name, (SELECT COUNT(*) FROM employees) AS total FROM employees WHERE id = 1",
        state
      );
      const r = rows(result);
      expect(r).toHaveLength(1);
      expect(r[0].TOTAL).toBe(5);
    });
  });

  // ─── CTEs ──────────────────────────────────────────────────────────

  describe("CTEs", () => {
    it("single CTE", () => {
      const { result } = run(
        "WITH active_emps AS (SELECT * FROM employees WHERE status = 'active') SELECT COUNT(*) AS cnt FROM active_emps",
        state
      );
      expect(rows(result)[0].CNT).toBe(4);
    });

    it("multiple CTEs", () => {
      const { result } = run(
        "WITH dept10 AS (SELECT * FROM employees WHERE dept_id = 10), dept20 AS (SELECT * FROM employees WHERE dept_id = 20) SELECT (SELECT COUNT(*) FROM dept10) AS d10, (SELECT COUNT(*) FROM dept20) AS d20",
        state
      );
      const r = rows(result);
      expect(r[0].D10).toBe(2);
      expect(r[0].D20).toBe(2);
    });
  });

  // ─── Set Operations ───────────────────────────────────────────────

  describe("UNION / INTERSECT / EXCEPT", () => {
    it("UNION removes duplicates", () => {
      const { result } = run(
        "SELECT status FROM employees WHERE id = 1 UNION SELECT status FROM employees WHERE id = 2",
        state
      );
      // Both are 'active', so UNION should return 1 row
      expect(rows(result)).toHaveLength(1);
    });

    it("UNION ALL keeps duplicates", () => {
      const { result } = run(
        "SELECT status FROM employees WHERE id = 1 UNION ALL SELECT status FROM employees WHERE id = 2",
        state
      );
      expect(rows(result)).toHaveLength(2);
    });

    it("INTERSECT returns common rows", () => {
      const { result } = run(
        "SELECT dept_id FROM employees WHERE id IN (1, 2) INTERSECT SELECT dept_id FROM employees WHERE id IN (1, 3)",
        state
      );
      // Common: dept_id 10 (from id 1)
      expect(rows(result)).toHaveLength(1);
    });

    it("EXCEPT removes matching rows", () => {
      const { result } = run(
        "SELECT dept_id FROM employees EXCEPT SELECT dept_id FROM employees WHERE dept_id = 10",
        state
      );
      const deptIds = columnValues(result, "DEPT_ID");
      expect(deptIds).not.toContain(10);
    });
  });

  // ─── INSERT ────────────────────────────────────────────────────────

  describe("INSERT", () => {
    it("inserts rows into a table", () => {
      const { result, state: newState } = run(
        "INSERT INTO employees (id, name, dept_id, status, salary, hire_date) VALUES (6, 'Frank', 10, 'active', 80000, '2024-01-01')",
        state
      );
      const qr = result.results[0];
      expect(qr.type).toBe("status");
      if (qr.type === "status") {
        expect(qr.data.rowsAffected).toBe(1);
      }
      // Verify the row was added
      const table = newState.getTable("NEXACORP_DB", "PUBLIC", "EMPLOYEES");
      expect(table!.rows).toHaveLength(6);
    });
  });

  // ─── UPDATE ────────────────────────────────────────────────────────

  describe("UPDATE", () => {
    it("updates matching rows", () => {
      const { result, state: newState } = run(
        "UPDATE employees SET salary = 100000 WHERE name = 'Alice'",
        state
      );
      const qr = result.results[0];
      expect(qr.type).toBe("status");
      if (qr.type === "status") {
        expect(qr.data.rowsAffected).toBe(1);
      }
      const alice = newState.getTable("NEXACORP_DB", "PUBLIC", "EMPLOYEES")!.rows.find(
        (r: Row) => r.NAME === "Alice"
      );
      expect(alice?.SALARY).toBe(100000);
    });
  });

  // ─── DELETE ────────────────────────────────────────────────────────

  describe("DELETE", () => {
    it("deletes matching rows", () => {
      const { result, state: newState } = run(
        "DELETE FROM employees WHERE status = 'inactive'",
        state
      );
      const qr = result.results[0];
      expect(qr.type).toBe("status");
      if (qr.type === "status") {
        expect(qr.data.rowsAffected).toBe(1);
      }
      expect(
        newState.getTable("NEXACORP_DB", "PUBLIC", "EMPLOYEES")!.rows
      ).toHaveLength(4);
    });
  });

  // ─── TRUNCATE ──────────────────────────────────────────────────────

  describe("TRUNCATE", () => {
    it("removes all rows from a table", () => {
      const { result, state: newState } = run("TRUNCATE TABLE employees", state);
      expect(result.results[0].type).toBe("status");
      expect(
        newState.getTable("NEXACORP_DB", "PUBLIC", "EMPLOYEES")!.rows
      ).toHaveLength(0);
    });
  });

  // ─── CREATE TABLE ──────────────────────────────────────────────────

  describe("CREATE TABLE", () => {
    it("creates a new table in state", () => {
      const { result, state: newState } = run(
        "CREATE TABLE test_table (id NUMBER, name VARCHAR)",
        state
      );
      expect(result.results[0].type).toBe("status");
      const tbl = newState.getTable("NEXACORP_DB", "PUBLIC", "TEST_TABLE");
      expect(tbl).toBeDefined();
      expect(tbl!.columns).toHaveLength(2);
      expect(tbl!.rows).toHaveLength(0);
    });
  });

  // ─── DROP TABLE ────────────────────────────────────────────────────

  describe("DROP TABLE", () => {
    it("removes a table from state", () => {
      const { result, state: newState } = run("DROP TABLE empty_table", state);
      expect(result.results[0].type).toBe("status");
      const tbl = newState.getTable("NEXACORP_DB", "PUBLIC", "EMPTY_TABLE");
      expect(tbl).toBeUndefined();
    });
  });

  // ─── CREATE / DROP DATABASE and SCHEMA ─────────────────────────────

  describe("CREATE / DROP DATABASE and SCHEMA", () => {
    it("creates a database", () => {
      const { state: newState } = run("CREATE DATABASE test_db", state);
      expect(newState.getDatabase("TEST_DB")).toBeDefined();
    });

    it("drops a database", () => {
      const s = createTestState().createDatabase("TEMP_DB");
      const { state: newState } = run("DROP DATABASE temp_db", s);
      expect(newState.getDatabase("TEMP_DB")).toBeUndefined();
    });

    it("creates a schema", () => {
      const { state: newState } = run("CREATE SCHEMA test_schema", state);
      expect(
        newState.getSchema("NEXACORP_DB", "TEST_SCHEMA")
      ).toBeDefined();
    });

    it("drops a schema", () => {
      const s = createTestState().createSchema("NEXACORP_DB", "TEMP_SCHEMA");
      const { state: newState } = run("DROP SCHEMA temp_schema", s);
      expect(
        newState.getSchema("NEXACORP_DB", "TEMP_SCHEMA")
      ).toBeUndefined();
    });
  });

  // ─── Window Functions ──────────────────────────────────────────────

  describe("window functions", () => {
    it("ROW_NUMBER() assigns sequential numbers", () => {
      const { result } = run(
        "SELECT name, ROW_NUMBER() OVER (ORDER BY salary DESC) AS rn FROM employees",
        state
      );
      const r = rows(result);
      const rns = r.map((row) => row.RN);
      expect(rns).toEqual([1, 2, 3, 4, 5]);
    });

    it("ROW_NUMBER() with PARTITION BY", () => {
      const { result } = run(
        "SELECT name, dept_id, ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rn FROM employees",
        state
      );
      const r = rows(result);
      // Each partition should start numbering from 1
      const dept10Rows = r.filter((row) => row.DEPT_ID === 10);
      const rns10 = dept10Rows.map((row) => row.RN);
      expect(rns10).toEqual([1, 2]);
    });

    it("RANK() with ties", () => {
      // Add a duplicate salary to create ties
      const s = createTestState();
      const updatedState = s.insertRows("NEXACORP_DB", "PUBLIC", "EMPLOYEES", [
        { ID: 6, NAME: "Frank", DEPT_ID: 10, STATUS: "active", SALARY: 90000, HIRE_DATE: "2023-06-01" },
      ]);
      const { result } = run(
        "SELECT name, RANK() OVER (ORDER BY salary DESC) AS rnk FROM employees",
        updatedState
      );
      const r = rows(result);
      // 95000 -> rank 1, 92000 -> rank 2, 90000 (x2) -> rank 3, 85000 -> rank 5, 78000 -> rank 6
      const rank3Rows = r.filter((row) => row.RNK === 3);
      expect(rank3Rows).toHaveLength(2);
    });

    it("DENSE_RANK() with ties", () => {
      const s = createTestState();
      const updatedState = s.insertRows("NEXACORP_DB", "PUBLIC", "EMPLOYEES", [
        { ID: 6, NAME: "Frank", DEPT_ID: 10, STATUS: "active", SALARY: 90000, HIRE_DATE: "2023-06-01" },
      ]);
      const { result } = run(
        "SELECT name, DENSE_RANK() OVER (ORDER BY salary DESC) AS drnk FROM employees",
        updatedState
      );
      const r = rows(result);
      // After ties at rank 3 (salary 90000), next rank should be 4 (not 5)
      const ranks = r.map((row) => row.DRNK);
      expect(Math.max(...(ranks as number[]))).toBe(5); // 5 distinct salary values
    });
  });

  // ─── QUALIFY ───────────────────────────────────────────────────────

  describe("QUALIFY", () => {
    it("filters on window function result", () => {
      const { result } = run(
        "SELECT name, dept_id, ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rn FROM employees QUALIFY rn = 1",
        state
      );
      const r = rows(result);
      // Should return 1 row per department (the highest salary)
      expect(r).toHaveLength(3);
    });
  });

  // ─── Nested Queries ────────────────────────────────────────────────

  describe("nested queries", () => {
    it("supports nested subquery in FROM (derived table)", () => {
      const { result } = run(
        "SELECT * FROM (SELECT name, salary FROM employees WHERE status = 'active') AS active_emps WHERE salary > 85000",
        state
      );
      const r = rows(result);
      // Active employees with salary > 85000: Alice (90000), Eve (92000)
      expect(r).toHaveLength(2);
    });
  });

  // ─── MERGE ─────────────────────────────────────────────────────────

  describe("MERGE", () => {
    it("WHEN MATCHED updates, WHEN NOT MATCHED inserts", () => {
      const s = createTestState();
      // Add SOURCE table to state
      const updatedState = new SnowflakeState({
        ...s.data,
        databases: {
          ...s.data.databases,
          NEXACORP_DB: {
            ...s.data.databases.NEXACORP_DB,
            schemas: {
              ...s.data.databases.NEXACORP_DB.schemas,
              PUBLIC: {
                ...s.data.databases.NEXACORP_DB.schemas.PUBLIC,
                tables: {
                  ...s.data.databases.NEXACORP_DB.schemas.PUBLIC.tables,
                  SOURCE: {
                    name: "SOURCE",
                    columns: [
                      { name: "ID", type: "NUMBER", nullable: false },
                      { name: "NAME", type: "VARCHAR", nullable: false },
                      { name: "DEPT_ID", type: "NUMBER", nullable: false },
                      { name: "STATUS", type: "VARCHAR", nullable: false },
                      { name: "SALARY", type: "NUMBER", nullable: false },
                      { name: "HIRE_DATE", type: "VARCHAR", nullable: false },
                    ],
                    rows: [
                      { ID: 1, NAME: "Alice Updated", DEPT_ID: 10, STATUS: "active", SALARY: 95000, HIRE_DATE: "2022-01-15" },
                      { ID: 6, NAME: "Frank", DEPT_ID: 10, STATUS: "active", SALARY: 80000, HIRE_DATE: "2024-01-01" },
                    ],
                    createdAt: new Date("2026-02-03"),
                  },
                },
              },
            },
          },
        },
        warehouses: s.data.warehouses,
      });
      const { result, state: newState } = run(
        "MERGE INTO employees t USING source s ON t.id = s.id WHEN MATCHED THEN UPDATE SET name = s.name, salary = s.salary WHEN NOT MATCHED THEN INSERT (id, name, dept_id, status, salary, hire_date) VALUES (s.id, s.name, s.dept_id, s.status, s.salary, s.hire_date)",
        updatedState
      );
      expect(result.results[0].type).toBe("status");
      const empRows = newState.getTable("NEXACORP_DB", "PUBLIC", "EMPLOYEES")!.rows;
      // Alice should be updated
      const alice = empRows.find((r: Row) => r.ID === 1);
      expect(alice?.NAME).toBe("Alice Updated");
      expect(alice?.SALARY).toBe(95000);
      // Frank should be inserted
      const frank = empRows.find((r: Row) => r.ID === 6);
      expect(frank).toBeDefined();
      expect(frank?.NAME).toBe("Frank");
    });
  });

  // ─── Multiple Statements ──────────────────────────────────────────

  describe("multiple statements", () => {
    it("executes multiple statements separated by semicolons", () => {
      const { result } = run(
        "CREATE TABLE test (id NUMBER, name VARCHAR); INSERT INTO test VALUES (1, 'a'); SELECT * FROM test;",
        state
      );
      // result.results should contain 3 QueryResults
      expect(result.results.length).toBeGreaterThanOrEqual(3);
      // The last result should be a resultset with 1 row
      const lastResult = result.results[result.results.length - 1];
      expect(lastResult.type).toBe("resultset");
      if (lastResult.type === "resultset") {
        expect(lastResult.data.rowCount).toBe(1);
      }
    });
  });
});
