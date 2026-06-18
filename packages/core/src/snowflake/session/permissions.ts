export type PermissionLevel = "READ" | "WRITE";

export interface RoleDef {
  name: string;
  comment: string;
  grants: Record<string, PermissionLevel>;
  isAdmin: boolean;
  createdOn: string;
}

const ANALYTICS_READ: Record<string, PermissionLevel> = {
  "NEXACORP_PROD.ANALYTICS": "READ",
  "NEXACORP_PROD.RAW_NEXACORP": "READ",
};

const ANALYTICS_WRITE: Record<string, PermissionLevel> = {
  "NEXACORP_PROD.ANALYTICS": "WRITE",
  "NEXACORP_PROD.RAW_NEXACORP": "READ",
};

export const ROLES: Record<string, RoleDef> = {
  PUBLIC: {
    name: "PUBLIC",
    comment: "Default role granted to all users",
    grants: {},
    isAdmin: false,
    createdOn: "2025-03-10 11:32:00.000",
  },
  ANALYST: {
    name: "ANALYST",
    comment: "Read-only access to analytics and raw data",
    grants: ANALYTICS_READ,
    isAdmin: false,
    createdOn: "2025-05-14 09:17:00.000",
  },
  TRANSFORMER: {
    name: "TRANSFORMER",
    comment: "Service role for dbt transformations",
    grants: ANALYTICS_WRITE,
    isAdmin: false,
    createdOn: "2025-06-02 15:41:00.000",
  },
  ENGINEER: {
    name: "ENGINEER",
    comment: "Read-write access to analytics, read access to raw data",
    grants: ANALYTICS_WRITE,
    isAdmin: false,
    createdOn: "2025-05-14 09:22:00.000",
  },
  SYSADMIN: {
    name: "SYSADMIN",
    comment: "System administrator with full database access",
    grants: {},
    isAdmin: true,
    createdOn: "2025-03-10 11:32:00.000",
  },
  ACCOUNTADMIN: {
    name: "ACCOUNTADMIN",
    comment: "Account administrator with full account access",
    grants: {},
    isAdmin: true,
    createdOn: "2025-03-10 11:32:00.000",
  },
};

export const AVAILABLE_ROLES = ["PUBLIC", "ANALYST", "TRANSFORMER", "ENGINEER", "SYSADMIN", "ACCOUNTADMIN"];

export function isValidRole(role: string): boolean {
  return role.toUpperCase() in ROLES;
}

export function getRoleDef(role: string): RoleDef | undefined {
  return ROLES[role.toUpperCase()];
}

export function canReadSchema(role: string, database: string, schema: string): boolean {
  const def = getRoleDef(role);
  if (!def) return false;
  if (def.isAdmin) return true;
  if (schema.toUpperCase() === "INFORMATION_SCHEMA") return true;
  const key = `${database.toUpperCase()}.${schema.toUpperCase()}`;
  return key in def.grants;
}

/**
 * Check permission and throw a Snowflake-style error on denial.
 */
export function checkPermission(role: string, database: string, schema: string, level: PermissionLevel): void {
  const def = getRoleDef(role);
  if (!def) {
    throw new Error(`SQL access control error:\nRole '${role}' does not exist.`);
  }
  if (def.isAdmin) return;
  if (schema.toUpperCase() === "INFORMATION_SCHEMA" && level === "READ") return;

  const key = `${database.toUpperCase()}.${schema.toUpperCase()}`;
  const grant = def.grants[key];

  if (!grant) {
    throw new Error(`SQL access control error:\nInsufficient privileges to operate on schema '${database.toUpperCase()}.${schema.toUpperCase()}'`);
  }
  if (level === "WRITE" && grant === "READ") {
    throw new Error(`SQL access control error:\nInsufficient privileges to operate on schema '${database.toUpperCase()}.${schema.toUpperCase()}'`);
  }
}
