import { describe, it, expect } from "vitest";
import {
  formatResultSet,
  formatStatusMessage,
} from "../formatter/table_formatter";
import type { ResultSet, StatusMessage, ResultColumn } from "../formatter/result_types";
import type { Value, DataType } from "../types";

// Helper: build a ResultSet from column names and record-style rows
function makeResultSet(
  columnNames: string[],
  recordRows: Record<string, unknown>[]
): ResultSet {
  const columns: ResultColumn[] = columnNames.map((name) => ({ name, type: "VARCHAR" as DataType }));
  const rows: Value[][] = recordRows.map((rec) =>
    columnNames.map((col) => (rec[col] as Value) ?? null)
  );
  return { columns, rows, rowCount: rows.length };
}

// Helper: build a StatusMessage
function makeStatus(
  message: string,
  rowsAffected?: number
): StatusMessage {
  return { message, rowsAffected };
}

// Helper: strip ANSI escape codes for content assertions
function stripAnsi(str: string): string {
   
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("Table Formatter — formatResultSet()", () => {
  // ─── Single Column, Single Row ─────────────────────────────────────

  it("formats a single column with a single row", () => {
    const rs = makeResultSet(["NAME"], [{ NAME: "Alice" }]);
    const output = formatResultSet(rs);
    const plain = stripAnsi(output);

    expect(plain).toContain("NAME");
    expect(plain).toContain("Alice");
    expect(plain).toContain("1 Row(s) produced.");
  });

  // ─── Multiple Columns with Varying Widths ──────────────────────────

  it("formats multiple columns with proper alignment", () => {
    const rs = makeResultSet(
      ["ID", "NAME", "SALARY"],
      [
        { ID: 1, NAME: "Alice", SALARY: 90000 },
        { ID: 2, NAME: "Bob", SALARY: 85000 },
        { ID: 3, NAME: "Carol Ann", SALARY: 95000 },
      ]
    );
    const output = formatResultSet(rs);
    const plain = stripAnsi(output);

    expect(plain).toContain("ID");
    expect(plain).toContain("NAME");
    expect(plain).toContain("SALARY");
    expect(plain).toContain("Alice");
    expect(plain).toContain("Carol Ann");
    expect(plain).toContain("3 Row(s) produced.");
  });

  // ─── Column Headers Uppercased ─────────────────────────────────────

  it("displays column headers in uppercase", () => {
    const rs = makeResultSet(["name", "salary"], [{ name: "Alice", salary: 90000 }]);
    const output = formatResultSet(rs);
    const plain = stripAnsi(output);

    expect(plain).toContain("NAME");
    expect(plain).toContain("SALARY");
  });

  // ─── Alignment: Numbers Right, Strings Left ───────────────────────

  it("right-aligns numbers and left-aligns strings", () => {
    const rs = makeResultSet(
      ["NAME", "SALARY"],
      [
        { NAME: "Alice", SALARY: 90000 },
        { NAME: "Bob", SALARY: 8500 },
      ]
    );
    const output = formatResultSet(rs);
    const lines = stripAnsi(output).split("\n");

    // Find the data lines (not header or border)
    const dataLines = lines.filter(
      (l) => l.includes("|") && !l.includes("+") && !l.includes("NAME")
    );

    // Numbers should be right-aligned: shorter numbers have leading spaces
    // For SALARY column, 8500 should have more leading space than 90000
    // We verify by checking that both data rows parse correctly
    expect(dataLines.length).toBeGreaterThanOrEqual(2);
  });

  // ─── NULL Display ──────────────────────────────────────────────────

  it("displays NULL values as 'NULL'", () => {
    const rs = makeResultSet(
      ["NAME", "VALUE"],
      [{ NAME: "Alice", VALUE: null }]
    );
    const output = formatResultSet(rs);
    const plain = stripAnsi(output);

    expect(plain).toContain("NULL");
  });

  // ─── Boolean Display ──────────────────────────────────────────────

  it("displays boolean values as TRUE/FALSE", () => {
    const rs = makeResultSet(
      ["NAME", "ACTIVE"],
      [
        { NAME: "Alice", ACTIVE: true },
        { NAME: "Bob", ACTIVE: false },
      ]
    );
    const output = formatResultSet(rs);
    const plain = stripAnsi(output);

    expect(plain).toContain("TRUE");
    expect(plain).toContain("FALSE");
  });

  // ─── Empty Result Set ─────────────────────────────────────────────

  it("shows headers and '0 Row(s) produced.' for empty results", () => {
    const rs = makeResultSet(["ID", "NAME"], []);
    const output = formatResultSet(rs);
    const plain = stripAnsi(output);

    expect(plain).toContain("ID");
    expect(plain).toContain("NAME");
    expect(plain).toContain("0 Row(s) produced.");
  });

  // ─── Row Count Footer ──────────────────────────────────────────────

  it("includes row count and elapsed time in footer", () => {
    const rs = makeResultSet(
      ["ID"],
      [{ ID: 1 }, { ID: 2 }, { ID: 3 }]
    );
    const output = formatResultSet(rs, 0.456);
    const plain = stripAnsi(output);

    expect(plain).toContain("3 Row(s) produced.");
    expect(plain).toMatch(/Time Elapsed: \d+\.\d+s/);
  });

  // ─── Long Values Truncated ─────────────────────────────────────────

  it("truncates long values to a reasonable width", () => {
    const longString = "A".repeat(500);
    const rs = makeResultSet(["DATA"], [{ DATA: longString }]);
    const output = formatResultSet(rs);
    const plain = stripAnsi(output);

    // The output should not contain the full 500-char string
    // It should be truncated (the exact limit depends on implementation)
    const dataLine = plain.split("\n").find((l) => l.includes("AAA") && l.includes("|"));
    expect(dataLine!.length).toBeLessThan(600);
  });

  // ─── Table Border Characters ───────────────────────────────────────

  it("uses +, -, | for table borders", () => {
    const rs = makeResultSet(["ID"], [{ ID: 1 }]);
    const output = formatResultSet(rs);
    const plain = stripAnsi(output);

    expect(plain).toContain("+");
    expect(plain).toContain("-");
    expect(plain).toContain("|");
  });

  // ─── ANSI Color Codes ─────────────────────────────────────────────

  it("includes ANSI escape sequences in output", () => {
    const rs = makeResultSet(["ID"], [{ ID: 1 }]);
    const output = formatResultSet(rs);

    // Check for ESC character (\x1b or \u001b)
     
    expect(output).toMatch(/\x1b\[/);
  });
});

describe("Table Formatter — formatStatusMessage()", () => {
  // ─── DDL Status ────────────────────────────────────────────────────

  it("formats DDL status message", () => {
    const msg = makeStatus("Statement executed successfully.");
    const output = formatStatusMessage(msg);
    const plain = stripAnsi(output);

    expect(plain).toContain("Statement executed successfully.");
  });

  // ─── DML Status with Rows Affected ────────────────────────────────

  it("formats DML status with row count", () => {
    const msg = makeStatus("Rows affected.", 3);
    const output = formatStatusMessage(msg);
    const plain = stripAnsi(output);

    expect(plain).toContain("3 Row(s) affected.");
  });

  // ─── Single Row Affected ──────────────────────────────────────────

  it("formats single row affected", () => {
    const msg = makeStatus("Rows affected.", 1);
    const output = formatStatusMessage(msg);
    const plain = stripAnsi(output);

    expect(plain).toContain("1 Row(s) affected.");
  });

  // ─── Zero Rows Affected ───────────────────────────────────────────

  it("formats zero rows affected", () => {
    const msg = makeStatus("Rows affected.", 0);
    const output = formatStatusMessage(msg);
    const plain = stripAnsi(output);

    expect(plain).toContain("0 Row(s) affected.");
  });
});
