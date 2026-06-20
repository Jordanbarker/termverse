import { TokenPosition } from "../lexer/tokens";

// ── Expressions ──────────────────────────────────────────────────────

export type Expression =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | NullLiteral
  | ColumnRef
  | StarRef
  | BinaryExpr
  | UnaryExpr
  | FunctionCall
  | AggregateCall
  | WindowCall
  | CaseExpr
  | CastExpr
  | InExpr
  | BetweenExpr
  | LikeExpr
  | IsNullExpr
  | ExistsExpr
  | SubqueryExpr
  | ArrayConstructExpr
  | ObjectConstructExpr
  | DotAccessExpr
  | BracketAccessExpr
  | IntervalExpr
  | TypedLiteral;

export interface NumberLiteral {
  kind: "number_literal";
  value: number;
  position?: TokenPosition;
}

export interface StringLiteral {
  kind: "string_literal";
  value: string;
  position?: TokenPosition;
}

export interface BooleanLiteral {
  kind: "boolean_literal";
  value: boolean;
  position?: TokenPosition;
}

export interface NullLiteral {
  kind: "null_literal";
  position?: TokenPosition;
}

export interface ColumnRef {
  kind: "column_ref";
  table?: string;
  column: string;
  position?: TokenPosition;
}

export interface StarRef {
  kind: "star_ref";
  table?: string;
  position?: TokenPosition;
}

export interface BinaryExpr {
  kind: "binary_expr";
  op: string; // +, -, *, /, %, ||, =, !=, <, >, <=, >=, AND, OR
  left: Expression;
  right: Expression;
  position?: TokenPosition;
}

export interface UnaryExpr {
  kind: "unary_expr";
  op: string; // -, NOT
  operand: Expression;
  position?: TokenPosition;
}

export interface FunctionCall {
  kind: "function_call";
  name: string;
  args: Expression[];
  distinct?: boolean;
  position?: TokenPosition;
}

export interface AggregateCall {
  kind: "aggregate_call";
  name: string; // COUNT, SUM, AVG, MIN, MAX
  arg: Expression | null; // null for COUNT(*)
  distinct?: boolean;
  position?: TokenPosition;
}

export interface WindowSpec {
  partitionBy: Expression[];
  orderBy: OrderByItem[];
  frame?: WindowFrame;
}

export interface WindowFrame {
  type: "ROWS" | "RANGE";
  start: FrameBound;
  end?: FrameBound;
}

export interface FrameBound {
  type: "UNBOUNDED_PRECEDING" | "UNBOUNDED_FOLLOWING" | "CURRENT_ROW" | "PRECEDING" | "FOLLOWING";
  value?: Expression;
}

export interface WindowCall {
  kind: "window_call";
  func: FunctionCall | AggregateCall;
  over: WindowSpec;
  position?: TokenPosition;
}

export interface CaseExpr {
  kind: "case_expr";
  operand?: Expression; // simple CASE: CASE x WHEN ...
  whenClauses: { when: Expression; then: Expression }[];
  elseClause?: Expression;
  position?: TokenPosition;
}

export interface CastExpr {
  kind: "cast_expr";
  expr: Expression;
  targetType: string;
  tryCast?: boolean;
  position?: TokenPosition;
}

export interface InExpr {
  kind: "in_expr";
  expr: Expression;
  values?: Expression[]; // IN (1, 2, 3)
  subquery?: SelectStatement; // IN (SELECT ...)
  negated: boolean;
  position?: TokenPosition;
}

export interface BetweenExpr {
  kind: "between_expr";
  expr: Expression;
  low: Expression;
  high: Expression;
  negated: boolean;
  position?: TokenPosition;
}

export interface LikeExpr {
  kind: "like_expr";
  expr: Expression;
  pattern: Expression;
  escape?: Expression;
  caseInsensitive: boolean; // ILIKE
  negated: boolean;
  position?: TokenPosition;
}

export interface IsNullExpr {
  kind: "is_null_expr";
  expr: Expression;
  negated: boolean;
  position?: TokenPosition;
}

