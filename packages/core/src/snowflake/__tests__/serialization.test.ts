import { describe, it, expect } from "vitest";
import { serializeSnowflake, deserializeSnowflake } from "../serialization";
import { SnowflakeState } from "../state";
import { Column } from "../types";

function createTestState(): SnowflakeState {
  const cols: Column[] = [
    { name: "ID", type: "NUMBER", nullable: false },
    { name: "NAME", type: "VARCHAR", nullable: true },
    { name: "CREATED", type: "TIMESTAMP", nullable: true },
  ];

  return new SnowflakeState({ databases: {}, warehouses: {} })
    .createDatabase("TESTDB")
    .createTable("TESTDB", "PUBLIC", "USERS", cols)
    .insertRows("TESTDB", "PUBLIC", "USERS", [
      { ID: 1, NAME: "Alice", CREATED: new Date("2024-01-15T10:00:00Z") },
      { ID: 2, NAME: "Bob", CREATED: new Date("2024-02-20T14:30:00Z") },
    ])
    .createWarehouse({
      name: "COMPUTE_WH",
      size: "X-SMALL",
      state: "STARTED",
      autoSuspend: 300,
    });
}

describe("Snowflake serialization", () => {
  it("round-trips state through serialize/deserialize", () => {
    const original = createTestState();
    const serialized = serializeSnowflake(original);
    const restored = deserializeSnowflake(serialized);

    expect(restored.listDatabases()).toEqual(original.listDatabases());
    expect(restored.listSchemas("TESTDB")).toEqual(
      original.listSchemas("TESTDB")
    );

    const table = restored.getTable("TESTDB", "PUBLIC", "USERS")!;
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].ID).toBe(1);
    expect(table.rows[0].NAME).toBe("Alice");
    expect(table.rows[1].NAME).toBe("Bob");
  });

  it("preserves Date objects through round-trip", () => {
    const original = createTestState();
    const serialized = serializeSnowflake(original);
    const restored = deserializeSnowflake(serialized);

    const table = restored.getTable("TESTDB", "PUBLIC", "USERS")!;
    expect(table.rows[0].CREATED).toBeInstanceOf(Date);
    expect((table.rows[0].CREATED as Date).toISOString()).toBe(
      "2024-01-15T10:00:00.000Z"
    );
  });

  it("preserves table createdAt as Date", () => {
    const original = createTestState();
    const serialized = serializeSnowflake(original);
    const restored = deserializeSnowflake(serialized);

    const table = restored.getTable("TESTDB", "PUBLIC", "USERS")!;
    expect(table.createdAt).toBeInstanceOf(Date);
  });

  it("preserves warehouses", () => {
    const original = createTestState();
    const serialized = serializeSnowflake(original);
    const restored = deserializeSnowflake(serialized);

    const wh = restored.getWarehouse("COMPUTE_WH");
    expect(wh).toBeDefined();
    expect(wh!.size).toBe("X-SMALL");
    expect(wh!.state).toBe("STARTED");
  });

  it("handles empty databases", () => {
    const state = new SnowflakeState({ databases: {}, warehouses: {} })
      .createDatabase("EMPTY");
    const serialized = serializeSnowflake(state);
    const restored = deserializeSnowflake(serialized);

    expect(restored.getDatabase("EMPTY")).toBeDefined();
    expect(restored.listTables("EMPTY", "PUBLIC")).toEqual([]);
  });

  it("handles null values in rows", () => {
    const cols: Column[] = [
      { name: "ID", type: "NUMBER", nullable: false },
      { name: "VAL", type: "VARCHAR", nullable: true },
    ];
    const state = new SnowflakeState({ databases: {}, warehouses: {} })
      .createDatabase("DB")
      .createTable("DB", "PUBLIC", "T", cols)
      .insertRows("DB", "PUBLIC", "T", [{ ID: 1, VAL: null }]);

    const serialized = serializeSnowflake(state);
    const restored = deserializeSnowflake(serialized);
    const table = restored.getTable("DB", "PUBLIC", "T")!;
    expect(table.rows[0].VAL).toBeNull();
  });

  it("handles nested object values (VARIANT type)", () => {
    const cols: Column[] = [
      { name: "ID", type: "NUMBER", nullable: false },
      { name: "DATA", type: "VARIANT", nullable: true },
    ];
    const state = new SnowflakeState({ databases: {}, warehouses: {} })
      .createDatabase("DB")
      .createTable("DB", "PUBLIC", "T", cols)
      .insertRows("DB", "PUBLIC", "T", [
        { ID: 1, DATA: { nested: { key: "value" }, arr: [1, 2, 3] } },
      ]);

    const serialized = serializeSnowflake(state);
    const restored = deserializeSnowflake(serialized);
    const row = restored.getTable("DB", "PUBLIC", "T")!.rows[0];
    const data = row.DATA as Record<string, unknown>;
    expect((data.nested as Record<string, unknown>).key).toBe("value");
    expect(data.arr).toEqual([1, 2, 3]);
  });

  it("handles array values", () => {
    const cols: Column[] = [
      { name: "ID", type: "NUMBER", nullable: false },
      { name: "TAGS", type: "ARRAY", nullable: true },
    ];
    const state = new SnowflakeState({ databases: {}, warehouses: {} })
      .createDatabase("DB")
      .createTable("DB", "PUBLIC", "T", cols)
      .insertRows("DB", "PUBLIC", "T", [
        { ID: 1, TAGS: ["a", "b", "c"] },
      ]);

    const serialized = serializeSnowflake(state);
    const restored = deserializeSnowflake(serialized);
    expect(restored.getTable("DB", "PUBLIC", "T")!.rows[0].TAGS).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("serialized form converts Dates to ISO strings", () => {
    const state = createTestState();
    const serialized = serializeSnowflake(state);
    const tbl = serialized.databases["TESTDB"].schemas["PUBLIC"].tables["USERS"];

    expect(typeof tbl.createdAt).toBe("string");
    // Row dates should be serialized as {__type: "date", value: "..."}
    const row = tbl.rows[0] as Record<string, unknown>;
    const created = row.CREATED as Record<string, unknown>;
    expect(created.__type).toBe("date");
    expect(typeof created.value).toBe("string");
  });
});
