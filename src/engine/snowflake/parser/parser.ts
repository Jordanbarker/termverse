import { Token, TokenType, TokenPosition } from "../lexer/tokens";
import { ParseError } from "./errors";
import * as AST from "./ast";

const AGGREGATE_NAMES = new Set(["COUNT", "SUM", "AVG", "MIN", "MAX", "LISTAGG", "ARRAY_AGG"]);
const TYPE_TOKENS = new Set([
  TokenType.NUMBER_TYPE, TokenType.INT, TokenType.INTEGER, TokenType.BIGINT,
  TokenType.SMALLINT, TokenType.TINYINT, TokenType.FLOAT_TYPE, TokenType.DOUBLE,
  TokenType.REAL, TokenType.DECIMAL, TokenType.NUMERIC, TokenType.VARCHAR_TYPE,
  TokenType.CHAR, TokenType.STRING_TYPE, TokenType.TEXT, TokenType.BOOLEAN_TYPE,
  TokenType.DATE_TYPE, TokenType.TIMESTAMP_TYPE, TokenType.TIMESTAMP_KW, TokenType.TIMESTAMP_LTZ,
  TokenType.TIMESTAMP_NTZ, TokenType.TIMESTAMP_TZ, TokenType.TIME_TYPE,
  TokenType.VARIANT_TYPE, TokenType.OBJECT_TYPE, TokenType.ARRAY_TYPE,
]);

export function parse(tokens: Token[]): AST.Statement {
  const p = new Parser(tokens);
  return p.parseStatement();
}

export function parseMultiple(tokens: Token[]): AST.Statement[] {
  const p = new Parser(tokens);
  const stmts: AST.Statement[] = [];
  while (!p.isAtEnd()) {
    if (p.check(TokenType.SEMICOLON)) { p.advance(); continue; }
    stmts.push(p.parseStatement());
    if (p.check(TokenType.SEMICOLON)) p.advance();
  }
  return stmts;
}

class Parser {
  private current = 0;

  constructor(private readonly tokens: Token[]) {}

  isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  // ── Core helpers ────────────────────────────────────────────────────

  peek(): Token {
    return this.tokens[this.current] ?? { type: TokenType.EOF, value: "", position: { offset: 0, line: 1, column: 1 } };
  }

  peekNext(): Token {
    return this.tokens[this.current + 1] ?? this.peek();
  }

  advance(): Token {
    const t = this.peek();
    if (t.type !== TokenType.EOF) this.current++;
    return t;
  }

  check(...types: TokenType[]): boolean {
    return types.includes(this.peek().type);
  }

  private match(...types: TokenType[]): Token | null {
    if (this.check(...types)) return this.advance();
    return null;
  }

  private expect(type: TokenType, message?: string): Token {
    if (this.check(type)) return this.advance();
    const t = this.peek();
    throw new ParseError(
      message ?? `Expected ${type} but got ${t.type} ('${t.value}')`,
      t.position
    );
  }

  private checkKeyword(value: string): boolean {
    const t = this.peek();
    return t.value.toUpperCase() === value.toUpperCase();
  }

  private matchKeyword(value: string): boolean {
    if (this.checkKeyword(value)) { this.advance(); return true; }
    return false;
  }

  private error(msg: string): ParseError {
    return new ParseError(msg, this.peek().position);
  }

  // ── Statement parsing ──────────────────────────────────────────────

  parseStatement(): AST.Statement {
    const t = this.peek();
    switch (t.type) {
      case TokenType.SELECT: return this.parseSelectFull();
      case TokenType.WITH: return this.parseSelectFull();
      case TokenType.INSERT: return this.parseInsert();
      case TokenType.UPDATE: return this.parseUpdate();
      case TokenType.DELETE: return this.parseDelete();
      case TokenType.MERGE: return this.parseMerge();
      case TokenType.TRUNCATE: return this.parseTruncate();
      case TokenType.CREATE: return this.parseCreate();
      case TokenType.ALTER: return this.parseAlter();
      case TokenType.DROP: return this.parseDrop();
      case TokenType.SHOW: return this.parseShow();
      case TokenType.DESCRIBE: return this.parseDescribe();
      case TokenType.USE: return this.parseUse();
      case TokenType.COPY: return this.parseCopyInto();
      default:
        // DESC can mean DESCRIBE
        if (t.type === TokenType.DESC && this.isDescribeContext()) {
          return this.parseDescribe();
        }
        throw this.error(`Unexpected token '${t.value}' at start of statement`);
    }
  }

  private isDescribeContext(): boolean {
    const next = this.peekNext();
    return next.type === TokenType.TABLE || next.type === TokenType.VIEW ||
           next.type === TokenType.DATABASE || next.type === TokenType.SCHEMA ||
           next.type === TokenType.WAREHOUSE || next.type === TokenType.IDENTIFIER;
  }

  // ── SELECT ─────────────────────────────────────────────────────────

  private parseSelectFull(): AST.SelectStatement {
    let ctes: AST.CTE[] | undefined;
    if (this.match(TokenType.WITH)) {
      ctes = this.parseCTEs();
    }
    const select = this.parseSelectCore();
    if (ctes) select.ctes = ctes;

    // Set operations
    if (this.check(TokenType.UNION, TokenType.INTERSECT, TokenType.EXCEPT)) {
      select.setOp = this.parseSetOp();
    }

    return select;
  }

  private parseCTEs(): AST.CTE[] {
    const ctes: AST.CTE[] = [];
    do {
      const name = this.parseIdentifierName();
      let columns: string[] | undefined;
      if (this.match(TokenType.LPAREN)) {
        columns = [];
        do {
          columns.push(this.parseIdentifierName());
        } while (this.match(TokenType.COMMA));
        this.expect(TokenType.RPAREN);
      }
      this.expect(TokenType.AS);
      this.expect(TokenType.LPAREN);
      const query = this.parseSelectFull();
      this.expect(TokenType.RPAREN);
      ctes.push({ name, columns, query });
    } while (this.match(TokenType.COMMA));
    return ctes;
  }

