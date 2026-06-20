import { describe, it, expect } from "vitest";
import { evaluate } from "../executor/evaluator";
import type { Expression } from "../parser/ast";
import type { Row, Value } from "../types";
import type { EvalContext } from "../executor/evaluator";

// ─── AST Node Builders ──────────────────────────────────────────────
// These helpers build AST nodes for unit testing the evaluator directly.

function literal(value: Value): Expression {
  if (value === null) {
    return { kind: "null_literal" };
  }
  if (typeof value === "number") {
    return { kind: "number_literal", value };
  }
  if (typeof value === "string") {
    return { kind: "string_literal", value };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean_literal", value };
  }
  throw new Error(`Unsupported literal type: ${typeof value}`);
}

function colRef(name: string, table?: string): Expression {
  return { kind: "column_ref", column: name, table };
}

function binary(
  left: Expression,
  operator: string,
  right: Expression
): Expression {
  return { kind: "binary_expr", op: operator, left, right };
}

function unary(operator: string, operand: Expression): Expression {
  return { kind: "unary_expr", op: operator, operand };
}


function caseExpr(
  whenClauses: Array<{ condition: Expression; result: Expression }>,
  elseClause?: Expression
): Expression {
  return {
    kind: "case_expr",
    whenClauses: whenClauses.map((wc) => ({ when: wc.condition, then: wc.result })),
    elseClause,
  };
}

function inExpr(
  expression: Expression,
  values: Expression[],
  negated = false
): Expression {
  return { kind: "in_expr", expr: expression, values, negated };
}

function betweenExpr(
  expression: Expression,
  low: Expression,
  high: Expression,
  negated = false
): Expression {
  return { kind: "between_expr", expr: expression, low, high, negated };
}

function isNullExpr(expression: Expression, negated = false): Expression {
  return { kind: "is_null_expr", expr: expression, negated };
}

function likeExpr(
  expression: Expression,
  pattern: Expression,
  caseInsensitive = false,
  negated = false,
  escape?: Expression
): Expression {
  return { kind: "like_expr", expr: expression, pattern, caseInsensitive, negated, ...(escape ? { escape } : {}) };
}

function castExpr(expression: Expression, dataType: string): Expression {
  return { kind: "cast_expr", expr: expression, targetType: dataType };
}

function dotAccess(expression: Expression, field: string): Expression {
  return { kind: "dot_access", object: expression, field };
}

// Default context for most tests
const defaultCtx: EvalContext = {
  currentDatabase: "NEXACORP_DB",
  currentSchema: "PUBLIC",
  currentUser: "PLAYER",
  currentRole: "SYSADMIN",
  currentWarehouse: "NEXACORP_WH",
};

