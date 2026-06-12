import { Expression, OrderByItem, SelectStatement } from "../parser/ast";

export type LogicalPlan =
  | ScanNode
  | DerivedNode
  | FilterNode
  | ProjectNode
  | JoinNode
  | AggregateNode
  | SortNode
  | LimitNode
  | DistinctNode
  | UnionNode
  | ValuesNode
  | FlattenNode
  | EmptyNode;

export interface ScanNode {
  kind: "scan";
  database: string;
  schema: string;
  table: string;
  alias?: string;
}

/**
 * A derived table (subquery in FROM) or CTE reference. The inner query is
 * executed as a complete SELECT — its projections, window functions, ORDER
 * BY, and LIMIT all run — and its output columns become the row columns the
 * outer query sees.
 */
export interface DerivedNode {
  kind: "derived";
  query: SelectStatement;
  alias?: string;
}

export interface FilterNode {
  kind: "filter";
  source: LogicalPlan;
  condition: Expression;
}

export interface ProjectNode {
  kind: "project";
  source: LogicalPlan;
  expressions: { expr: Expression; alias?: string }[];
}

export interface JoinNode {
  kind: "join";
  joinType: "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS" | "NATURAL";
  left: LogicalPlan;
  right: LogicalPlan;
  condition?: Expression;
}

export interface AggregateNode {
  kind: "aggregate";
  source: LogicalPlan;
  groupBy: Expression[];
  having?: Expression;
}

export interface SortNode {
  kind: "sort";
  source: LogicalPlan;
  orderBy: OrderByItem[];
}

export interface LimitNode {
  kind: "limit";
  source: LogicalPlan;
  count?: Expression;
  offset?: Expression;
}

export interface DistinctNode {
  kind: "distinct";
  source: LogicalPlan;
}

export interface UnionNode {
  kind: "union";
  type: "UNION" | "UNION ALL" | "INTERSECT" | "EXCEPT";
  left: LogicalPlan;
  right: LogicalPlan;
}

export interface ValuesNode {
  kind: "values";
  rows: Expression[][];
}

export interface FlattenNode {
  kind: "flatten";
  source: LogicalPlan;
  input: Expression;
  path?: string;
  outer?: boolean;
  alias?: string;
}

export interface EmptyNode {
  kind: "empty";
}