  private parseSelectCore(): AST.SelectStatement {
    const pos = this.expect(TokenType.SELECT).position;
    const stmt: AST.SelectStatement = { kind: "select", items: [], position: pos };

    if (this.match(TokenType.DISTINCT)) stmt.distinct = true;
    if (this.match(TokenType.ALL)) { /* default */ }

    if (this.match(TokenType.TOP)) {
      const topTok = this.expect(TokenType.NUMBER);
      stmt.top = parseInt(topTok.value);
    }

    // Select items
    stmt.items = this.parseSelectItems();

    // FROM
    if (this.match(TokenType.FROM)) {
      stmt.from = this.parseTableRef();
      // Additional joins
      while (this.isJoinKeyword()) {
        stmt.from = this.parseJoin(stmt.from!);
      }
    }

    // WHERE
    if (this.match(TokenType.WHERE)) {
      stmt.where = this.parseExpression();
    }

    // GROUP BY
    if (this.match(TokenType.GROUP)) {
      this.expect(TokenType.BY);
      stmt.groupBy = this.parseExpressionList();
    }

    // HAVING
    if (this.match(TokenType.HAVING)) {
      stmt.having = this.parseExpression();
    }

    // QUALIFY
    if (this.match(TokenType.QUALIFY)) {
      stmt.qualify = this.parseExpression();
    }

    // ORDER BY
    if (this.match(TokenType.ORDER)) {
      this.expect(TokenType.BY);
      stmt.orderBy = this.parseOrderByItems();
    }

    // LIMIT
    if (this.match(TokenType.LIMIT)) {
      stmt.limit = this.parseExpression();
      if (this.match(TokenType.OFFSET)) {
        stmt.offset = this.parseExpression();
      }
    }

    // FETCH FIRST N ROWS ONLY (alternative LIMIT syntax)
    if (this.match(TokenType.FETCH)) {
      this.match(TokenType.FIRST, TokenType.NEXT);
      stmt.limit = this.parseExpression();
      this.match(TokenType.ROWS, TokenType.ROW);
      this.match(TokenType.ONLY);
    }

    // OFFSET without LIMIT
    if (!stmt.offset && this.match(TokenType.OFFSET)) {
      stmt.offset = this.parseExpression();
    }

    return stmt;
  }

  private parseSetOp(): { type: "UNION" | "UNION ALL" | "INTERSECT" | "EXCEPT"; right: AST.SelectStatement } {
    let type: "UNION" | "UNION ALL" | "INTERSECT" | "EXCEPT";
    if (this.match(TokenType.UNION)) {
      type = this.match(TokenType.ALL) ? "UNION ALL" : "UNION";
    } else if (this.match(TokenType.INTERSECT)) {
      type = "INTERSECT";
    } else {
      this.expect(TokenType.EXCEPT);
      type = "EXCEPT";
    }
    const right = this.parseSelectFull();
    return { type, right };
  }

  private parseSelectItems(): AST.SelectItem[] {
    const items: AST.SelectItem[] = [];
    do {
      items.push(this.parseSelectItem());
    } while (this.match(TokenType.COMMA));
    return items;
  }

  private parseSelectItem(): AST.SelectItem {
    const expr = this.parseExpression();
    let alias: string | undefined;
    if (this.match(TokenType.AS)) {
      alias = this.parseIdentifierName();
    } else if (this.check(TokenType.IDENTIFIER) && !this.isClauseKeyword()) {
      alias = this.parseIdentifierName();
    }
    return { expr, alias };
  }

  private isClauseKeyword(): boolean {
    const v = this.peek().value.toUpperCase();
    return ["FROM", "WHERE", "GROUP", "HAVING", "ORDER", "LIMIT", "UNION",
            "INTERSECT", "EXCEPT", "QUALIFY", "INTO", "ON", "JOIN", "INNER",
            "LEFT", "RIGHT", "FULL", "CROSS", "NATURAL", "OFFSET", "FETCH",
            "WHEN", "THEN", "ELSE", "END", "SET", "VALUES"].includes(v);
  }

  // ── Table references ──────────────────────────────────────────────

  private parseTableRef(): AST.TableRef {
    // Subquery
    if (this.check(TokenType.LPAREN)) {
      // Could be subquery or parenthesized table ref
      if (this.isSubqueryAhead()) {
        this.advance(); // skip (
        const query = this.parseSelectFull();
        this.expect(TokenType.RPAREN);
        const alias = this.parseOptionalAlias();
        return { kind: "subquery_table", query, alias: alias ?? "_subquery", position: query.position };
      }
    }

    // LATERAL FLATTEN
    if (this.check(TokenType.LATERAL) || this.check(TokenType.FLATTEN)) {
      return this.parseFlatten();
    }

    // Table name
    const name = this.parseQualifiedName();
    let atTimestamp: AST.Expression | undefined;
    if (this.match(TokenType.AT)) {
      this.expect(TokenType.LPAREN);
      atTimestamp = this.parseExpression();
      this.expect(TokenType.RPAREN);
    }
    const alias = this.parseOptionalAlias();
    const tableRef: AST.TableName = { kind: "table_name", name, alias, atTimestamp, position: this.peek().position };

    // Check for sample
    if (this.match(TokenType.SAMPLE, TokenType.TABLESAMPLE)) {
      this.expect(TokenType.LPAREN);
      this.parseExpression(); // percentage
      this.match(TokenType.ROWS);
      this.expect(TokenType.RPAREN);
    }

    return tableRef;
  }

  private parseFlatten(): AST.FlattenTable {
    const isLateral = !!this.match(TokenType.LATERAL);
    this.expect(TokenType.FLATTEN);
    this.expect(TokenType.LPAREN);

    let input: AST.Expression | undefined;
    let path: string | undefined;
    let outer = false;
    let recursive = false;

    // Parse named args: INPUT =>, PATH =>, OUTER =>, RECURSIVE =>
    if (this.checkKeyword("INPUT") || this.checkKeyword("PATH") || this.checkKeyword("OUTER") || this.checkKeyword("RECURSIVE")) {
      while (!this.check(TokenType.RPAREN)) {
        const argName = this.advance().value.toUpperCase();
        this.expect(TokenType.ARROW);
        if (argName === "INPUT") input = this.parseExpression();
        else if (argName === "PATH") path = this.expect(TokenType.STRING).value;
        else if (argName === "OUTER") { outer = this.advance().value.toUpperCase() === "TRUE"; }
        else if (argName === "RECURSIVE") { recursive = this.advance().value.toUpperCase() === "TRUE"; }
        this.match(TokenType.COMMA);
      }
    } else {
      input = this.parseExpression();
    }

    this.expect(TokenType.RPAREN);
    const alias = this.parseOptionalAlias();

    void isLateral;
    return { kind: "flatten_table", input: input!, path, outer, recursive, alias };
  }

