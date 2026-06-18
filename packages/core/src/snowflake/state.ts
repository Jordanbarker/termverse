import {
  Database,
  Schema,
  Table,
  Column,
  Row,
  Warehouse,
  Value,
  ViewDef,
  Sequence,
  Stage,
  createSchema,
  createDatabase as createDbObj,
  createTable as createTblObj,
} from "./types";

export interface SnowflakeData {
  databases: Record<string, Database>;
  warehouses: Record<string, Warehouse>;
}

/**
 * Immutable Snowflake state. Every mutation returns a new instance.
 * Mirrors the VirtualFS pattern.
 */
export class SnowflakeState {
  constructor(public readonly data: SnowflakeData) {}

  // ── Lookups ──────────────────────────────────────────────────────────

  getDatabase(name: string): Database | undefined {
    return this.data.databases[name.toUpperCase()];
  }

  getSchema(db: string, schema: string): Schema | undefined {
    return this.getDatabase(db)?.schemas[schema.toUpperCase()];
  }

  getTable(db: string, schema: string, table: string): Table | undefined {
    return this.getSchema(db, schema)?.tables[table.toUpperCase()];
  }

  getView(db: string, schema: string, view: string): ViewDef | undefined {
    return this.getSchema(db, schema)?.views[view.toUpperCase()];
  }

  getWarehouse(name: string): Warehouse | undefined {
    return this.data.warehouses[name.toUpperCase()];
  }

  listDatabases(): string[] {
    return Object.keys(this.data.databases);
  }

  listSchemas(db: string): string[] {
    const d = this.getDatabase(db);
    return d ? Object.keys(d.schemas) : [];
  }

  listTables(db: string, schema: string): Table[] {
    const s = this.getSchema(db, schema);
    return s ? Object.values(s.tables) : [];
  }

  listViews(db: string, schema: string): ViewDef[] {
    const s = this.getSchema(db, schema);
    return s ? Object.values(s.views) : [];
  }

  listWarehouses(): Warehouse[] {
    return Object.values(this.data.warehouses);
  }

  /**
   * Resolve a possibly-qualified table name: TABLE, SCHEMA.TABLE, or DB.SCHEMA.TABLE
   */
  resolveTable(
    name: string | string[],
    currentDb: string,
    currentSchema: string
  ): Table | undefined {
    const parts = Array.isArray(name) ? name : name.split(".");
    if (parts.length === 1)
      return this.getTable(currentDb, currentSchema, parts[0]);
    if (parts.length === 2) return this.getTable(currentDb, parts[0], parts[1]);
    if (parts.length === 3)
      return this.getTable(parts[0], parts[1], parts[2]);
    return undefined;
  }

  /**
   * Same as resolveTable but for views.
   */
  resolveView(
    name: string | string[],
    currentDb: string,
    currentSchema: string
  ): ViewDef | undefined {
    const parts = Array.isArray(name) ? name : name.split(".");
    if (parts.length === 1)
      return this.getView(currentDb, currentSchema, parts[0]);
    if (parts.length === 2) return this.getView(currentDb, parts[0], parts[1]);
    if (parts.length === 3)
      return this.getView(parts[0], parts[1], parts[2]);
    return undefined;
  }

  // ── Database mutations ───────────────────────────────────────────────

  createDatabase(name: string): SnowflakeState {
    const key = name.toUpperCase();
    return this.withDatabases({
      ...this.data.databases,
      [key]: createDbObj(key),
    });
  }

  dropDatabase(name: string): SnowflakeState {
    const key = name.toUpperCase();
    const dbs = { ...this.data.databases };
    delete dbs[key];
    return this.withDatabases(dbs);
  }

  // ── Schema mutations ─────────────────────────────────────────────────

