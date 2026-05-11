import * as AST from "../parser/ast";
import { Value, Row } from "../types";
import { callFunction } from "./functions/registry";
import type { SessionContext } from "../session/context";

export interface EvalContext {
  currentDatabase: string;
  currentSchema: string;
  currentUser: string;
  currentRole: string;
  currentWarehouse: string;
  /** Optional callback to execute a sub-select and return result rows */
  executeSubquery?: (query: AST.SelectStatement, outerRow: Row) => Row[];
  /** Tracks view expansion depth to prevent infinite recursion */
  viewDepth?: number;
  /** In-game "now" — when omitted, date functions fall back to real wall-clock time. */
  gameNow?: Date;
}

/**
 * Build an EvalContext from a SessionContext, copying every shared field
 * (currentDatabase/Schema/User/Role/Warehouse, gameNow). Pass `extras` for
 * the EvalContext-only fields (executeSubquery, viewDepth).
 */
export function evalContextFromSession(
  ctx: SessionContext,
  extras?: Pick<EvalContext, "executeSubquery" | "viewDepth">,
): EvalContext {
  return {
    currentDatabase: ctx.currentDatabase,
    currentSchema: ctx.currentSchema,
    currentUser: ctx.currentUser,
    currentRole: ctx.currentRole,
    currentWarehouse: ctx.currentWarehouse,
    gameNow: ctx.gameNow,
    ...extras,
  };
}

/**
 * Evaluate an expression against a row, returning a Value.
 * Handles NULL propagation, type coercion, and all expression types.
 */
export function evaluate(expr: AST.Expression, row: Row, ctx: EvalContext): Value {
  switch (expr.kind) {
    case "number_literal":
      return expr.value;
    case "string_literal":
      return expr.value;
    case "boolean_literal":
      return expr.value;
    case "null_literal":
      return null;
    case "typed_literal":
      return coerceTypedLiteral(expr.type, expr.value);

    case "column_ref": {
      const key = expr.table ? `${expr.table}.${expr.column}` : expr.column;
      // Try exact match first, then case-insensitive
      if (key in row) return row[key];
      const upper = key.toUpperCase();
      for (const [k, v] of Object.entries(row)) {
        if (k.toUpperCase() === upper) return v;
      }
      // Try just column name if table-qualified didn't match
      if (expr.table) {
        const colOnly = expr.column;
        if (colOnly in row) return row[colOnly];
        const colUpper = colOnly.toUpperCase();
        for (const [k, v] of Object.entries(row)) {
          if (k.toUpperCase() === colUpper) return v;
        }
      }
      return null;
    }

    case "star_ref":
      return null; // Handled at projection level, not here

    case "binary_expr":
      return evaluateBinary(expr, row, ctx);

    case "unary_expr": {
      const operand = evaluate(expr.operand, row, ctx);
      if (expr.op === "-") {
        if (operand === null) return null;
        return -(operand as number);
      }
      if (expr.op === "NOT") {
        if (operand === null) return null;
        return !operand;
      }
      return null;
    }

    case "function_call":
      return callFunction(expr.name, expr.args.map((a) => evaluate(a, row, ctx)), ctx);

    case "aggregate_call":
      // Aggregates are resolved at the aggregate execution level,
      // but when evaluated on an already-aggregated row, look for the alias
      return row[aggregateKey(expr)] ?? null;

    case "window_call":
      // Window functions resolved at window execution level
      return row[windowKey(expr)] ?? null;

    case "case_expr":
      return evaluateCase(expr, row, ctx);

    case "cast_expr":
      return evaluateCast(expr, row, ctx);

    case "in_expr":
      return evaluateIn(expr, row, ctx);

    case "between_expr": {
      const val = evaluate(expr.expr, row, ctx);
      const low = evaluate(expr.low, row, ctx);
      const high = evaluate(expr.high, row, ctx);
      if (val === null || low === null || high === null) return null;
      const result = compareValues(val, low) >= 0 && compareValues(val, high) <= 0;
      return expr.negated ? !result : result;
    }

    case "like_expr":
      return evaluateLike(expr, row, ctx);

    case "is_null_expr": {
      const val = evaluate(expr.expr, row, ctx);
      return expr.negated ? val !== null : val === null;
    }

    case "exists_expr": {
      if (ctx.executeSubquery) {
        const subRows = ctx.executeSubquery(expr.subquery, row);
        return subRows.length > 0;
      }
      return row["__exists__"] ?? false;
    }

    case "subquery_expr": {
      if (ctx.executeSubquery) {
        const subRows = ctx.executeSubquery(expr.query, row);
        if (subRows.length === 0) return null;
        // Scalar subquery: return first column of first row
        const firstRow = subRows[0];
        const keys = Object.keys(firstRow);
        return keys.length > 0 ? firstRow[keys[0]] : null;
      }
      return row["__subquery__"] ?? null;
    }

    case "array_construct":
      return expr.elements.map((e) => evaluate(e, row, ctx));

    case "object_construct": {
      const obj: Record<string, Value> = {};
      for (const pair of expr.pairs) {
        const k = evaluate(pair.key, row, ctx);
        obj[String(k)] = evaluate(pair.value, row, ctx);
      }
      return obj;
    }

    case "dot_access": {
      const obj = evaluate(expr.object, row, ctx);
      if (obj === null || typeof obj !== "object" || obj instanceof Date || Array.isArray(obj)) return null;
      const field = expr.field.toUpperCase();
      // Case-insensitive lookup
      for (const [k, v] of Object.entries(obj as Record<string, Value>)) {
        if (k.toUpperCase() === field) return v;
      }
      return null;
    }

    case "bracket_access": {
      const obj = evaluate(expr.object, row, ctx);
      const idx = evaluate(expr.index, row, ctx);
      if (obj === null || idx === null) return null;
      if (Array.isArray(obj)) return (obj as Value[])[idx as number] ?? null;
      if (typeof obj === "object" && !(obj instanceof Date)) {
        return (obj as Record<string, Value>)[String(idx)] ?? null;
      }
      return null;
    }

    case "interval_expr":
      return evaluate(expr.value, row, ctx);

    default:
      return null;
  }
}