export interface ExistsExpr {
  kind: "exists_expr";
  subquery: SelectStatement;
  position?: TokenPosition;
}

export interface SubqueryExpr {
  kind: "subquery_expr";
  query: SelectStatement;
  position?: TokenPosition;
}

export interface ArrayConstructExpr {
  kind: "array_construct";
  elements: Expression[];
  position?: TokenPosition;
}

export interface ObjectConstructExpr {
  kind: "object_construct";
  pairs: { key: Expression; value: Expression }[];
  position?: TokenPosition;
}

export interface DotAccessExpr {
  kind: "dot_access";
  object: Expression;
  field: string;
  position?: TokenPosition;
}

export interface BracketAccessExpr {
  kind: "bracket_access";
  object: Expression;
  index: Expression;
  position?: TokenPosition;
}

export interface IntervalExpr {
  kind: "interval_expr";
  value: Expression;
  unit: string;
  position?: TokenPosition;
}

export interface TypedLiteral {
  kind: "typed_literal";
  type: string;
  value: string;
  position?: TokenPosition;
}

// ── Table references ─────────────────────────────────────────────────

export type TableRef =
  | TableName
  | SubqueryTable
  | FlattenTable
  | JoinedTable;

export interface TableName {
  kind: "table_name";
  name: string[];  // [db, schema, table] or [schema, table] or [table]
  alias?: string;
  atTimestamp?: Expression; // Time Travel
  position?: TokenPosition;
}

export interface SubqueryTable {
  kind: "subquery_table";
  query: SelectStatement;
  alias: string;
  position?: TokenPosition;
}

export interface FlattenTable {
  kind: "flatten_table";
  input: Expression;
  path?: string;
  outer?: boolean;
  recursive?: boolean;
  alias?: string;
  position?: TokenPosition;
}

export interface JoinedTable {
  kind: "joined_table";
  left: TableRef;
  joinType: "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS" | "NATURAL";
  right: TableRef;
  condition?: Expression;
  position?: TokenPosition;
}

// ── Select items ─────────────────────────────────────────────────────

export interface SelectItem {
  expr: Expression;
  alias?: string;
}

export interface OrderByItem {
  expr: Expression;
  direction: "ASC" | "DESC";
  nulls?: "FIRST" | "LAST";
}

// ── Statements ───────────────────────────────────────────────────────

export type Statement =
  | SelectStatement
  | InsertStatement
  | UpdateStatement
  | DeleteStatement
  | MergeStatement
  | TruncateStatement
  | CreateDatabaseStatement
  | CreateSchemaStatement
  | CreateTableStatement
  | CreateViewStatement
  | CreateWarehouseStatement
  | CreateStageStatement
  | CreateSequenceStatement
  | AlterTableStatement
  | DropStatement
  | ShowStatement
  | DescribeStatement
  | UseStatement
  | CopyIntoStatement
  | SetCompound;

export interface SelectStatement {
  kind: "select";
  distinct?: boolean;
  top?: number;
  items: SelectItem[];
  from?: TableRef;
  where?: Expression;
  groupBy?: Expression[];
  having?: Expression;
  qualify?: Expression;
  orderBy?: OrderByItem[];
  limit?: Expression;
  offset?: Expression;
  setOp?: { type: "UNION" | "UNION ALL" | "INTERSECT" | "EXCEPT"; right: SelectStatement };
  ctes?: CTE[];
  position?: TokenPosition;
}

export interface CTE {
  name: string;
  columns?: string[];
  query: SelectStatement;
}

export interface InsertStatement {
  kind: "insert";
  table: string[];
  columns?: string[];
  values?: Expression[][];
  select?: SelectStatement;
  position?: TokenPosition;
}

export interface UpdateStatement {
  kind: "update";
  table: string[];
  alias?: string;
  set: { column: string; value: Expression }[];
  where?: Expression;
  position?: TokenPosition;
}

export interface DeleteStatement {
  kind: "delete";
  table: string[];
  alias?: string;
  where?: Expression;
  position?: TokenPosition;
}

