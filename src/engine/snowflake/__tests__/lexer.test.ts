import { describe, it, expect } from "vitest";
import { tokenize } from "../lexer/lexer";
import type { Token } from "../lexer/tokens";

// Helper: extract just the type and value from tokens (ignore position for brevity)
function types(tokens: Token[]): Array<{ type: string; value: string }> {
  return tokens.map((t) => ({ type: t.type, value: t.value }));
}

// Helper: get token types only
function tokenTypes(sql: string): string[] {
  return tokenize(sql).map((t) => t.type);
}

describe("Lexer — tokenize()", () => {
  // ─── Simple SELECT ───────────────────────────────────────────────────

  describe("simple SELECT", () => {
    it("tokenizes SELECT 1 into SELECT, NUMBER, EOF", () => {
      const tokens = tokenize("SELECT 1");
      const tt = types(tokens);
      expect(tt).toEqual([
        { type: "SELECT", value: "SELECT" },
        { type: "NUMBER", value: "1" },
        { type: "EOF", value: "" },
      ]);
    });
  });

  // ─── Identifiers ────────────────────────────────────────────────────

  describe("identifiers", () => {
    it("tokenizes SELECT foo FROM bar with proper token types", () => {
      const tokens = tokenize("SELECT foo FROM bar");
      const tt = types(tokens);
      expect(tt).toEqual([
        { type: "SELECT", value: "SELECT" },
        { type: "IDENTIFIER", value: "foo" },
        { type: "FROM", value: "FROM" },
        { type: "IDENTIFIER", value: "bar" },
        { type: "EOF", value: "" },
      ]);
    });

    it("tokenizes double-quoted identifiers", () => {
      const tokens = tokenize('SELECT "My Column" FROM t');
      expect(tokens[1].type).toBe("QUOTED_IDENTIFIER");
      expect(tokens[1].value).toBe("My Column");
    });

    it("handles identifiers starting with underscore", () => {
      const tokens = tokenize("SELECT _foo FROM _bar");
      expect(tokens[1].type).toBe("IDENTIFIER");
      expect(tokens[1].value).toBe("_foo");
      expect(tokens[3].type).toBe("IDENTIFIER");
      expect(tokens[3].value).toBe("_bar");
    });

    it("handles identifiers with digits", () => {
      const tokens = tokenize("SELECT col1 FROM table2");
      expect(tokens[1].type).toBe("IDENTIFIER");
      expect(tokens[1].value).toBe("col1");
      expect(tokens[3].type).toBe("IDENTIFIER");
      expect(tokens[3].value).toBe("table2");
    });
  });

  // ─── String Literals ────────────────────────────────────────────────

  describe("string literals", () => {
    it("tokenizes a simple single-quoted string", () => {
      const tokens = tokenize("SELECT 'hello'");
      expect(tokens[1].type).toBe("STRING");
      expect(tokens[1].value).toBe("hello");
    });

    it("tokenizes a string with escaped single quotes (doubled)", () => {
      const tokens = tokenize("SELECT 'it''s'");
      expect(tokens[1].type).toBe("STRING");
      expect(tokens[1].value).toBe("it's");
    });

    it("tokenizes an empty string", () => {
      const tokens = tokenize("SELECT ''");
      expect(tokens[1].type).toBe("STRING");
      expect(tokens[1].value).toBe("");
    });
  });

  // ─── Number Literals ────────────────────────────────────────────────

  describe("number literals", () => {
    it("tokenizes integers", () => {
      const tokens = tokenize("SELECT 42");
      expect(tokens[1].type).toBe("NUMBER");
      expect(tokens[1].value).toBe("42");
    });

    it("tokenizes decimals", () => {
      const tokens = tokenize("SELECT 3.14");
      expect(tokens[1].type).toBe("NUMBER");
      expect(tokens[1].value).toBe("3.14");
    });

    it("tokenizes negative numbers (minus as operator, number as literal)", () => {
      const tokens = tokenize("SELECT -5");
      expect(tokens[1].type).toBe("MINUS");
      expect(tokens[2].type).toBe("NUMBER");
      expect(tokens[2].value).toBe("5");
    });

    it("tokenizes zero", () => {
      const tokens = tokenize("SELECT 0");
      expect(tokens[1].type).toBe("NUMBER");
      expect(tokens[1].value).toBe("0");
    });
  });

  // ─── Operators ──────────────────────────────────────────────────────

  describe("operators", () => {
    it("tokenizes =", () => {
      const tokens = tokenize("a = b");
      expect(tokens[1].type).toBe("EQ");
    });

    it("tokenizes !=", () => {
      const tokens = tokenize("a != b");
      expect(tokens[1].type).toBe("NEQ");
    });

    it("tokenizes <>", () => {
      const tokens = tokenize("a <> b");
      expect(tokens[1].type).toBe("NEQ");
    });

    it("tokenizes < and >", () => {
      const tokens = tokenize("a < b");
      expect(tokens[1].type).toBe("LT");
      const tokens2 = tokenize("a > b");
      expect(tokens2[1].type).toBe("GT");
    });

    it("tokenizes <= and >=", () => {
      const tokens = tokenize("a <= b");
      expect(tokens[1].type).toBe("LTE");
      const tokens2 = tokenize("a >= b");
      expect(tokens2[1].type).toBe("GTE");
    });

    it("tokenizes arithmetic operators +, -, *, /", () => {
      const tokens = tokenize("1 + 2 - 3 * 4 / 5");
      expect(tokens[1].type).toBe("PLUS");
      expect(tokens[3].type).toBe("MINUS");
      expect(tokens[5].type).toBe("STAR");
      expect(tokens[7].type).toBe("SLASH");
    });

    it("tokenizes string concatenation ||", () => {
      const tokens = tokenize("a || b");
      expect(tokens[1].type).toBe("CONCAT");
    });
  });

  // ─── Keywords ───────────────────────────────────────────────────────

  describe("keywords", () => {
    const keywords = [
      "SELECT",
      "FROM",
      "WHERE",
      "INSERT",
      "INTO",
      "VALUES",
      "UPDATE",
      "SET",
      "DELETE",
      "CREATE",
      "DROP",
      "TABLE",
      "DATABASE",
      "SCHEMA",
      "ALTER",
      "AND",
      "OR",
      "NOT",
      "NULL",
      "TRUE",
      "FALSE",
      "AS",
      "ON",
      "JOIN",
      "LEFT",
      "RIGHT",
      "FULL",
      "INNER",
      "OUTER",
      "CROSS",
      "GROUP",
      "BY",
      "ORDER",
      "ASC",
      "DESC",
      "HAVING",
      "LIMIT",
      "OFFSET",
      "UNION",
      "ALL",
      "INTERSECT",
      "EXCEPT",
      "DISTINCT",
      "CASE",
      "WHEN",
      "THEN",
      "ELSE",
      "END",
      "IN",
      "BETWEEN",
      "LIKE",
      "IS",
      "EXISTS",
      "WITH",
      "OVER",
      "PARTITION",
      "TRUNCATE",
      "MERGE",
      "USING",
      "MATCHED",
      "SHOW",
      "DESCRIBE",
      "USE",
      "LATERAL",
      "CAST",
    ];

    it.each(keywords)("recognizes %s as a keyword token type", (kw) => {
      const tokens = tokenize(kw);
      // The token type should match the keyword itself
      expect(tokens[0].type).toBe(kw);
    });
  });

  // ─── Case Insensitivity ─────────────────────────────────────────────

  describe("case insensitivity", () => {
    it("tokenizes 'select' as SELECT", () => {
      const tokens = tokenize("select 1");
      expect(tokens[0].type).toBe("SELECT");
      expect(tokens[0].value).toBe("select");
    });

    it("tokenizes 'Select' as SELECT", () => {
      const tokens = tokenize("Select 1");
      expect(tokens[0].type).toBe("SELECT");
    });

    it("tokenizes 'sElEcT' as SELECT", () => {
      const tokens = tokenize("sElEcT 1");
      expect(tokens[0].type).toBe("SELECT");
    });

    it("preserves original case for identifiers that are not keywords", () => {
      const tokens = tokenize("SELECT myColumn FROM myTable");
      // Identifiers should preserve original case
      expect(tokens[1].value).toBe("myColumn");
      expect(tokens[3].value).toBe("myTable");
    });
  });

  // ─── Dot Notation ───────────────────────────────────────────────────

  describe("dot notation", () => {
    it("tokenizes db.schema.table as IDENTIFIER DOT SCHEMA DOT TABLE", () => {
      const tokens = tokenize("db.schema.table");
      const tt = types(tokens);
      expect(tt).toEqual([
        { type: "IDENTIFIER", value: "db" },
        { type: "DOT", value: "." },
        { type: "SCHEMA", value: "schema" },
        { type: "DOT", value: "." },
        { type: "TABLE", value: "table" },
        { type: "EOF", value: "" },
      ]);
    });
  });

  // ─── Punctuation ────────────────────────────────────────────────────

  describe("parentheses, commas, semicolons", () => {
    it("tokenizes parentheses", () => {
      const tokens = tokenize("(a)");
      expect(tokens[0].type).toBe("LPAREN");
      expect(tokens[2].type).toBe("RPAREN");
    });

    it("tokenizes commas", () => {
      const tokens = tokenize("a, b, c");
      expect(tokens[1].type).toBe("COMMA");
      expect(tokens[3].type).toBe("COMMA");
    });

    it("tokenizes semicolons", () => {
      const tokens = tokenize("SELECT 1;");
      expect(tokens[2].type).toBe("SEMICOLON");
    });
  });

  // ─── Comments ───────────────────────────────────────────────────────

  describe("comments", () => {
    it("skips single-line comments", () => {
      const tt = tokenTypes("SELECT 1 -- this is a comment\nFROM t");
      expect(tt).not.toContain("COMMENT");
      expect(tt).toContain("SELECT");
      expect(tt).toContain("FROM");
    });

    it("skips block comments", () => {
      const tokens = tokenize("SELECT /* a comment */ 1");
      const values = tokens.map((t) => t.type);
      expect(values).not.toContain("COMMENT");
      expect(values).toEqual(["SELECT", "NUMBER", "EOF"]);
    });

    it("skips multi-line block comments", () => {
      const tokens = tokenize("SELECT /* a\nmulti\nline\ncomment */ 1");
      const values = tokens.map((t) => t.type);
      expect(values).toEqual(["SELECT", "NUMBER", "EOF"]);
    });
  });

  // ─── Whitespace ─────────────────────────────────────────────────────

  describe("whitespace handling", () => {
    it("handles multiple spaces", () => {
      const tokens = tokenize("SELECT    1");
      expect(tokens[0].type).toBe("SELECT");
      expect(tokens[1].type).toBe("NUMBER");
    });

    it("handles tabs", () => {
      const tokens = tokenize("SELECT\t1");
      expect(tokens[0].type).toBe("SELECT");
      expect(tokens[1].type).toBe("NUMBER");
    });

    it("handles newlines", () => {
      const tokens = tokenize("SELECT\n1");
      expect(tokens[0].type).toBe("SELECT");
      expect(tokens[1].type).toBe("NUMBER");
    });

    it("handles mixed whitespace", () => {
      const tokens = tokenize("SELECT \t\n  1");
      expect(tokens[0].type).toBe("SELECT");
      expect(tokens[1].type).toBe("NUMBER");
    });
  });

  // ─── Position Tracking ──────────────────────────────────────────────

  describe("position tracking", () => {
    it("tracks offset, line, and column for each token", () => {
      const tokens = tokenize("SELECT 1");
      expect(tokens[0].position).toEqual({ offset: 0, line: 1, column: 1 });
      expect(tokens[1].position).toEqual({ offset: 7, line: 1, column: 8 });
    });

    it("tracks position across newlines", () => {
      const tokens = tokenize("SELECT\n1");
      expect(tokens[0].position).toEqual({ offset: 0, line: 1, column: 1 });
      expect(tokens[1].position).toEqual({ offset: 7, line: 2, column: 1 });
    });
  });

  // ─── Complex Query ──────────────────────────────────────────────────

  describe("complex query", () => {
    it("tokenizes a realistic multi-clause query", () => {
      const sql =
        "SELECT e.name, d.dept FROM employees e JOIN departments d ON e.dept_id = d.id WHERE e.status = 'active' ORDER BY e.name";
      const tokens = tokenize(sql);
      const tt = tokens.map((t) => t.type);

      // Verify key token types are present in correct order
      expect(tt[0]).toBe("SELECT");
      expect(tt).toContain("FROM");
      expect(tt).toContain("JOIN");
      expect(tt).toContain("ON");
      expect(tt).toContain("WHERE");
      expect(tt).toContain("ORDER");
      expect(tt).toContain("BY");
      expect(tt).toContain("DOT");
      expect(tt).toContain("COMMA");
      expect(tt).toContain("EQ");
      expect(tt).toContain("STRING"); // 'active'
      expect(tt[tt.length - 1]).toBe("EOF");
    });
  });

  // ─── Snowflake-Specific Keywords ───────────────────────────────────

  describe("Snowflake-specific keywords", () => {
    it("tokenizes ILIKE as a keyword", () => {
      const tokens = tokenize("name ILIKE '%john%'");
      expect(tokens[1].type).toBe("ILIKE");
    });

    it("tokenizes QUALIFY as a keyword", () => {
      const tokens = tokenize("QUALIFY rn = 1");
      expect(tokens[0].type).toBe("QUALIFY");
    });

    it("tokenizes FLATTEN as a keyword", () => {
      const tokens = tokenize("FLATTEN(input => data)");
      expect(tokens[0].type).toBe("FLATTEN");
    });

    it("tokenizes VARIANT as a keyword", () => {
      const tokens = tokenize("VARIANT");
      expect(tokens[0].type).toBe("VARIANT");
    });

    it("tokenizes CLONE as a keyword", () => {
      const tokens = tokenize("CLONE t1");
      expect(tokens[0].type).toBe("CLONE");
    });
  });

  // ─── Arrow Operator ────────────────────────────────────────────────

  describe("arrow operator", () => {
    it("tokenizes => for FLATTEN syntax", () => {
      const tokens = tokenize("input => data");
      expect(tokens[1].type).toBe("ARROW");
      expect(tokens[1].value).toBe("=>");
    });
  });
});
