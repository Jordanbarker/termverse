import { Value } from "../../types";
import { ScalarFn } from "./registry";

function toDate(v: Value): Date | null {
  if (v === null) return null;
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

// `ctx.gameNow` carries the in-game story clock; falling back to wall-clock time
// keeps unit tests that don't supply it working. Always return a fresh Date so
// downstream mutation can't leak into ctx.
export const dateFunctions: Record<string, ScalarFn> = {
  CURRENT_DATE: (_, ctx) => {
    const now = ctx.gameNow ?? new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  },

  CURRENT_TIMESTAMP: (_, ctx) => (ctx.gameNow ? new Date(ctx.gameNow) : new Date()),
  NOW: (_, ctx) => (ctx.gameNow ? new Date(ctx.gameNow) : new Date()),
  GETDATE: (_, ctx) => (ctx.gameNow ? new Date(ctx.gameNow) : new Date()),
  SYSDATE: (_, ctx) => (ctx.gameNow ? new Date(ctx.gameNow) : new Date()),
  LOCALTIMESTAMP: (_, ctx) => (ctx.gameNow ? new Date(ctx.gameNow) : new Date()),

  CURRENT_TIME: (_, ctx) => {
    const now = ctx.gameNow ?? new Date();
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  },

  DATEADD: ([part, num, dt]) => {
    if (part === null || num === null || dt === null) return null;
    const date = toDate(dt);
    if (!date) return null;
    const n = Number(num);
    const result = new Date(date);
    const p = String(part).toLowerCase().replace(/s$/, "");
    switch (p) {
      case "year": case "yy": case "yyyy": result.setFullYear(result.getFullYear() + n); break;
      case "quarter": case "qq": case "q": result.setMonth(result.getMonth() + n * 3); break;
      case "month": case "mm": case "m": result.setMonth(result.getMonth() + n); break;
      case "week": case "wk": case "ww": result.setDate(result.getDate() + n * 7); break;
      case "day": case "dd": case "d": result.setDate(result.getDate() + n); break;
      case "hour": case "hh": result.setHours(result.getHours() + n); break;
      case "minute": case "mi": case "n": result.setMinutes(result.getMinutes() + n); break;
      case "second": case "ss": case "s": result.setSeconds(result.getSeconds() + n); break;
      default: return null;
    }
    return result;
  },

  DATEDIFF: ([part, dt1, dt2]) => {
    if (part === null || dt1 === null || dt2 === null) return null;
    const d1 = toDate(dt1);
    const d2 = toDate(dt2);
    if (!d1 || !d2) return null;
    const p = String(part).toLowerCase().replace(/s$/, "");
    const diffMs = d2.getTime() - d1.getTime();
    switch (p) {
      case "year": case "yy": case "yyyy": return d2.getFullYear() - d1.getFullYear();
      case "quarter": case "qq": case "q":
        return (d2.getFullYear() - d1.getFullYear()) * 4 + Math.floor(d2.getMonth() / 3) - Math.floor(d1.getMonth() / 3);
      case "month": case "mm": case "m":
        return (d2.getFullYear() - d1.getFullYear()) * 12 + d2.getMonth() - d1.getMonth();
      case "week": case "wk": case "ww": return Math.floor(diffMs / (7 * 86400000));
      case "day": case "dd": case "d": return Math.floor(diffMs / 86400000);
      case "hour": case "hh": return Math.floor(diffMs / 3600000);
      case "minute": case "mi": case "n": return Math.floor(diffMs / 60000);
      case "second": case "ss": case "s": return Math.floor(diffMs / 1000);
      default: return null;
    }
  },

  DATE_TRUNC: ([part, dt]) => {
    if (part === null || dt === null) return null;
    const date = toDate(dt);
    if (!date) return null;
    const p = String(part).toLowerCase().replace(/s$/, "");
    switch (p) {
      case "year": case "yy": case "yyyy": return new Date(date.getFullYear(), 0, 1);
      case "quarter": case "qq": case "q":
        return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
      case "month": case "mm": case "m": return new Date(date.getFullYear(), date.getMonth(), 1);
      case "week": case "wk": case "ww": {
        const d = new Date(date);
        d.setDate(d.getDate() - d.getDay());
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }
      case "day": case "dd": case "d":
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
      case "hour": case "hh":
        return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
      case "minute": case "mi": case "n":
        return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes());
      default: return date;
    }
  },

  EXTRACT: ([part, dt]) => {
    if (part === null || dt === null) return null;
    const date = toDate(dt);
    if (!date) return null;
    const p = String(part).toLowerCase();
    switch (p) {
      case "year": case "yy": case "yyyy": return date.getFullYear();
      case "quarter": case "qq": case "q": return Math.floor(date.getMonth() / 3) + 1;
      case "month": case "mm": case "m": return date.getMonth() + 1;
      case "week": case "wk": case "ww": return getWeekNumber(date);
      case "day": case "dd": case "d": return date.getDate();
      case "dayofweek": case "dw": return date.getDay();
      case "dayofyear": case "dy": return getDayOfYear(date);
      case "hour": case "hh": return date.getHours();
      case "minute": case "mi": case "n": return date.getMinutes();
      case "second": case "ss": case "s": return date.getSeconds();
      case "epoch_second": case "epoch": return Math.floor(date.getTime() / 1000);
      default: return null;
    }
  },

  // Shorthand extract functions
  YEAR: ([dt]) => dateFunctions.EXTRACT(["year", dt], {} as never),
  MONTH: ([dt]) => dateFunctions.EXTRACT(["month", dt], {} as never),
  DAY: ([dt]) => dateFunctions.EXTRACT(["day", dt], {} as never),
  DAYOFWEEK: ([dt]) => dateFunctions.EXTRACT(["dayofweek", dt], {} as never),
  DAYOFYEAR: ([dt]) => dateFunctions.EXTRACT(["dayofyear", dt], {} as never),
  HOUR: ([dt]) => dateFunctions.EXTRACT(["hour", dt], {} as never),
  MINUTE: ([dt]) => dateFunctions.EXTRACT(["minute", dt], {} as never),
  SECOND: ([dt]) => dateFunctions.EXTRACT(["second", dt], {} as never),
  QUARTER: ([dt]) => dateFunctions.EXTRACT(["quarter", dt], {} as never),

  TO_DATE: ([v, fmt]) => {
    void fmt;
    if (v === null) return null;
    const d = toDate(v);
    return d ?? null;
  },

  TO_TIMESTAMP: ([v, fmt]) => {
    void fmt;
    if (v === null) return null;
    const d = toDate(v);
    return d ?? null;
  },

  TO_TIMESTAMP_NTZ: ([v]) => dateFunctions.TO_TIMESTAMP([v], {} as never),
  TO_TIMESTAMP_LTZ: ([v]) => dateFunctions.TO_TIMESTAMP([v], {} as never),
  TO_TIMESTAMP_TZ: ([v]) => dateFunctions.TO_TIMESTAMP([v], {} as never),

  DATE_FROM_PARTS: ([year, month, day]) => {
    if (year === null || month === null || day === null) return null;
    return new Date(Number(year), Number(month) - 1, Number(day));
  },

  TIMESTAMP_FROM_PARTS: ([year, month, day, hour, min, sec]) => {
    if (year === null || month === null || day === null) return null;
    return new Date(
      Number(year), Number(month) - 1, Number(day),
      Number(hour ?? 0), Number(min ?? 0), Number(sec ?? 0)
    );
  },

  LAST_DAY: ([dt, part]) => {
    if (dt === null) return null;
    const date = toDate(dt);
    if (!date) return null;
    const p = part ? String(part).toLowerCase() : "month";
    if (p === "month" || p === "mm") {
      return new Date(date.getFullYear(), date.getMonth() + 1, 0);
    }
    if (p === "year" || p === "yy") {
      return new Date(date.getFullYear(), 11, 31);
    }
    return date;
  },

  MONTHS_BETWEEN: ([dt1, dt2]) => {
    if (dt1 === null || dt2 === null) return null;
    const d1 = toDate(dt1);
    const d2 = toDate(dt2);
    if (!d1 || !d2) return null;
    return (d1.getFullYear() - d2.getFullYear()) * 12 + d1.getMonth() - d2.getMonth();
  },

  ADD_MONTHS: ([dt, n]) => dateFunctions.DATEADD(["month", n, dt], {} as never),
};

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}

function getDayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}