describe("Evaluator — evaluate()", () => {
  // ─── Literal Values ────────────────────────────────────────────────

  describe("literal values", () => {
    it("evaluates a number literal", () => {
      expect(evaluate(literal(42), {}, defaultCtx)).toBe(42);
    });

    it("evaluates a string literal", () => {
      expect(evaluate(literal("hello"), {}, defaultCtx)).toBe("hello");
    });

    it("evaluates a boolean literal", () => {
      expect(evaluate(literal(true), {}, defaultCtx)).toBe(true);
      expect(evaluate(literal(false), {}, defaultCtx)).toBe(false);
    });

    it("evaluates a null literal", () => {
      expect(evaluate(literal(null), {}, defaultCtx)).toBeNull();
    });
  });

  // ─── Column References ─────────────────────────────────────────────

  describe("column references", () => {
    it("evaluates a simple column reference", () => {
      const row: Row = { name: "Alice", age: 30 };
      expect(evaluate(colRef("name"), row, defaultCtx)).toBe("Alice");
      expect(evaluate(colRef("age"), row, defaultCtx)).toBe(30);
    });

    it("returns null for missing column", () => {
      const row: Row = { name: "Alice" };
      expect(evaluate(colRef("missing"), row, defaultCtx)).toBeNull();
    });

    it("evaluates a qualified column reference (table.column)", () => {
      const row: Row = { "e.name": "Alice", name: "Bob" };
      expect(evaluate(colRef("name", "e"), row, defaultCtx)).toBe("Alice");
    });
  });

  // ─── Arithmetic ────────────────────────────────────────────────────

  describe("arithmetic", () => {
    it("evaluates addition", () => {
      const expr = binary(literal(3), "+", literal(4));
      expect(evaluate(expr, {}, defaultCtx)).toBe(7);
    });

    it("evaluates subtraction", () => {
      const expr = binary(literal(10), "-", literal(4));
      expect(evaluate(expr, {}, defaultCtx)).toBe(6);
    });

    it("evaluates multiplication", () => {
      const expr = binary(literal(5), "*", literal(3));
      expect(evaluate(expr, {}, defaultCtx)).toBe(15);
    });

    it("evaluates division", () => {
      const expr = binary(literal(10), "/", literal(4));
      expect(evaluate(expr, {}, defaultCtx)).toBe(2.5);
    });

    it("evaluates nested arithmetic: (a + b) * c", () => {
      const row: Row = { a: 2, b: 3, c: 4 };
      const expr = binary(
        binary(colRef("a"), "+", colRef("b")),
        "*",
        colRef("c")
      );
      expect(evaluate(expr, row, defaultCtx)).toBe(20);
    });
  });

  // ─── String Concatenation ──────────────────────────────────────────

  describe("string concatenation", () => {
    it("evaluates || for string concatenation", () => {
      const expr = binary(literal("hello"), "||", literal(" world"));
      expect(evaluate(expr, {}, defaultCtx)).toBe("hello world");
    });

    it("concatenates number with string", () => {
      const expr = binary(literal(42), "||", literal(" items"));
      expect(evaluate(expr, {}, defaultCtx)).toBe("42 items");
    });
  });

  // ─── Comparison Operators ──────────────────────────────────────────

  describe("comparison operators", () => {
    it("evaluates = (equals)", () => {
      expect(evaluate(binary(literal(1), "=", literal(1)), {}, defaultCtx)).toBe(true);
      expect(evaluate(binary(literal(1), "=", literal(2)), {}, defaultCtx)).toBe(false);
    });

    it("evaluates != (not equals)", () => {
      expect(evaluate(binary(literal(1), "!=", literal(2)), {}, defaultCtx)).toBe(true);
      expect(evaluate(binary(literal(1), "!=", literal(1)), {}, defaultCtx)).toBe(false);
    });

    it("evaluates <> (not equals alternative)", () => {
      // The parser normalizes <> to != before producing AST nodes
      expect(evaluate(binary(literal(1), "!=", literal(2)), {}, defaultCtx)).toBe(true);
    });

    it("evaluates < (less than)", () => {
      expect(evaluate(binary(literal(1), "<", literal(2)), {}, defaultCtx)).toBe(true);
      expect(evaluate(binary(literal(2), "<", literal(1)), {}, defaultCtx)).toBe(false);
    });

    it("evaluates > (greater than)", () => {
      expect(evaluate(binary(literal(2), ">", literal(1)), {}, defaultCtx)).toBe(true);
    });

    it("evaluates <= (less than or equal)", () => {
      expect(evaluate(binary(literal(1), "<=", literal(1)), {}, defaultCtx)).toBe(true);
      expect(evaluate(binary(literal(1), "<=", literal(2)), {}, defaultCtx)).toBe(true);
      expect(evaluate(binary(literal(2), "<=", literal(1)), {}, defaultCtx)).toBe(false);
    });

    it("evaluates >= (greater than or equal)", () => {
      expect(evaluate(binary(literal(2), ">=", literal(2)), {}, defaultCtx)).toBe(true);
      expect(evaluate(binary(literal(3), ">=", literal(2)), {}, defaultCtx)).toBe(true);
      expect(evaluate(binary(literal(1), ">=", literal(2)), {}, defaultCtx)).toBe(false);
    });
  });

  // ─── Logical Operators ─────────────────────────────────────────────

  describe("logical operators", () => {
    it("evaluates AND", () => {
      expect(evaluate(binary(literal(true), "AND", literal(true)), {}, defaultCtx)).toBe(true);
      expect(evaluate(binary(literal(true), "AND", literal(false)), {}, defaultCtx)).toBe(false);
      expect(evaluate(binary(literal(false), "AND", literal(true)), {}, defaultCtx)).toBe(false);
      expect(evaluate(binary(literal(false), "AND", literal(false)), {}, defaultCtx)).toBe(false);
    });

    it("evaluates OR", () => {
      expect(evaluate(binary(literal(true), "OR", literal(false)), {}, defaultCtx)).toBe(true);
      expect(evaluate(binary(literal(false), "OR", literal(true)), {}, defaultCtx)).toBe(true);
      expect(evaluate(binary(literal(false), "OR", literal(false)), {}, defaultCtx)).toBe(false);
    });

    it("evaluates NOT", () => {
      expect(evaluate(unary("NOT", literal(true)), {}, defaultCtx)).toBe(false);
      expect(evaluate(unary("NOT", literal(false)), {}, defaultCtx)).toBe(true);
    });
  });

  // ─── NULL Propagation ──────────────────────────────────────────────

  describe("NULL propagation", () => {
    it("NULL + 5 returns NULL", () => {
      const expr = binary(literal(null), "+", literal(5));
      expect(evaluate(expr, {}, defaultCtx)).toBeNull();
    });

    it("5 + NULL returns NULL", () => {
      const expr = binary(literal(5), "+", literal(null));
      expect(evaluate(expr, {}, defaultCtx)).toBeNull();
    });

    it("NULL = NULL returns NULL (not true)", () => {
      const expr = binary(literal(null), "=", literal(null));
      expect(evaluate(expr, {}, defaultCtx)).toBeNull();
    });

    it("NULL != NULL returns NULL", () => {
      const expr = binary(literal(null), "!=", literal(null));
      expect(evaluate(expr, {}, defaultCtx)).toBeNull();
    });

    it("NULL AND TRUE returns NULL", () => {
      const expr = binary(literal(null), "AND", literal(true));
      expect(evaluate(expr, {}, defaultCtx)).toBeNull();
    });

    it("NULL AND FALSE returns FALSE (short circuit)", () => {
      const expr = binary(literal(null), "AND", literal(false));
      expect(evaluate(expr, {}, defaultCtx)).toBe(false);
    });

    it("FALSE AND NULL returns FALSE (short circuit)", () => {
      const expr = binary(literal(false), "AND", literal(null));
      expect(evaluate(expr, {}, defaultCtx)).toBe(false);
    });

    it("NULL OR TRUE returns TRUE (short circuit)", () => {
      const expr = binary(literal(null), "OR", literal(true));
      expect(evaluate(expr, {}, defaultCtx)).toBe(true);
    });

    it("TRUE OR NULL returns TRUE (short circuit)", () => {
      const expr = binary(literal(true), "OR", literal(null));
      expect(evaluate(expr, {}, defaultCtx)).toBe(true);
    });

    it("NULL OR FALSE returns NULL", () => {
      const expr = binary(literal(null), "OR", literal(false));
      expect(evaluate(expr, {}, defaultCtx)).toBeNull();
    });
  });

  // ─── Type Coercion ─────────────────────────────────────────────────

  describe("type coercion", () => {
    it("coerces string to number in arithmetic", () => {
      const expr = binary(literal("5"), "+", literal(3));
      expect(evaluate(expr, {}, defaultCtx)).toBe(8);
    });

    it("coerces number to string in concatenation", () => {
      const expr = binary(literal(42), "||", literal("!"));
      expect(evaluate(expr, {}, defaultCtx)).toBe("42!");
    });
  });

  // ─── LIKE Pattern Matching ─────────────────────────────────────────

  describe("LIKE pattern matching", () => {
    it("matches with % wildcard (any characters)", () => {
      const expr = likeExpr(literal("hello world"), literal("hello%"));
      expect(evaluate(expr, {}, defaultCtx)).toBe(true);
    });

    it("matches with _ wildcard (single character)", () => {
      const expr = likeExpr(literal("hat"), literal("h_t"));
      expect(evaluate(expr, {}, defaultCtx)).toBe(true);
    });

    it("returns false when pattern does not match", () => {
      const expr = likeExpr(literal("hello"), literal("world%"));
      expect(evaluate(expr, {}, defaultCtx)).toBe(false);
    });

    it("matches exact string with no wildcards", () => {
      const expr = likeExpr(literal("hello"), literal("hello"));
      expect(evaluate(expr, {}, defaultCtx)).toBe(true);
    });

    it("% matches empty string", () => {
      const expr = likeExpr(literal(""), literal("%"));
      expect(evaluate(expr, {}, defaultCtx)).toBe(true);
    });
  });

  // ─── ILIKE ─────────────────────────────────────────────────────────

  describe("ILIKE (case-insensitive LIKE)", () => {
    it("matches case-insensitively", () => {
      const expr = likeExpr(literal("Hello World"), literal("%hello%"), true);
      expect(evaluate(expr, {}, defaultCtx)).toBe(true);
    });

    it("returns false when pattern does not match even case-insensitively", () => {
      const expr = likeExpr(literal("Hello"), literal("world%"), true);
      expect(evaluate(expr, {}, defaultCtx)).toBe(false);
    });
  });

  // ─── BETWEEN ───────────────────────────────────────────────────────

  describe("BETWEEN", () => {
    it("returns true when value is within range (inclusive)", () => {
      const expr = betweenExpr(literal(5), literal(1), literal(10));
      expect(evaluate(expr, {}, defaultCtx)).toBe(true);
    });

    it("returns true at boundaries", () => {
      expect(evaluate(betweenExpr(literal(1), literal(1), literal(10)), {}, defaultCtx)).toBe(true);
      expect(evaluate(betweenExpr(literal(10), literal(1), literal(10)), {}, defaultCtx)).toBe(true);
    });

    it("returns false when value is outside range", () => {
      const expr = betweenExpr(literal(15), literal(1), literal(10));
      expect(evaluate(expr, {}, defaultCtx)).toBe(false);
    });

    it("handles NOT BETWEEN", () => {
      const expr = betweenExpr(literal(15), literal(1), literal(10), true);
      expect(evaluate(expr, {}, defaultCtx)).toBe(true);
    });
  });

  // ─── IN List ───────────────────────────────────────────────────────

  describe("IN list", () => {
    it("returns true when value is in list", () => {
      const expr = inExpr(literal(2), [literal(1), literal(2), literal(3)]);
      expect(evaluate(expr, {}, defaultCtx)).toBe(true);
    });

    it("returns false when value is not in list", () => {
      const expr = inExpr(literal(5), [literal(1), literal(2), literal(3)]);
      expect(evaluate(expr, {}, defaultCtx)).toBe(false);
    });

    it("handles NOT IN", () => {
      const expr = inExpr(literal(5), [literal(1), literal(2), literal(3)], true);
      expect(evaluate(expr, {}, defaultCtx)).toBe(true);
    });

    it("handles IN with strings", () => {
      const expr = inExpr(literal("b"), [literal("a"), literal("b"), literal("c")]);
      expect(evaluate(expr, {}, defaultCtx)).toBe(true);
    });
  });

  // ─── IS NULL / IS NOT NULL ─────────────────────────────────────────

  describe("IS NULL / IS NOT NULL", () => {
    it("IS NULL returns true for null", () => {
      expect(evaluate(isNullExpr(literal(null)), {}, defaultCtx)).toBe(true);
    });

    it("IS NULL returns false for non-null", () => {
      expect(evaluate(isNullExpr(literal(42)), {}, defaultCtx)).toBe(false);
    });

    it("IS NOT NULL returns true for non-null", () => {
      expect(evaluate(isNullExpr(literal(42), true), {}, defaultCtx)).toBe(true);
    });

    it("IS NOT NULL returns false for null", () => {
      expect(evaluate(isNullExpr(literal(null), true), {}, defaultCtx)).toBe(false);
    });
  });

  // ─── CASE WHEN ─────────────────────────────────────────────────────

  describe("CASE WHEN", () => {
    it("returns first matching WHEN result", () => {
      const expr = caseExpr(
        [
          { condition: literal(false), result: literal("no") },
          { condition: literal(true), result: literal("yes") },
        ],
        literal("default")
      );
      expect(evaluate(expr, {}, defaultCtx)).toBe("yes");
    });

    it("returns ELSE when no WHEN matches", () => {
      const expr = caseExpr(
        [{ condition: literal(false), result: literal("no") }],
        literal("default")
      );
      expect(evaluate(expr, {}, defaultCtx)).toBe("default");
    });

    it("returns NULL when no WHEN matches and no ELSE", () => {
      const expr = caseExpr([
        { condition: literal(false), result: literal("no") },
      ]);
      expect(evaluate(expr, {}, defaultCtx)).toBeNull();
    });

    it("evaluates conditions with row data", () => {
      const row: Row = { x: 10 };
      const expr = caseExpr(
        [
          {
            condition: binary(colRef("x"), ">", literal(100)),
            result: literal("big"),
          },
          {
            condition: binary(colRef("x"), ">", literal(5)),
            result: literal("medium"),
          },
        ],
        literal("small")
      );
      expect(evaluate(expr, row, defaultCtx)).toBe("medium");
    });
  });

  // ─── Function Calls ────────────────────────────────────────────────
  // Note: Function calls are delegated to the function registry (callFunction)
  // which is loaded from ./functions/registry. These are tested separately.

  // ─── Unary Minus ───────────────────────────────────────────────────

  describe("unary minus", () => {
    it("negates a number", () => {
      const expr = unary("-", literal(5));
      expect(evaluate(expr, {}, defaultCtx)).toBe(-5);
    });

    it("negates a negative number (double negative)", () => {
      const expr = unary("-", literal(-3));
      expect(evaluate(expr, {}, defaultCtx)).toBe(3);
    });

    it("returns NULL for unary minus on NULL", () => {
      const expr = unary("-", literal(null));
      expect(evaluate(expr, {}, defaultCtx)).toBeNull();
    });
  });

  // ─── CAST Expressions ──────────────────────────────────────────────

  describe("CAST expressions", () => {
    it("casts number to VARCHAR", () => {
      const expr = castExpr(literal(42), "VARCHAR");
      expect(evaluate(expr, {}, defaultCtx)).toBe("42");
    });

    it("casts string to NUMBER", () => {
      const expr = castExpr(literal("42"), "NUMBER");
      expect(evaluate(expr, {}, defaultCtx)).toBe(42);
    });

    it("casts string to BOOLEAN", () => {
      const expr = castExpr(literal("true"), "BOOLEAN");
      expect(evaluate(expr, {}, defaultCtx)).toBe(true);
    });

    it("casts NULL returns NULL", () => {
      const expr = castExpr(literal(null), "NUMBER");
      expect(evaluate(expr, {}, defaultCtx)).toBeNull();
    });
  });

  // ─── Dot Notation for VARIANT ──────────────────────────────────────

  describe("dot notation for VARIANT access", () => {
    it("accesses nested object field", () => {
      const row: Row = { data: { name: "Alice", age: 30 } };
      const expr = dotAccess(colRef("data"), "name");
      expect(evaluate(expr, row, defaultCtx)).toBe("Alice");
    });

    it("returns null for missing field", () => {
      const row: Row = { data: { name: "Alice" } };
      const expr = dotAccess(colRef("data"), "missing");
      expect(evaluate(expr, row, defaultCtx)).toBeNull();
    });

    it("returns null when base is null", () => {
      const row: Row = { data: null };
      const expr = dotAccess(colRef("data"), "name");
      expect(evaluate(expr, row, defaultCtx)).toBeNull();
    });
  });
});
