import { describe, it, expect } from "vitest";
import { parse } from "../parser/parser";
import { tokenize } from "../lexer/lexer";

// Helper: tokenize + parse in one step
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSql(sql: string): any {
  return parse(tokenize(sql));
}


describe("Parser — parse()", () => {
  // ─── Simple SELECT ──────────────────────────────────────────────────

  describe("SELECT literal", () => {
    it("parses SELECT 1 into a SelectStatement with a single literal", () => {
      const ast = parseSql("SELECT 1");
      expect(ast.kind).toBe("select");
      expect(ast.items).toHaveLength(1);
      expect(ast.items[0].expr.kind).toBe("number_literal");
      expect(ast.items[0].expr.value).toBe(1);
    });

    it("parses SELECT with string literal", () => {
      const ast = parseSql("SELECT 'hello'");
      expect(ast.kind).toBe("select");
      expect(ast.items[0].expr.kind).toBe("string_literal");
      expect(ast.items[0].expr.value).toBe("hello");
    });

    it("parses SELECT TRUE", () => {
      const ast = parseSql("SELECT TRUE");
      expect(ast.items[0].expr.value).toBe(true);
    });

    it("parses SELECT NULL", () => {
      const ast = parseSql("SELECT NULL");
      expect(ast.items[0].expr.kind).toBe("null_literal");
    });
  });

  // ─── SELECT with Columns ────────────────────────────────────────────

  describe("SELECT with columns", () => {
    it("parses SELECT a, b, c FROM t", () => {
      const ast = parseSql("SELECT a, b, c FROM t");
      expect(ast.kind).toBe("select");
      expect(ast.items).toHaveLength(3);
      expect(ast.items[0].expr.kind).toBe("column_ref");
      expect(ast.items[0].expr.column).toBe("a");
      expect(ast.items[1].expr.column).toBe("b");
      expect(ast.items[2].expr.column).toBe("c");
      expect(ast.from.kind).toBe("table_name");
      expect(ast.from.name[0]).toBe("t");
    });

    it("parses SELECT * FROM t", () => {
      const ast = parseSql("SELECT * FROM t");
      expect(ast.items).toHaveLength(1);
      expect(ast.items[0].expr.kind).toBe("star_ref");
    });
  });

  // ─── Aliases ────────────────────────────────────────────────────────

  describe("aliases", () => {
    it("parses SELECT a AS x FROM t", () => {
      const ast = parseSql("SELECT a AS x FROM t");
      expect(ast.items[0].alias).toBe("x");
    });

    it("parses alias without AS keyword", () => {
      const ast = parseSql("SELECT a x FROM t");
      expect(ast.items[0].alias).toBe("x");
    });

    it("parses table alias", () => {
      const ast = parseSql("SELECT * FROM employees e");
      expect(ast.from.alias).toBe("e");
    });
  });

  // ─── WHERE ──────────────────────────────────────────────────────────

  describe("WHERE clause", () => {
    it("parses WHERE with comparison", () => {
      const ast = parseSql("SELECT * FROM t WHERE x > 5");
      expect(ast.where).toBeDefined();
      expect(ast.where.kind).toBe("binary_expr");
      expect(ast.where.op).toBe(">");
      expect(ast.where.left.kind).toBe("column_ref");
      expect(ast.where.right.kind).toBe("number_literal");
    });

    it("parses WHERE with AND", () => {
      const ast = parseSql("SELECT * FROM t WHERE a = 1 AND b = 2");
      expect(ast.where.kind).toBe("binary_expr");
      expect(ast.where.op).toBe("AND");
    });

    it("parses WHERE with OR", () => {
      const ast = parseSql("SELECT * FROM t WHERE a = 1 OR b = 2");
      expect(ast.where.kind).toBe("binary_expr");
      expect(ast.where.op).toBe("OR");
    });

    it("parses WHERE with NOT", () => {
      const ast = parseSql("SELECT * FROM t WHERE NOT active");
      expect(ast.where.kind).toBe("unary_expr");
      expect(ast.where.op).toBe("NOT");
    });
  });

  // ─── ORDER BY ───────────────────────────────────────────────────────

  describe("ORDER BY", () => {
    it("parses ORDER BY single column", () => {
      const ast = parseSql("SELECT * FROM t ORDER BY x");
      expect(ast.orderBy).toHaveLength(1);
      expect(ast.orderBy[0].expr.column).toBe("x");
      // Default should be ASC
      expect(ast.orderBy[0].direction).toBe("ASC");
    });

    it("parses ORDER BY with ASC and DESC", () => {
      const ast = parseSql("SELECT * FROM t ORDER BY x ASC, y DESC");
      expect(ast.orderBy).toHaveLength(2);
      expect(ast.orderBy[0].direction).toBe("ASC");
      expect(ast.orderBy[1].direction).toBe("DESC");
    });
  });

  // ─── LIMIT / OFFSET ────────────────────────────────────────────────

  describe("LIMIT and OFFSET", () => {
    it("parses LIMIT", () => {
      const ast = parseSql("SELECT * FROM t LIMIT 10");
      expect(ast.limit.kind).toBe("number_literal");
      expect(ast.limit.value).toBe(10);
    });

    it("parses LIMIT and OFFSET", () => {
      const ast = parseSql("SELECT * FROM t LIMIT 10 OFFSET 5");
      expect(ast.limit.kind).toBe("number_literal");
      expect(ast.limit.value).toBe(10);
      expect(ast.offset.kind).toBe("number_literal");
      expect(ast.offset.value).toBe(5);
    });
  });

  // ─── JOINs ─────────────────────────────────────────────────────────

  describe("JOINs", () => {
    it("parses INNER JOIN", () => {
      const ast = parseSql("SELECT * FROM a JOIN b ON a.id = b.id");
      expect(ast.from.kind).toBe("joined_table");
      expect(ast.from.joinType).toBe("INNER");
      expect(ast.from.right.name[0]).toBe("b");
      expect(ast.from.condition.kind).toBe("binary_expr");
    });

    it("parses LEFT JOIN", () => {
      const ast = parseSql("SELECT * FROM a LEFT JOIN b ON a.id = b.id");
      expect(ast.from.joinType).toBe("LEFT");
    });

    it("parses RIGHT JOIN", () => {
      const ast = parseSql("SELECT * FROM a RIGHT JOIN b ON a.id = b.id");
      expect(ast.from.joinType).toBe("RIGHT");
    });

    it("parses FULL OUTER JOIN", () => {
      const ast = parseSql(
        "SELECT * FROM a FULL OUTER JOIN b ON a.id = b.id"
      );
      expect(ast.from.joinType).toBe("FULL");
    });

    it("parses CROSS JOIN", () => {
      const ast = parseSql("SELECT * FROM a CROSS JOIN b");
      expect(ast.from.joinType).toBe("CROSS");
      // CROSS JOIN has no ON condition
      expect(ast.from.condition).toBeUndefined();
    });
  });

  // ─── GROUP BY / HAVING ─────────────────────────────────────────────

  describe("GROUP BY and HAVING", () => {
    it("parses GROUP BY", () => {
      const ast = parseSql("SELECT dept, COUNT(*) FROM emp GROUP BY dept");
      expect(ast.groupBy).toHaveLength(1);
      expect(ast.groupBy[0].kind).toBe("column_ref");
      expect(ast.groupBy[0].column).toBe("dept");
    });

    it("parses GROUP BY with HAVING", () => {
      const ast = parseSql(
        "SELECT dept, COUNT(*) FROM emp GROUP BY dept HAVING COUNT(*) > 5"
      );
      expect(ast.having).toBeDefined();
      expect(ast.having.kind).toBe("binary_expr");
      expect(ast.having.op).toBe(">");
    });
  });

  // ─── Subqueries ─────────────────────────────────────────────────────

  describe("subqueries", () => {
    it("parses IN subquery", () => {
      const ast = parseSql(
        "SELECT * FROM t WHERE id IN (SELECT id FROM t2)"
      );
      expect(ast.where.kind).toBe("in_expr");
      expect(ast.where.subquery).toBeDefined();
      expect(ast.where.subquery.kind).toBe("select");
    });

    it("parses EXISTS subquery", () => {
      const ast = parseSql(
        "SELECT * FROM t WHERE EXISTS (SELECT 1 FROM t2 WHERE t2.id = t.id)"
      );
      expect(ast.where.kind).toBe("exists_expr");
      expect(ast.where.subquery.kind).toBe("select");
    });

    it("parses scalar subquery in SELECT", () => {
      const ast = parseSql(
        "SELECT (SELECT COUNT(*) FROM t2) AS cnt FROM t"
      );
      expect(ast.items[0].expr.kind).toBe("subquery_expr");
    });
  });

  // ─── CTEs ───────────────────────────────────────────────────────────

  describe("CTEs (WITH clause)", () => {
    it("parses single CTE", () => {
      const ast = parseSql("WITH cte AS (SELECT 1) SELECT * FROM cte");
      expect(ast.kind).toBe("select");
      expect(ast.ctes).toHaveLength(1);
      expect(ast.ctes[0].name).toBe("cte");
      expect(ast.ctes[0].query.kind).toBe("select");
    });

    it("parses multiple CTEs", () => {
      const ast = parseSql(
        "WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a, b"
      );
      expect(ast.ctes).toHaveLength(2);
      expect(ast.ctes[0].name).toBe("a");
      expect(ast.ctes[1].name).toBe("b");
    });
  });

  // ─── Set Operations ────────────────────────────────────────────────

  describe("UNION / INTERSECT / EXCEPT", () => {
    it("parses UNION", () => {
      const ast = parseSql("SELECT 1 UNION SELECT 2");
      expect(ast.kind).toBe("select");
      expect(ast.setOp?.type).toBe("UNION");
    });

    it("parses UNION ALL", () => {
      const ast = parseSql("SELECT 1 UNION ALL SELECT 2");
      expect(ast.kind).toBe("select");
      expect(ast.setOp?.type).toBe("UNION ALL");
    });

    it("parses INTERSECT", () => {
      const ast = parseSql("SELECT 1 INTERSECT SELECT 1");
      expect(ast.kind).toBe("select");
      expect(ast.setOp?.type).toBe("INTERSECT");
    });

    it("parses EXCEPT", () => {
      const ast = parseSql("SELECT 1 EXCEPT SELECT 2");
      expect(ast.kind).toBe("select");
      expect(ast.setOp?.type).toBe("EXCEPT");
    });
  });

  // ─── DISTINCT ──────────────────────────────────────────────────────

  describe("DISTINCT", () => {
    it("parses SELECT DISTINCT", () => {
      const ast = parseSql("SELECT DISTINCT x FROM t");
      expect(ast.distinct).toBe(true);
    });
  });

  // ─── INSERT ────────────────────────────────────────────────────────

  describe("INSERT", () => {
    it("parses INSERT INTO with column list and VALUES", () => {
      const ast = parseSql("INSERT INTO t (a, b) VALUES (1, 'x')");
      expect(ast.kind).toBe("insert");
      expect(ast.table).toEqual(["t"]);
      expect(ast.columns).toEqual(["a", "b"]);
      expect(ast.values).toHaveLength(1); // one row
      expect(ast.values[0]).toHaveLength(2); // two values in the row
    });

    it("parses INSERT with multiple value rows", () => {
      const ast = parseSql(
        "INSERT INTO t (a, b) VALUES (1, 'x'), (2, 'y')"
      );
      expect(ast.values).toHaveLength(2);
    });
  });

  // ─── UPDATE ────────────────────────────────────────────────────────

  describe("UPDATE", () => {
    it("parses UPDATE with SET and WHERE", () => {
      const ast = parseSql("UPDATE t SET a = 1 WHERE b = 2");
      expect(ast.kind).toBe("update");
      expect(ast.table).toEqual(["t"]);
      expect(ast.set).toHaveLength(1);
      expect(ast.set[0].column).toBe("a");
      expect(ast.where).toBeDefined();
    });
  });

  // ─── DELETE ────────────────────────────────────────────────────────

  describe("DELETE", () => {
    it("parses DELETE FROM with WHERE", () => {
      const ast = parseSql("DELETE FROM t WHERE a = 1");
      expect(ast.kind).toBe("delete");
      expect(ast.table).toEqual(["t"]);
      expect(ast.where).toBeDefined();
    });
  });

  // ─── CREATE TABLE ──────────────────────────────────────────────────

  describe("CREATE TABLE", () => {
    it("parses CREATE TABLE with column definitions", () => {
      const ast = parseSql("CREATE TABLE t (id NUMBER, name VARCHAR)");
      expect(ast.kind).toBe("create_table");
      expect(ast.name).toEqual(["t"]);
      expect(ast.columns).toHaveLength(2);
      expect(ast.columns[0].name).toBe("id");
      expect(ast.columns[0].type).toBe("NUMBER");
      expect(ast.columns[1].name).toBe("name");
      expect(ast.columns[1].type).toBe("VARCHAR");
    });

    it("parses CREATE TABLE IF NOT EXISTS", () => {
      const ast = parseSql(
        "CREATE TABLE IF NOT EXISTS t (id NUMBER)"
      );
      expect(ast.kind).toBe("create_table");
      expect(ast.ifNotExists).toBe(true);
    });

    it("parses CREATE TABLE with CLONE", () => {
      const ast = parseSql("CREATE TABLE t2 CLONE t1");
      expect(ast.kind).toBe("create_table");
      expect(ast.name).toEqual(["t2"]);
      expect(ast.clone).toEqual(["t1"]);
    });
  });

  // ─── CREATE DATABASE / SCHEMA ──────────────────────────────────────

  describe("CREATE DATABASE / SCHEMA", () => {
    it("parses CREATE DATABASE", () => {
      const ast = parseSql("CREATE DATABASE mydb");
      expect(ast.kind).toBe("create_database");
      expect(ast.name).toBe("mydb");
    });

    it("parses CREATE SCHEMA", () => {
      const ast = parseSql("CREATE SCHEMA myschema");
      expect(ast.kind).toBe("create_schema");
      expect(ast.name).toBe("myschema");
    });
  });

  // ─── DROP ──────────────────────────────────────────────────────────

  describe("DROP", () => {
    it("parses DROP TABLE", () => {
      const ast = parseSql("DROP TABLE t");
      expect(ast.kind).toBe("drop");
      expect(ast.name).toEqual(["t"]);
    });

    it("parses DROP TABLE IF EXISTS", () => {
      const ast = parseSql("DROP TABLE IF EXISTS t");
      expect(ast.kind).toBe("drop");
      expect(ast.ifExists).toBe(true);
    });

    it("parses DROP DATABASE", () => {
      const ast = parseSql("DROP DATABASE mydb");
      expect(ast.kind).toBe("drop");
    });

    it("parses DROP SCHEMA", () => {
      const ast = parseSql("DROP SCHEMA myschema");
      expect(ast.kind).toBe("drop");
    });
  });

  // ─── TRUNCATE ──────────────────────────────────────────────────────

  describe("TRUNCATE", () => {
    it("parses TRUNCATE TABLE", () => {
      const ast = parseSql("TRUNCATE TABLE t");
      expect(ast.kind).toBe("truncate");
      expect(ast.table).toEqual(["t"]);
    });
  });

  // ─── CASE Expression ──────────────────────────────────────────────

  describe("CASE expression", () => {
    it("parses CASE WHEN THEN ELSE END", () => {
      const ast = parseSql(
        "SELECT CASE WHEN x > 0 THEN 'pos' ELSE 'neg' END FROM t"
      );
      const caseExpr = ast.items[0].expr;
      expect(caseExpr.kind).toBe("case_expr");
      expect(caseExpr.whenClauses).toHaveLength(1);
      expect(caseExpr.whenClauses[0].when.kind).toBe("binary_expr");
      expect(caseExpr.elseClause).toBeDefined();
    });

    it("parses CASE with multiple WHEN branches", () => {
      const ast = parseSql(
        "SELECT CASE WHEN x = 1 THEN 'one' WHEN x = 2 THEN 'two' ELSE 'other' END FROM t"
      );
      const caseExpr = ast.items[0].expr;
      expect(caseExpr.whenClauses).toHaveLength(2);
    });
  });

  // ─── Function Calls ────────────────────────────────────────────────

  describe("function calls", () => {
    it("parses a simple function call", () => {
      const ast = parseSql("SELECT UPPER(name) FROM t");
      const fn = ast.items[0].expr;
      expect(fn.kind).toBe("function_call");
      expect(fn.name).toBe("UPPER");
      expect(fn.args).toHaveLength(1);
    });

    it("parses COUNT(*)", () => {
      const ast = parseSql("SELECT COUNT(*) FROM t");
      const fn = ast.items[0].expr;
      expect(fn.kind).toBe("aggregate_call");
      expect(fn.name).toBe("COUNT");
      expect(fn.arg).toBeNull();
    });

    it("parses nested function calls", () => {
      const ast = parseSql("SELECT UPPER(TRIM(name)) FROM t");
      const outer = ast.items[0].expr;
      expect(outer.kind).toBe("function_call");
      expect(outer.name).toBe("UPPER");
      expect(outer.args[0].kind).toBe("function_call");
      expect(outer.args[0].name).toBe("TRIM");
    });
  });

  // ─── Window Functions ──────────────────────────────────────────────

  describe("window functions", () => {
    it("parses ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)", () => {
      const ast = parseSql(
        "SELECT ROW_NUMBER() OVER (PARTITION BY dept ORDER BY hire_date) FROM emp"
      );
      const fn = ast.items[0].expr;
      expect(fn.kind).toBe("window_call");
      expect(fn.func.name).toBe("ROW_NUMBER");
      expect(fn.over).toBeDefined();
      expect(fn.over.partitionBy).toHaveLength(1);
      expect(fn.over.orderBy).toHaveLength(1);
    });

    it("parses window function with only ORDER BY", () => {
      const ast = parseSql(
        "SELECT RANK() OVER (ORDER BY score DESC) FROM t"
      );
      const fn = ast.items[0].expr;
      expect(fn.kind).toBe("window_call");
      expect(fn.over).toBeDefined();
      expect(fn.over.partitionBy).toHaveLength(0);
      expect(fn.over.orderBy).toHaveLength(1);
      expect(fn.over.orderBy[0].direction).toBe("DESC");
    });
  });

  // ─── QUALIFY ───────────────────────────────────────────────────────

  describe("QUALIFY", () => {
    it("parses QUALIFY clause", () => {
      const ast = parseSql(
        "SELECT * FROM t QUALIFY ROW_NUMBER() OVER (PARTITION BY x ORDER BY y) = 1"
      );
      expect(ast.qualify).toBeDefined();
      expect(ast.qualify.kind).toBe("binary_expr");
      expect(ast.qualify.op).toBe("=");
    });
  });

  // ─── FLATTEN ───────────────────────────────────────────────────────

  describe("FLATTEN", () => {
    it("parses LATERAL FLATTEN", () => {
      const ast = parseSql(
        "SELECT * FROM t, LATERAL FLATTEN(input => t.data)"
      );
      // FLATTEN appears as a comma join (CROSS) with right being flatten_table
      expect(ast.from.kind).toBe("joined_table");
      expect(ast.from.joinType).toBe("CROSS");
      const flatten = ast.from.right;
      expect(flatten.kind).toBe("flatten_table");
      expect(flatten.input).toBeDefined();
    });
  });

  // ─── ILIKE ─────────────────────────────────────────────────────────

  describe("ILIKE", () => {
    it("parses ILIKE in WHERE clause", () => {
      const ast = parseSql("SELECT * FROM t WHERE name ILIKE '%john%'");
      expect(ast.where.kind).toBe("like_expr");
      expect(ast.where.caseInsensitive).toBe(true);
    });
  });

  // ─── BETWEEN ───────────────────────────────────────────────────────

  describe("BETWEEN", () => {
    it("parses BETWEEN expression", () => {
      const ast = parseSql("SELECT * FROM t WHERE x BETWEEN 1 AND 10");
      expect(ast.where.kind).toBe("between_expr");
      expect(ast.where.low.value).toBe(1);
      expect(ast.where.high.value).toBe(10);
    });
  });

  // ─── IS NULL / IS NOT NULL ─────────────────────────────────────────

  describe("IS NULL / IS NOT NULL", () => {
    it("parses IS NULL", () => {
      const ast = parseSql("SELECT * FROM t WHERE x IS NULL");
      expect(ast.where.kind).toBe("is_null_expr");
      expect(ast.where.negated).toBe(false);
    });

    it("parses IS NOT NULL", () => {
      const ast = parseSql("SELECT * FROM t WHERE x IS NOT NULL");
      expect(ast.where.kind).toBe("is_null_expr");
      expect(ast.where.negated).toBe(true);
    });
  });

  // ─── LIKE with ESCAPE ──────────────────────────────────────────────

  describe("LIKE with ESCAPE", () => {
    it("parses LIKE with ESCAPE clause", () => {
      const ast = parseSql(
        "SELECT * FROM t WHERE name LIKE '%10\\%%' ESCAPE '\\'"
      );
      expect(ast.where.kind).toBe("like_expr");
      expect(ast.where.caseInsensitive).toBe(false);
      expect(ast.where.escape.kind).toBe("string_literal");
      expect(ast.where.escape.value).toBe("\\");
    });
  });

  // ─── MERGE ─────────────────────────────────────────────────────────

  describe("MERGE", () => {
    it("parses MERGE statement", () => {
      const ast = parseSql(
        "MERGE INTO target t USING source s ON t.id = s.id WHEN MATCHED THEN UPDATE SET name = s.name WHEN NOT MATCHED THEN INSERT (id, name) VALUES (s.id, s.name)"
      );
      expect(ast.kind).toBe("merge");
      expect(ast.target).toEqual(["target"]);
      expect(ast.source).toBeDefined();
      expect(ast.condition).toBeDefined();
      expect(ast.clauses).toHaveLength(2);
      expect(ast.clauses[0].matched).toBe(true);
      expect(ast.clauses[1].matched).toBe(false);
    });
  });

  // ─── SHOW / DESCRIBE / USE ─────────────────────────────────────────

  describe("SHOW / DESCRIBE / USE", () => {
    it("parses SHOW TABLES", () => {
      const ast = parseSql("SHOW TABLES");
      expect(ast.kind).toBe("show");
      expect(ast.objectType).toBe("TABLES");
    });

    it("parses SHOW DATABASES", () => {
      const ast = parseSql("SHOW DATABASES");
      expect(ast.kind).toBe("show");
      expect(ast.objectType).toBe("DATABASES");
    });

    it("parses SHOW SCHEMAS", () => {
      const ast = parseSql("SHOW SCHEMAS");
      expect(ast.kind).toBe("show");
      expect(ast.objectType).toBe("SCHEMAS");
    });

    it("parses SHOW TABLES IN ACCOUNT", () => {
      const ast = parseSql("SHOW TABLES IN ACCOUNT");
      expect(ast.kind).toBe("show");
      expect(ast.objectType).toBe("TABLES");
      expect(ast.inAccount).toBe(true);
      expect(ast.inDatabase).toBeUndefined();
      expect(ast.inSchema).toBeUndefined();
    });

    it("parses SHOW SCHEMAS IN ACCOUNT", () => {
      const ast = parseSql("SHOW SCHEMAS IN ACCOUNT");
      expect(ast.kind).toBe("show");
      expect(ast.objectType).toBe("SCHEMAS");
      expect(ast.inAccount).toBe(true);
    });

    it("parses SHOW TABLES IN ACCOUNT LIKE 'EMP%'", () => {
      const ast = parseSql("SHOW TABLES IN ACCOUNT LIKE 'EMP%'");
      expect(ast.inAccount).toBe(true);
      expect(ast.like).toBe("EMP%");
    });

    it("parses SHOW TABLES IN DATABASE NEXACORP_PROD", () => {
      const ast = parseSql("SHOW TABLES IN DATABASE NEXACORP_PROD");
      expect(ast.inAccount).toBeUndefined();
      expect(ast.inDatabase).toBe("NEXACORP_PROD");
      expect(ast.inSchema).toBeUndefined();
    });

    it("parses DESCRIBE TABLE", () => {
      const ast = parseSql("DESCRIBE TABLE employees");
      expect(ast.kind).toBe("describe");
      expect(ast.objectType).toBe("TABLE");
      expect(ast.name).toEqual(["employees"]);
    });

    it("parses USE DATABASE", () => {
      const ast = parseSql("USE DATABASE mydb");
      expect(ast.kind).toBe("use");
      expect(ast.objectType).toBe("DATABASE");
      expect(ast.name).toBe("mydb");
    });

    it("parses USE SCHEMA", () => {
      const ast = parseSql("USE SCHEMA myschema");
      expect(ast.kind).toBe("use");
      expect(ast.objectType).toBe("SCHEMA");
      expect(ast.name).toBe("myschema");
    });
  });

  // ─── Error Cases ───────────────────────────────────────────────────

  describe("error cases", () => {
    it("throws parse error for invalid SQL", () => {
      expect(() => parseSql("SELEC 1")).toThrow();
    });

    it("error includes position information", () => {
      try {
        parseSql("SELECT FROM");
        expect.unreachable("Should have thrown");
      } catch (e: unknown) {
        const err = e as Error & { position?: { offset: number } };
        // Error should contain position info
        expect(err.message).toBeDefined();
        // The error might include position in the message or as a property
        expect(
          err.position !== undefined || err.message.includes("position") || err.message.includes("column") || err.message.includes("line")
        ).toBe(true);
      }
    });

    it("throws for unclosed parenthesis", () => {
      expect(() => parseSql("SELECT (1 + 2")).toThrow();
    });

    it("throws for missing FROM in UPDATE", () => {
      expect(() => parseSql("UPDATE SET a = 1")).toThrow();
    });
  });
});
