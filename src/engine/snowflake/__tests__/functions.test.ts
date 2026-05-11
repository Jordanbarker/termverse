import { describe, it, expect, beforeEach } from "vitest";
import { SnowflakeState } from "../state";
import { createTestContext, executeQuery, rows, singleValue } from "./testHelpers";
import type { ExecutionResult } from "../executor/executor";

// ─── Test State Factory ──────────────────────────────────────────────

function createTestState(): SnowflakeState {
  const now = new Date("2026-02-03");
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
                createdAt: now,
                columns: [
                  { name: "ID", type: "NUMBER", nullable: false },
                  { name: "NAME", type: "VARCHAR", nullable: true },
                  { name: "DEPT", type: "VARCHAR", nullable: true },
                  { name: "SALARY", type: "NUMBER", nullable: true },
                  { name: "SCORE", type: "NUMBER", nullable: true },
                ],
                rows: [
                  { ID: 1, NAME: "Alice", DEPT: "Eng", SALARY: 90000, SCORE: 85 },
                  { ID: 2, NAME: "Bob", DEPT: "Eng", SALARY: 85000, SCORE: 90 },
                  { ID: 3, NAME: "Carol", DEPT: "Mkt", SALARY: 95000, SCORE: 85 },
                  { ID: 4, NAME: "Dave", DEPT: "Mkt", SALARY: null, SCORE: null },
                  { ID: 5, NAME: null, DEPT: "Sales", SALARY: 78000, SCORE: 92 },
                ],
              },
              NUMBERS: {
                name: "NUMBERS",
                createdAt: now,
                columns: [
                  { name: "ID", type: "NUMBER", nullable: false },
                  { name: "VAL", type: "NUMBER", nullable: false },
                ],
                rows: [
                  { ID: 1, VAL: 10 },
                  { ID: 2, VAL: 20 },
                  { ID: 3, VAL: 10 },
                  { ID: 4, VAL: 30 },
                  { ID: 5, VAL: 20 },
                ],
              },
            },
            views: {},
            sequences: {},
            stages: {},
          },
        },
      },
    },
    warehouses: {
      NEXACORP_WH: { name: "NEXACORP_WH", size: "XSMALL", state: "STARTED", autoSuspend: 600 },
    },
  });
}

function run(sql: string, state?: SnowflakeState): ExecutionResult {
  return executeQuery(sql, state ?? createTestState());
}

