import { colorize, ansi } from "@tt/core/lib/ansi";
import { KEYWORDS } from "@tt/core/snowflake/lexer/keywords";

const SQL_KEYWORDS = new Set(Object.keys(KEYWORDS));

/**
 * Lightweight SQL syntax highlighter that produces ANSI-colored output.
 * Handles SQL keywords, strings, numbers, comments, and dbt Jinja blocks.
 */
export function highlightSql(sql: string): string {
  let out = "";
  let i = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];

    // Jinja blocks: {{ ... }} or {% ... %}
    if (ch === "{" && i + 1 < len && (sql[i + 1] === "{" || sql[i + 1] === "%")) {
      const closer = sql[i + 1] === "{" ? "}}" : "%}";
      const end = sql.indexOf(closer, i + 2);
      if (end !== -1) {
        out += colorize(sql.slice(i, end + 2), ansi.yellow);
        i = end + 2;
        continue;
      }
      // No closing found — emit rest as Jinja
      out += colorize(sql.slice(i), ansi.yellow);
      break;
    }

    // Block comments: /* ... */
    if (ch === "/" && i + 1 < len && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end !== -1) {
        out += colorize(sql.slice(i, end + 2), ansi.dim);
        i = end + 2;
      } else {
        out += colorize(sql.slice(i), ansi.dim);
        i = len;
      }
      continue;
    }

    // Line comments: --
    if (ch === "-" && i + 1 < len && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      if (nl !== -1) {
        out += colorize(sql.slice(i, nl), ansi.dim);
        i = nl; // newline itself handled next iteration
      } else {
        out += colorize(sql.slice(i), ansi.dim);
        i = len;
      }
      continue;
    }

    // Single-quoted strings
    if (ch === "'") {
      let j = i + 1;
      while (j < len) {
        if (sql[j] === "'" && j + 1 < len && sql[j + 1] === "'") {
          j += 2; // escaped quote
        } else if (sql[j] === "'") {
          j++;
          break;
        } else {
          j++;
        }
      }
      out += colorize(sql.slice(i, j), ansi.green);
      i = j;
      continue;
    }

    // Numbers (digits, optionally with decimal point)
    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < len && /[0-9.]/.test(sql[j])) j++;
      // Don't color if immediately followed by a word char (e.g. part of identifier)
      if (j < len && /[a-zA-Z_]/.test(sql[j])) {
        out += sql.slice(i, j);
        i = j;
      } else {
        out += colorize(sql.slice(i, j), ansi.magenta);
        i = j;
      }
      continue;
    }

    // Words (identifiers / keywords)
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_]/.test(sql[j])) j++;
      const word = sql.slice(i, j);
      if (SQL_KEYWORDS.has(word.toUpperCase())) {
        out += colorize(word, ansi.cyan);
      } else {
        out += word;
      }
      i = j;
      continue;
    }

    // Everything else (whitespace, operators, punctuation)
    out += ch;
    i++;
  }

  return out;
}