  private isSubqueryAhead(): boolean {
    // Look ahead to see if ( is followed by SELECT or WITH
    let depth = 0;
    let i = this.current;
    if (this.tokens[i]?.type === TokenType.LPAREN) {
      i++;
      while (i < this.tokens.length) {
        const t = this.tokens[i];
        if (t.type === TokenType.SELECT || t.type === TokenType.WITH) return true;
        if (t.type === TokenType.LPAREN) { depth++; i++; continue; }
        if (depth > 0) { if (t.type === TokenType.RPAREN) depth--; i++; continue; }
        return false;
      }
    }
    return false;
  }

  private isJoinKeyword(): boolean {
    const t = this.peek().type;
    return t === TokenType.JOIN || t === TokenType.INNER || t === TokenType.LEFT ||
           t === TokenType.RIGHT || t === TokenType.FULL || t === TokenType.CROSS ||
           t === TokenType.NATURAL || t === TokenType.COMMA;
  }

  private parseJoin(left: AST.TableRef): AST.JoinedTable {
    let joinType: AST.JoinedTable["joinType"] = "INNER";

    // Comma join = CROSS
    if (this.match(TokenType.COMMA)) {
      const right = this.parseTableRef();
      return { kind: "joined_table", left, joinType: "CROSS", right };
    }

    if (this.match(TokenType.NATURAL)) joinType = "NATURAL";
    if (this.match(TokenType.INNER)) joinType = "INNER";
    else if (this.match(TokenType.LEFT)) { this.match(TokenType.OUTER); joinType = "LEFT"; }
    else if (this.match(TokenType.RIGHT)) { this.match(TokenType.OUTER); joinType = "RIGHT"; }
    else if (this.match(TokenType.FULL)) { this.match(TokenType.OUTER); joinType = "FULL"; }
    else if (this.match(TokenType.CROSS)) joinType = "CROSS";

    this.expect(TokenType.JOIN);
    const right = this.parseTableRef();
    let condition: AST.Expression | undefined;
    if (this.match(TokenType.ON)) {
      condition = this.parseExpression();
    }
    return { kind: "joined_table", left, joinType, right, condition };
  }

  // ── INSERT ─────────────────────────────────────────────────────────

  private parseInsert(): AST.InsertStatement {
    const pos = this.advance().position; // INSERT
    this.expect(TokenType.INTO);
    const table = this.parseQualifiedName();
    let columns: string[] | undefined;

    if (this.match(TokenType.LPAREN)) {
      columns = [];
      do { columns.push(this.parseIdentifierName()); } while (this.match(TokenType.COMMA));
      this.expect(TokenType.RPAREN);
    }

    if (this.check(TokenType.SELECT) || this.check(TokenType.WITH)) {
      return { kind: "insert", table, columns, select: this.parseSelectFull(), position: pos };
    }

    this.expect(TokenType.VALUES);
    const values: AST.Expression[][] = [];
    do {
      this.expect(TokenType.LPAREN);
      const row: AST.Expression[] = [];
      do { row.push(this.parseExpression()); } while (this.match(TokenType.COMMA));
      this.expect(TokenType.RPAREN);
      values.push(row);
    } while (this.match(TokenType.COMMA));

    return { kind: "insert", table, columns, values, position: pos };
  }

  // ── UPDATE ─────────────────────────────────────────────────────────

  private parseUpdate(): AST.UpdateStatement {
    const pos = this.advance().position; // UPDATE
    const table = this.parseQualifiedName();
    const alias = this.parseOptionalAlias();
    this.expect(TokenType.SET);
    const set: AST.UpdateStatement["set"] = [];
    do {
      const column = this.parseIdentifierName();
      this.expect(TokenType.EQ);
      const value = this.parseExpression();
      set.push({ column, value });
    } while (this.match(TokenType.COMMA));

    let where: AST.Expression | undefined;
    if (this.match(TokenType.WHERE)) where = this.parseExpression();

    return { kind: "update", table, alias, set, where, position: pos };
  }

  // ── DELETE ─────────────────────────────────────────────────────────

  private parseDelete(): AST.DeleteStatement {
    const pos = this.advance().position; // DELETE
    this.expect(TokenType.FROM);
    const table = this.parseQualifiedName();
    const alias = this.parseOptionalAlias();
    let where: AST.Expression | undefined;
    if (this.match(TokenType.WHERE)) where = this.parseExpression();
    return { kind: "delete", table, alias, where, position: pos };
  }

  // ── MERGE ──────────────────────────────────────────────────────────

  private parseMerge(): AST.MergeStatement {
    const pos = this.advance().position; // MERGE
    this.expect(TokenType.INTO);
    const target = this.parseQualifiedName();
    const targetAlias = this.parseOptionalAlias();
    this.expect(TokenType.USING);
    const source = this.parseTableRef();
    this.expect(TokenType.ON);
    const condition = this.parseExpression();

    const clauses: AST.MergeClause[] = [];
    while (this.match(TokenType.WHEN)) {
      const notMatched = !!this.match(TokenType.NOT);
      this.expect(TokenType.MATCHED);
      let clauseCondition: AST.Expression | undefined;
      if (this.match(TokenType.AND)) clauseCondition = this.parseExpression();
      this.expect(TokenType.THEN);

      if (notMatched) {
        // INSERT
        this.expect(TokenType.INSERT);
        let columns: string[] | undefined;
        if (this.match(TokenType.LPAREN)) {
          columns = [];
          do { columns.push(this.parseIdentifierName()); } while (this.match(TokenType.COMMA));
          this.expect(TokenType.RPAREN);
        }
        this.expect(TokenType.VALUES);
        this.expect(TokenType.LPAREN);
        const values: AST.Expression[] = [];
        do { values.push(this.parseExpression()); } while (this.match(TokenType.COMMA));
        this.expect(TokenType.RPAREN);
        clauses.push({ matched: false, condition: clauseCondition, action: "INSERT", columns, values });
      } else if (this.check(TokenType.UPDATE)) {
        this.advance();
        this.expect(TokenType.SET);
        const set: AST.MergeClause["set"] = [];
        do {
          let col = this.parseIdentifierName();
          // Handle dot-qualified column names like t.name
          if (this.match(TokenType.DOT)) {
            col = col + "." + this.parseIdentifierName();
          }
          this.expect(TokenType.EQ);
          const val = this.parseExpression();
          set.push({ column: col, value: val });
        } while (this.match(TokenType.COMMA));
        clauses.push({ matched: true, condition: clauseCondition, action: "UPDATE", set });
      } else if (this.check(TokenType.DELETE)) {
        this.advance();
        clauses.push({ matched: true, condition: clauseCondition, action: "DELETE" });
      }
    }

    return { kind: "merge", target, targetAlias: targetAlias ?? undefined, source, condition, clauses, position: pos };
  }

