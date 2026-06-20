import { SnowflakeState, SnowflakeData } from "./state";
import { Value, Row, Table, Column, Schema, Database, Warehouse, ViewDef, Sequence, Stage } from "./types";

// ── Serialize ────────────────────────────────────────────────────────

interface SerializedTable {
  name: string;
  columns: Column[];
  rows: Row[];
  createdAt: string;
  cloneSource?: string;
}

interface SerializedSchema {
  name: string;
  tables: Record<string, SerializedTable>;
  views: Record<string, ViewDef>;
  sequences: Record<string, Sequence>;
  stages: Record<string, Stage>;
}

interface SerializedDatabase {
  name: string;
  schemas: Record<string, SerializedSchema>;
}

export interface SerializedSnowflake {
  databases: Record<string, SerializedDatabase>;
  warehouses: Record<string, Warehouse>;
}

export function serializeSnowflake(state: SnowflakeState): SerializedSnowflake {
  const databases: Record<string, SerializedDatabase> = {};
  for (const [dbName, db] of Object.entries(state.data.databases)) {
    const schemas: Record<string, SerializedSchema> = {};
    for (const [schName, sch] of Object.entries(db.schemas)) {
      const tables: Record<string, SerializedTable> = {};
      for (const [tblName, tbl] of Object.entries(sch.tables)) {
        tables[tblName] = {
          name: tbl.name,
          columns: tbl.columns,
          rows: tbl.rows.map((r) => serializeRow(r)),
          createdAt: tbl.createdAt.toISOString(),
          cloneSource: tbl.cloneSource,
        };
      }
      schemas[schName] = {
        name: sch.name,
        tables,
        views: sch.views,
        sequences: sch.sequences,
        stages: sch.stages,
      };
    }
    databases[dbName] = { name: db.name, schemas };
  }
  return { databases, warehouses: state.data.warehouses };
}

export function deserializeSnowflake(data: SerializedSnowflake): SnowflakeState {
  const databases: Record<string, Database> = {};
  for (const [dbName, sdb] of Object.entries(data.databases)) {
    const schemas: Record<string, Schema> = {};
    for (const [schName, ssch] of Object.entries(sdb.schemas)) {
      const tables: Record<string, Table> = {};
      for (const [tblName, stbl] of Object.entries(ssch.tables)) {
        tables[tblName] = {
          name: stbl.name,
          columns: stbl.columns,
          rows: stbl.rows.map((r) => deserializeRow(r)),
          createdAt: new Date(stbl.createdAt),
          cloneSource: stbl.cloneSource,
        };
      }
      schemas[schName] = {
        name: ssch.name,
        tables,
        views: ssch.views ?? {},
        sequences: ssch.sequences ?? {},
        stages: ssch.stages ?? {},
      };
    }
    databases[dbName] = { name: sdb.name, schemas };
  }
  const snowData: SnowflakeData = {
    databases,
    warehouses: data.warehouses,
  };
  return new SnowflakeState(snowData);
}

function serializeRow(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = serializeValue(v);
  }
  return out;
}

function serializeValue(v: Value): Value {
  if (v instanceof Date) return { __type: "date", value: v.toISOString() } as unknown as Value;
  if (Array.isArray(v)) return v.map(serializeValue);
  if (v !== null && typeof v === "object") {
    const out: Record<string, Value> = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = serializeValue(val as Value);
    }
    return out;
  }
  return v;
}

function deserializeRow(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = deserializeValue(v);
  }
  return out;
}

function deserializeValue(v: Value): Value {
  if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
    const obj = v as Record<string, Value>;
    if (obj.__type === "date" && typeof obj.value === "string") {
      return new Date(obj.value as string);
    }
    const out: Record<string, Value> = {};
    for (const [k, val] of Object.entries(obj)) {
      out[k] = deserializeValue(val);
    }
    return out;
  }
  if (Array.isArray(v)) return v.map(deserializeValue);
  return v;
}