  createSchema(db: string, name: string): SnowflakeState {
    const dbKey = db.toUpperCase();
    const schKey = name.toUpperCase();
    const database = this.data.databases[dbKey];
    if (!database) return this;
    return this.withDatabase(dbKey, {
      ...database,
      schemas: { ...database.schemas, [schKey]: createSchema(schKey) },
    });
  }

  dropSchema(db: string, name: string): SnowflakeState {
    const dbKey = db.toUpperCase();
    const schKey = name.toUpperCase();
    const database = this.data.databases[dbKey];
    if (!database) return this;
    const schemas = { ...database.schemas };
    delete schemas[schKey];
    return this.withDatabase(dbKey, { ...database, schemas });
  }

  // ── Table mutations ──────────────────────────────────────────────────

  createTable(db: string, schema: string, name: string, columns: Column[]): SnowflakeState {
    const tblKey = name.toUpperCase();
    return this.updateSchema(db, schema, (s) => ({
      ...s,
      tables: { ...s.tables, [tblKey]: createTblObj(tblKey, columns) },
    }));
  }

  dropTable(db: string, schema: string, name: string): SnowflakeState {
    return this.updateSchema(db, schema, (s) => {
      const tables = { ...s.tables };
      delete tables[name.toUpperCase()];
      return { ...s, tables };
    });
  }

  insertRows(db: string, schema: string, table: string, rows: Row[]): SnowflakeState {
    return this.updateTable(db, schema, table, (t) => ({
      ...t,
      rows: [...t.rows, ...rows],
    }));
  }

  updateRows(
    db: string,
    schema: string,
    table: string,
    predicate: (row: Row) => boolean,
    updates: Record<string, Value>
  ): SnowflakeState {
    return this.updateTable(db, schema, table, (t) => ({
      ...t,
      rows: t.rows.map((r) => (predicate(r) ? { ...r, ...updates } : r)),
    }));
  }

  deleteRows(
    db: string,
    schema: string,
    table: string,
    predicate: (row: Row) => boolean
  ): SnowflakeState {
    return this.updateTable(db, schema, table, (t) => ({
      ...t,
      rows: t.rows.filter((r) => !predicate(r)),
    }));
  }

  truncateTable(db: string, schema: string, table: string): SnowflakeState {
    return this.updateTable(db, schema, table, (t) => ({ ...t, rows: [] }));
  }

  cloneTable(
    srcDb: string,
    srcSchema: string,
    srcTable: string,
    dstDb: string,
    dstSchema: string,
    dstTable: string
  ): SnowflakeState {
    const src = this.getTable(srcDb, srcSchema, srcTable);
    if (!src) return this;
    const dstKey = dstTable.toUpperCase();
    const cloned: Table = {
      ...src,
      name: dstKey,
      rows: src.rows.map((r) => ({ ...r })),
      createdAt: new Date(),
      cloneSource: `${srcDb}.${srcSchema}.${srcTable}`.toUpperCase(),
    };
    return this.updateSchema(dstDb, dstSchema, (s) => ({
      ...s,
      tables: { ...s.tables, [dstKey]: cloned },
    }));
  }

  alterTableAddColumn(db: string, schema: string, table: string, column: Column): SnowflakeState {
    return this.updateTable(db, schema, table, (t) => ({
      ...t,
      columns: [...t.columns, column],
      rows: t.rows.map((r) => ({ ...r, [column.name]: column.defaultValue ?? null })),
    }));
  }

  alterTableDropColumn(db: string, schema: string, table: string, columnName: string): SnowflakeState {
    const colKey = columnName.toUpperCase();
    return this.updateTable(db, schema, table, (t) => ({
      ...t,
      columns: t.columns.filter((c) => c.name.toUpperCase() !== colKey),
      rows: t.rows.map((r) => {
        const newRow = { ...r };
        delete newRow[colKey];
        // Also try original casing
        for (const k of Object.keys(newRow)) {
          if (k.toUpperCase() === colKey) delete newRow[k];
        }
        return newRow;
      }),
    }));
  }

  // ── View mutations ───────────────────────────────────────────────────