  // ── TRUNCATE ───────────────────────────────────────────────────────

  private parseTruncate(): AST.TruncateStatement {
    const pos = this.advance().position;
    this.match(TokenType.TABLE);
    const table = this.parseQualifiedName();
    return { kind: "truncate", table, position: pos };
  }

  // ── CREATE ─────────────────────────────────────────────────────────

  private parseCreate(): AST.Statement {
    const pos = this.advance().position; // CREATE
    const orReplace = this.matchKeyword("OR") && this.matchKeyword("REPLACE");
    const temporary = !!this.match(TokenType.TEMPORARY);
    const transient = !!this.match(TokenType.TRANSIENT);

    if (this.match(TokenType.DATABASE)) return this.parseCreateDatabase(pos, orReplace);
    if (this.match(TokenType.SCHEMA)) return this.parseCreateSchema(pos, orReplace);
    if (this.match(TokenType.TABLE)) return this.parseCreateTable(pos, orReplace, temporary, transient);
    if (this.match(TokenType.VIEW)) return this.parseCreateView(pos, orReplace);
    if (this.match(TokenType.WAREHOUSE)) return this.parseCreateWarehouse(pos);
    if (this.match(TokenType.STAGE)) return this.parseCreateStage(pos);
    if (this.match(TokenType.SEQUENCE)) return this.parseCreateSequence(pos);

    throw this.error(`Unexpected token after CREATE: '${this.peek().value}'`);
  }

  private parseCreateDatabase(pos: TokenPosition | undefined, orReplace: boolean): AST.CreateDatabaseStatement {
    const ifNotExists = this.parseIfNotExists();
    const name = this.parseIdentifierName();
    let clone: string | undefined;
    if (this.match(TokenType.CLONE)) clone = this.parseIdentifierName();
    return { kind: "create_database", name, ifNotExists, orReplace, clone, position: pos };
  }

  private parseCreateSchema(pos: TokenPosition | undefined, orReplace: boolean): AST.CreateSchemaStatement {
    const ifNotExists = this.parseIfNotExists();
    const parts = this.parseQualifiedName();
    let database: string | undefined;
    let name: string;
    if (parts.length === 2) { database = parts[0]; name = parts[1]; }
    else { name = parts[0]; }
    let clone: string | undefined;
    if (this.match(TokenType.CLONE)) clone = this.parseIdentifierName();
    return { kind: "create_schema", database, name, ifNotExists, orReplace, clone, position: pos };
  }

  private parseCreateTable(pos: TokenPosition | undefined, orReplace: boolean, temporary: boolean, transient: boolean): AST.CreateTableStatement {
    const ifNotExists = this.parseIfNotExists();
    const name = this.parseQualifiedName();

    // CLONE
    if (this.match(TokenType.CLONE)) {
      const clone = this.parseQualifiedName();
      return { kind: "create_table", name, columns: [], ifNotExists, orReplace, clone, temporary, transient, position: pos };
    }

    // AS SELECT
    if (this.match(TokenType.AS)) {
      const asSelect = this.parseSelectFull();
      return { kind: "create_table", name, columns: [], ifNotExists, orReplace, asSelect, temporary, transient, position: pos };
    }

    // Column definitions
    this.expect(TokenType.LPAREN);
    const columns: AST.ColumnDef[] = [];
    do { columns.push(this.parseColumnDef()); } while (this.match(TokenType.COMMA));
    this.expect(TokenType.RPAREN);

    return { kind: "create_table", name, columns, ifNotExists, orReplace, temporary, transient, position: pos };
  }

  private parseColumnDef(): AST.ColumnDef {
    const name = this.parseIdentifierName();
    const type = this.parseDataType();
    let nullable: boolean | undefined;
    let defaultValue: AST.Expression | undefined;
    let primaryKey = false;
    let autoIncrement = false;

    while (!this.check(TokenType.COMMA, TokenType.RPAREN, TokenType.EOF)) {
      if (this.match(TokenType.NOT)) {
        this.expect(TokenType.NULL);
        nullable = false;
      } else if (this.match(TokenType.NULL)) {
        nullable = true;
      } else if (this.match(TokenType.DEFAULT)) {
        defaultValue = this.parseExpression();
      } else if (this.match(TokenType.PRIMARY)) {
        this.expect(TokenType.KEY);
        primaryKey = true;
      } else if (this.match(TokenType.AUTOINCREMENT) || this.match(TokenType.IDENTITY)) {
        autoIncrement = true;
      } else if (this.match(TokenType.UNIQUE)) {
        // consume but don't track
      } else if (this.match(TokenType.COMMENT)) {
        this.expect(TokenType.STRING); // consume comment string
      } else {
        break;
      }
    }

    return { name, type, nullable, defaultValue, primaryKey, autoIncrement };
  }

  private parseDataType(): string {
    const t = this.peek();
    if (TYPE_TOKENS.has(t.type)) {
      let typeName = this.advance().value.toUpperCase();
      // Handle type parameters like VARCHAR(100) or NUMBER(10, 2)
      if (this.match(TokenType.LPAREN)) {
        const params: string[] = [];
        do { params.push(this.advance().value); } while (this.match(TokenType.COMMA));
        this.expect(TokenType.RPAREN);
        typeName += `(${params.join(",")})`;
      }
      return typeName;
    }
    // Also allow IDENTIFIER for custom types
    if (this.check(TokenType.IDENTIFIER)) {
      return this.advance().value.toUpperCase();
    }
    throw this.error(`Expected data type but got '${t.value}'`);
  }

  private parseCreateView(pos: TokenPosition | undefined, orReplace: boolean): AST.CreateViewStatement {
    const name = this.parseQualifiedName();
    let columns: string[] | undefined;
    if (this.match(TokenType.LPAREN)) {
      columns = [];
      do { columns.push(this.parseIdentifierName()); } while (this.match(TokenType.COMMA));
      this.expect(TokenType.RPAREN);
    }
    this.expect(TokenType.AS);
    const query = this.parseSelectFull();
    return { kind: "create_view", name, columns, query, orReplace, position: pos };
  }

  private parseCreateWarehouse(pos: TokenPosition | undefined): AST.CreateWarehouseStatement {
    const ifNotExists = this.parseIfNotExists();
    const name = this.parseIdentifierName();
    let size: string | undefined;
    let autoSuspend: number | undefined;
    // Parse WITH or direct properties
    this.matchKeyword("WITH");
    while (this.check(TokenType.IDENTIFIER) || this.checkKeyword("WAREHOUSE_SIZE") || this.checkKeyword("AUTO_SUSPEND")) {
      const prop = this.advance().value.toUpperCase();
      this.expect(TokenType.EQ);
      if (prop === "WAREHOUSE_SIZE") {
        size = this.advance().value;
      } else if (prop === "AUTO_SUSPEND") {
        autoSuspend = parseInt(this.advance().value);
      } else {
        this.advance(); // skip unknown property value
      }
    }
    return { kind: "create_warehouse", name, size, autoSuspend, ifNotExists, position: pos };
  }

