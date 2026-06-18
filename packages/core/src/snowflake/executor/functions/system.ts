import { ScalarFn } from "./registry";
import { EvalContext } from "../evaluator";
import { AVAILABLE_ROLES } from "../../session/permissions";

export const systemFunctions: Record<string, ScalarFn> = {
  CURRENT_USER: (_args, ctx: EvalContext) => ctx.currentUser,
  CURRENT_ROLE: (_args, ctx: EvalContext) => ctx.currentRole,
  CURRENT_WAREHOUSE: (_args, ctx: EvalContext) => ctx.currentWarehouse,
  CURRENT_DATABASE: (_args, ctx: EvalContext) => ctx.currentDatabase,
  CURRENT_SCHEMA: (_args, ctx: EvalContext) => ctx.currentSchema,
  CURRENT_SESSION: () => "session_001",
  CURRENT_ACCOUNT: () => "nexacorp",
  CURRENT_REGION: () => "us-east-1",
  CURRENT_VERSION: () => "8.0.0",
  CURRENT_CLIENT: () => "Snowflake CLI 3.4.0",
  CURRENT_AVAILABLE_ROLES: () => AVAILABLE_ROLES.join(","),
  SYSTEM$TYPEOF: ([v]) => {
    if (v === null) return "NULL";
    if (typeof v === "number") return Number.isInteger(v) ? "NUMBER(38,0)" : "FLOAT";
    if (typeof v === "string") return "VARCHAR";
    if (typeof v === "boolean") return "BOOLEAN";
    if (v instanceof Date) return "TIMESTAMP_NTZ(9)";
    if (Array.isArray(v)) return "ARRAY";
    if (typeof v === "object") return "OBJECT";
    return "VARCHAR";
  },
};