  createView(db: string, schema: string, view: ViewDef): SnowflakeState {
    const key = view.name.toUpperCase();
    return this.updateSchema(db, schema, (s) => ({
      ...s,
      views: { ...s.views, [key]: { ...view, name: key } },
    }));
  }

  dropView(db: string, schema: string, name: string): SnowflakeState {
    return this.updateSchema(db, schema, (s) => {
      const views = { ...s.views };
      delete views[name.toUpperCase()];
      return { ...s, views };
    });
  }

  // ── Sequence mutations ───────────────────────────────────────────────

  createSequence(db: string, schema: string, seq: Sequence): SnowflakeState {
    const key = seq.name.toUpperCase();
    return this.updateSchema(db, schema, (s) => ({
      ...s,
      sequences: { ...s.sequences, [key]: { ...seq, name: key } },
    }));
  }

  nextVal(db: string, schema: string, seqName: string): { value: number; state: SnowflakeState } {
    const s = this.getSchema(db, schema);
    const seq = s?.sequences[seqName.toUpperCase()];
    if (!seq) return { value: 0, state: this };
    const value = seq.current;
    const newState = this.updateSchema(db, schema, (sc) => ({
      ...sc,
      sequences: {
        ...sc.sequences,
        [seqName.toUpperCase()]: { ...seq, current: seq.current + seq.increment },
      },
    }));
    return { value, state: newState };
  }

  // ── Stage mutations ──────────────────────────────────────────────────

  createStage(db: string, schema: string, stage: Stage): SnowflakeState {
    const key = stage.name.toUpperCase();
    return this.updateSchema(db, schema, (s) => ({
      ...s,
      stages: { ...s.stages, [key]: { ...stage, name: key } },
    }));
  }

  putFile(db: string, schema: string, stageName: string, fileName: string, content: string): SnowflakeState {
    return this.updateSchema(db, schema, (s) => {
      const stage = s.stages[stageName.toUpperCase()];
      if (!stage) return s;
      return {
        ...s,
        stages: {
          ...s.stages,
          [stageName.toUpperCase()]: {
            ...stage,
            files: { ...stage.files, [fileName]: content },
          },
        },
      };
    });
  }

  // ── Warehouse mutations ──────────────────────────────────────────────

  createWarehouse(wh: Warehouse): SnowflakeState {
    const key = wh.name.toUpperCase();
    return new SnowflakeState({
      ...this.data,
      warehouses: { ...this.data.warehouses, [key]: { ...wh, name: key } },
    });
  }

  dropWarehouse(name: string): SnowflakeState {
    const whs = { ...this.data.warehouses };
    delete whs[name.toUpperCase()];
    return new SnowflakeState({ ...this.data, warehouses: whs });
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  private withDatabases(databases: Record<string, Database>): SnowflakeState {
    return new SnowflakeState({ ...this.data, databases });
  }

  private withDatabase(name: string, db: Database): SnowflakeState {
    return this.withDatabases({ ...this.data.databases, [name]: db });
  }

  private updateSchema(
    db: string,
    schema: string,
    fn: (s: Schema) => Schema
  ): SnowflakeState {
    const dbKey = db.toUpperCase();
    const schKey = schema.toUpperCase();
    const database = this.data.databases[dbKey];
    if (!database) return this;
    const s = database.schemas[schKey];
    if (!s) return this;
    return this.withDatabase(dbKey, {
      ...database,
      schemas: { ...database.schemas, [schKey]: fn(s) },
    });
  }

  private updateTable(
    db: string,
    schema: string,
    table: string,
    fn: (t: Table) => Table
  ): SnowflakeState {
    const tblKey = table.toUpperCase();
    return this.updateSchema(db, schema, (s) => {
      const t = s.tables[tblKey];
      if (!t) return s;
      return { ...s, tables: { ...s.tables, [tblKey]: fn(t) } };
    });
  }
}