  private parseCreateStage(pos: TokenPosition | undefined): AST.CreateStageStatement {
    const ifNotExists = this.parseIfNotExists();
    const name = this.parseQualifiedName();
    return { kind: "create_stage", name, ifNotExists, position: pos };
  }

  private parseCreateSequence(pos: TokenPosition | undefined): AST.CreateSequenceStatement {
    const ifNotExists = this.parseIfNotExists();
    const name = this.parseQualifiedName();
    let start: number | undefined;
    let increment: number | undefined;
    while (!this.isAtEnd() && !this.check(TokenType.SEMICOLON)) {
      if (this.matchKeyword("START")) {
        if (!this.match(TokenType.EQ)) this.matchKeyword("WITH");
        start = parseInt(this.advance().value);
      } else if (this.matchKeyword("INCREMENT")) {
        if (!this.match(TokenType.EQ)) this.matchKeyword("BY");
        increment = parseInt(this.advance().value);
      } else break;
    }
    return { kind: "create_sequence", name, start, increment, ifNotExists, position: pos };
  }

  // ── ALTER ──────────────────────────────────────────────────────────

  private parseAlter(): AST.AlterTableStatement {
    const pos = this.advance().position; // ALTER
    this.expect(TokenType.TABLE);
    const table = this.parseQualifiedName();

    let action: AST.AlterTableStatement["action"];
    if (this.match(TokenType.ADD)) {
      this.match(TokenType.COLUMN);
      action = { type: "add_column", column: this.parseColumnDef() };
    } else if (this.match(TokenType.DROP)) {
      this.match(TokenType.COLUMN);
      action = { type: "drop_column", name: this.parseIdentifierName() };
    } else if (this.match(TokenType.RENAME)) {
      if (this.match(TokenType.COLUMN)) {
        const from = this.parseIdentifierName();
        this.matchKeyword("TO");
        const to = this.parseIdentifierName();
        action = { type: "rename_column", from, to };
      } else {
        this.matchKeyword("TO");
        action = { type: "rename_table", to: this.parseIdentifierName() };
      }
    } else {
      throw this.error(`Unexpected ALTER TABLE action: '${this.peek().value}'`);
    }

    return { kind: "alter_table", table, action, position: pos };
  }

  // ── DROP ───────────────────────────────────────────────────────────

  private parseDrop(): AST.DropStatement {
    const pos = this.advance().position; // DROP
    let objectType: AST.DropStatement["objectType"];
    const t = this.advance();
    switch (t.type) {
      case TokenType.DATABASE: objectType = "DATABASE"; break;
      case TokenType.SCHEMA: objectType = "SCHEMA"; break;
      case TokenType.TABLE: objectType = "TABLE"; break;
      case TokenType.VIEW: objectType = "VIEW"; break;
      case TokenType.WAREHOUSE: objectType = "WAREHOUSE"; break;
      case TokenType.STAGE: objectType = "STAGE"; break;
      case TokenType.SEQUENCE: objectType = "SEQUENCE"; break;
      default: throw new ParseError(`Unexpected object type '${t.value}' after DROP`, t.position);
    }
    const ifExists = this.parseIfExists();
    const name = this.parseQualifiedName();
    const cascade = this.matchKeyword("CASCADE");
    return { kind: "drop", objectType, name, ifExists, cascade, position: pos };
  }

  // ── SHOW ───────────────────────────────────────────────────────────

  private parseShow(): AST.ShowStatement {
    const pos = this.advance().position; // SHOW
    const t = this.advance();
    let objectType: AST.ShowStatement["objectType"];
    switch (t.type) {
      case TokenType.DATABASES: objectType = "DATABASES"; break;
      case TokenType.SCHEMAS: objectType = "SCHEMAS"; break;
      case TokenType.TABLES: objectType = "TABLES"; break;
      case TokenType.VIEWS: objectType = "VIEWS"; break;
      case TokenType.COLUMNS: objectType = "COLUMNS"; break;
      case TokenType.WAREHOUSES: objectType = "WAREHOUSES"; break;
      case TokenType.STAGES: objectType = "STAGES"; break;
      case TokenType.SEQUENCES: objectType = "SEQUENCES"; break;
      case TokenType.GRANTS: objectType = "GRANTS"; break;
      case TokenType.ROLES: objectType = "ROLES"; break;
      case TokenType.USERS: objectType = "USERS"; break;
      default: throw new ParseError(`Unexpected object type '${t.value}' after SHOW`, t.position);
    }

    let inAccount = false;
    let inDatabase: string | undefined;
    let inSchema: string | undefined;
    let like: string | undefined;

    if (this.match(TokenType.IN)) {
      if (this.match(TokenType.ACCOUNT)) {
        inAccount = true;
      } else if (this.match(TokenType.DATABASE)) {
        inDatabase = this.parseIdentifierName();
      } else if (this.match(TokenType.SCHEMA)) {
        const parts = this.parseQualifiedName();
        if (parts.length === 2) { inDatabase = parts[0]; inSchema = parts[1]; }
        else { inSchema = parts[0]; }
      } else {
        inDatabase = this.parseIdentifierName();
      }
    }

    if (this.match(TokenType.LIKE)) {
      like = this.expect(TokenType.STRING).value;
    }

    return { kind: "show", objectType, inAccount: inAccount || undefined, inDatabase, inSchema, like, position: pos };
  }

  // ── DESCRIBE ───────────────────────────────────────────────────────

  private parseDescribe(): AST.DescribeStatement {
    const pos = this.advance().position; // DESCRIBE or DESC
    let objectType: AST.DescribeStatement["objectType"] = "TABLE";
    if (this.match(TokenType.TABLE)) objectType = "TABLE";
    else if (this.match(TokenType.VIEW)) objectType = "VIEW";
    else if (this.match(TokenType.DATABASE)) objectType = "DATABASE";
    else if (this.match(TokenType.SCHEMA)) objectType = "SCHEMA";
    else if (this.match(TokenType.WAREHOUSE)) objectType = "WAREHOUSE";
    const name = this.parseQualifiedName();
    return { kind: "describe", objectType, name, position: pos };
  }

