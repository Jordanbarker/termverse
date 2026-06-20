import { describe, it, expect } from "vitest";
import { SnowflakeState } from "../state";
import { Column } from "../types";

function emptyState(): SnowflakeState {
  return new SnowflakeState({ databases: {}, warehouses: {} });
}

function stateWithDB(): SnowflakeState {
  return emptyState().createDatabase("TESTDB");
}

function stateWithTable(): SnowflakeState {
  const cols: Column[] = [
    { name: "ID", type: "NUMBER", nullable: false },
    { name: "NAME", type: "VARCHAR", nullable: true },
  ];
  return stateWithDB().createTable("TESTDB", "PUBLIC", "USERS", cols);
}

describe("SnowflakeState", () => {
  describe("database operations", () => {
    it("creates a database with default schemas", () => {
      const state = stateWithDB();
      expect(state.getDatabase("TESTDB")).toBeDefined();
      expect(state.listSchemas("TESTDB")).toContain("PUBLIC");
      expect(state.listSchemas("TESTDB")).toContain("INFORMATION_SCHEMA");
    });

    it("creates database with case-insensitive name", () => {
      const state = emptyState().createDatabase("mydb");
      expect(state.getDatabase("MYDB")).toBeDefined();
      expect(state.getDatabase("mydb")).toBeDefined();
    });

    it("drops a database", () => {
      const state = stateWithDB().dropDatabase("TESTDB");
      expect(state.getDatabase("TESTDB")).toBeUndefined();
    });

    it("lists databases", () => {
      const state = stateWithDB().createDatabase("OTHER");
      expect(state.listDatabases()).toContain("TESTDB");
      expect(state.listDatabases()).toContain("OTHER");
    });

    it("does not mutate original on create", () => {
      const original = emptyState();
      original.createDatabase("TESTDB");
      expect(original.listDatabases()).toHaveLength(0);
    });
  });

  describe("schema operations", () => {
    it("creates a schema", () => {
      const state = stateWithDB().createSchema("TESTDB", "ANALYTICS");
      expect(state.getSchema("TESTDB", "ANALYTICS")).toBeDefined();
    });

    it("drops a schema", () => {
      const state = stateWithDB()
        .createSchema("TESTDB", "ANALYTICS")
        .dropSchema("TESTDB", "ANALYTICS");
      expect(state.getSchema("TESTDB", "ANALYTICS")).toBeUndefined();
    });

    it("returns same state when db does not exist", () => {
      const state = emptyState();
      const result = state.createSchema("MISSING", "TEST");
      expect(result).toBe(state);
    });
  });

  describe("table operations", () => {
    it("creates a table", () => {
      const state = stateWithTable();
      const table = state.getTable("TESTDB", "PUBLIC", "USERS");
      expect(table).toBeDefined();
      expect(table!.columns).toHaveLength(2);
      expect(table!.rows).toEqual([]);
    });

    it("drops a table", () => {
      const state = stateWithTable().dropTable("TESTDB", "PUBLIC", "USERS");
      expect(state.getTable("TESTDB", "PUBLIC", "USERS")).toBeUndefined();
    });

    it("lists tables", () => {
      const state = stateWithTable();
      const tables = state.listTables("TESTDB", "PUBLIC");
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe("USERS");
    });
  });

  describe("row operations", () => {
    it("inserts rows", () => {
      const state = stateWithTable().insertRows("TESTDB", "PUBLIC", "USERS", [
        { ID: 1, NAME: "Alice" },
        { ID: 2, NAME: "Bob" },
      ]);
      const table = state.getTable("TESTDB", "PUBLIC", "USERS")!;
      expect(table.rows).toHaveLength(2);
      expect(table.rows[0]).toEqual({ ID: 1, NAME: "Alice" });
    });

    it("updates rows matching predicate", () => {
      const state = stateWithTable()
        .insertRows("TESTDB", "PUBLIC", "USERS", [
          { ID: 1, NAME: "Alice" },
          { ID: 2, NAME: "Bob" },
        ])
        .updateRows(
          "TESTDB",
          "PUBLIC",
          "USERS",
          (r) => r.ID === 1,
          { NAME: "Alicia" }
        );
      const table = state.getTable("TESTDB", "PUBLIC", "USERS")!;
      expect(table.rows[0].NAME).toBe("Alicia");
      expect(table.rows[1].NAME).toBe("Bob");
    });

    it("deletes rows matching predicate", () => {
      const state = stateWithTable()
        .insertRows("TESTDB", "PUBLIC", "USERS", [
          { ID: 1, NAME: "Alice" },
          { ID: 2, NAME: "Bob" },
        ])
        .deleteRows("TESTDB", "PUBLIC", "USERS", (r) => r.ID === 2);
      const table = state.getTable("TESTDB", "PUBLIC", "USERS")!;
      expect(table.rows).toHaveLength(1);
      expect(table.rows[0].NAME).toBe("Alice");
    });

    it("truncates table", () => {
      const state = stateWithTable()
        .insertRows("TESTDB", "PUBLIC", "USERS", [
          { ID: 1, NAME: "Alice" },
        ])
        .truncateTable("TESTDB", "PUBLIC", "USERS");
      expect(
        state.getTable("TESTDB", "PUBLIC", "USERS")!.rows
      ).toHaveLength(0);
    });

    it("does not mutate original on insert", () => {
      const original = stateWithTable();
      original.insertRows("TESTDB", "PUBLIC", "USERS", [
        { ID: 1, NAME: "Alice" },
      ]);
      expect(
        original.getTable("TESTDB", "PUBLIC", "USERS")!.rows
      ).toHaveLength(0);
    });
  });

  describe("resolveTable", () => {
    it("resolves unqualified name", () => {
      const state = stateWithTable();
      const table = state.resolveTable("USERS", "TESTDB", "PUBLIC");
      expect(table).toBeDefined();
      expect(table!.name).toBe("USERS");
    });

    it("resolves schema.table", () => {
      const state = stateWithTable();
      const table = state.resolveTable("PUBLIC.USERS", "TESTDB", "OTHER");
      expect(table).toBeDefined();
    });

    it("resolves db.schema.table", () => {
      const state = stateWithTable();
      const table = state.resolveTable("TESTDB.PUBLIC.USERS", "OTHER", "OTHER");
      expect(table).toBeDefined();
    });

    it("accepts array of parts", () => {
      const state = stateWithTable();
      expect(state.resolveTable(["USERS"], "TESTDB", "PUBLIC")).toBeDefined();
      expect(
        state.resolveTable(["PUBLIC", "USERS"], "TESTDB", "PUBLIC")
      ).toBeDefined();
    });

    it("returns undefined for nonexistent table", () => {
      const state = stateWithTable();
      expect(state.resolveTable("MISSING", "TESTDB", "PUBLIC")).toBeUndefined();
    });

    it("returns undefined for 4+ parts", () => {
      const state = stateWithTable();
      expect(
        state.resolveTable(["A", "B", "C", "D"], "TESTDB", "PUBLIC")
      ).toBeUndefined();
    });
  });

  describe("clone table", () => {
    it("clones table with data", () => {
      const state = stateWithTable()
        .insertRows("TESTDB", "PUBLIC", "USERS", [{ ID: 1, NAME: "Alice" }])
        .cloneTable("TESTDB", "PUBLIC", "USERS", "TESTDB", "PUBLIC", "USERS_COPY");

      const clone = state.getTable("TESTDB", "PUBLIC", "USERS_COPY");
      expect(clone).toBeDefined();
      expect(clone!.rows).toHaveLength(1);
      expect(clone!.rows[0].NAME).toBe("Alice");
      expect(clone!.cloneSource).toBe("TESTDB.PUBLIC.USERS");
    });

    it("clone rows are independent of original", () => {
      const base = stateWithTable().insertRows("TESTDB", "PUBLIC", "USERS", [
        { ID: 1, NAME: "Alice" },
      ]);
      const cloned = base.cloneTable(
        "TESTDB", "PUBLIC", "USERS",
        "TESTDB", "PUBLIC", "USERS_COPY"
      );
      const updated = cloned.updateRows(
        "TESTDB", "PUBLIC", "USERS_COPY",
        () => true,
        { NAME: "Changed" }
      );
      expect(
        updated.getTable("TESTDB", "PUBLIC", "USERS")!.rows[0].NAME
      ).toBe("Alice");
    });
  });

  describe("alter table", () => {
    it("adds a column with default value", () => {
      const state = stateWithTable()
        .insertRows("TESTDB", "PUBLIC", "USERS", [{ ID: 1, NAME: "Alice" }])
        .alterTableAddColumn("TESTDB", "PUBLIC", "USERS", {
          name: "AGE",
          type: "NUMBER",
          nullable: true,
          defaultValue: 0,
        });
      const table = state.getTable("TESTDB", "PUBLIC", "USERS")!;
      expect(table.columns).toHaveLength(3);
      expect(table.rows[0].AGE).toBe(0);
    });

    it("drops a column", () => {
      const state = stateWithTable()
        .insertRows("TESTDB", "PUBLIC", "USERS", [{ ID: 1, NAME: "Alice" }])
        .alterTableDropColumn("TESTDB", "PUBLIC", "USERS", "NAME");
      const table = state.getTable("TESTDB", "PUBLIC", "USERS")!;
      expect(table.columns).toHaveLength(1);
      expect(table.rows[0].NAME).toBeUndefined();
    });
  });

  describe("view operations", () => {
    it("creates and retrieves a view", () => {
      const state = stateWithDB().createView("TESTDB", "PUBLIC", {
        name: "ACTIVE_USERS",
        columns: [],
        query: "SELECT * FROM USERS WHERE active = true",
      });
      const view = state.getView("TESTDB", "PUBLIC", "ACTIVE_USERS");
      expect(view).toBeDefined();
      expect(view!.query).toContain("SELECT");
    });

    it("drops a view", () => {
      const state = stateWithDB()
        .createView("TESTDB", "PUBLIC", {
          name: "V1",
          columns: [],
          query: "SELECT 1",
        })
        .dropView("TESTDB", "PUBLIC", "V1");
      expect(state.getView("TESTDB", "PUBLIC", "V1")).toBeUndefined();
    });

    it("resolves view with qualified name", () => {
      const state = stateWithDB().createView("TESTDB", "PUBLIC", {
        name: "V1",
        columns: [],
        query: "SELECT 1",
      });
      expect(state.resolveView("V1", "TESTDB", "PUBLIC")).toBeDefined();
      expect(state.resolveView("PUBLIC.V1", "TESTDB", "X")).toBeDefined();
      expect(state.resolveView("TESTDB.PUBLIC.V1", "X", "X")).toBeDefined();
    });
  });

  describe("sequence operations", () => {
    it("creates a sequence and increments", () => {
      const state = stateWithDB().createSequence("TESTDB", "PUBLIC", {
        name: "SEQ1",
        current: 1,
        increment: 1,
      });

      const { value: v1, state: s1 } = state.nextVal("TESTDB", "PUBLIC", "SEQ1");
      expect(v1).toBe(1);

      const { value: v2 } = s1.nextVal("TESTDB", "PUBLIC", "SEQ1");
      expect(v2).toBe(2);
    });

    it("returns 0 for nonexistent sequence", () => {
      const { value } = stateWithDB().nextVal("TESTDB", "PUBLIC", "MISSING");
      expect(value).toBe(0);
    });
  });

  describe("warehouse operations", () => {
    it("creates and lists warehouses", () => {
      const state = emptyState().createWarehouse({
        name: "WH1",
        size: "X-SMALL",
        state: "STARTED",
        autoSuspend: 300,
      });
      expect(state.getWarehouse("WH1")).toBeDefined();
      expect(state.listWarehouses()).toHaveLength(1);
    });

    it("drops a warehouse", () => {
      const state = emptyState()
        .createWarehouse({
          name: "WH1",
          size: "X-SMALL",
          state: "STARTED",
          autoSuspend: 300,
        })
        .dropWarehouse("WH1");
      expect(state.getWarehouse("WH1")).toBeUndefined();
    });
  });

  describe("stage operations", () => {
    it("creates a stage and puts files", () => {
      const state = stateWithDB()
        .createStage("TESTDB", "PUBLIC", { name: "MY_STAGE", files: {} })
        .putFile("TESTDB", "PUBLIC", "MY_STAGE", "data.csv", "a,b,c");

      const schema = state.getSchema("TESTDB", "PUBLIC")!;
      const stage = schema.stages["MY_STAGE"];
      expect(stage).toBeDefined();
      expect(stage.files["data.csv"]).toBe("a,b,c");
    });
  });
});
