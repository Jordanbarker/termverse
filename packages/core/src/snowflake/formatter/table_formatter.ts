import { ResultSet, StatusMessage } from "./result_types";
import { Value } from "../types";
import { colorize, ansi } from "@tt/core/lib/ansi";

const MAX_COL_WIDTH = 40;

export function formatResultSet(rs: ResultSet, elapsed?: number): string {
  if (rs.columns.length === 0) return formatRowCount(rs.rowCount, elapsed);

  const headers = rs.columns.map((c) => c.name.toUpperCase());
  const rows = rs.rows.map((row) => row.map(formatValue));

  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxData = rows.reduce((max, row) => Math.max(max, (row[i] ?? "").length), 0);
    return Math.min(Math.max(h.length, maxData), MAX_COL_WIDTH);
  });

  const lines: string[] = [];

  // Top border
  lines.push(colorize("+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+", ansi.dim));

  // Header row
  const headerCells = headers.map((h, i) => ` ${colorize(padRight(h, widths[i]), ansi.bold + ansi.cyan)} `);
  lines.push(colorize("|", ansi.dim) + headerCells.join(colorize("|", ansi.dim)) + colorize("|", ansi.dim));

  // Header separator
  lines.push(colorize("|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|", ansi.dim));

  // Data rows
  for (const row of rows) {
    const cells = row.map((val, i) => {
      const col = rs.columns[i];
      const isNum = col && (col.type === "NUMBER" || col.type === "FLOAT");
      const truncated = val.length > widths[i] ? val.slice(0, widths[i] - 1) + "…" : val;
      const padded = isNum ? padLeft(truncated, widths[i]) : padRight(truncated, widths[i]);
      const colored = val === "NULL" ? colorize(padded, ansi.dim) : padded;
      return ` ${colored} `;
    });
    lines.push(colorize("|", ansi.dim) + cells.join(colorize("|", ansi.dim)) + colorize("|", ansi.dim));
  }

  // Bottom border
  lines.push(colorize("+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+", ansi.dim));

  // Row count
  lines.push(formatRowCount(rs.rowCount, elapsed));

  return lines.join("\n");
}

export function formatStatusMessage(status: StatusMessage, elapsed?: number): string {
  const time = elapsed != null ? ` Time Elapsed: ${elapsed.toFixed(3)}s` : "";
  if (status.rowsAffected != null) {
    return colorize(`${status.rowsAffected} Row(s) affected.${time}`, ansi.green);
  }
  return colorize(`${status.message}${time}`, ansi.green);
}

export function formatError(message: string): string {
  return colorize(`Error: ${message}`, ansi.red);
}

function formatRowCount(count: number, elapsed?: number): string {
  const time = elapsed != null ? ` Time Elapsed: ${elapsed.toFixed(3)}s` : "";
  return colorize(`${count} Row(s) produced.${time}`, ansi.dim);
}

function formatValue(v: Value): string {
  if (v === null) return "NULL";
  if (v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) {
    const Y = v.getFullYear();
    const M = String(v.getMonth() + 1).padStart(2, "0");
    const D = String(v.getDate()).padStart(2, "0");
    const h = String(v.getHours()).padStart(2, "0");
    const m = String(v.getMinutes()).padStart(2, "0");
    const s = String(v.getSeconds()).padStart(2, "0");
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
  }
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function padRight(s: string, width: number): string {
  return s + " ".repeat(Math.max(0, width - s.length));
}

function padLeft(s: string, width: number): string {
  return " ".repeat(Math.max(0, width - s.length)) + s;
}
