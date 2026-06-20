import { describe, it, expect } from "vitest";
import { checkPermission, canReadSchema, isValidRole, AVAILABLE_ROLES } from "@tt/core/snowflake/session/permissions";
import { execute } from "@tt/core/snowflake/executor/executor";
import { createDefaultContext } from "@tt/core/snowflake/session/context";
import { createInitialSnowflakeState } from "../initial_data";
import { createTestContext } from "@tt/core/snowflake/__tests__/testHelpers";

function ctx(role: string) {
  return createTestContext({ currentDatabase: "NEXACORP_PROD", currentSchema: "ANALYTICS", currentRole: role });
}

describe("permissions", () => {
  describe("isValidRole", () => {
    it("accepts all defined roles", () => {
      for (const role of AVAILABLE_ROLES) {
        expect(isValidRole(role)).toBe(true);
      }
    });

    it("rejects unknown roles", () => {
      expect(isValidRole("FAKE_ROLE")).toBe(false);
      expect(isValidRole("TRANSFORMER2")).toBe(false);
    });

    it("is case-insensitive", () => {
      expect(isValidRole("analyst")).toBe(true);
      expect(isValidRole("Sysadmin")).toBe(true);
    });
  });

  describe("canReadSchema", () => {
    it("ANALYST can read ANALYTICS and RAW_NEXACORP", () => {
      expect(canReadSchema("ANALYST", "NEXACORP_PROD", "ANALYTICS")).toBe(true);
      expect(canReadSchema("ANALYST", "NEXACORP_PROD", "RAW_NEXACORP")).toBe(true);
    });

    it("PUBLIC cannot read ANALYTICS or RAW_NEXACORP", () => {
      expect(canReadSchema("PUBLIC", "NEXACORP_PROD", "ANALYTICS")).toBe(false);
      expect(canReadSchema("PUBLIC", "NEXACORP_PROD", "RAW_NEXACORP")).toBe(false);
    });

    it("all roles can read INFORMATION_SCHEMA", () => {
      for (const role of AVAILABLE_ROLES) {
        expect(canReadSchema(role, "NEXACORP_PROD", "INFORMATION_SCHEMA")).toBe(true);
      }
    });

    it("admin roles can read any schema", () => {
      expect(canReadSchema("SYSADMIN", "ANY_DB", "ANY_SCHEMA")).toBe(true);
      expect(canReadSchema("ACCOUNTADMIN", "ANY_DB", "ANY_SCHEMA")).toBe(true);
    });
  });

  describe("checkPermission", () => {
    it("ANALYST can read ANALYTICS", () => {
      expect(() => checkPermission("ANALYST", "NEXACORP_PROD", "ANALYTICS", "READ")).not.toThrow();
    });

    it("ANALYST cannot write to ANALYTICS", () => {
      expect(() => checkPermission("ANALYST", "NEXACORP_PROD", "ANALYTICS", "WRITE"))
        .toThrow("Insufficient privileges");
    });

    it("ANALYST can read RAW_NEXACORP", () => {
      expect(() => checkPermission("ANALYST", "NEXACORP_PROD", "RAW_NEXACORP", "READ")).not.toThrow();
    });

    it("ANALYST cannot write to RAW_NEXACORP", () => {
      expect(() => checkPermission("ANALYST", "NEXACORP_PROD", "RAW_NEXACORP", "WRITE"))
        .toThrow("Insufficient privileges");
    });

    it("ENGINEER can write to ANALYTICS", () => {
      expect(() => checkPermission("ENGINEER", "NEXACORP_PROD", "ANALYTICS", "WRITE")).not.toThrow();
    });

    it("ENGINEER can read RAW_NEXACORP", () => {
      expect(() => checkPermission("ENGINEER", "NEXACORP_PROD", "RAW_NEXACORP", "READ")).not.toThrow();
    });

    it("ENGINEER cannot write to RAW_NEXACORP", () => {
      expect(() => checkPermission("ENGINEER", "NEXACORP_PROD", "RAW_NEXACORP", "WRITE"))
        .toThrow("Insufficient privileges");
    });

    it("TRANSFORMER has same access as ENGINEER", () => {
      expect(() => checkPermission("TRANSFORMER", "NEXACORP_PROD", "ANALYTICS", "WRITE")).not.toThrow();
      expect(() => checkPermission("TRANSFORMER", "NEXACORP_PROD", "RAW_NEXACORP", "READ")).not.toThrow();
      expect(() => checkPermission("TRANSFORMER", "NEXACORP_PROD", "RAW_NEXACORP", "WRITE"))
        .toThrow("Insufficient privileges");
    });

    it("PUBLIC cannot access ANALYTICS or RAW_NEXACORP", () => {
      expect(() => checkPermission("PUBLIC", "NEXACORP_PROD", "ANALYTICS", "READ"))
        .toThrow("Insufficient privileges");
      expect(() => checkPermission("PUBLIC", "NEXACORP_PROD", "RAW_NEXACORP", "READ"))
        .toThrow("Insufficient privileges");
    });

    it("admin roles bypass all checks", () => {
      expect(() => checkPermission("SYSADMIN", "ANY_DB", "ANY_SCHEMA", "WRITE")).not.toThrow();
      expect(() => checkPermission("ACCOUNTADMIN", "ANY_DB", "ANY_SCHEMA", "WRITE")).not.toThrow();
    });

    it("error message matches Snowflake format", () => {
      expect(() => checkPermission("ANALYST", "NEXACORP_PROD", "ANALYTICS", "WRITE"))
        .toThrow("SQL access control error:\nInsufficient privileges to operate on schema 'NEXACORP_PROD.ANALYTICS'");
    });
  });
});

