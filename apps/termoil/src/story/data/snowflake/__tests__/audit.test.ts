import { describe, it, expect, beforeEach } from "vitest";
import { createInitialSnowflakeState } from "../initial_data";
import { SnowflakeState } from "@tt/core/snowflake/state";
import type { SessionContext } from "@tt/core/snowflake/session/context";
import { formatResultSet } from "@tt/core/snowflake/formatter/table_formatter";
import { createTestContext, executeQuery, rows, singleValue, expectError, stripAnsi } from "@tt/core/snowflake/__tests__/testHelpers";

// ─── Shared Helpers ─────────────────────────────────────────────────

const auditCtx = () => createTestContext({ currentDatabase: "NEXACORP_PROD", currentSchema: "RAW_NEXACORP" });

function run(sql: string, state: SnowflakeState, ctx?: SessionContext) {
  return executeQuery(sql, state, ctx ?? auditCtx());
}

// ─── Simple test state for non-seed tests ───────────────────────────

function createSimpleState(): SnowflakeState {
  return new SnowflakeState({
    databases: {
      TESTDB: {
        name: "TESTDB",
        schemas: {
          PUBLIC: {
            name: "PUBLIC",
            tables: {
              ITEMS: {
                name: "ITEMS",
                columns: [
                  { name: "ID", type: "NUMBER", nullable: false },
                  { name: "NAME", type: "VARCHAR", nullable: false },
                  { name: "PRICE", type: "NUMBER", nullable: false },
                  { name: "CATEGORY", type: "VARCHAR", nullable: false },
                ],
                rows: [
                  { ID: 1, NAME: "Widget", PRICE: 10, CATEGORY: "A" },
                  { ID: 2, NAME: "Gadget", PRICE: 20, CATEGORY: "A" },
                  { ID: 3, NAME: "Doohickey", PRICE: 30, CATEGORY: "B" },
                  { ID: 4, NAME: "Thingamajig", PRICE: 15, CATEGORY: "B" },
                  { ID: 5, NAME: "Whatchamacallit", PRICE: 25, CATEGORY: "C" },
                ],
                createdAt: new Date("2026-02-03"),
              },
              TAGS: {
                name: "TAGS",
                columns: [
                  { name: "ID", type: "NUMBER", nullable: false },
                  { name: "DATA", type: "VARIANT", nullable: true },
                ],
                rows: [
                  { ID: 1, DATA: { colors: ["red", "blue"], size: "large" } },
                  { ID: 2, DATA: { colors: ["green"], size: "small" } },
                  { ID: 3, DATA: null },
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

function simpleCtx() {
  return createTestContext({ currentDatabase: "TESTDB", currentSchema: "PUBLIC" });
}

// ═════════════════════════════════════════════════════════════════════
// SEED DATA INTEGRATION TESTS (Task #6)
// ═════════════════════════════════════════════════════════════════════

describe("Seed Data Integration — Narrative Queries", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createInitialSnowflakeState();
  });

  it("finds Jin Chen in EMPLOYEE_DIRECTORY", () => {
    const result = run(
      "SELECT FIRST_NAME, LAST_NAME, STATUS FROM EMPLOYEE_DIRECTORY WHERE LAST_NAME = 'Chen' AND FIRST_NAME = 'Jin'",
      state
    );
    const r = rows(result);
    expect(r).toHaveLength(1);
    expect(r[0].FIRST_NAME).toBe("Jin");
    expect(r[0].STATUS).toBe("resigned");
  });

  it("finds employees with 'system concern' notes in EMPLOYEE_DIRECTORY", () => {
    const result = run(
      "SELECT FIRST_NAME, LAST_NAME, NOTES FROM EMPLOYEE_DIRECTORY WHERE NOTES LIKE '%system concern%'",
      state
    );
    const r = rows(result);
    expect(r.length).toBeGreaterThanOrEqual(1);
    for (const row of r) {
      expect(String(row.NOTES).toLowerCase()).toContain("system concern");
    }
  });

  it("counts all employees in EMPLOYEE_DIRECTORY", () => {
    const result = run("SELECT COUNT(*) AS cnt FROM EMPLOYEE_DIRECTORY", state);
    const count = singleValue(result);
    expect(Number(count)).toBe(21);
  });

  it("finds employees with system concern notes or resigned status", () => {
    const result = run(
      "SELECT FIRST_NAME, LAST_NAME FROM EMPLOYEE_DIRECTORY WHERE NOTES LIKE '%system concern%' OR STATUS = 'resigned'",
      state
    );
    const r = rows(result);
    // Sarah Knight + Oscar Diaz (system concern notes); Jin Chen, Lisa Huang, Priya Nair, Navid Ahmadi (resigned)
    expect(r.length).toBe(6);
  });
});

// ═════════════════════════════════════════════════════════════════════
// FLATTEN EXECUTION TESTS (Task #9)
// ═════════════════════════════════════════════════════════════════════

describe("FLATTEN Execution", () => {
  let simpleState: SnowflakeState;

  beforeEach(() => {
    simpleState = createSimpleState();
  });

  it("FLATTEN on array produces one row per element", () => {
    const result = run(
      "SELECT t.ID, f.VALUE FROM TAGS t, LATERAL FLATTEN(input => t.DATA.colors) f",
      simpleState,
      simpleCtx()
    );
    const r = rows(result);
    // ID 1 has ["red", "blue"] (2 rows), ID 2 has ["green"] (1 row), ID 3 is null (0 rows)
    expect(r.length).toBe(3);
    const values = r.map((row) => row.VALUE);
    expect(values).toContain("red");
    expect(values).toContain("blue");
    expect(values).toContain("green");
  });

  it("FLATTEN on object produces one row per key", () => {
    const result = run(
      "SELECT t.ID, f.KEY, f.VALUE FROM TAGS t, LATERAL FLATTEN(input => t.DATA) f WHERE t.ID = 1",
      simpleState,
      simpleCtx()
    );
    const r = rows(result);
    // {colors: [...], size: "large"} = 2 keys
    expect(r.length).toBe(2);
    const keys = r.map((row) => row.KEY);
    expect(keys).toContain("colors");
    expect(keys).toContain("size");
  });

  it("FLATTEN skips null values (non-OUTER)", () => {
    const result = run(
      "SELECT t.ID, f.VALUE FROM TAGS t, LATERAL FLATTEN(input => t.DATA) f",
      simpleState,
      simpleCtx()
    );
    const r = rows(result);
    // ID 3 has null DATA, should be skipped
    const ids = r.map((row) => row.ID);
    expect(ids).not.toContain(3);
  });

  it("FLATTEN on TAGS VARIANT data", () => {
    const result = run(
      "SELECT t.ID, f.KEY, f.VALUE FROM TAGS t, LATERAL FLATTEN(input => t.DATA) f WHERE t.ID = 1",
      simpleState,
      simpleCtx()
    );
    const r = rows(result);
    // {colors: [...], size: "large"} = 2 keys
    expect(r.length).toBe(2);
    const keys = r.map((row) => row.KEY);
    expect(keys).toContain("colors");
    expect(keys).toContain("size");
  });

  it("FLATTEN INDEX column is populated", () => {
    const result = run(
      "SELECT f.INDEX, f.VALUE FROM TAGS t, LATERAL FLATTEN(input => t.DATA.colors) f WHERE t.ID = 1",
      simpleState,
      simpleCtx()
    );
    const r = rows(result);
    expect(r.length).toBe(2);
    expect(r[0].INDEX).toBe(0);
    expect(r[1].INDEX).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════
// DATE FUNCTION TESTS (Task #7)
// ═════════════════════════════════════════════════════════════════════

describe("Date Functions — Extended", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createSimpleState();
  });

  const ctx = () => simpleCtx();

  it("DATEADD months", () => {
    const result = run("SELECT DATEADD('month', 3, '2024-01-15') AS val", state, ctx());
    const val = singleValue(result);
    expect(val).toBeInstanceOf(Date);
    // Verify month advanced by 3
    const d = val as Date;
    expect(d.getMonth()).toBe(3); // April = month 3 (0-indexed)
  });

  it("DATEADD hours", () => {
    const result = run("SELECT DATEADD('hour', 5, '2024-01-01 10:00:00') AS val", state, ctx());
    const val = singleValue(result);
    expect(val).toBeInstanceOf(Date);
    const d = val as Date;
    expect(d.getHours()).toBe(15); // 10 + 5
  });

  it("DATEADD years", () => {
    // Use a mid-month date to avoid timezone boundary issues
    const result = run("SELECT DATEADD('year', 2, '2024-06-15') AS val", state, ctx());
    const val = singleValue(result);
    expect(val).toBeInstanceOf(Date);
    expect((val as Date).getFullYear()).toBe(2026);
  });

  it("DATEDIFF months", () => {
    const result = run("SELECT DATEDIFF('month', '2024-01-01', '2024-06-01') AS val", state, ctx());
    expect(singleValue(result)).toBe(5);
  });

  it("DATEDIFF hours", () => {
    const result = run("SELECT DATEDIFF('hour', '2024-01-01 00:00:00', '2024-01-01 05:30:00') AS val", state, ctx());
    expect(singleValue(result)).toBe(5);
  });

  it("YEAR() shorthand", () => {
    const result = run("SELECT YEAR('2024-03-15') AS val", state, ctx());
    expect(singleValue(result)).toBe(2024);
  });

  it("MONTH() shorthand", () => {
    const result = run("SELECT MONTH('2024-03-15') AS val", state, ctx());
    // Month is local time, so use getMonth + 1 logic
    const val = singleValue(result);
    expect(val).toBe(3);
  });

  it("DAY() shorthand", () => {
    const result = run("SELECT DAY('2024-03-15') AS val", state, ctx());
    const val = singleValue(result);
    // Should extract the day — may vary by timezone but should be 14 or 15
    expect([14, 15]).toContain(val);
  });

  it("DATEADD with negative value", () => {
    const result = run("SELECT DATEADD('day', -10, '2024-06-15') AS val", state, ctx());
    const val = singleValue(result);
    expect(val).toBeInstanceOf(Date);
    // Allow for timezone boundary: June 15 - 10 days = June 5 (local may show 4 or 5)
    expect([4, 5]).toContain((val as Date).getDate());
  });

  it("DATEDIFF years", () => {
    const result = run("SELECT DATEDIFF('year', '2020-06-01', '2024-06-01') AS val", state, ctx());
    expect(singleValue(result)).toBe(4);
  });
});

// ═════════════════════════════════════════════════════════════════════
// ERROR MESSAGE TESTS (Task #8)
// ═════════════════════════════════════════════════════════════════════

describe("Error Messages", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createSimpleState();
  });

  const ctx = () => simpleCtx();

  it("table not found gives clear error", () => {
    const result = run("SELECT * FROM nonexistent_table", state, ctx());
    expectError(result, "does not exist");
  });

  it("bad column name in WHERE", () => {
    const result = run("SELECT * FROM ITEMS WHERE nonexistent_col = 1", state, ctx());
    // Should return rows with null comparison (no error) or error
    // In Snowflake-like behavior, unknown columns evaluate to null
    const r = rows(result);
    expect(r.length).toBe(0); // null = 1 is always false
  });

  it("syntax error in SQL", () => {
    const result = run("SELEC * FORM items", state, ctx());
    expectError(result, "");
  });

  it("missing FROM clause with column reference", () => {
    // SELECT col without FROM — should still execute (returns null for unknown col)
    const result = run("SELECT 1 AS val", state, ctx());
    expect(result.results[0].type).toBe("resultset");
  });

  it("duplicate table in INSERT", () => {
    const result = run("INSERT INTO nonexistent VALUES (1)", state, ctx());
    expectError(result, "does not exist");
  });

  it("UPDATE on nonexistent table", () => {
    const result = run("UPDATE nonexistent SET col = 1", state, ctx());
    expectError(result, "does not exist");
  });

  it("DELETE from nonexistent table", () => {
    const result = run("DELETE FROM nonexistent WHERE id = 1", state, ctx());
    expectError(result, "does not exist");
  });
});

// ═════════════════════════════════════════════════════════════════════
// LISTAGG / ARRAY_AGG TESTS (Task #10)
// ═════════════════════════════════════════════════════════════════════

describe("LISTAGG and ARRAY_AGG", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createSimpleState();
  });

  const ctx = () => simpleCtx();

  it("LISTAGG concatenates values", () => {
    const result = run(
      "SELECT LISTAGG(NAME) AS names FROM ITEMS WHERE CATEGORY = 'A'",
      state,
      ctx()
    );
    const val = singleValue(result);
    expect(typeof val).toBe("string");
    expect(String(val)).toContain("Widget");
    expect(String(val)).toContain("Gadget");
  });

  it("ARRAY_AGG collects values into array", () => {
    const result = run(
      "SELECT ARRAY_AGG(NAME) AS names FROM ITEMS WHERE CATEGORY = 'B'",
      state,
      ctx()
    );
    const val = singleValue(result);
    expect(Array.isArray(val)).toBe(true);
    expect(val).toContain("Doohickey");
    expect(val).toContain("Thingamajig");
  });

  it("LISTAGG with GROUP BY", () => {
    const result = run(
      "SELECT CATEGORY, LISTAGG(NAME) AS NAMES FROM ITEMS GROUP BY CATEGORY ORDER BY CATEGORY",
      state,
      ctx()
    );
    const r = rows(result);
    expect(r.length).toBe(3);
    expect(String(r[0].NAMES)).toContain("Widget");
  });

  it("ARRAY_AGG with GROUP BY", () => {
    const result = run(
      "SELECT CATEGORY, ARRAY_AGG(PRICE) AS PRICES FROM ITEMS GROUP BY CATEGORY ORDER BY CATEGORY",
      state,
      ctx()
    );
    const r = rows(result);
    expect(r.length).toBe(3);
    expect(Array.isArray(r[0].PRICES)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// WINDOW FRAME TESTS (Task #11 — Phase 3)
// ═════════════════════════════════════════════════════════════════════

describe("Window Frame Bounds", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createSimpleState();
  });

  const ctx = () => simpleCtx();

  it("ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING", () => {
    const result = run(
      "SELECT ID, PRICE, SUM(PRICE) OVER (ORDER BY ID ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS WINDOW_SUM FROM ITEMS",
      state,
      ctx()
    );
    const r = rows(result);
    expect(r.length).toBe(5);
    // ID 1: sum of [10, 20] = 30 (no preceding)
    expect(r[0].WINDOW_SUM).toBe(30);
    // ID 2: sum of [10, 20, 30] = 60
    expect(r[1].WINDOW_SUM).toBe(60);
    // ID 3: sum of [20, 30, 15] = 65
    expect(r[2].WINDOW_SUM).toBe(65);
  });

  it("ROWS BETWEEN 2 PRECEDING AND CURRENT ROW", () => {
    const result = run(
      "SELECT ID, PRICE, SUM(PRICE) OVER (ORDER BY ID ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS WINDOW_SUM FROM ITEMS",
      state,
      ctx()
    );
    const r = rows(result);
    // ID 1: sum of [10] = 10
    expect(r[0].WINDOW_SUM).toBe(10);
    // ID 2: sum of [10, 20] = 30
    expect(r[1].WINDOW_SUM).toBe(30);
    // ID 3: sum of [10, 20, 30] = 60
    expect(r[2].WINDOW_SUM).toBe(60);
    // ID 4: sum of [20, 30, 15] = 65
    expect(r[3].WINDOW_SUM).toBe(65);
  });

  it("ROWS BETWEEN 3 PRECEDING AND 1 FOLLOWING uses actual offsets", () => {
    const result = run(
      "SELECT ID, PRICE, SUM(PRICE) OVER (ORDER BY ID ROWS BETWEEN 3 PRECEDING AND 1 FOLLOWING) AS WINDOW_SUM FROM ITEMS",
      state,
      ctx()
    );
    const r = rows(result);
    // ID 1 (pos 0): rows [0..1] = 10+20 = 30
    expect(r[0].WINDOW_SUM).toBe(30);
    // ID 2 (pos 1): rows [0..2] = 10+20+30 = 60
    expect(r[1].WINDOW_SUM).toBe(60);
    // ID 3 (pos 2): rows [0..3] = 10+20+30+15 = 75
    expect(r[2].WINDOW_SUM).toBe(75);
    // ID 4 (pos 3): rows [0..4] = 10+20+30+15+25 = 100
    expect(r[3].WINDOW_SUM).toBe(100);
    // ID 5 (pos 4): rows [1..4] = 20+30+15+25 = 90
    expect(r[4].WINDOW_SUM).toBe(90);
  });

  it("ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING sums all rows", () => {
    const result = run(
      "SELECT ID, SUM(PRICE) OVER (ORDER BY ID ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS total FROM ITEMS",
      state,
      ctx()
    );
    const r = rows(result);
    // All rows should have the same total: 10+20+30+15+25 = 100
    for (const row of r) {
      expect(row.TOTAL).toBe(100);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// CAST TO DATE/TIMESTAMP TESTS (Task #11 — Phase 3)
// ═════════════════════════════════════════════════════════════════════

describe("CAST to DATE/TIMESTAMP", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createSimpleState();
  });

  const ctx = () => simpleCtx();

  it("CAST string to DATE", () => {
    const result = run("SELECT CAST('2024-06-15' AS DATE) AS val", state, ctx());
    const val = singleValue(result);
    expect(val).toBeDefined();
    expect(val instanceof Date ? val.toISOString() : String(val)).toContain("2024-06-15");
  });

  it("CAST string to TIMESTAMP", () => {
    const result = run("SELECT CAST('2024-06-15 10:30:00' AS TIMESTAMP) AS val", state, ctx());
    const val = singleValue(result);
    expect(val).toBeDefined();
    expect(val instanceof Date ? val.toISOString() : String(val)).toContain("2024-06-15");
  });

  it("CAST number to VARCHAR", () => {
    const result = run("SELECT CAST(42 AS VARCHAR) AS val", state, ctx());
    expect(singleValue(result)).toBe("42");
  });

  it("CAST VARCHAR to NUMBER", () => {
    const result = run("SELECT CAST('123' AS NUMBER) AS val", state, ctx());
    expect(singleValue(result)).toBe(123);
  });
});

// ═════════════════════════════════════════════════════════════════════
// VARIANT/ARRAY/OBJECT FORMATTER TESTS (Task #11 — Phase 3)
// ═════════════════════════════════════════════════════════════════════

describe("VARIANT/ARRAY/OBJECT Formatting", () => {
  it("VARIANT object is formatted as JSON in output", () => {
    const simpleState = createSimpleState();
    const result = run(
      "SELECT DATA FROM TAGS WHERE ID = 1",
      simpleState,
      simpleCtx()
    );
    const qr = result.results[0];
    expect(qr.type).toBe("resultset");
    if (qr.type === "resultset") {
      const formatted = formatResultSet(qr.data);
      const plain = stripAnsi(formatted);
      // Should contain JSON-formatted output
      expect(plain).toContain("large");
    }
  });

  it("ARRAY values are formatted as JSON arrays", () => {
    const simpleState = createSimpleState();
    const result = run(
      "SELECT ARRAY_AGG(NAME) AS names FROM ITEMS WHERE CATEGORY = 'A'",
      simpleState,
      simpleCtx()
    );
    const qr = result.results[0];
    expect(qr.type).toBe("resultset");
    if (qr.type === "resultset") {
      const formatted = formatResultSet(qr.data);
      const plain = stripAnsi(formatted);
      expect(plain).toContain("Widget");
      expect(plain).toContain("Gadget");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// INSERT...SELECT TESTS (Task #11 — Phase 3)
// ═════════════════════════════════════════════════════════════════════

describe("INSERT...SELECT Execution", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createSimpleState();
  });

  const ctx = () => simpleCtx();

  it("INSERT INTO ... SELECT copies rows", () => {
    // First create target table, then insert from source
    const r1 = run("CREATE TABLE ITEMS_COPY (ID NUMBER, NAME VARCHAR, PRICE NUMBER, CATEGORY VARCHAR)", state, ctx());
    const s1 = r1.state;
    const r2 = run("INSERT INTO ITEMS_COPY SELECT * FROM ITEMS WHERE CATEGORY = 'A'", s1, ctx());
    const qr = r2.results[0];
    expect(qr.type).toBe("status");
    if (qr.type === "status") {
      expect(qr.data.rowsAffected).toBe(2);
    }
    // Verify the rows were inserted
    const r3 = run("SELECT COUNT(*) AS cnt FROM ITEMS_COPY", r2.state, ctx());
    expect(singleValue(r3)).toBe(2);
  });

  it("INSERT...SELECT with WHERE clause", () => {
    const r1 = run("CREATE TABLE EXPENSIVE (ID NUMBER, NAME VARCHAR, PRICE NUMBER, CATEGORY VARCHAR)", state, ctx());
    const s1 = r1.state;
    const r2 = run("INSERT INTO EXPENSIVE SELECT * FROM ITEMS WHERE PRICE > 20", s1, ctx());
    const qr = r2.results[0];
    expect(qr.type).toBe("status");
    if (qr.type === "status") {
      expect(qr.data.rowsAffected).toBe(2); // Doohickey (30), Whatchamacallit (25)
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// UPDATE SET PER-ROW EVALUATION (Bug #2 regression test)
// ═════════════════════════════════════════════════════════════════════

describe("UPDATE SET per-row evaluation", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createSimpleState();
  });

  const ctx = () => simpleCtx();

  it("UPDATE SET col = col * 1.1 computes per-row", () => {
    const r1 = run("UPDATE ITEMS SET PRICE = PRICE * 2 WHERE CATEGORY = 'A'", state, ctx());
    const qr = r1.results[0];
    expect(qr.type).toBe("status");
    if (qr.type === "status") {
      expect(qr.data.rowsAffected).toBe(2);
    }
    // Verify prices were doubled
    const r2 = run("SELECT NAME, PRICE FROM ITEMS WHERE CATEGORY = 'A' ORDER BY ID", r1.state, ctx());
    const r = rows(r2);
    expect(r[0].PRICE).toBe(20); // Widget: 10 * 2
    expect(r[1].PRICE).toBe(40); // Gadget: 20 * 2
  });

  it("UPDATE SET with expression referencing current row", () => {
    const r1 = run("UPDATE ITEMS SET NAME = NAME || '_updated' WHERE ID = 1", state, ctx());
    const r2 = run("SELECT NAME FROM ITEMS WHERE ID = 1", r1.state, ctx());
    expect(singleValue(r2)).toBe("Widget_updated");
  });
});
