import { SnowflakeState, SnowflakeData } from "../state";
import { Database, Schema, Table, Column, Row, createSchema } from "../types";
import { generateAccessLogRows, LogOptions } from "../../../story/filesystem/logs";

import nexacorpProdJson from "../../../story/data/snowflake/nexacorp_prod.json";

// ── Date columns per table (for reconstituting Date objects from JSON strings) ──
const DATE_COLUMNS: Record<string, Set<string>> = {
  EMPLOYEES: new Set(["HIRE_DATE", "END_DATE"]),
  EMPLOYEE_DIRECTORY: new Set(["HIRE_DATE"]),
  PROJECTS: new Set(["START_DATE"]),
  ACCESS_LOG: new Set(["TIMESTAMP"]),
  SYSTEM_EVENTS: new Set(["TIMESTAMP"]),
  AI_MODEL_METRICS: new Set(["METRIC_DATE"]),
  DEPARTMENT_BUDGETS: new Set(["APPROVED_DATE"]),
  SUPPORT_TICKETS: new Set(["SUBMITTED_DATE", "RESOLVED_DATE"]),
  CUSTOMERS: new Set(["SIGNUP_DATE", "LAST_ACTIVITY_DATE"]),
  DEPLOYMENTS: new Set(["DEPLOYED_AT"]),
};

// ── Generated chip_service_account auto-resolved tickets ──────────────────────
const CHIP_TICKET_TEMPLATES: { category: string; subjects: string[] }[] = [
  { category: "Access", subjects: [
    "Password reset request", "SSO login failure", "MFA token expired",
    "Account locked after failed attempts", "VPN credentials expired",
    "Service account token renewal", "LDAP sync issue",
  ]},
  { category: "Software", subjects: [
    "IDE plugin update needed", "License seat request", "Build tool version mismatch",
    "Package registry timeout", "Dev certificate expired", "Slack integration error",
  ]},
  { category: "Hardware", subjects: [
    "Keyboard replacement request", "Docking station not detected", "Headset mic not working",
    "Monitor not waking from sleep",
  ]},
  { category: "Network", subjects: [
    "DNS resolution failure", "WiFi keeps disconnecting", "Slow network on floor 3",
    "Cannot reach internal wiki", "Proxy configuration error",
  ]},
  { category: "System", subjects: [
    "Disk cleanup needed", "Log rotation stalled", "Temp files consuming disk space",
    "Scheduled task not firing", "Service restart required", "Stale cache flush",
  ]},
];

const CHIP_RESOLUTION_NOTES = [
  "Resolved automatically.",
  "Auto-resolved per standard policy.",
  "Resolved via automated workflow.",
  "Automated remediation applied.",
  "Issue cleared — no manual intervention needed.",
  "Auto-resolved. Monitoring confirmed normal.",
];

const ACTIVE_EMPLOYEE_IDS = [
  "E001", "E002", "E003", "E004", "E005", "E009", "E011", "E013",
  "E014", "E015", "E016", "E018", "E019", "E020", "E021",
];