function evaluateBinary(expr: AST.BinaryExpr, row: Row, ctx: EvalContext): Value {
  const left = evaluate(expr.left, row, ctx);
  const right = evaluate(expr.right, row, ctx);

  // NULL propagation for most operators
  if (expr.op !== "AND" && expr.op !== "OR") {
    if (left === null || right === null) return null;
  }

  switch (expr.op) {
    // Arithmetic
    case "+": return toNumber(left) + toNumber(right);
    case "-": return toNumber(left) - toNumber(right);
    case "*": return toNumber(left) * toNumber(right);
    case "/": {
      const d = toNumber(right);
      return d === 0 ? null : toNumber(left) / d;
    }
    case "%": {
      const d = toNumber(right);
      return d === 0 ? null : toNumber(left) % d;
    }

    // String concat
    case "||": return String(left ?? "") + String(right ?? "");

    // Comparison
    case "=": return compareValues(left, right) === 0;
    case "!=": return compareValues(left, right) !== 0;
    case "<": return compareValues(left, right) < 0;
    case ">": return compareValues(left, right) > 0;
    case "<=": return compareValues(left, right) <= 0;
    case ">=": return compareValues(left, right) >= 0;

    // Logical — three-valued logic
    case "AND": {
      if (left === false || right === false) return false;
      if (left === null || right === null) return null;
      return Boolean(left) && Boolean(right);
    }
    case "OR": {
      if (left === true || right === true) return true;
      if (left === null || right === null) return null;
      return Boolean(left) || Boolean(right);
    }

    default:
      return null;
  }
}

function evaluateCase(expr: AST.CaseExpr, row: Row, ctx: EvalContext): Value {
  if (expr.operand) {
    // Simple CASE: CASE x WHEN 1 THEN 'a' WHEN 2 THEN 'b' END
    const base = evaluate(expr.operand, row, ctx);
    for (const wc of expr.whenClauses) {
      const whenVal = evaluate(wc.when, row, ctx);
      if (base !== null && whenVal !== null && compareValues(base, whenVal) === 0) {
        return evaluate(wc.then, row, ctx);
      }
    }
  } else {
    // Searched CASE: CASE WHEN cond1 THEN 'a' WHEN cond2 THEN 'b' END
    for (const wc of expr.whenClauses) {
      const cond = evaluate(wc.when, row, ctx);
      if (cond === true) return evaluate(wc.then, row, ctx);
    }
  }
  return expr.elseClause ? evaluate(expr.elseClause, row, ctx) : null;
}

function evaluateCast(expr: AST.CastExpr, row: Row, ctx: EvalContext): Value {
  const val = evaluate(expr.expr, row, ctx);
  if (val === null) return null;

  const targetType = expr.targetType.toUpperCase().replace(/\(.*\)/, "");
  try {
    return castValue(val, targetType);
  } catch {
    if (expr.tryCast) return null;
    throw new Error(`Cannot cast ${JSON.stringify(val)} to ${expr.targetType}`);
  }
}

export function castValue(val: Value, targetType: string): Value {
  if (val === null) return null;
  const t = targetType.toUpperCase().replace(/\(.*\)/, "");

  switch (t) {
    case "NUMBER": case "INT": case "INTEGER": case "BIGINT": case "SMALLINT":
    case "TINYINT": case "FLOAT": case "DOUBLE": case "REAL": case "DECIMAL": case "NUMERIC": {
      const n = Number(val);
      if (isNaN(n)) throw new Error(`Cannot cast to number: ${val}`);
      return n;
    }
    case "VARCHAR": case "STRING": case "TEXT": case "CHAR":
      if (val instanceof Date) return val.toISOString().replace("T", " ").replace(/\.000Z$/, "");
      if (typeof val === "boolean") return val ? "true" : "false";
      return String(val);
    case "BOOLEAN":
      if (typeof val === "boolean") return val;
      if (typeof val === "string") {
        const s = val.toLowerCase();
        if (s === "true" || s === "1" || s === "yes") return true;
        if (s === "false" || s === "0" || s === "no") return false;
        throw new Error(`Cannot cast '${val}' to BOOLEAN`);
      }
      if (typeof val === "number") return val !== 0;
      throw new Error(`Cannot cast to BOOLEAN`);
    case "DATE":
      if (val instanceof Date) return val;
      return new Date(String(val));
    case "TIMESTAMP": case "TIMESTAMP_NTZ": case "TIMESTAMP_LTZ": case "TIMESTAMP_TZ":
      if (val instanceof Date) return val;
      return new Date(String(val));
    case "VARIANT": case "OBJECT": case "ARRAY":
      if (typeof val === "string") {
        try { return JSON.parse(val); } catch { return val; }
      }
      return val;
    default:
      return val;
  }
}

