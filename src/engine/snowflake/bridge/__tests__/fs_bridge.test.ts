import { describe, it, expect } from "vitest";
import { syncToVirtualFS } from "../fs_bridge";
import { SnowflakeState } from "../../state";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";

function makeEmptyFS(): VirtualFS {
  const root: DirectoryNode = {
    type: "directory",
    name: "/",
    permissions: "rwxr-xr-x",
    hidden: false,
    children: {
      opt: {
        type: "directory",
        name: "opt",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {},
      },
    },
  };
  return new VirtualFS(root, "/", "/");
}

function makeSnowflakeState(): SnowflakeState {
  let state = new SnowflakeState({ databases: {}, warehouses: {} });
  state = state.createDatabase("ANALYTICS");
  state = state.createSchema("ANALYTICS", "PUBLIC");
  state = state.createTable("ANALYTICS", "PUBLIC", "USERS", [
    { name: "ID", type: "NUMBER", nullable: false },
    { name: "NAME", type: "VARCHAR", nullable: true },
    { name: "EMAIL", type: "VARCHAR", nullable: true },
  ]);
  state = state.insertRows("ANALYTICS", "PUBLIC", "USERS", [
    { ID: 1, NAME: "Alice", EMAIL: "alice@test.com" },
    { ID: 2, NAME: "Bob", EMAIL: "bob@test.com" },
  ]);
  return state;
}

describe("syncToVirtualFS", () => {
  it("creates /opt/snowflake/ directory", () => {
    const fs = makeEmptyFS();
    const sfState = makeSnowflakeState();
    const result = syncToVirtualFS(sfState, fs);

    expect(result.getNode("/opt/snowflake")?.type).toBe("directory");
  });

  it("creates database directory", () => {
    const fs = makeEmptyFS();
    const sfState = makeSnowflakeState();
    const result = syncToVirtualFS(sfState, fs);

    expect(result.getNode("/opt/snowflake/ANALYTICS")?.type).toBe("directory");
  });

  it("creates _schemas.txt listing schemas", () => {
    const fs = makeEmptyFS();
    const sfState = makeSnowflakeState();
    const result = syncToVirtualFS(sfState, fs);

    const content = result.readFile("/opt/snowflake/ANALYTICS/_schemas.txt");
    expect(content.content).toContain("PUBLIC");
    expect(content.content).toContain("Schemas in ANALYTICS");
  });

  it("filters out INFORMATION_SCHEMA from _schemas.txt", () => {
    const fs = makeEmptyFS();
    const sfState = makeSnowflakeState();
    const result = syncToVirtualFS(sfState, fs);

    const content = result.readFile("/opt/snowflake/ANALYTICS/_schemas.txt");
    expect(content.content).not.toContain("INFORMATION_SCHEMA");
  });

  it("creates schema directory with _tables subdirectory", () => {
    const fs = makeEmptyFS();
    const sfState = makeSnowflakeState();
    const result = syncToVirtualFS(sfState, fs);

    expect(result.getNode("/opt/snowflake/ANALYTICS/PUBLIC")?.type).toBe("directory");
    expect(result.getNode("/opt/snowflake/ANALYTICS/PUBLIC/_tables")?.type).toBe("directory");
  });

  it("creates .meta file for each table", () => {
    const fs = makeEmptyFS();
    const sfState = makeSnowflakeState();
    const result = syncToVirtualFS(sfState, fs);

    const meta = result.readFile("/opt/snowflake/ANALYTICS/PUBLIC/_tables/USERS.meta");
    expect(meta.content).toContain("Table: ANALYTICS.PUBLIC.USERS");
    expect(meta.content).toContain("Columns: 3");
    expect(meta.content).toContain("Rows: 2");
  });

  it("includes column definitions in .meta file", () => {
    const fs = makeEmptyFS();
    const sfState = makeSnowflakeState();
    const result = syncToVirtualFS(sfState, fs);

    const meta = result.readFile("/opt/snowflake/ANALYTICS/PUBLIC/_tables/USERS.meta");
    expect(meta.content).toContain("ID");
    expect(meta.content).toContain("NUMBER");
    expect(meta.content).toContain("NOT NULL");
    expect(meta.content).toContain("NAME");
    expect(meta.content).toContain("VARCHAR");
    expect(meta.content).toContain("NULL");
  });

  it("includes snow sql usage hint in .meta file", () => {
    const fs = makeEmptyFS();
    const sfState = makeSnowflakeState();
    const result = syncToVirtualFS(sfState, fs);

    const meta = result.readFile("/opt/snowflake/ANALYTICS/PUBLIC/_tables/USERS.meta");
    expect(meta.content).toContain("snow sql");
    expect(meta.content).toContain("SELECT * FROM USERS LIMIT 5");
  });

  it("is idempotent — re-running produces the same result", () => {
    const fs = makeEmptyFS();
    const sfState = makeSnowflakeState();
    const first = syncToVirtualFS(sfState, fs);
    const second = syncToVirtualFS(sfState, first);

    const meta1 = first.readFile("/opt/snowflake/ANALYTICS/PUBLIC/_tables/USERS.meta");
    const meta2 = second.readFile("/opt/snowflake/ANALYTICS/PUBLIC/_tables/USERS.meta");
    expect(meta1.content).toBe(meta2.content);
  });

  it("handles multiple databases", () => {
    const fs = makeEmptyFS();
    let sfState = makeSnowflakeState();
    sfState = sfState.createDatabase("WAREHOUSE");
    sfState = sfState.createSchema("WAREHOUSE", "RAW");

    const result = syncToVirtualFS(sfState, fs);
    expect(result.getNode("/opt/snowflake/ANALYTICS")?.type).toBe("directory");
    expect(result.getNode("/opt/snowflake/WAREHOUSE")?.type).toBe("directory");
    expect(result.getNode("/opt/snowflake/WAREHOUSE/RAW")?.type).toBe("directory");
  });

  it("handles empty schema (no tables)", () => {
    const fs = makeEmptyFS();
    let sfState = new SnowflakeState({ databases: {}, warehouses: {} });
    sfState = sfState.createDatabase("EMPTYDB");
    sfState = sfState.createSchema("EMPTYDB", "PUBLIC");

    const result = syncToVirtualFS(sfState, fs);
    expect(result.getNode("/opt/snowflake/EMPTYDB/PUBLIC/_tables")?.type).toBe("directory");
    // _tables directory should exist but be empty
    const tablesNode = result.getNode("/opt/snowflake/EMPTYDB/PUBLIC/_tables");
    if (tablesNode?.type === "directory") {
      expect(Object.keys(tablesNode.children)).toHaveLength(0);
    }
  });

  it("creates /opt/snowflake even when /opt doesn't exist", () => {
    const root: DirectoryNode = {
      type: "directory",
      name: "/",
      permissions: "rwxr-xr-x",
      hidden: false,
      children: {},
    };
    const fs = new VirtualFS(root, "/", "/");
    const sfState = makeSnowflakeState();

    const result = syncToVirtualFS(sfState, fs);
    expect(result.getNode("/opt/snowflake")?.type).toBe("directory");
  });
});
