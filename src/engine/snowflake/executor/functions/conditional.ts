import { ScalarFn } from "./registry";

export const conditionalFunctions: Record<string, ScalarFn> = {
  COALESCE: (args) => {
    for (const a of args) {
      if (a !== null) return a;
    }
    return null;
  },

  NULLIF: ([a, b]) => {
    if (a === null || b === null) return a;
    // If values equal, return NULL
    if (typeof a === typeof b && a === b) return null;
    if (String(a) === String(b)) return null;
    return a;
  },

  NVL: ([a, b]) => (a === null ? b : a),

  NVL2: ([a, b, c]) => (a !== null ? b : c),

  IFNULL: ([a, b]) => (a === null ? b : a),

  IFF: ([cond, trueVal, falseVal]) => {
    if (cond === null) return falseVal ?? null;
    return cond ? trueVal : (falseVal ?? null);
  },

  DECODE: (args) => {
    // DECODE(expr, search1, result1, search2, result2, ..., default?)
    if (args.length < 3) return null;
    const expr = args[0];
    for (let i = 1; i + 1 < args.length; i += 2) {
      const search = args[i];
      const result = args[i + 1];
      if (expr === null && search === null) return result;
      if (expr !== null && search !== null && String(expr) === String(search)) return result;
    }
    // Default value (if odd number of remaining args)
    if (args.length % 2 === 0) return args[args.length - 1];
    return null;
  },

  ZEROIFNULL: ([v]) => (v === null ? 0 : v),

  NULLIFZERO: ([v]) => {
    if (v === null) return null;
    return Number(v) === 0 ? null : v;
  },

  EQUAL_NULL: ([a, b]) => {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return String(a) === String(b);
  },
};