function evaluateIn(expr: AST.InExpr, row: Row, ctx: EvalContext): Value {
  const val = evaluate(expr.expr, row, ctx);
  if (val === null) return null;

  if (expr.values) {
    const values = expr.values.map((v) => evaluate(v, row, ctx));
    const found = values.some((v) => v !== null && compareValues(val, v) === 0);
    return expr.negated ? !found : found;
  }
  // Subquery IN
  if (expr.subquery && ctx.executeSubquery) {
    const subRows = ctx.executeSubquery(expr.subquery, row);
    const subValues: Value[] = subRows.map((r) => {
      const keys = Object.keys(r);
      return keys.length > 0 ? r[keys[0]] : null;
    });
    const found = subValues.some((v) => v !== null && compareValues(val, v) === 0);
    return expr.negated ? !found : found;
  }
  return null;
}

function evaluateLike(expr: AST.LikeExpr, row: Row, ctx: EvalContext): Value {
  const val = evaluate(expr.expr, row, ctx);
  const pattern = evaluate(expr.pattern, row, ctx);
  if (val === null || pattern === null) return null;

  const strVal = String(val);
  const strPattern = String(pattern);
  const esc = expr.escape ? String(evaluate(expr.escape, row, ctx)) : undefined;

  const regex = likeToRegex(strPattern, esc, expr.caseInsensitive);
  const result = regex.test(strVal);
  return expr.negated ? !result : result;
}

function likeToRegex(pattern: string, escape?: string, caseInsensitive?: boolean): RegExp {
  let regex = "^";
  for (let i = 0; i < pattern.length; i++) {
    if (escape && pattern[i] === escape && i + 1 < pattern.length) {
      regex += escapeRegex(pattern[++i]);
    } else if (pattern[i] === "%") {
      regex += ".*";
    } else if (pattern[i] === "_") {
      regex += ".";
    } else {
      regex += escapeRegex(pattern[i]);
    }
  }
  regex += "$";
  return new RegExp(regex, caseInsensitive ? "i" : "");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compareValues(a: Value, b: Value): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;

  // Coerce for comparison
  if (typeof a === "number" && typeof b === "string") b = Number(b);
  if (typeof a === "string" && typeof b === "number") a = Number(a);

  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (a instanceof Date && typeof b === "string") return a.getTime() - new Date(b).getTime();
  if (typeof a === "string" && b instanceof Date) return new Date(a).getTime() - b.getTime();

  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return (a ? 1 : 0) - (b ? 1 : 0);
  return String(a).localeCompare(String(b));
}

export function toNumber(v: Value): number {
  if (v === null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export function toBool(v: Value): boolean {
  if (v === null || v === false || v === 0 || v === "") return false;
  return true;
}

export function aggregateKey(expr: AST.AggregateCall): string {
  if (expr.arg === null) return `${expr.name}(*)`;
  const prefix = expr.distinct ? "DISTINCT " : "";
  return `${expr.name}(${prefix}${exprToString(expr.arg)})`;
}

export function windowKey(expr: AST.WindowCall): string {
  const func = expr.func;
  const funcStr = func.kind === "aggregate_call"
    ? aggregateKey(func)
    : `${func.name}(${func.args.map(exprToString).join(",")})`;
  const partStr = expr.over.partitionBy.map(exprToString).join(",");
  const ordStr = expr.over.orderBy.map((o) => `${exprToString(o.expr)} ${o.direction}`).join(",");
  return `${funcStr} OVER(${partStr ? "PARTITION BY " + partStr : ""}${ordStr ? " ORDER BY " + ordStr : ""})`;
}

function exprToString(expr: AST.Expression): string {
  switch (expr.kind) {
    case "column_ref": return expr.table ? `${expr.table}.${expr.column}` : expr.column;
    case "number_literal": return String(expr.value);
    case "string_literal": return `'${expr.value}'`;
    case "star_ref": return expr.table ? `${expr.table}.*` : "*";
    default: return "expr";
  }
}

function coerceTypedLiteral(type: string, value: string): Value {
  switch (type.toUpperCase()) {
    case "DATE":
      return new Date(value);
    case "TIMESTAMP":
      return new Date(value);
    default:
      return value;
  }
}