export interface MergeClause {
  matched: boolean;
  condition?: Expression;
  action: "UPDATE" | "INSERT" | "DELETE";
  set?: { column: string; value: Expression }[];
  columns?: string[];
  values?: Expression[];
}

export interface MergeStatement {
  kind: "merge";
  target: string[];
  targetAlias?: string;
  source: TableRef;
  condition: Expression;
  clauses: MergeClause[];
  position?: TokenPosition;
}

export interface TruncateStatement {
  kind: "truncate";
  table: string[];
  position?: TokenPosition;
}

export interface CreateDatabaseStatement {
  kind: "create_database";
  name: string;
  ifNotExists?: boolean;
  orReplace?: boolean;
  clone?: string;
  position?: TokenPosition;
}

export interface CreateSchemaStatement {
  kind: "create_schema";
  database?: string;
  name: string;
  ifNotExists?: boolean;
  orReplace?: boolean;
  clone?: string;
  position?: TokenPosition;
}

export interface ColumnDef {
  name: string;
  type: string;
  nullable?: boolean;
  defaultValue?: Expression;
  primaryKey?: boolean;
  autoIncrement?: boolean;
}

export interface CreateTableStatement {
  kind: "create_table";
  name: string[];
  columns: ColumnDef[];
  ifNotExists?: boolean;
  orReplace?: boolean;
  clone?: string[];
  asSelect?: SelectStatement;
  temporary?: boolean;
  transient?: boolean;
  position?: TokenPosition;
}

export interface CreateViewStatement {
  kind: "create_view";
  name: string[];
  columns?: string[];
  query: SelectStatement;
  orReplace?: boolean;
  position?: TokenPosition;
}

export interface CreateWarehouseStatement {
  kind: "create_warehouse";
  name: string;
  size?: string;
  autoSuspend?: number;
  ifNotExists?: boolean;
  position?: TokenPosition;
}

export interface CreateStageStatement {
  kind: "create_stage";
  name: string[];
  ifNotExists?: boolean;
  position?: TokenPosition;
}

export interface CreateSequenceStatement {
  kind: "create_sequence";
  name: string[];
  start?: number;
  increment?: number;
  ifNotExists?: boolean;
  position?: TokenPosition;
}

export interface AlterTableStatement {
  kind: "alter_table";
  table: string[];
  action:
    | { type: "add_column"; column: ColumnDef }
    | { type: "drop_column"; name: string }
    | { type: "rename_column"; from: string; to: string }
    | { type: "rename_table"; to: string };
  position?: TokenPosition;
}

export interface DropStatement {
  kind: "drop";
  objectType: "DATABASE" | "SCHEMA" | "TABLE" | "VIEW" | "WAREHOUSE" | "STAGE" | "SEQUENCE";
  name: string[];
  ifExists?: boolean;
  cascade?: boolean;
  position?: TokenPosition;
}

export interface ShowStatement {
  kind: "show";
  objectType: "DATABASES" | "SCHEMAS" | "TABLES" | "VIEWS" | "COLUMNS" | "WAREHOUSES" | "STAGES" | "SEQUENCES" | "GRANTS" | "ROLES" | "USERS";
  inAccount?: boolean;
  inDatabase?: string;
  inSchema?: string;
  like?: string;
  position?: TokenPosition;
}

export interface DescribeStatement {
  kind: "describe";
  objectType: "TABLE" | "VIEW" | "DATABASE" | "SCHEMA" | "WAREHOUSE";
  name: string[];
  position?: TokenPosition;
}

export interface UseStatement {
  kind: "use";
  objectType: "DATABASE" | "SCHEMA" | "WAREHOUSE" | "ROLE";
  name: string;
  position?: TokenPosition;
}

export interface CopyIntoStatement {
  kind: "copy_into";
  target: string[];
  source: string;
  fileFormat?: Record<string, string>;
  pattern?: string;
  position?: TokenPosition;
}

export interface SetCompound {
  kind: "set_compound";
  statements: Statement[];
  position?: TokenPosition;
}
