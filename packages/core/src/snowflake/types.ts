// ── Data types ───────────────────────────────────────────────────────

export type DataType =
  | "NUMBER"
  | "FLOAT"
  | "VARCHAR"
  | "BOOLEAN"
  | "DATE"
  | "TIMESTAMP"
  | "TIME"
  | "VARIANT"
  | "OBJECT"
  | "ARRAY";

/** Runtime value — mirrors Snowflake's type system */
export type Value =
  | string
  | number
  | boolean
  | null
  | Date
  | Value[]
  | { [key: string]: Value };

// ── Column / Row ─────────────────────────────────────────────────────

export interface Column {
  name: string;
  type: DataType;
  nullable: boolean;
  defaultValue?: Value;
  primaryKey?: boolean;
  autoIncrement?: boolean;
}

export interface Row {
  [columnName: string]: Value;
}

// ── Table / View / Sequence / Stage ──────────────────────────────────

export interface Table {
  name: string;
  columns: Column[];
  rows: Row[];
  createdAt: Date;
  cloneSource?: string;
}

export interface ViewDef {
  name: string;
  columns: Column[];
  query: string; // raw SQL stored for display; executed via parser
}

export interface Sequence {
  name: string;
  current: number;
  increment: number;
}

export interface Stage {
  name: string;
  files: Record<string, string>; // filename → content
}

// ── Schema / Database / Warehouse ────────────────────────────────────

export interface Schema {
  name: string;
  tables: Record<string, Table>;
  views: Record<string, ViewDef>;
  sequences: Record<string, Sequence>;
  stages: Record<string, Stage>;
}

export interface Database {
  name: string;
  schemas: Record<string, Schema>;
}

export interface Warehouse {
  name: string;
  size: string;
  state: "STARTED" | "SUSPENDED";
  autoSuspend: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

export function createSchema(name: string): Schema {
  return { name, tables: {}, views: {}, sequences: {}, stages: {} };
}

export function createDatabase(name: string): Database {
  return {
    name,
    schemas: {
      PUBLIC: createSchema("PUBLIC"),
      INFORMATION_SCHEMA: createSchema("INFORMATION_SCHEMA"),
    },
  };
}

export function createTable(name: string, columns: Column[]): Table {
  return { name, columns, rows: [], createdAt: new Date("2026-02-03") };
}