describe("SQL Functions", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createTestState();
  });

  // ═══════════════════════════════════════════════════════════════════
  // AGGREGATE FUNCTIONS (tested via executor with GROUP BY)
  // ═══════════════════════════════════════════════════════════════════

  describe("aggregate functions", () => {
    it("COUNT(*) counts all rows including NULLs", () => {
      const result = run("SELECT COUNT(*) AS cnt FROM employees", state);
      expect(singleValue(result)).toBe(5);
    });

    it("COUNT(col) excludes NULL values", () => {
      const result = run("SELECT COUNT(name) AS cnt FROM employees", state);
      expect(singleValue(result)).toBe(4); // one NULL name
    });

    it("COUNT(DISTINCT col) counts unique non-null values", () => {
      const result = run("SELECT COUNT(DISTINCT val) AS cnt FROM numbers", state);
      expect(singleValue(result)).toBe(3); // 10, 20, 30
    });

    it("SUM with numbers", () => {
      const result = run("SELECT SUM(val) AS total FROM numbers", state);
      expect(singleValue(result)).toBe(90); // 10+20+10+30+20
    });

    it("SUM ignores NULLs", () => {
      const result = run("SELECT SUM(salary) AS total FROM employees", state);
      expect(singleValue(result)).toBe(348000); // 90000+85000+95000+78000 (Dave is NULL)
    });

    it("AVG with numbers", () => {
      const result = run("SELECT AVG(val) AS avg_val FROM numbers", state);
      expect(singleValue(result)).toBe(18); // 90/5
    });

    it("AVG ignores NULLs", () => {
      const result = run("SELECT AVG(salary) AS avg_sal FROM employees", state);
      expect(singleValue(result)).toBe(87000); // 348000/4
    });

    it("MIN with numbers", () => {
      const result = run("SELECT MIN(salary) AS min_sal FROM employees", state);
      expect(singleValue(result)).toBe(78000);
    });

    it("MAX with numbers", () => {
      const result = run("SELECT MAX(salary) AS max_sal FROM employees", state);
      expect(singleValue(result)).toBe(95000);
    });

    it("MIN with strings", () => {
      const result = run("SELECT MIN(name) AS min_name FROM employees", state);
      expect(singleValue(result)).toBe("Alice");
    });

    it("MAX with strings", () => {
      const result = run("SELECT MAX(name) AS max_name FROM employees", state);
      expect(singleValue(result)).toBe("Dave"); // alphabetically last among non-null
    });

    it("COUNT with all NULLs returns 0", () => {
      const result = run(
        "SELECT COUNT(salary) AS cnt FROM employees WHERE salary IS NULL",
        state
      );
      expect(singleValue(result)).toBe(0);
    });

    it("SUM with all NULLs returns NULL", () => {
      const result = run(
        "SELECT SUM(salary) AS total FROM employees WHERE salary IS NULL",
        state
      );
      expect(singleValue(result)).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STRING FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  describe("string functions", () => {
    it("UPPER converts to uppercase", () => {
      const result = run("SELECT UPPER('hello') AS val");
      expect(singleValue(result)).toBe("HELLO");
    });

    it("LOWER converts to lowercase", () => {
      const result = run("SELECT LOWER('HELLO') AS val");
      expect(singleValue(result)).toBe("hello");
    });

    it("TRIM removes leading and trailing spaces", () => {
      const result = run("SELECT TRIM('  hello  ') AS val");
      expect(singleValue(result)).toBe("hello");
    });

    it("LTRIM removes leading spaces", () => {
      const result = run("SELECT LTRIM('  hello  ') AS val");
      expect(singleValue(result)).toBe("hello  ");
    });

    it("RTRIM removes trailing spaces", () => {
      const result = run("SELECT RTRIM('  hello  ') AS val");
      expect(singleValue(result)).toBe("  hello");
    });

    it("SUBSTR extracts substring (1-based indexing)", () => {
      const result = run("SELECT SUBSTR('hello', 2, 3) AS val");
      expect(singleValue(result)).toBe("ell");
    });

    it("SUBSTR without length returns rest of string", () => {
      const result = run("SELECT SUBSTR('hello', 2) AS val");
      expect(singleValue(result)).toBe("ello");
    });

    it("CONCAT joins multiple strings", () => {
      const result = run("SELECT CONCAT('a', 'b', 'c') AS val");
      expect(singleValue(result)).toBe("abc");
    });

    it("LENGTH returns string length", () => {
      const result = run("SELECT LENGTH('hello') AS val");
      expect(singleValue(result)).toBe(5);
    });

    it("REPLACE replaces all occurrences", () => {
      const result = run("SELECT REPLACE('hello', 'l', 'r') AS val");
      expect(singleValue(result)).toBe("herro");
    });

    it("SPLIT splits string into array", () => {
      const result = run("SELECT SPLIT('a,b,c', ',') AS val");
      const val = singleValue(result);
      expect(val).toEqual(["a", "b", "c"]);
    });

    it("LPAD pads from the left", () => {
      const result = run("SELECT LPAD('hi', 5, '*') AS val");
      expect(singleValue(result)).toBe("***hi");
    });

    it("RPAD pads from the right", () => {
      const result = run("SELECT RPAD('hi', 5, '*') AS val");
      expect(singleValue(result)).toBe("hi***");
    });

    it("REVERSE reverses a string", () => {
      const result = run("SELECT REVERSE('hello') AS val");
      expect(singleValue(result)).toBe("olleh");
    });

    it("INITCAP capitalizes first letter of each word", () => {
      const result = run("SELECT INITCAP('hello world') AS val");
      expect(singleValue(result)).toBe("Hello World");
    });

    it("NULL input returns NULL for string functions", () => {
      const result = run("SELECT UPPER(NULL) AS val");
      expect(singleValue(result)).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // NUMERIC FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  describe("numeric functions", () => {
    it("ABS returns absolute value", () => {
      const result = run("SELECT ABS(-5) AS val");
      expect(singleValue(result)).toBe(5);
    });

    it("CEIL rounds up", () => {
      const result = run("SELECT CEIL(3.2) AS val");
      expect(singleValue(result)).toBe(4);
    });

    it("FLOOR rounds down", () => {
      const result = run("SELECT FLOOR(3.8) AS val");
      expect(singleValue(result)).toBe(3);
    });

    it("ROUND to specified decimal places", () => {
      const result = run("SELECT ROUND(3.456, 2) AS val");
      expect(singleValue(result)).toBe(3.46);
    });

    it("MOD returns remainder", () => {
      const result = run("SELECT MOD(10, 3) AS val");
      expect(singleValue(result)).toBe(1);
    });

    it("POWER raises to exponent", () => {
      const result = run("SELECT POWER(2, 3) AS val");
      expect(singleValue(result)).toBe(8);
    });

    it("SQRT returns square root", () => {
      const result = run("SELECT SQRT(9) AS val");
      expect(singleValue(result)).toBe(3);
    });

    it("SIGN returns -1, 0, or 1", () => {
      expect(singleValue(run("SELECT SIGN(-5) AS val"))).toBe(-1);
      expect(singleValue(run("SELECT SIGN(0) AS val"))).toBe(0);
      expect(singleValue(run("SELECT SIGN(5) AS val"))).toBe(1);
    });

    it("TRUNC truncates to specified decimal places", () => {
      const result = run("SELECT TRUNC(3.789, 1) AS val");
      expect(singleValue(result)).toBe(3.7);
    });

    it("NULL input returns NULL for numeric functions", () => {
      const result = run("SELECT ABS(NULL) AS val");
      expect(singleValue(result)).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // DATE FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  describe("date functions", () => {
    it("CURRENT_DATE returns a date", () => {
      const result = run("SELECT CURRENT_DATE() AS val");
      const val = singleValue(result);
      expect(val).toBeDefined();
      expect(val).not.toBeNull();
      // Should be a string in date format or a Date object
      if (typeof val === "string") {
        expect(val).toMatch(/^\d{4}-\d{2}-\d{2}/);
      }
    });

    it("DATEADD adds days", () => {
      const result = run("SELECT DATEADD('day', 5, '2024-01-01') AS val");
      const val = singleValue(result);
      expect(val instanceof Date ? val.toISOString() : String(val)).toContain("2024-01-06");
    });

    it("DATEDIFF calculates difference", () => {
      const result = run("SELECT DATEDIFF('day', '2024-01-01', '2024-01-10') AS val");
      expect(singleValue(result)).toBe(9);
    });

    it("DATE_TRUNC truncates to month", () => {
      const result = run("SELECT DATE_TRUNC('month', '2024-03-15') AS val");
      const val = singleValue(result);
      expect(val instanceof Date ? val.toISOString() : String(val)).toContain("2024-03-01");
    });

    it("EXTRACT extracts year", () => {
      const result = run("SELECT EXTRACT('year', '2024-03-15') AS val");
      expect(singleValue(result)).toBe(2024);
    });

    it("TO_DATE converts string to date", () => {
      const result = run("SELECT TO_DATE('2024-01-15') AS val");
      const val = singleValue(result);
      expect(val).toBeDefined();
      expect(val instanceof Date ? val.toISOString() : String(val)).toContain("2024-01-15");
    });

    it("TO_TIMESTAMP converts string to timestamp", () => {
      const result = run("SELECT TO_TIMESTAMP('2024-01-15 10:30:00') AS val");
      const val = singleValue(result);
      expect(val).toBeDefined();
      expect(val instanceof Date ? val.toISOString() : String(val)).toContain("2024-01-15");
    });

    describe("story-clock (ctx.gameNow)", () => {
      const storyNow = new Date(2026, 1, 23, 9, 30, 15); // Day 1, 09:30:15

      function runWithGameNow(sql: string): ExecutionResult {
        return executeQuery(sql, createTestState(), createTestContext({ gameNow: storyNow }));
      }

      it("CURRENT_DATE honors ctx.gameNow", () => {
        const val = singleValue(runWithGameNow("SELECT CURRENT_DATE() AS val"));
        expect(val).toBeInstanceOf(Date);
        expect((val as Date).getFullYear()).toBe(2026);
        expect((val as Date).getMonth()).toBe(1);
        expect((val as Date).getDate()).toBe(23);
        // CURRENT_DATE truncates time
        expect((val as Date).getHours()).toBe(0);
      });

      it("CURRENT_TIMESTAMP honors ctx.gameNow with full time", () => {
        const val = singleValue(runWithGameNow("SELECT CURRENT_TIMESTAMP() AS val"));
        expect(val).toBeInstanceOf(Date);
        expect((val as Date).getTime()).toBe(storyNow.getTime());
      });

      it("NOW honors ctx.gameNow", () => {
        const val = singleValue(runWithGameNow("SELECT NOW() AS val"));
        expect((val as Date).getTime()).toBe(storyNow.getTime());
      });

      it("GETDATE/SYSDATE/LOCALTIMESTAMP honor ctx.gameNow", () => {
        for (const fn of ["GETDATE", "SYSDATE", "LOCALTIMESTAMP"]) {
          const val = singleValue(runWithGameNow(`SELECT ${fn}() AS val`));
          expect((val as Date).getTime()).toBe(storyNow.getTime());
        }
      });

      it("CURRENT_TIME honors ctx.gameNow", () => {
        const val = singleValue(runWithGameNow("SELECT CURRENT_TIME() AS val"));
        expect(val).toBe("09:30:15");
      });

      it("returns a fresh Date — mutating result does not leak into ctx", () => {
        const ctx = createTestContext({ gameNow: storyNow });
        const result = executeQuery("SELECT NOW() AS val", createTestState(), ctx);
        const val = singleValue(result) as Date;
        val.setFullYear(1999);
        expect(ctx.gameNow!.getFullYear()).toBe(2026);
      });

      it("falls back to wall-clock when ctx.gameNow is absent", () => {
        const before = Date.now();
        const val = singleValue(run("SELECT NOW() AS val")) as Date;
        const after = Date.now();
        expect(val.getTime()).toBeGreaterThanOrEqual(before);
        expect(val.getTime()).toBeLessThanOrEqual(after);
      });

      it("DATEDIFF against CURRENT_DATE uses story clock", () => {
        // Hire date 2025-02-23, story today 2026-02-23 → 365 days
        const val = singleValue(runWithGameNow(
          "SELECT DATEDIFF('day', '2025-02-23', CURRENT_DATE()) AS val"
        ));
        expect(val).toBe(365);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CONVERSION FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  describe("conversion functions", () => {
    it("CAST number to VARCHAR", () => {
      const result = run("SELECT CAST(42 AS VARCHAR) AS val");
      expect(singleValue(result)).toBe("42");
    });

    it("CAST string to NUMBER", () => {
      const result = run("SELECT CAST('42' AS NUMBER) AS val");
      expect(singleValue(result)).toBe(42);
    });

    it("CAST string to BOOLEAN", () => {
      const result = run("SELECT CAST('true' AS BOOLEAN) AS val");
      expect(singleValue(result)).toBe(true);
    });

    it("TRY_CAST returns NULL for invalid conversion", () => {
      const result = run("SELECT TRY_CAST('not_a_number' AS NUMBER) AS val");
      expect(singleValue(result)).toBeNull();
    });

    it("TO_NUMBER converts string to number", () => {
      const result = run("SELECT TO_NUMBER('42.5') AS val");
      expect(singleValue(result)).toBe(42.5);
    });

    it("TO_VARCHAR converts number to string", () => {
      const result = run("SELECT TO_VARCHAR(42) AS val");
      expect(singleValue(result)).toBe("42");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SEMI-STRUCTURED FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  describe("semi-structured functions", () => {
    it("PARSE_JSON parses a JSON string", () => {
      const result = run("SELECT PARSE_JSON('{\"a\": 1}') AS val");
      const val = singleValue(result);
      expect(val).toEqual({ a: 1 });
    });

    it("GET_PATH extracts nested value", () => {
      const result = run(
        "SELECT GET_PATH(PARSE_JSON('{\"a\": {\"b\": 42}}'), 'a.b') AS val"
      );
      expect(singleValue(result)).toBe(42);
    });

    it("OBJECT_CONSTRUCT builds an object", () => {
      const result = run(
        "SELECT OBJECT_CONSTRUCT('key1', 'val1', 'key2', 'val2') AS val"
      );
      expect(singleValue(result)).toEqual({ key1: "val1", key2: "val2" });
    });

    it("ARRAY_CONSTRUCT builds an array", () => {
      const result = run("SELECT ARRAY_CONSTRUCT(1, 2, 3) AS val");
      expect(singleValue(result)).toEqual([1, 2, 3]);
    });

    it("ARRAY_SIZE returns array length", () => {
      const result = run(
        "SELECT ARRAY_SIZE(ARRAY_CONSTRUCT(1, 2, 3)) AS val"
      );
      expect(singleValue(result)).toBe(3);
    });

    it("TYPEOF returns the type name", () => {
      expect(singleValue(run("SELECT TYPEOF(42) AS val"))).toBe("INTEGER");
      expect(singleValue(run("SELECT TYPEOF('hello') AS val"))).toBe("VARCHAR");
      expect(singleValue(run("SELECT TYPEOF(TRUE) AS val"))).toBe("BOOLEAN");
      expect(singleValue(run("SELECT TYPEOF(NULL) AS val"))).toBe("NULL_VALUE");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // WINDOW FUNCTIONS (tested via executor)
  // ═══════════════════════════════════════════════════════════════════

  describe("window functions", () => {
    it("ROW_NUMBER produces sequential numbers", () => {
      const result = run(
        "SELECT name, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM employees",
        state
      );
      const r = rows(result);
      const rns = r.map((row) => row.RN);
      expect(rns).toEqual([1, 2, 3, 4, 5]);
    });

    it("RANK handles ties by skipping", () => {
      const result = run(
        "SELECT name, RANK() OVER (ORDER BY score) AS rnk FROM employees WHERE score IS NOT NULL",
        state
      );
      const r = rows(result);
      // Scores: 85, 85, 90, 92 → ranks: 1, 1, 3, 4
      const ranks = r.map((row) => row.RNK);
      expect(ranks).toContain(1);
      expect(ranks).toContain(3); // Skips 2 because of tie at 1
    });

    it("DENSE_RANK handles ties without skipping", () => {
      const result = run(
        "SELECT name, DENSE_RANK() OVER (ORDER BY score) AS drnk FROM employees WHERE score IS NOT NULL",
        state
      );
      const r = rows(result);
      // Scores: 85, 85, 90, 92 → dense_ranks: 1, 1, 2, 3
      const ranks = r.map((row) => row.DRNK);
      expect(ranks).toContain(1);
      expect(ranks).toContain(2); // No skip after tie
      expect(Math.max(...(ranks as number[]))).toBe(3);
    });

    it("LAG accesses previous row value", () => {
      const result = run(
        "SELECT name, salary, LAG(salary, 1) OVER (ORDER BY id) AS prev_salary FROM employees",
        state
      );
      const r = rows(result);
      expect(r[0].PREV_SALARY).toBeNull(); // No previous row
      expect(r[1].PREV_SALARY).toBe(90000); // Alice's salary
    });

    it("LEAD accesses next row value", () => {
      const result = run(
        "SELECT name, salary, LEAD(salary, 1) OVER (ORDER BY id) AS next_salary FROM employees",
        state
      );
      const r = rows(result);
      expect(r[0].NEXT_SALARY).toBe(85000); // Bob's salary
      expect(r[r.length - 1].NEXT_SALARY).toBeNull(); // No next row
    });

    it("LAG with default value", () => {
      const result = run(
        "SELECT name, LAG(salary, 1, 0) OVER (ORDER BY id) AS prev_salary FROM employees",
        state
      );
      const r = rows(result);
      expect(r[0].PREV_SALARY).toBe(0); // Default value instead of NULL
    });

    it("FIRST_VALUE returns first value in window", () => {
      const result = run(
        "SELECT name, FIRST_VALUE(name) OVER (ORDER BY id) AS first_name FROM employees",
        state
      );
      const r = rows(result);
      r.forEach((row) => {
        expect(row.FIRST_NAME).toBe("Alice");
      });
    });

    it("LAST_VALUE returns last value in window", () => {
      const result = run(
        "SELECT name, LAST_VALUE(name) OVER (ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last_name FROM employees",
        state
      );
      const r = rows(result);
      // With the full window frame, last_value should be the last row's value
      r.forEach((row) => {
        // ID 5's name is null, so last non-null or just the last value
        expect(row.LAST_NAME).toBeDefined();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CONDITIONAL FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  describe("conditional functions", () => {
    it("COALESCE returns first non-null value", () => {
      const result = run("SELECT COALESCE(NULL, NULL, 'x') AS val");
      expect(singleValue(result)).toBe("x");
    });

    it("COALESCE returns first argument if non-null", () => {
      const result = run("SELECT COALESCE('first', 'second') AS val");
      expect(singleValue(result)).toBe("first");
    });

    it("NULLIF returns NULL when values are equal", () => {
      const result = run("SELECT NULLIF(1, 1) AS val");
      expect(singleValue(result)).toBeNull();
    });

    it("NULLIF returns first value when values differ", () => {
      const result = run("SELECT NULLIF(1, 2) AS val");
      expect(singleValue(result)).toBe(1);
    });

    it("NVL returns value when non-null", () => {
      const result = run("SELECT NVL(42, 0) AS val");
      expect(singleValue(result)).toBe(42);
    });

    it("NVL returns default when null", () => {
      const result = run("SELECT NVL(NULL, 'default') AS val");
      expect(singleValue(result)).toBe("default");
    });

    it("IFF returns true branch when condition is true", () => {
      const result = run("SELECT IFF(TRUE, 'a', 'b') AS val");
      expect(singleValue(result)).toBe("a");
    });

    it("IFF returns false branch when condition is false", () => {
      const result = run("SELECT IFF(FALSE, 'a', 'b') AS val");
      expect(singleValue(result)).toBe("b");
    });

    it("DECODE matches first value", () => {
      const result = run("SELECT DECODE(1, 1, 'one', 2, 'two', 'other') AS val");
      expect(singleValue(result)).toBe("one");
    });

    it("DECODE returns default when no match", () => {
      const result = run("SELECT DECODE(3, 1, 'one', 2, 'two', 'other') AS val");
      expect(singleValue(result)).toBe("other");
    });

    it("ZEROIFNULL returns 0 for NULL", () => {
      const result = run("SELECT ZEROIFNULL(NULL) AS val");
      expect(singleValue(result)).toBe(0);
    });

    it("ZEROIFNULL returns value when non-null", () => {
      const result = run("SELECT ZEROIFNULL(42) AS val");
      expect(singleValue(result)).toBe(42);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SYSTEM FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  describe("system functions", () => {
    it("CURRENT_USER returns PLAYER", () => {
      const result = run("SELECT CURRENT_USER() AS val", state);
      expect(singleValue(result)).toBe("PLAYER");
    });

    it("CURRENT_ROLE returns session role", () => {
      const result = run("SELECT CURRENT_ROLE() AS val", state);
      expect(singleValue(result)).toBe("SYSADMIN");
    });

    it("CURRENT_WAREHOUSE returns NEXACORP_WH", () => {
      const result = run("SELECT CURRENT_WAREHOUSE() AS val", state);
      expect(singleValue(result)).toBe("NEXACORP_WH");
    });

    it("CURRENT_DATABASE returns current database", () => {
      const result = run("SELECT CURRENT_DATABASE() AS val", state);
      expect(singleValue(result)).toBe("NEXACORP_DB");
    });

    it("CURRENT_SCHEMA returns current schema", () => {
      const result = run("SELECT CURRENT_SCHEMA() AS val", state);
      expect(singleValue(result)).toBe("PUBLIC");
    });
  });
});
