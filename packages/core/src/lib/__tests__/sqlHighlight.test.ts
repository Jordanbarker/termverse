import { describe, it, expect } from "vitest";
import { ansi } from "@tt/core/lib/ansi";
import { highlightSql } from "../sqlHighlight";

/** Strip ANSI codes for plain-text comparison. */
function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Check that a substring appears wrapped in the expected ANSI color. */
function expectColored(result: string, text: string, color: string): void {
  expect(result).toContain(`${color}${text}${ansi.reset}`);
}

describe("highlightSql", () => {
  it("colorizes keywords (case-insensitive)", () => {
    const result = highlightSql("SELECT id FROM users");
    expectColored(result, "SELECT", ansi.cyan);
    expectColored(result, "FROM", ansi.cyan);
    expect(strip(result)).toBe("SELECT id FROM users");
  });

  it("handles lowercase keywords", () => {
    const result = highlightSql("select * from orders where id = 1");
    expectColored(result, "select", ansi.cyan);
    expectColored(result, "from", ansi.cyan);
    expectColored(result, "where", ansi.cyan);
  });

  it("colorizes single-quoted strings green", () => {
    const result = highlightSql("WHERE name = 'alice'");
    expectColored(result, "'alice'", ansi.green);
  });

  it("handles escaped single quotes in strings", () => {
    const result = highlightSql("WHERE name = 'it''s'");
    expectColored(result, "'it''s'", ansi.green);
  });

  it("colorizes numbers magenta", () => {
    const result = highlightSql("LIMIT 10");
    expectColored(result, "10", ansi.magenta);
  });

  it("colorizes decimal numbers", () => {
    const result = highlightSql("WHERE price > 9.99");
    expectColored(result, "9.99", ansi.magenta);
  });

  it("does not color numbers that are part of identifiers", () => {
    const result = highlightSql("col2");
    // Should not contain magenta coloring for "2"
    expect(result).not.toContain(ansi.magenta);
  });

  it("dims single-line comments", () => {
    const result = highlightSql("SELECT 1 -- a comment\nFROM t");
    expectColored(result, "-- a comment", ansi.dim);
    // The newline and next line should still parse
    expectColored(result, "FROM", ansi.cyan);
  });

  it("dims block comments", () => {
    const result = highlightSql("/* multi\nline */ SELECT 1");
    expectColored(result, "/* multi\nline */", ansi.dim);
    expectColored(result, "SELECT", ansi.cyan);
  });

  it("handles unclosed block comment", () => {
    const result = highlightSql("/* unclosed");
    expectColored(result, "/* unclosed", ansi.dim);
  });

  it("colorizes Jinja {{ }} blocks yellow", () => {
    const result = highlightSql("SELECT * FROM {{ ref('stg_users') }}");
    expectColored(result, "{{ ref('stg_users') }}", ansi.yellow);
  });

  it("colorizes Jinja {% %} blocks yellow", () => {
    const result = highlightSql("{% if target.name == 'prod' %}");
    expectColored(result, "{% if target.name == 'prod' %}", ansi.yellow);
  });

  it("leaves identifiers uncolored", () => {
    const result = highlightSql("my_table");
    expect(result).toBe("my_table");
  });

  it("leaves operators and punctuation uncolored", () => {
    const result = highlightSql("a = b + c");
    expect(strip(result)).toBe("a = b + c");
    // = + should not have any color codes around them
    expect(result).toContain(" = ");
    expect(result).toContain(" + ");
  });

  it("returns empty string for empty input", () => {
    expect(highlightSql("")).toBe("");
  });

  it("preserves whitespace-only input", () => {
    expect(highlightSql("   \n  ")).toBe("   \n  ");
  });

  it("handles mixed SQL with multiple token types", () => {
    const sql = "SELECT id, name FROM {{ ref('raw') }} WHERE count > 5 -- filter";
    const result = highlightSql(sql);
    expectColored(result, "SELECT", ansi.cyan);
    expectColored(result, "FROM", ansi.cyan);
    expectColored(result, "WHERE", ansi.cyan);
    expectColored(result, "{{ ref('raw') }}", ansi.yellow);
    expectColored(result, "5", ansi.magenta);
    expectColored(result, "-- filter", ansi.dim);
    expect(strip(result)).toBe(sql);
  });
});
