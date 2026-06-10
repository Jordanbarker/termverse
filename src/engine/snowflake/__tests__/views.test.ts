import { describe, it, expect } from "vitest";
import { SnowflakeState } from "../state";
import { createSchema } from "../types";
import { execute } from "../executor/executor";
import { createTestContext } from "./testHelpers";

function createTestState(): SnowflakeState {
  const state = new SnowflakeState({
    databases: {
      TEST_DB: {
        name: "TEST_DB",
        schemas: {
          PUBLIC: createSchema("PUBLIC"),
        },
      },
    },
    warehouses: {},
  });

  // Create a table with data
  let s = state.createTable("TEST_DB", "PUBLIC", "EMPLOYEES", [
    { name: "ID", type: "NUMBER", nullable: false },
    { name: "NAME", type: "VARCHAR", nullable: true },
    { name: "DEPT", type: "VARCHAR", nullable: true },
  ]);
  s = s.insertRows("TEST_DB", "PUBLIC", "EMPLOYEES", [
    { ID: 1, NAME: "Alice", DEPT: "Eng" },
    { ID: 2, NAME: "Bob", DEPT: "Sales" },
    { ID: 3, NAME: "Carol", DEPT: "Eng" },
  ]);
  return s;
}

function ctx() {
  return createTestContext({ currentDatabase: "TEST_DB" });
}

describe("view query expansion", () => {
  it("basic view query returns same rows as underlying table", () => {
    let state = createTestState();
    state = state.createView("TEST_DB", "PUBLIC", {
      name: "EMP_VIEW",
      columns: [],
      query: "SELECT ID, NAME, DEPT FROM TEST_DB.PUBLIC.EMPLOYEES",
    });

    const { results } = execute("SELECT * FROM EMP_VIEW", state, ctx());
    expect(results[0].type).toBe("resultset");
    if (results[0].type === "resultset") {
      expect(results[0].data.rowCount).toBe(3);
    }
  });

  it("view with WHERE clause returns filtered set", () => {
    let state = createTestState();
    state = state.createView("TEST_DB", "PUBLIC", {
      name: "ENG_VIEW",
      columns: [],
      query: "SELECT ID, NAME FROM TEST_DB.PUBLIC.EMPLOYEES WHERE DEPT = 'Eng'",
    });

    const { results } = execute("SELECT * FROM ENG_VIEW", state, ctx());
    expect(results[0].type).toBe("resultset");
    if (results[0].type === "resultset") {
      expect(results[0].data.rowCount).toBe(2);
    }
  });

  it("view referencing another view (nested expansion)", () => {
    let state = createTestState();
    state = state.createView("TEST_DB", "PUBLIC", {
      name: "ALL_EMP",
      columns: [],
      query: "SELECT ID, NAME, DEPT FROM TEST_DB.PUBLIC.EMPLOYEES",
    });
    state = state.createView("TEST_DB", "PUBLIC", {
      name: "ENG_ONLY",
      columns: [],
      query: "SELECT ID, NAME FROM TEST_DB.PUBLIC.ALL_EMP WHERE DEPT = 'Eng'",
    });

    const { results } = execute("SELECT * FROM ENG_ONLY", state, ctx());
    expect(results[0].type).toBe("resultset");
    if (results[0].type === "resultset") {
      expect(results[0].data.rowCount).toBe(2);
    }
  });

  it("recursion depth limit prevents infinite loops", () => {
    let state = createTestState();
    // Create views that reference each other
    state = state.createView("TEST_DB", "PUBLIC", {
      name: "VIEW_A",
      columns: [],
      query: "SELECT * FROM TEST_DB.PUBLIC.VIEW_B",
    });
    state = state.createView("TEST_DB", "PUBLIC", {
      name: "VIEW_B",
      columns: [],
      query: "SELECT * FROM TEST_DB.PUBLIC.VIEW_A",
    });

    const { results } = execute("SELECT * FROM VIEW_A", state, ctx());
    expect(results[0].type).toBe("error");
    if (results[0].type === "error") {
      expect(results[0].message).toContain("maximum depth");
    }
  });

  it("view with alias works", () => {
    let state = createTestState();
    state = state.createView("TEST_DB", "PUBLIC", {
      name: "EMP_VIEW",
      columns: [],
      query: "SELECT ID, NAME FROM TEST_DB.PUBLIC.EMPLOYEES",
    });

    const { results } = execute("SELECT v.ID, v.NAME FROM EMP_VIEW v", state, ctx());
    expect(results[0].type).toBe("resultset");
    if (results[0].type === "resultset") {
      expect(results[0].data.rowCount).toBe(3);
    }
  });

  it("non-existent table/view throws original error", () => {
    const state = createTestState();
    const { results } = execute("SELECT * FROM NONEXISTENT_TABLE", state, ctx());
    expect(results[0].type).toBe("error");
    if (results[0].type === "error") {
      expect(results[0].message).toContain("does not exist");
    }
  });

  it("view with JOIN works", () => {
    let state = createTestState();
    state = state.createTable("TEST_DB", "PUBLIC", "DEPT_INFO", [
      { name: "DEPT_NAME", type: "VARCHAR", nullable: false },
      { name: "LOCATION", type: "VARCHAR", nullable: true },
    ]);
    state = state.insertRows("TEST_DB", "PUBLIC", "DEPT_INFO", [
      { DEPT_NAME: "Eng", LOCATION: "SF" },
      { DEPT_NAME: "Sales", LOCATION: "NYC" },
    ]);
    state = state.createView("TEST_DB", "PUBLIC", {
      name: "EMP_WITH_LOC",
      columns: [],
      query: "SELECT e.NAME, d.LOCATION FROM TEST_DB.PUBLIC.EMPLOYEES e JOIN TEST_DB.PUBLIC.DEPT_INFO d ON e.DEPT = d.DEPT_NAME",
    });

    const { results } = execute("SELECT * FROM EMP_WITH_LOC", state, ctx());
    expect(results[0].type).toBe("resultset");
    if (results[0].type === "resultset") {
      expect(results[0].data.rowCount).toBe(3);
    }
  });
});
