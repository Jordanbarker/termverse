import { ScalarFn } from "./registry";

export const numericFunctions: Record<string, ScalarFn> = {
  ABS: ([v]) => (v === null ? null : Math.abs(Number(v))),
  CEIL: ([v]) => (v === null ? null : Math.ceil(Number(v))),
  CEILING: ([v]) => (v === null ? null : Math.ceil(Number(v))),
  FLOOR: ([v]) => (v === null ? null : Math.floor(Number(v))),

  ROUND: ([v, scale]) => {
    if (v === null) return null;
    const n = Number(v);
    const s = scale != null ? Number(scale) : 0;
    const factor = Math.pow(10, s);
    return Math.round(n * factor) / factor;
  },

  TRUNC: ([v, scale]) => {
    if (v === null) return null;
    const n = Number(v);
    const s = scale != null ? Number(scale) : 0;
    const factor = Math.pow(10, s);
    return Math.trunc(n * factor) / factor;
  },
  TRUNCATE: ([v, scale]) => numericFunctions.TRUNC([v, scale], {} as never),

  MOD: ([a, b]) => {
    if (a === null || b === null) return null;
    const bNum = Number(b);
    if (bNum === 0) throw new Error("Division by zero");
    return Number(a) % bNum;
  },

  POWER: ([base, exp]) => {
    if (base === null || exp === null) return null;
    return Math.pow(Number(base), Number(exp));
  },
  POW: ([base, exp]) => numericFunctions.POWER([base, exp], {} as never),

  SQRT: ([v]) => {
    if (v === null) return null;
    const n = Number(v);
    if (n < 0) return null;
    return Math.sqrt(n);
  },

  SIGN: ([v]) => {
    if (v === null) return null;
    const n = Number(v);
    if (n > 0) return 1;
    if (n < 0) return -1;
    return 0;
  },

  LN: ([v]) => (v === null ? null : Math.log(Number(v))),
  LOG: ([base, v]) => {
    if (base === null) return null;
    if (v === undefined || v === null) return Math.log10(Number(base)); // single arg = log10
    return Math.log(Number(v)) / Math.log(Number(base));
  },
  LOG10: ([v]) => (v === null ? null : Math.log10(Number(v))),
  LOG2: ([v]) => (v === null ? null : Math.log2(Number(v))),
  EXP: ([v]) => (v === null ? null : Math.exp(Number(v))),

  RANDOM: () => Math.random(),
  UNIFORM: ([low, high]) => {
    const lo = Number(low ?? 0);
    const hi = Number(high ?? 1);
    return lo + Math.random() * (hi - lo);
  },

  GREATEST: (args) => {
    const vals = args.filter((a) => a !== null).map(Number);
    return vals.length === 0 ? null : Math.max(...vals);
  },
  LEAST: (args) => {
    const vals = args.filter((a) => a !== null).map(Number);
    return vals.length === 0 ? null : Math.min(...vals);
  },

  DIV0: ([a, b]) => {
    if (a === null || b === null) return null;
    const bNum = Number(b);
    return bNum === 0 ? 0 : Number(a) / bNum;
  },

  DIV0NULL: ([a, b]) => {
    if (a === null || b === null) return null;
    const bNum = Number(b);
    return bNum === 0 ? null : Number(a) / bNum;
  },

  WIDTH_BUCKET: ([v, lo, hi, buckets]) => {
    if (v === null || lo === null || hi === null || buckets === null) return null;
    const val = Number(v);
    const low = Number(lo);
    const high = Number(hi);
    const n = Number(buckets);
    if (val < low) return 0;
    if (val >= high) return n + 1;
    return Math.floor(((val - low) / (high - low)) * n) + 1;
  },
};