describe("permissions integration", () => {
  const state = createInitialSnowflakeState();

  describe("SELECT", () => {
    it("ANALYST can SELECT from RAW_NEXACORP", () => {
      const { results } = execute("SELECT * FROM RAW_NEXACORP.EMPLOYEES LIMIT 1", state, ctx("ANALYST"));
      expect(results[0].type).toBe("resultset");
    });

    it("PUBLIC cannot SELECT from RAW_NEXACORP", () => {
      const { results } = execute("SELECT * FROM RAW_NEXACORP.EMPLOYEES LIMIT 1", state, ctx("PUBLIC"));
      expect(results[0].type).toBe("error");
      if (results[0].type === "error") {
        expect(results[0].message).toContain("Insufficient privileges");
      }
    });
  });

  describe("DML", () => {
    it("ANALYST cannot INSERT into ANALYTICS", () => {
      const { results } = execute(
        "CREATE TABLE ANALYTICS.TEST_TBL (ID NUMBER); INSERT INTO ANALYTICS.TEST_TBL VALUES (1)",
        state, ctx("ANALYST"),
      );
      // CREATE TABLE fails first (WRITE needed)
      expect(results[0].type).toBe("error");
    });

    it("ENGINEER can INSERT into ANALYTICS", () => {
      const s = state.createTable("NEXACORP_PROD", "ANALYTICS", "ENG_TEST", [
        { name: "ID", type: "NUMBER", nullable: false },
      ]);
      const { results } = execute("INSERT INTO ANALYTICS.ENG_TEST VALUES (1)", s, ctx("ENGINEER"));
      expect(results[0].type).toBe("status");
    });

    it("ENGINEER cannot INSERT into RAW_NEXACORP", () => {
      const { results } = execute(
        "INSERT INTO RAW_NEXACORP.EMPLOYEES (EMPLOYEE_ID) VALUES (999)",
        state, ctx("ENGINEER"),
      );
      expect(results[0].type).toBe("error");
      if (results[0].type === "error") {
        expect(results[0].message).toContain("Insufficient privileges");
      }
    });
  });

  describe("DDL", () => {
    it("ANALYST cannot CREATE TABLE", () => {
      const { results } = execute(
        "CREATE TABLE ANALYTICS.BLOCKED (ID NUMBER)",
        state, ctx("ANALYST"),
      );
      expect(results[0].type).toBe("error");
    });

    it("ENGINEER can CREATE TABLE in ANALYTICS", () => {
      const { results } = execute(
        "CREATE TABLE ANALYTICS.ALLOWED (ID NUMBER)",
        state, ctx("ENGINEER"),
      );
      expect(results[0].type).toBe("status");
    });

    it("ENGINEER cannot CREATE DATABASE", () => {
      const { results } = execute("CREATE DATABASE NEW_DB", state, ctx("ENGINEER"));
      expect(results[0].type).toBe("error");
      if (results[0].type === "error") {
        expect(results[0].message).toContain("Insufficient privileges");
      }
    });

    it("SYSADMIN can CREATE DATABASE", () => {
      const { results } = execute("CREATE DATABASE NEW_DB", state, ctx("SYSADMIN"));
      expect(results[0].type).toBe("status");
    });
  });

  describe("USE ROLE", () => {
    it("accepts valid roles", () => {
      const { results } = execute("USE ROLE ENGINEER", state, ctx("ANALYST"));
      expect(results[0].type).toBe("status");
    });

    it("rejects invalid roles", () => {
      const { results } = execute("USE ROLE FAKE_ROLE", state, ctx("ANALYST"));
      expect(results[0].type).toBe("error");
      if (results[0].type === "error") {
        expect(results[0].message).toContain("does not exist or not authorized");
      }
    });

    it("updates context role", () => {
      const { context } = execute("USE ROLE ENGINEER", state, ctx("ANALYST"));
      expect(context.currentRole).toBe("ENGINEER");
    });
  });

  describe("SHOW ROLES", () => {
    it("returns all roles", () => {
      const { results } = execute("SHOW ROLES", state, ctx("ANALYST"));
      expect(results[0].type).toBe("resultset");
      if (results[0].type === "resultset") {
        expect(results[0].data.rowCount).toBe(AVAILABLE_ROLES.length);
      }
    });

    it("marks current role", () => {
      const { results } = execute("SHOW ROLES", state, ctx("ENGINEER"));
      if (results[0].type === "resultset") {
        const engineerRow = results[0].data.rows.find((r) => r[0] === "ENGINEER");
        expect(engineerRow?.[1]).toBe("Y");
        const analystRow = results[0].data.rows.find((r) => r[0] === "ANALYST");
        expect(analystRow?.[1]).toBe("N");
      }
    });
  });

  describe("SHOW GRANTS", () => {
    it("returns grants for ANALYST", () => {
      const { results } = execute("SHOW GRANTS", state, ctx("ANALYST"));
      expect(results[0].type).toBe("resultset");
      if (results[0].type === "resultset") {
        // ANALYST has READ on 2 schemas = USAGE + SELECT per schema = 4 rows
        expect(results[0].data.rowCount).toBe(4);
      }
    });

    it("returns ALL PRIVILEGES for admin roles", () => {
      const { results } = execute("SHOW GRANTS", state, ctx("SYSADMIN"));
      if (results[0].type === "resultset") {
        expect(results[0].data.rows[0][0]).toBe("ALL PRIVILEGES");
      }
    });
  });

  describe("SHOW TABLES permission filtering", () => {
    it("PUBLIC cannot see tables in RAW_NEXACORP", () => {
      const { results } = execute("SHOW TABLES IN SCHEMA RAW_NEXACORP", state, ctx("PUBLIC"));
      if (results[0].type === "resultset") {
        expect(results[0].data.rowCount).toBe(0);
      }
    });

    it("ANALYST can see tables in RAW_NEXACORP", () => {
      const { results } = execute("SHOW TABLES IN SCHEMA RAW_NEXACORP", state, ctx("ANALYST"));
      if (results[0].type === "resultset") {
        expect(results[0].data.rowCount).toBeGreaterThan(0);
      }
    });

    it("SHOW TABLES IN ACCOUNT lists tables across all readable schemas (ANALYST)", () => {
      const { results } = execute("SHOW TABLES IN ACCOUNT", state, ctx("ANALYST"));
      expect(results[0].type).toBe("resultset");
      if (results[0].type === "resultset") {
        const schemas = new Set(results[0].data.rows.map((r) => r[2]));
        expect(schemas.has("RAW_NEXACORP")).toBe(true);
        expect(results[0].data.rowCount).toBeGreaterThan(0);
      }
    });

    it("SHOW TABLES IN ACCOUNT returns nothing for PUBLIC", () => {
      const { results } = execute("SHOW TABLES IN ACCOUNT", state, ctx("PUBLIC"));
      expect(results[0].type).toBe("resultset");
      if (results[0].type === "resultset") {
        expect(results[0].data.rowCount).toBe(0);
      }
    });

    it("SHOW TABLES IN DATABASE NEXACORP_PROD spans schemas", () => {
      const { results } = execute("SHOW TABLES IN DATABASE NEXACORP_PROD", state, ctx("ANALYST"));
      expect(results[0].type).toBe("resultset");
      if (results[0].type === "resultset") {
        const schemas = new Set(results[0].data.rows.map((r) => r[2]));
        expect(schemas.has("RAW_NEXACORP")).toBe(true);
      }
    });

    it("SHOW TABLES IN ACCOUNT LIKE 'EMP%' filters by table name", () => {
      const { results } = execute("SHOW TABLES IN ACCOUNT LIKE 'EMP%'", state, ctx("ANALYST"));
      expect(results[0].type).toBe("resultset");
      if (results[0].type === "resultset") {
        for (const row of results[0].data.rows) {
          expect(String(row[0]).toUpperCase().startsWith("EMP")).toBe(true);
        }
        expect(results[0].data.rowCount).toBeGreaterThan(0);
      }
    });

    it("SHOW SCHEMAS IN ACCOUNT lists schemas across all databases", () => {
      const { results } = execute("SHOW SCHEMAS IN ACCOUNT", state, ctx("ANALYST"));
      expect(results[0].type).toBe("resultset");
      if (results[0].type === "resultset") {
        const names = new Set(results[0].data.rows.map((r) => r[0]));
        expect(names.has("RAW_NEXACORP")).toBe(true);
        expect(names.has("ANALYTICS")).toBe(true);
      }
    });
  });

  describe("default context", () => {
    it("default role is ANALYST", () => {
      const defaultCtx = createDefaultContext();
      expect(defaultCtx.currentRole).toBe("ANALYST");
    });
  });

  describe("CURRENT_AVAILABLE_ROLES()", () => {
    it("returns all role names", () => {
      const { results } = execute("SELECT CURRENT_AVAILABLE_ROLES()", state, ctx("ANALYST"));
      if (results[0].type === "resultset") {
        const value = results[0].data.rows[0][0] as string;
        expect(value).toContain("ANALYST");
        expect(value).toContain("ENGINEER");
        expect(value).toContain("TRANSFORMER");
        expect(value).toContain("SYSADMIN");
        expect(value).toContain("ACCOUNTADMIN");
      }
    });
  });
});
