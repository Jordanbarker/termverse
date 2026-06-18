import { Value } from "../../types";
import { ScalarFn } from "./registry";

export const semiStructuredFunctions: Record<string, ScalarFn> = {
  PARSE_JSON: ([v]) => {
    if (v === null) return null;
    try { return JSON.parse(String(v)); } catch { return null; }
  },

  TO_JSON: ([v]) => {
    if (v === null) return null;
    return JSON.stringify(v);
  },

  TO_VARIANT: ([v]) => v,

  GET_PATH: ([obj, pathStr]) => {
    if (obj === null || pathStr === null) return null;
    const path = String(pathStr).split(".");
    let current: Value = obj;
    for (const key of path) {
      if (current === null || typeof current !== "object" || current instanceof Date) return null;
      if (Array.isArray(current)) {
        const idx = parseInt(key);
        if (isNaN(idx)) return null;
        current = current[idx] ?? null;
      } else {
        const record = current as Record<string, Value>;
        // Case-insensitive lookup
        const found = Object.keys(record).find((k) => k.toUpperCase() === key.toUpperCase());
        current = found ? record[found] : null;
      }
    }
    return current;
  },

  GET: ([obj, key]) => {
    if (obj === null || key === null) return null;
    if (Array.isArray(obj)) {
      const idx = Number(key);
      return obj[idx] ?? null;
    }
    if (typeof obj === "object" && !(obj instanceof Date)) {
      const record = obj as Record<string, Value>;
      return record[String(key)] ?? null;
    }
    return null;
  },

  OBJECT_CONSTRUCT: (args) => {
    const obj: Record<string, Value> = {};
    for (let i = 0; i + 1 < args.length; i += 2) {
      const key = args[i];
      const val = args[i + 1];
      if (key !== null) obj[String(key)] = val;
    }
    return obj;
  },

  OBJECT_CONSTRUCT_KEEP_NULL: (args) => {
    const obj: Record<string, Value> = {};
    for (let i = 0; i + 1 < args.length; i += 2) {
      const key = args[i];
      const val = args[i + 1];
      if (key !== null) obj[String(key)] = val;
    }
    return obj;
  },

  OBJECT_KEYS: ([obj]) => {
    if (obj === null || typeof obj !== "object" || obj instanceof Date || Array.isArray(obj)) return null;
    return Object.keys(obj as Record<string, Value>);
  },

  OBJECT_DELETE: ([obj, ...keys]) => {
    if (obj === null || typeof obj !== "object" || obj instanceof Date || Array.isArray(obj)) return null;
    const result = { ...(obj as Record<string, Value>) };
    for (const k of keys) {
      if (k !== null) delete result[String(k)];
    }
    return result;
  },

  OBJECT_INSERT: ([obj, key, val]) => {
    if (obj === null || typeof obj !== "object" || obj instanceof Date || Array.isArray(obj)) return null;
    if (key === null) return obj;
    return { ...(obj as Record<string, Value>), [String(key)]: val };
  },

  ARRAY_CONSTRUCT: (args) => [...args],

  ARRAY_CONSTRUCT_COMPACT: (args) => args.filter((a) => a !== null),

  ARRAY_SIZE: ([arr]) => {
    if (arr === null) return null;
    if (Array.isArray(arr)) return arr.length;
    return null;
  },

  ARRAY_LENGTH: ([arr]) => semiStructuredFunctions.ARRAY_SIZE([arr], {} as never),

  ARRAY_APPEND: ([arr, val]) => {
    if (arr === null) return null;
    if (!Array.isArray(arr)) return null;
    return [...arr, val];
  },

  ARRAY_PREPEND: ([arr, val]) => {
    if (arr === null) return null;
    if (!Array.isArray(arr)) return null;
    return [val, ...arr];
  },

  ARRAY_CAT: ([arr1, arr2]) => {
    if (arr1 === null || arr2 === null) return null;
    if (!Array.isArray(arr1) || !Array.isArray(arr2)) return null;
    return [...arr1, ...arr2];
  },

  ARRAY_COMPACT: ([arr]) => {
    if (arr === null || !Array.isArray(arr)) return null;
    return arr.filter((a) => a !== null);
  },

  ARRAY_CONTAINS: ([val, arr]) => {
    if (arr === null || !Array.isArray(arr)) return null;
    return arr.some((a) => String(a) === String(val));
  },

  ARRAY_FLATTEN: ([arr]) => {
    if (arr === null || !Array.isArray(arr)) return null;
    return (arr as Value[]).flat();
  },

  ARRAY_SLICE: ([arr, from, to]) => {
    if (arr === null || !Array.isArray(arr)) return null;
    return arr.slice(Number(from), Number(to));
  },

  ARRAY_DISTINCT: ([arr]) => {
    if (arr === null || !Array.isArray(arr)) return null;
    const seen = new Set<string>();
    return arr.filter((a) => {
      const key = JSON.stringify(a);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },

  TYPEOF: ([v]) => {
    if (v === null) return "NULL_VALUE";
    if (typeof v === "number") return Number.isInteger(v) ? "INTEGER" : "DECIMAL";
    if (typeof v === "string") return "VARCHAR";
    if (typeof v === "boolean") return "BOOLEAN";
    if (v instanceof Date) return "TIMESTAMP";
    if (Array.isArray(v)) return "ARRAY";
    if (typeof v === "object") return "OBJECT";
    return "VARCHAR";
  },

  FLATTEN: ([input]) => {
    // FLATTEN as a function returns the array — actual table expansion is handled in executor
    if (input === null) return null;
    if (Array.isArray(input)) return input;
    return null;
  },

  STRTOK_TO_ARRAY: ([v, delim]) => {
    if (v === null) return null;
    const d = delim === null || delim === undefined ? "," : String(delim);
    return String(v).split(d);
  },

  ARRAY_TO_STRING: ([arr, delim]) => {
    if (arr === null || !Array.isArray(arr)) return null;
    const d = delim === null || delim === undefined ? "," : String(delim);
    return arr.map(String).join(d);
  },
};
