import { ScalarFn } from "./registry";
import { castValue } from "../evaluator";

export const conversionFunctions: Record<string, ScalarFn> = {
  TO_NUMBER: ([v]) => {
    if (v === null) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  },
  TO_DECIMAL: ([v]) => conversionFunctions.TO_NUMBER([v], {} as never),
  TO_NUMERIC: ([v]) => conversionFunctions.TO_NUMBER([v], {} as never),
  TO_DOUBLE: ([v]) => conversionFunctions.TO_NUMBER([v], {} as never),

  TO_VARCHAR: ([v]) => {
    if (v === null) return null;
    return castValue(v, "VARCHAR");
  },
  TO_CHAR: ([v]) => conversionFunctions.TO_VARCHAR([v], {} as never),

  TO_BOOLEAN: ([v]) => {
    if (v === null) return null;
    return castValue(v, "BOOLEAN");
  },

  TRY_TO_NUMBER: ([v]) => {
    if (v === null) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  },

  TRY_TO_BOOLEAN: ([v]) => {
    if (v === null) return null;
    try { return castValue(v, "BOOLEAN"); } catch { return null; }
  },

  TRY_TO_DATE: ([v]) => {
    if (v === null) return null;
    try {
      const d = new Date(String(v));
      return isNaN(d.getTime()) ? null : d;
    } catch { return null; }
  },

  TRY_TO_TIMESTAMP: ([v]) => {
    if (v === null) return null;
    try {
      const d = new Date(String(v));
      return isNaN(d.getTime()) ? null : d;
    } catch { return null; }
  },
};
