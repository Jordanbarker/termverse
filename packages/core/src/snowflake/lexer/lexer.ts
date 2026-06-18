import { Token, TokenType, TokenPosition } from "./tokens";
import { KEYWORDS } from "./keywords";

export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let col = 1;

  function position(): TokenPosition {
    return { offset: pos, line, column: col };
  }

  function advance(): string {
    const ch = sql[pos];
    pos++;
    if (ch === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
    return ch;
  }

  function peek(): string {
    return pos < sql.length ? sql[pos] : "";
  }

  function peekAt(offset: number): string {
    const i = pos + offset;
    return i < sql.length ? sql[i] : "";
  }

  function push(type: TokenType, value: string, p: TokenPosition) {
    tokens.push({ type, value, position: p });
  }

  while (pos < sql.length) {
    const ch = sql[pos];

    // Whitespace
    if (/\s/.test(ch)) {
      advance();
      continue;
    }

    // Single-line comment
    if (ch === "-" && peekAt(1) === "-") {
      while (pos < sql.length && sql[pos] !== "\n") advance();
      continue;
    }

    // Block comment
    if (ch === "/" && peekAt(1) === "*") {
      const start = position();
      advance(); advance(); // skip /*
      let depth = 1;
      while (pos < sql.length && depth > 0) {
        if (sql[pos] === "/" && peekAt(1) === "*") {
          advance(); advance();
          depth++;
        } else if (sql[pos] === "*" && peekAt(1) === "/") {
          advance(); advance();
          depth--;
        } else {
          advance();
        }
      }
      if (depth > 0) {
        push(TokenType.EOF, "", start);
        return tokens;
      }
      continue;
    }

    // String literal (single-quoted)
    if (ch === "'") {
      const p = position();
      advance(); // skip opening quote
      let value = "";
      while (pos < sql.length) {
        if (sql[pos] === "'" && peekAt(1) === "'") {
          value += "'";
          advance(); advance();
        } else if (sql[pos] === "'") {
          advance(); // skip closing quote
          break;
        } else {
          value += advance();
        }
      }
      push(TokenType.STRING, value, p);
      continue;
    }

    // Quoted identifier (double-quoted)
    if (ch === '"') {
      const p = position();
      advance();
      let value = "";
      while (pos < sql.length && sql[pos] !== '"') {
        value += advance();
      }
      if (pos < sql.length) advance(); // skip closing quote
      push(TokenType.QUOTED_IDENTIFIER, value, p);
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(peekAt(1)))) {
      const p = position();
      let num = "";
      while (pos < sql.length && /[0-9]/.test(sql[pos])) {
        num += advance();
      }
      if (pos < sql.length && sql[pos] === "." && /[0-9]/.test(peekAt(1))) {
        num += advance(); // dot
        while (pos < sql.length && /[0-9]/.test(sql[pos])) {
          num += advance();
        }
      }
      // Scientific notation
      if (pos < sql.length && /[eE]/.test(sql[pos])) {
        num += advance();
        if (pos < sql.length && /[+-]/.test(sql[pos])) num += advance();
        while (pos < sql.length && /[0-9]/.test(sql[pos])) num += advance();
      }
      push(TokenType.NUMBER, num, p);
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(ch)) {
      const p = position();
      let ident = "";
      while (pos < sql.length && /[a-zA-Z0-9_$]/.test(sql[pos])) {
        ident += advance();
      }
      const upper = ident.toUpperCase();
      // Special two-word keyword: TRY_CAST
      if (upper === "TRY_CAST") {
        push(TokenType.TRY_CAST, ident, p);
        continue;
      }
      // Special two-word keyword: FILE_FORMAT
      if (upper === "FILE_FORMAT") {
        push(TokenType.FILE_FORMAT, ident, p);
        continue;
      }
      const kwType = KEYWORDS[upper];
      if (kwType !== undefined) {
        push(kwType, ident, p);
      } else {
        push(TokenType.IDENTIFIER, ident, p);
      }
      continue;
    }

    // Operators and punctuation
    const p = position();
    switch (ch) {
      case "(":
        advance();
        push(TokenType.LPAREN, "(", p);
        break;
      case ")":
        advance();
        push(TokenType.RPAREN, ")", p);
        break;
      case ",":
        advance();
        push(TokenType.COMMA, ",", p);
        break;
      case ".":
        advance();
        push(TokenType.DOT, ".", p);
        break;
      case ";":
        advance();
        push(TokenType.SEMICOLON, ";", p);
        break;
      case "+":
        advance();
        push(TokenType.PLUS, "+", p);
        break;
      case "-":
        advance();
        push(TokenType.MINUS, "-", p);
        break;
      case "*":
        advance();
        push(TokenType.STAR, "*", p);
        break;
      case "/":
        advance();
        push(TokenType.SLASH, "/", p);
        break;
      case "%":
        advance();
        push(TokenType.PERCENT, "%", p);
        break;
      case "=":
        advance();
        if (peek() === ">") {
          advance();
          push(TokenType.ARROW, "=>", p);
        } else {
          push(TokenType.EQ, "=", p);
        }
        break;
      case "!":
        advance();
        if (peek() === "=") {
          advance();
          push(TokenType.NEQ, "!=", p);
        }
        break;
      case "<":
        advance();
        if (peek() === "=") {
          advance();
          push(TokenType.LTE, "<=", p);
        } else if (peek() === ">") {
          advance();
          push(TokenType.NEQ, "<>", p);
        } else {
          push(TokenType.LT, "<", p);
        }
        break;
      case ">":
        advance();
        if (peek() === "=") {
          advance();
          push(TokenType.GTE, ">=", p);
        } else {
          push(TokenType.GT, ">", p);
        }
        break;
      case "|":
        advance();
        if (peek() === "|") {
          advance();
          push(TokenType.CONCAT, "||", p);
        }
        break;
      case ":":
        advance();
        if (peek() === ":") {
          advance();
          push(TokenType.DOUBLE_COLON, "::", p);
        } else {
          push(TokenType.COLON, ":", p);
        }
        break;
      default:
        // Skip unknown characters
        advance();
        break;
    }
  }

  push(TokenType.EOF, "", position());
  return tokens;
}