  // ── USE ────────────────────────────────────────────────────────────

  private parseUse(): AST.UseStatement {
    const pos = this.advance().position; // USE
    let objectType: AST.UseStatement["objectType"] = "DATABASE";
    if (this.match(TokenType.DATABASE)) objectType = "DATABASE";
    else if (this.match(TokenType.SCHEMA)) objectType = "SCHEMA";
    else if (this.match(TokenType.WAREHOUSE)) objectType = "WAREHOUSE";
    else if (this.checkKeyword("ROLE")) { this.advance(); objectType = "ROLE"; }
    const name = this.parseIdentifierName();
    return { kind: "use", objectType, name, position: pos };
  }

  // ── COPY INTO ──────────────────────────────────────────────────────

  private parseCopyInto(): AST.CopyIntoStatement {
    const pos = this.advance().position; // COPY
    this.expect(TokenType.INTO);
    const target = this.parseQualifiedName();
    this.expect(TokenType.FROM);
    // Source can be a stage reference like @stage_name
    let source = this.advance().value;
    if (source === "@") source = "@" + this.advance().value;

    const fileFormat: Record<string, string> = {};
    let pattern: string | undefined;

    while (!this.isAtEnd() && !this.check(TokenType.SEMICOLON)) {
      if (this.match(TokenType.FILE_FORMAT)) {
        this.expect(TokenType.EQ);
        this.expect(TokenType.LPAREN);
        while (!this.check(TokenType.RPAREN)) {
          const key = this.advance().value;
          this.expect(TokenType.EQ);
          const val = this.advance().value;
          fileFormat[key] = val;
          this.match(TokenType.COMMA);
        }
        this.expect(TokenType.RPAREN);
      } else if (this.match(TokenType.PATTERN)) {
        this.expect(TokenType.EQ);
        pattern = this.expect(TokenType.STRING).value;
      } else {
        break;
      }
    }

    return { kind: "copy_into", target, source, fileFormat: Object.keys(fileFormat).length > 0 ? fileFormat : undefined, pattern, position: pos };
  }

  // ── Expression parsing (operator precedence) ──────────────────────

  parseExpression(): AST.Expression {
    return this.parseOr();
  }

  private parseOr(): AST.Expression {
    let left = this.parseAnd();
    while (this.match(TokenType.OR)) {
      const right = this.parseAnd();
      left = { kind: "binary_expr", op: "OR", left, right };
    }
    return left;
  }

  private parseAnd(): AST.Expression {
    let left = this.parseNot();
    while (this.match(TokenType.AND)) {
      const right = this.parseNot();
      left = { kind: "binary_expr", op: "AND", left, right };
    }
    return left;
  }

  private parseNot(): AST.Expression {
    if (this.match(TokenType.NOT)) {
      return { kind: "unary_expr", op: "NOT", operand: this.parseNot() };
    }
    return this.parseComparison();
  }

  private parseComparison(): AST.Expression {
    const left = this.parseAddSub();

    // IS NULL / IS NOT NULL
    if (this.match(TokenType.IS)) {
      const negated = !!this.match(TokenType.NOT);
      this.expect(TokenType.NULL);
      return { kind: "is_null_expr", expr: left, negated };
    }

    // NOT IN, NOT LIKE, NOT BETWEEN, NOT ILIKE
    const negated = !!this.match(TokenType.NOT);

    // IN
    if (this.match(TokenType.IN)) {
      this.expect(TokenType.LPAREN);
      if (this.check(TokenType.SELECT) || this.check(TokenType.WITH)) {
        const subquery = this.parseSelectFull();
        this.expect(TokenType.RPAREN);
        return { kind: "in_expr", expr: left, subquery, negated };
      }
      const values: AST.Expression[] = [];
      do { values.push(this.parseExpression()); } while (this.match(TokenType.COMMA));
      this.expect(TokenType.RPAREN);
      return { kind: "in_expr", expr: left, values, negated };
    }

    // BETWEEN
    if (this.match(TokenType.BETWEEN)) {
      const low = this.parseAddSub();
      this.expect(TokenType.AND);
      const high = this.parseAddSub();
      return { kind: "between_expr", expr: left, low, high, negated };
    }

    // LIKE / ILIKE
    if (this.match(TokenType.LIKE)) {
      const pattern = this.parseAddSub();
      let escape: AST.Expression | undefined;
      if (this.match(TokenType.ESCAPE)) escape = this.parsePrimary();
      return { kind: "like_expr", expr: left, pattern, escape, caseInsensitive: false, negated };
    }
    if (this.match(TokenType.ILIKE)) {
      const pattern = this.parseAddSub();
      let escape: AST.Expression | undefined;
      if (this.match(TokenType.ESCAPE)) escape = this.parsePrimary();
      return { kind: "like_expr", expr: left, pattern, escape, caseInsensitive: true, negated };
    }

    if (negated) {
      // Dangling NOT — wrap next expression
      throw this.error("Expected IN, BETWEEN, LIKE, or ILIKE after NOT");
    }

    // Standard comparisons
    if (this.match(TokenType.EQ)) return { kind: "binary_expr", op: "=", left, right: this.parseAddSub() };
    if (this.match(TokenType.NEQ)) return { kind: "binary_expr", op: "!=", left, right: this.parseAddSub() };
    if (this.match(TokenType.LT)) return { kind: "binary_expr", op: "<", left, right: this.parseAddSub() };
    if (this.match(TokenType.GT)) return { kind: "binary_expr", op: ">", left, right: this.parseAddSub() };
    if (this.match(TokenType.LTE)) return { kind: "binary_expr", op: "<=", left, right: this.parseAddSub() };
    if (this.match(TokenType.GTE)) return { kind: "binary_expr", op: ">=", left, right: this.parseAddSub() };

    return left;
  }

  private parseAddSub(): AST.Expression {
    let left = this.parseMulDiv();
    while (this.check(TokenType.PLUS, TokenType.MINUS, TokenType.CONCAT)) {
      const opTok = this.advance();
      const op = opTok.type === TokenType.CONCAT ? "||" : opTok.value;
      const right = this.parseMulDiv();
      left = { kind: "binary_expr", op, left, right };
    }
    return left;
  }

