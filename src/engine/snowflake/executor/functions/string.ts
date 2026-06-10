import { ScalarFn } from "./registry";

export const stringFunctions: Record<string, ScalarFn> = {
  UPPER: ([v]) => (v === null ? null : String(v).toUpperCase()),
  LOWER: ([v]) => (v === null ? null : String(v).toLowerCase()),

  TRIM: ([v]) => (v === null ? null : String(v).trim()),
  LTRIM: ([v, chars]) => {
    if (v === null) return null;
    const s = String(v);
    if (chars === null || chars === undefined) return s.trimStart();
    const c = String(chars);
    let i = 0;
    while (i < s.length && c.includes(s[i])) i++;
    return s.slice(i);
  },
  RTRIM: ([v, chars]) => {
    if (v === null) return null;
    const s = String(v);
    if (chars === null || chars === undefined) return s.trimEnd();
    const c = String(chars);
    let i = s.length;
    while (i > 0 && c.includes(s[i - 1])) i--;
    return s.slice(0, i);
  },

  // Snowflake SUBSTR is 1-based
  SUBSTR: ([v, start, len]) => {
    if (v === null || start === null) return null;
    const s = String(v);
    const idx = Number(start) - 1;
    if (len !== undefined && len !== null) return s.substr(Math.max(0, idx), Number(len));
    return s.substr(Math.max(0, idx));
  },
  SUBSTRING: ([v, start, len]) => stringFunctions.SUBSTR([v, start, len], {} as never),

  CONCAT: (args) => {
    if (args.some((a) => a === null)) return null;
    return args.map(String).join("");
  },
  CONCAT_WS: ([sep, ...args]) => {
    if (sep === null) return null;
    return args.filter((a) => a !== null).map(String).join(String(sep));
  },

  LENGTH: ([v]) => (v === null ? null : String(v).length),
  LEN: ([v]) => (v === null ? null : String(v).length),

  REPLACE: ([v, from, to]) => {
    if (v === null || from === null) return null;
    return String(v).split(String(from)).join(to === null || to === undefined ? "" : String(to));
  },

  SPLIT: ([v, delim]) => {
    if (v === null) return null;
    const d = delim === null || delim === undefined ? "," : String(delim);
    return String(v).split(d);
  },

  SPLIT_PART: ([v, delim, partNum]) => {
    if (v === null || delim === null || partNum === null) return null;
    const parts = String(v).split(String(delim));
    const idx = Number(partNum);
    // Snowflake 0-indexed for SPLIT_PART
    if (idx < 0) return parts[parts.length + idx] ?? "";
    return parts[idx] ?? "";
  },

  LPAD: ([v, len, pad]) => {
    if (v === null || len === null) return null;
    const s = String(v);
    const n = Number(len);
    const p = pad === null || pad === undefined ? " " : String(pad);
    if (s.length >= n) return s.slice(0, n);
    return (p.repeat(Math.ceil(n / p.length)) + s).slice(-n);
  },

  RPAD: ([v, len, pad]) => {
    if (v === null || len === null) return null;
    const s = String(v);
    const n = Number(len);
    const p = pad === null || pad === undefined ? " " : String(pad);
    if (s.length >= n) return s.slice(0, n);
    return (s + p.repeat(Math.ceil(n / p.length))).slice(0, n);
  },

  REVERSE: ([v]) => (v === null ? null : String(v).split("").reverse().join("")),

  INITCAP: ([v]) => {
    if (v === null) return null;
    return String(v).replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
  },

  LEFT: ([v, n]) => {
    if (v === null || n === null) return null;
    return String(v).slice(0, Number(n));
  },

  RIGHT: ([v, n]) => {
    if (v === null || n === null) return null;
    return String(v).slice(-Number(n));
  },

  REPEAT: ([v, n]) => {
    if (v === null || n === null) return null;
    return String(v).repeat(Math.max(0, Number(n)));
  },

  CHARINDEX: ([substr, str, start]) => {
    if (substr === null || str === null) return null;
    const s = String(str);
    const sub = String(substr);
    const startIdx = start ? Number(start) - 1 : 0;
    const idx = s.indexOf(sub, startIdx);
    return idx === -1 ? 0 : idx + 1;
  },

  POSITION: ([substr, str]) => stringFunctions.CHARINDEX([substr, str], {} as never),

  REGEXP_LIKE: ([v, pattern]) => {
    if (v === null || pattern === null) return null;
    try {
      return new RegExp(String(pattern)).test(String(v));
    } catch {
      return false;
    }
  },
};