function generateChipAutoTickets(): Row[] {
  const tickets: Row[] = [];
  // Deterministic pseudo-random using a simple LCG
  let seed = 42;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  const startDate = new Date("2026-02-03");
  const endDate = new Date("2026-02-24");
  const daySpan = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

  for (let i = 0; i < 43; i++) {
    const id = `TK-${4430 + i}`;
    const tmpl = CHIP_TICKET_TEMPLATES[Math.floor(rand() * CHIP_TICKET_TEMPLATES.length)];
    const subject = tmpl.subjects[Math.floor(rand() * tmpl.subjects.length)];
    const submitter = ACTIVE_EMPLOYEE_IDS[Math.floor(rand() * ACTIVE_EMPLOYEE_IDS.length)];
    const dayOffset = Math.floor(rand() * daySpan);
    const submitted = new Date(startDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const resolved = new Date(submitted.getTime() + (1 + Math.floor(rand() * 3)) * 60 * 60 * 1000); // 1-3 hours later
    const priority = rand() < 0.7 ? "low" : "medium";
    const note = CHIP_RESOLUTION_NOTES[Math.floor(rand() * CHIP_RESOLUTION_NOTES.length)];

    tickets.push({
      TICKET_ID: id,
      SUBMITTED_BY: submitter,
      SUBMITTED_DATE: submitted,
      CATEGORY: tmpl.category,
      SUBJECT: subject,
      DESCRIPTION: null,
      PRIORITY: priority,
      STATUS: "closed",
      ASSIGNED_TO: "chip_service_account",
      RESOLVED_BY: "chip_service_account",
      RESOLVED_DATE: resolved,
      RESOLUTION_NOTES: note,
    });
  }
  return tickets;
}

/**
 * Create the initial SnowflakeState with narrative game data.
 */
export function createInitialSnowflakeState(opts?: LogOptions): SnowflakeState {
  const data: SnowflakeData = {
    databases: {
      NEXACORP_PROD: loadDatabase(nexacorpProdJson as unknown as JsonDatabase, opts),
    },
    warehouses: {
      NEXACORP_WH: {
        name: "NEXACORP_WH",
        size: "X-Small",
        state: "STARTED",
        autoSuspend: 600,
      },
    },
  };
  return new SnowflakeState(data);
}

// ── JSON → Database hydration ────────────────────────────────────────

interface JsonTable {
  name: string;
  columns: Column[];
  rows: Record<string, unknown>[];
  createdAt: string;
}

interface JsonSchema {
  tables: Record<string, JsonTable>;
}

interface JsonDatabase {
  name: string;
  schemas: Record<string, JsonSchema>;
}

function loadDatabase(json: JsonDatabase, opts?: LogOptions): Database {
  const schemas: Record<string, Schema> = {};
  for (const [schemaName, schemaJson] of Object.entries(json.schemas)) {
    const schema = createSchema(schemaName);
    for (const [tableName, tableJson] of Object.entries(schemaJson.tables)) {
      const dateCols = DATE_COLUMNS[tableName] || new Set<string>();

      // ACCESS_LOG rows are generated from the shared access event source
      if (tableName === "ACCESS_LOG") {
        schema.tables[tableName] = {
          name: tableJson.name,
          columns: tableJson.columns,
          rows: generateAccessLogRows(opts),
          createdAt: new Date(tableJson.createdAt),
        };
        continue;
      }

      const rows: Row[] = tableJson.rows.map((row) => hydrateRow(row, dateCols));

      if (tableName === "SUPPORT_TICKETS") {
        rows.push(...generateChipAutoTickets());
      }

      if (tableName === "CAMPAIGN_METRICS" && opts?.includeDay2) {
        rows.push(
          { CAMPAIGN_ID: "CM-101", CAMPAIGN_NAME: "partner_referral_q2", CHANNEL: "referral", IMPRESSIONS: 42000, CLICKS: null, CONVERSIONS: null, SPEND: 6200, REPORT_DATE: "2026-02-23" },
          { CAMPAIGN_ID: "CM-102", CAMPAIGN_NAME: "partner_referral_q2", CHANNEL: "referral", IMPRESSIONS: 38000, CLICKS: null, CONVERSIONS: null, SPEND: 5800, REPORT_DATE: "2026-02-23" },
        );
      }

      schema.tables[tableName] = {
        name: tableJson.name,
        columns: tableJson.columns,
        rows,
        createdAt: new Date(tableJson.createdAt),
      };
    }
    schemas[schemaName] = schema;
  }
  return { name: json.name, schemas };
}

function hydrateRow(row: Record<string, unknown>, dateCols: Set<string>): Row {
  const result: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (dateCols.has(key) && typeof value === "string") {
      result[key] = new Date(value);
    } else if (value === null || value === undefined) {
      result[key] = null;
    } else {
      result[key] = value as Row[string];
    }
  }
  return result;
}