  private parseMulDiv(): AST.Expression {
    let left = this.parseUnary();
    while (this.check(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT)) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { kind: "binary_expr", op, left, right };
    }
    return left;
  }

  private parseUnary(): AST.Expression {
    if (this.match(TokenType.MINUS)) {
      return { kind: "unary_expr", op: "-", operand: this.parseUnary() };
    }
    if (this.match(TokenType.PLUS)) {
      return this.parseUnary();
    }
    return this.parsePostfix();
  }

  private parsePostfix(): AST.Expression {
    let expr = this.parsePrimary();

    // Dot access / bracket access / :: cast (postfix)
    while (true) {
      if (this.match(TokenType.DOT)) {
        if (this.check(TokenType.STAR)) {
          this.advance();
          // table.* — extract table name from expr
          const tableName = expr.kind === "column_ref" ? expr.column : undefined;
          return { kind: "star_ref", table: tableName };
        }
        const field = this.parseIdentifierName();
        // Check if this is a column reference continuation (a.b or a.b.c)
        if (expr.kind === "column_ref" && !expr.table) {
          expr = { kind: "column_ref", table: expr.column, column: field, position: expr.position };
        } else {
          expr = { kind: "dot_access", object: expr, field };
        }
        continue;
      }
      // Bracket access ([]) is not currently tokenized; VARIANT bracket
      // notation is handled via dot_access and the evaluator.
      if (this.match(TokenType.DOUBLE_COLON)) {
        const targetType = this.parseDataType();
        expr = { kind: "cast_expr", expr, targetType };
        continue;
      }
      break;
    }

    return expr;
  }

  private parsePrimary(): AST.Expression {
    const t = this.peek();

    // Number literal
    if (this.check(TokenType.NUMBER)) {
      const tok = this.advance();
      return { kind: "number_literal", value: parseFloat(tok.value), position: tok.position };
    }

    // String literal
    if (this.check(TokenType.STRING)) {
      const tok = this.advance();
      return { kind: "string_literal", value: tok.value, position: tok.position };
    }

    // Boolean
    if (this.match(TokenType.TRUE)) return { kind: "boolean_literal", value: true, position: t.position };
    if (this.match(TokenType.FALSE)) return { kind: "boolean_literal", value: false, position: t.position };

    // NULL
    if (this.match(TokenType.NULL)) return { kind: "null_literal", position: t.position };

    // Parenthesized expression or subquery
    if (this.check(TokenType.LPAREN)) {
      if (this.isSubqueryAhead()) {
        this.advance();
        const query = this.parseSelectFull();
        this.expect(TokenType.RPAREN);
        return { kind: "subquery_expr", query };
      }
      this.advance();
      const expr = this.parseExpression();
      this.expect(TokenType.RPAREN);
      return expr;
    }

    // CASE expression
    if (this.match(TokenType.CASE)) return this.parseCaseExpr();

    // CAST / TRY_CAST
    if (this.check(TokenType.CAST) || this.check(TokenType.TRY_CAST)) {
      const tryCast = this.peek().type === TokenType.TRY_CAST;
      this.advance();
      this.expect(TokenType.LPAREN);
      const expr = this.parseExpression();
      this.expect(TokenType.AS);
      const targetType = this.parseDataType();
      this.expect(TokenType.RPAREN);
      return { kind: "cast_expr", expr, targetType, tryCast };
    }

    // EXISTS
    if (this.match(TokenType.EXISTS)) {
      this.expect(TokenType.LPAREN);
      const subquery = this.parseSelectFull();
      this.expect(TokenType.RPAREN);
      return { kind: "exists_expr", subquery };
    }

    // Star (for SELECT *)
    if (this.match(TokenType.STAR)) return { kind: "star_ref", position: t.position };

    // ARRAY_CONSTRUCT, OBJECT_CONSTRUCT — handled as function calls in evaluator

    // Function call or identifier
    if (this.isIdentifierLike()) {
      const name = this.advance();
      const nameStr = name.value.toUpperCase();

      // Function call
      if (this.check(TokenType.LPAREN)) {
        return this.parseFunctionCall(nameStr, name.position);
      }

      // Column reference
      return { kind: "column_ref", column: name.value, position: name.position };
    }

    // Date/timestamp typed literals
    if (this.check(TokenType.DATE_TYPE) || this.check(TokenType.TIMESTAMP_KW)) {
      const typeTok = this.advance();
      if (this.check(TokenType.STRING)) {
        const val = this.advance();
        return { kind: "typed_literal", type: typeTok.value.toUpperCase(), value: val.value, position: typeTok.position };
      }
      // It's being used as a keyword/type reference, not a literal
      return { kind: "column_ref", column: typeTok.value, position: typeTok.position };
    }

    // CURRENT_DATE, CURRENT_TIMESTAMP etc without parens
    if (this.check(TokenType.CURRENT)) {
      const tok = this.advance();
      return { kind: "column_ref", column: tok.value, position: tok.position };
    }

    throw this.error(`Unexpected token '${t.value}' in expression`);
  }

  private parseFunctionCall(name: string, position?: TokenPosition): AST.Expression {
    this.expect(TokenType.LPAREN);

    // COUNT(*)
    if (AGGREGATE_NAMES.has(name) && name === "COUNT" && this.check(TokenType.STAR)) {
      this.advance();
      this.expect(TokenType.RPAREN);
      const agg: AST.AggregateCall = { kind: "aggregate_call", name, arg: null, position };
      if (this.match(TokenType.OVER)) return this.parseWindowSpec(agg);
      return agg;
    }

    // Aggregate with DISTINCT
    if (AGGREGATE_NAMES.has(name)) {
      const distinct = !!this.match(TokenType.DISTINCT);
      if (this.check(TokenType.RPAREN)) {
        this.advance();
        const agg: AST.AggregateCall = { kind: "aggregate_call", name, arg: null, distinct, position };
        if (this.match(TokenType.OVER)) return this.parseWindowSpec(agg);
        return agg;
      }
      const arg = this.parseExpression();
      // Consume any additional args (for aggregate-like functions)
      while (this.match(TokenType.COMMA)) this.parseExpression();
      this.expect(TokenType.RPAREN);
      const agg: AST.AggregateCall = { kind: "aggregate_call", name, arg, distinct, position };
      if (this.match(TokenType.OVER)) return this.parseWindowSpec(agg);
      return agg;
    }

    // Regular function or window function
    const args: AST.Expression[] = [];
    let distinct = false;
    if (this.match(TokenType.DISTINCT)) distinct = true;
    if (!this.check(TokenType.RPAREN)) {
      do {
        // Handle named args (for FLATTEN etc): name => value
        args.push(this.parseExpression());
      } while (this.match(TokenType.COMMA));
    }
    this.expect(TokenType.RPAREN);

    const func: AST.FunctionCall = { kind: "function_call", name, args, distinct, position };

    // OVER clause → window function
    if (this.match(TokenType.OVER)) {
      return this.parseWindowSpec(func);
    }

    return func;
  }

  private parseWindowSpec(func: AST.FunctionCall | AST.AggregateCall): AST.WindowCall {
    this.expect(TokenType.LPAREN);
    const spec: AST.WindowSpec = { partitionBy: [], orderBy: [] };

    if (this.match(TokenType.PARTITION)) {
      this.expect(TokenType.BY);
      spec.partitionBy = this.parseExpressionList();
    }

    if (this.match(TokenType.ORDER)) {
      this.expect(TokenType.BY);
      spec.orderBy = this.parseOrderByItems();
    }

    // Window frame
    if (this.check(TokenType.ROWS, TokenType.RANGE)) {
      const frameType = this.advance().value.toUpperCase() as "ROWS" | "RANGE";
      if (this.matchKeyword("BETWEEN")) {
        const start = this.parseFrameBound();
        this.expect(TokenType.AND);
        const end = this.parseFrameBound();
        spec.frame = { type: frameType, start, end };
      } else {
        spec.frame = { type: frameType, start: this.parseFrameBound() };
      }
    }

    this.expect(TokenType.RPAREN);
    return { kind: "window_call", func, over: spec, position: func.position };
  }

  private parseFrameBound(): AST.FrameBound {
    if (this.match(TokenType.UNBOUNDED)) {
      if (this.match(TokenType.PRECEDING)) return { type: "UNBOUNDED_PRECEDING" };
      this.expect(TokenType.FOLLOWING);
      return { type: "UNBOUNDED_FOLLOWING" };
    }
    if (this.match(TokenType.CURRENT)) {
      this.expect(TokenType.ROW);
      return { type: "CURRENT_ROW" };
    }
    const value = this.parseExpression();
    if (this.match(TokenType.PRECEDING)) return { type: "PRECEDING", value };
    this.expect(TokenType.FOLLOWING);
    return { type: "FOLLOWING", value };
  }

  private parseCaseExpr(): AST.CaseExpr {
    let operand: AST.Expression | undefined;
    // Simple CASE vs Searched CASE
    if (!this.check(TokenType.WHEN)) {
      operand = this.parseExpression();
    }
    const whenClauses: AST.CaseExpr["whenClauses"] = [];
    while (this.match(TokenType.WHEN)) {
      const when = this.parseExpression();
      this.expect(TokenType.THEN);
      const then = this.parseExpression();
      whenClauses.push({ when, then });
    }
    let elseClause: AST.Expression | undefined;
    if (this.match(TokenType.ELSE)) {
      elseClause = this.parseExpression();
    }
    this.expect(TokenType.END);
    return { kind: "case_expr", operand, whenClauses, elseClause };
  }

  // ── Utilities ──────────────────────────────────────────────────────

  private parseIdentifierName(): string {
    const t = this.peek();
    if (t.type === TokenType.IDENTIFIER || t.type === TokenType.QUOTED_IDENTIFIER) {
      return this.advance().value;
    }
    // Allow keywords as identifiers in certain contexts
    if (this.isIdentifierLike()) {
      return this.advance().value;
    }
    throw this.error(`Expected identifier but got '${t.value}' (${t.type})`);
  }

  private isIdentifierLike(): boolean {
    const t = this.peek().type;
    // Many keywords can also be used as identifiers
    return t === TokenType.IDENTIFIER || t === TokenType.QUOTED_IDENTIFIER ||
           t === TokenType.NUMBER_TYPE || t === TokenType.VARCHAR_TYPE ||
           t === TokenType.BOOLEAN_TYPE || t === TokenType.DATE_TYPE ||
           t === TokenType.FLOAT_TYPE || t === TokenType.TIME_TYPE ||
           t === TokenType.TIMESTAMP_TYPE || t === TokenType.VARIANT_TYPE ||
           t === TokenType.OBJECT_TYPE || t === TokenType.ARRAY_TYPE ||
           t === TokenType.INT || t === TokenType.INTEGER ||
           t === TokenType.TEXT || t === TokenType.STRING_TYPE ||
           t === TokenType.REPLACE || t === TokenType.INPUT ||
           t === TokenType.PATH || t === TokenType.COMMENT ||
           t === TokenType.KEY || t === TokenType.COLUMN ||
           t === TokenType.FIRST || t === TokenType.LAST ||
           t === TokenType.CURRENT || t === TokenType.ROW ||
           t === TokenType.ROWS || t === TokenType.ONLY ||
           t === TokenType.NEXT || t === TokenType.STATEMENT ||
           t === TokenType.ADD || t === TokenType.SET ||
           t === TokenType.PATTERN || t === TokenType.TABLES ||
           t === TokenType.SCHEMAS || t === TokenType.DATABASES ||
           t === TokenType.COLUMNS || t === TokenType.VIEWS;
  }

  private parseQualifiedName(): string[] {
    const parts = [this.parseIdentifierName()];
    while (this.match(TokenType.DOT)) {
      parts.push(this.parseIdentifierName());
    }
    return parts;
  }

  private parseOptionalAlias(): string | undefined {
    if (this.match(TokenType.AS)) return this.parseIdentifierName();
    if (this.check(TokenType.IDENTIFIER) && !this.isClauseKeyword()) {
      return this.parseIdentifierName();
    }
    return undefined;
  }

  private parseIfNotExists(): boolean {
    if (this.match(TokenType.IF)) {
      this.expect(TokenType.NOT);
      this.expect(TokenType.EXISTS);
      return true;
    }
    return false;
  }

  private parseIfExists(): boolean {
    if (this.match(TokenType.IF)) {
      this.expect(TokenType.EXISTS);
      return true;
    }
    return false;
  }

  private parseExpressionList(): AST.Expression[] {
    const exprs: AST.Expression[] = [];
    do { exprs.push(this.parseExpression()); } while (this.match(TokenType.COMMA));
    return exprs;
  }

  private parseOrderByItems(): AST.OrderByItem[] {
    const items: AST.OrderByItem[] = [];
    do {
      const expr = this.parseExpression();
      let direction: "ASC" | "DESC" = "ASC";
      if (this.match(TokenType.ASC)) direction = "ASC";
      else if (this.match(TokenType.DESC)) direction = "DESC";
      let nulls: "FIRST" | "LAST" | undefined;
      if (this.match(TokenType.NULLS)) {
        if (this.match(TokenType.FIRST)) nulls = "FIRST";
        else { this.expect(TokenType.LAST); nulls = "LAST"; }
      }
      items.push({ expr, direction, nulls });
    } while (this.match(TokenType.COMMA));
    return items;
  }
}
