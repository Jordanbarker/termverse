import { GitCommit, RemoteRepoDef } from "./types";
import { shortHash } from "./repo";
import { DirectoryNode } from "@tt/core/filesystem/types";
import { buildDbtProject } from "../../story/filesystem/nexacorp";

/**
 * Build a simple remote with a single initial commit from a set of files.
 */
function buildSimpleRemote(
  files: Record<string, string>,
  opts: { author: string; defaultBranch?: string; commitMessage?: string }
): RemoteRepoDef {
  const branch = opts.defaultBranch ?? "main";
  const message = opts.commitMessage ?? "Initial commit";
  const timestamp = 1700000000000; // fixed for determinism
  const hash = shortHash(message + timestamp + "" + JSON.stringify(files));

  return {
    files,
    defaultBranch: branch,
    commits: [
      {
        hash,
        parent: null,
        message,
        author: opts.author,
        timestamp,
        tree: files,
      },
    ],
  };
}

/** Flatten a DirectoryNode tree into a flat Record<path, content> for RemoteRepoDef. */
function flattenTree(node: DirectoryNode, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, child] of Object.entries(node.children)) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (child.type === "file") result[path] = child.content;
    else Object.assign(result, flattenTree(child as DirectoryNode, path));
  }
  return result;
}

/**
 * Build a chain of commits, each merging addFiles into the running tree.
 * No-op commits (empty addFiles) reuse the same tree reference for zero extra memory.
 */
function buildCommitChain(
  steps: { addFiles: Record<string, string>; author: string; message: string; timestamp: number }[]
): GitCommit[] {
  let runningTree: Record<string, string> = {};
  let parentHash: string | null = null;
  const commits: GitCommit[] = [];

  for (const step of steps) {
    if (Object.keys(step.addFiles).length > 0) {
      runningTree = { ...runningTree, ...step.addFiles };
    }
    const hash = shortHash(step.message + step.timestamp + (parentHash ?? "") + JSON.stringify(runningTree));
    commits.push({
      hash,
      parent: parentHash,
      message: step.message,
      author: step.author,
      timestamp: step.timestamp,
      tree: runningTree,
    });
    parentHash = hash;
  }
  return commits;
}

// --- Authors ---
const JIN = "Jin Chen <jchen@nexacorp.com>";
const SARAH = "Sarah Knight <sarah@nexacorp.com>";
const OSCAR = "Oscar Diaz <oscar@nexacorp.com>";
const AURI = "Auri Park <auri@nexacorp.com>";

// --- Progressive _marts__models.yml versions ---

const MARTS_YAML_V1 = `version: 2

models:
  - name: dim_employees
    description: "Employee dimension table — active employees only"
    columns:
      - name: employee_id
        tests:
          - unique
          - not_null
      - name: full_name
      - name: department
      - name: status
      - name: hire_date

  - name: fct_system_events
    description: "Fact table of system events"
    columns:
      - name: event_id
        tests:
          - unique
          - not_null
`;

const MARTS_YAML_V2 = `version: 2

models:
  - name: dim_employees
    description: "Employee dimension table — active employees only"
    columns:
      - name: employee_id
        tests:
          - unique
          - not_null
      - name: full_name
      - name: department
      - name: status
      - name: hire_date

  - name: fct_system_events
    description: "Fact table of system events"
    columns:
      - name: event_id
        tests:
          - unique
          - not_null

  - name: fct_support_tickets
    description: "Support ticket fact table"
    columns:
      - name: ticket_id
        tests:
          - unique
          - not_null
`;

const MARTS_YAML_V3 = `version: 2

models:
  - name: dim_employees
    description: "Employee dimension table — active employees only"
    columns:
      - name: employee_id
        tests:
          - unique
          - not_null
      - name: full_name
      - name: department
      - name: status
      - name: hire_date

  - name: fct_system_events
    description: "Fact table of system events"
    columns:
      - name: event_id
        tests:
          - unique
          - not_null

  - name: fct_support_tickets
    description: "Support ticket fact table"
    columns:
      - name: ticket_id
        tests:
          - unique
          - not_null

  - name: rpt_ai_performance
    description: "AI model performance summary"
    columns:
      - name: model_name
        tests:
          - not_null
`;

const MARTS_YAML_V4 = `version: 2

models:
  - name: dim_employees
    description: "Employee dimension table — active employees only"
    columns:
      - name: employee_id
        tests:
          - unique
          - not_null
      - name: full_name
      - name: department
      - name: status
      - name: hire_date

  - name: fct_system_events
    description: "Fact table of system events"
    columns:
      - name: event_id
        tests:
          - unique
          - not_null

  - name: fct_support_tickets
    description: "Support ticket fact table"
    columns:
      - name: ticket_id
        tests:
          - unique
          - not_null

  - name: rpt_ai_performance
    description: "AI model performance summary"
    columns:
      - name: model_name
        tests:
          - not_null

  - name: rpt_employee_directory
    description: "Company employee directory for HR portal"
    columns:
      - name: employee_id
        tests:
          - unique
      - name: full_name
        tests:
          - not_null

  - name: rpt_department_spending
    description: "Department budget vs actual spending report"
    columns:
      - name: department_name
        tests:
          - not_null
`;

// v5 is read from buildDbtProject() to avoid drift
const ALL_FILES = flattenTree(buildDbtProject());
const MARTS_YAML_V5 = ALL_FILES["models/marts/_marts__models.yml"];

// UPDATED_MARTS_YAML adds conversion_rate: not_null test (Auri's dynamic commit)
const UPDATED_MARTS_YAML = `version: 2

models:
  - name: dim_employees
    description: "Employee dimension table — active employees only"
    columns:
      - name: employee_id
        tests:
          - unique
          - not_null
      - name: full_name
      - name: department
      - name: status
      - name: hire_date

  - name: fct_system_events
    description: "Fact table of system events"
    columns:
      - name: event_id
        tests:
          - unique
          - not_null

  - name: fct_support_tickets
    description: "Support ticket fact table"
    columns:
      - name: ticket_id
        tests:
          - unique
          - not_null

  - name: rpt_ai_performance
    description: "AI model performance summary"
    columns:
      - name: model_name
        tests:
          - not_null

  - name: rpt_employee_directory
    description: "Company employee directory for HR portal"
    columns:
      - name: employee_id
        tests:
          - unique
      - name: full_name
        tests:
          - not_null

  - name: rpt_department_spending
    description: "Department budget vs actual spending report"
    columns:
      - name: department_name
        tests:
          - not_null

  - name: rpt_campaign_performance
    description: "Marketing campaign performance summary"
    columns:
      - name: campaign_name
        tests:
          - unique
          - not_null
      - name: conversion_rate
        tests:
          - not_null
`;

// --- profiles.yml versions ---

const PROFILES_JCHEN = `nexacorp:
  target: prod
  outputs:
    prod:
      type: snowflake
      account: nexacorp.us-east-1
      user: jchen
      role: TRANSFORMER
      database: NEXACORP_PROD
      warehouse: NEXACORP_WH
      schema: ANALYTICS
      threads: 4
`;

const PROFILES_CHIP = ALL_FILES["profiles.yml"];

// --- README versions ---

const README_INITIAL = `# NexaCorp Analytics

dbt project for NexaCorp's data warehouse transformations.

## Getting Started

\`\`\`bash
dbt run        # Run all models
dbt test       # Run data tests
dbt build      # Run models + tests
\`\`\`

## Project Structure

- \`models/staging/\` — Clean and standardize raw source data
- \`models/intermediate/\` — Combine staging models
- \`models/marts/\` — Business-facing tables and reports
`;

const README_FINAL = ALL_FILES["README.md"];

// --- Timestamp helpers ---
// Uses the local-time field convention shared with gameNowFor() so
// formatGitDate() renders these the same way as player-authored commits.
// In-game wall clock is UTC; the hour passed is the displayed UTC hour.
function utc(year: number, month: number, day: number, hour: number, min: number): number {
  return new Date(year, month - 1, day, hour, min, 0).getTime();
}

/**
 * Build the nexacorp-analytics commit chain (~18 commits).
 */
function buildAnalyticsCommits(): GitCommit[] {
  const steps: { addFiles: Record<string, string>; author: string; message: string; timestamp: number }[] = [
    // --- Sprint 1: Project kickoff (April 2025) ---
    { // 1: Apr 14, 10:23am
      author: JIN,
      message: "initial project scaffold",
      timestamp: utc(2025, 4, 14, 17, 23), // 10:23 PDT
      addFiles: {
        "dbt_project.yml": ALL_FILES["dbt_project.yml"],
        "profiles.yml": PROFILES_JCHEN,
        "README.md": README_INITIAL,
        ".gitignore": ALL_FILES[".gitignore"],
        "packages.yml": ALL_FILES["packages.yml"],
      },
    },
    { // 2: Apr 15, 2:45pm
      author: JIN,
      message: "add raw sources and staging models",
      timestamp: utc(2025, 4, 15, 21, 45), // 14:45 PDT
      addFiles: {
        "models/staging/_staging__sources.yml": ALL_FILES["models/staging/_staging__sources.yml"],
        "models/staging/_staging__models.yml": ALL_FILES["models/staging/_staging__models.yml"],
        "models/staging/stg_raw_nexacorp__employees.sql": ALL_FILES["models/staging/stg_raw_nexacorp__employees.sql"],
        "models/staging/stg_raw_nexacorp__system_events.sql": ALL_FILES["models/staging/stg_raw_nexacorp__system_events.sql"],
        "models/staging/stg_raw_nexacorp__ai_metrics.sql": ALL_FILES["models/staging/stg_raw_nexacorp__ai_metrics.sql"],
        "models/staging/stg_raw_nexacorp__department_budgets.sql": ALL_FILES["models/staging/stg_raw_nexacorp__department_budgets.sql"],
        "models/staging/stg_raw_nexacorp__support_tickets.sql": ALL_FILES["models/staging/stg_raw_nexacorp__support_tickets.sql"],
        "models/staging/stg_raw_nexacorp__campaign_metrics.sql": ALL_FILES["models/staging/stg_raw_nexacorp__campaign_metrics.sql"],
        "models/staging/stg_raw_nexacorp__employee_directory.sql": ALL_FILES["models/staging/stg_raw_nexacorp__employee_directory.sql"],
        "models/staging/stg_raw_nexacorp__projects.sql": ALL_FILES["models/staging/stg_raw_nexacorp__projects.sql"],
        "models/staging/stg_raw_nexacorp__departments.sql": ALL_FILES["models/staging/stg_raw_nexacorp__departments.sql"],
        "models/staging/stg_raw_nexacorp__customers.sql": ALL_FILES["models/staging/stg_raw_nexacorp__customers.sql"],
        "models/staging/stg_raw_nexacorp__deployments.sql": ALL_FILES["models/staging/stg_raw_nexacorp__deployments.sql"],
      },
    },
    { // 3: Apr 15, 4:12pm — fix commit (no-op)
      author: JIN,
      message: "fix source ref in stg_employees",
      timestamp: utc(2025, 4, 15, 23, 12), // 16:12 PDT
      addFiles: {},
    },
    { // 4: Apr 17, 11:05am
      author: JIN,
      message: "add intermediate employee models",
      timestamp: utc(2025, 4, 17, 18, 5), // 11:05 PDT
      addFiles: {
        "models/intermediate/int_employees_joined_to_events.sql": ALL_FILES["models/intermediate/int_employees_joined_to_events.sql"],
        "models/intermediate/int_employees_with_tenure.sql": ALL_FILES["models/intermediate/int_employees_with_tenure.sql"],
      },
    },

    // --- Sprint 2: Marts buildout (June 2025) — ~6 week gap ---
    { // 5: Jun 2, 3:30pm
      author: SARAH,
      message: "add support ticket enrichment",
      timestamp: utc(2025, 6, 2, 22, 30), // 15:30 PDT
      addFiles: {
        "models/intermediate/int_support_tickets_enriched.sql": ALL_FILES["models/intermediate/int_support_tickets_enriched.sql"],
      },
    },
    { // 6: Jun 3, 9:18am — fix commit (no-op)
      author: JIN,
      message: "fix join condition in int_support_tickets_enriched",
      timestamp: utc(2025, 6, 3, 16, 18), // 09:18 PDT
      addFiles: {},
    },
    { // 7: Jun 3, 2:40pm
      author: JIN,
      message: "add employee dim and events fact table",
      timestamp: utc(2025, 6, 3, 21, 40), // 14:40 PDT
      addFiles: {
        "models/marts/dim_employees.sql": ALL_FILES["models/marts/dim_employees.sql"],
        "models/marts/fct_system_events.sql": ALL_FILES["models/marts/fct_system_events.sql"],
        "models/marts/_marts__models.yml": MARTS_YAML_V1,
      },
    },
    { // 8: Jun 4, 10:15am (~15 min gap simulating back-to-back merges... next day)
      author: JIN,
      message: "add support tickets fact table",
      timestamp: utc(2025, 6, 4, 17, 15), // 10:15 PDT
      addFiles: {
        "models/marts/fct_support_tickets.sql": ALL_FILES["models/marts/fct_support_tickets.sql"],
        "models/marts/_marts__models.yml": MARTS_YAML_V2,
      },
    },
    { // 9: Jun 4, 10:32am — fix commit (no-op)
      author: JIN,
      message: "fix yml indentation in _marts__models",
      timestamp: utc(2025, 6, 4, 17, 32), // 10:32 PDT
      addFiles: {},
    },

    // --- Sprint 3: Reports (Aug–Sep 2025) — ~2 month gap ---
    { // 10: Aug 11, 11:50am
      author: SARAH,
      message: "add AI performance report",
      timestamp: utc(2025, 8, 11, 18, 50), // 11:50 PDT
      addFiles: {
        "models/marts/rpt_ai_performance.sql": ALL_FILES["models/marts/rpt_ai_performance.sql"],
        "models/marts/_marts__models.yml": MARTS_YAML_V3,
      },
    },
    { // 11: Sep 15, 4:20pm
      author: JIN,
      message: "add directory and spending reports",
      timestamp: utc(2025, 9, 15, 23, 20), // 16:20 PDT
      addFiles: {
        "models/marts/rpt_employee_directory.sql": ALL_FILES["models/marts/rpt_employee_directory.sql"],
        "models/marts/rpt_department_spending.sql": ALL_FILES["models/marts/rpt_department_spending.sql"],
        "macros/fiscal_quarter.sql": ALL_FILES["macros/fiscal_quarter.sql"],
        "models/marts/_marts__models.yml": MARTS_YAML_V4,
      },
    },
    { // 12: Sep 15, 5:02pm — no-op
      author: JIN,
      message: "update dbt_project.yml target config",
      timestamp: utc(2025, 9, 16, 0, 2), // 17:02 PDT Sep 15 = 00:02 UTC Sep 16
      addFiles: {},
    },

    // --- Oscar handles infra request (Oct 2025) ---
    { // 13: Oct 3, 9:45am
      author: OSCAR,
      message: "update profiles.yml: switch to chip_service_account",
      timestamp: utc(2025, 10, 3, 16, 45), // 09:45 PDT
      addFiles: {
        "profiles.yml": PROFILES_CHIP,
      },
    },

    // --- Sprint 4: Campaign + cleanup (Nov 2025) — ~5 week gap ---
    { // 14: Nov 10, 1:15pm
      author: JIN,
      message: "add campaign performance report",
      timestamp: utc(2025, 11, 10, 20, 15), // 13:15 PST
      addFiles: {
        "models/marts/rpt_campaign_performance.sql": ALL_FILES["models/marts/rpt_campaign_performance.sql"],
        "models/marts/_marts__models.yml": MARTS_YAML_V5,
      },
    },
    { // 15: Nov 11, 10:40am
      author: JIN,
      message: "add seed data and custom tests",
      timestamp: utc(2025, 11, 11, 18, 40), // 10:40 PST
      addFiles: {
        "seeds/department_codes.csv": ALL_FILES["seeds/department_codes.csv"],
        "seeds/status_codes.csv": ALL_FILES["seeds/status_codes.csv"],
        "tests/assert_employee_count.sql": ALL_FILES["tests/assert_employee_count.sql"],
        "tests/assert_no_future_hire_dates.sql": ALL_FILES["tests/assert_no_future_hire_dates.sql"],
        "tests/assert_no_negative_budgets.sql": ALL_FILES["tests/assert_no_negative_budgets.sql"],
        "tests/assert_valid_ticket_priorities.sql": ALL_FILES["tests/assert_valid_ticket_priorities.sql"],
        "tests/assert_all_tickets_in_directory.sql": ALL_FILES["tests/assert_all_tickets_in_directory.sql"],
        "macros/filter_internal.sql": ALL_FILES["macros/filter_internal.sql"],
      },
    },
    { // 16: Nov 11, 10:58am — fix (no-op)
      author: JIN,
      message: "fix test ref: dim_employees -> stg table",
      timestamp: utc(2025, 11, 11, 18, 58), // 10:58 PST
      addFiles: {},
    },

    // --- Final commits before Jin leaves (Jan 2026) — ~2 month gap ---
    { // 17: Jan 13, 2026, 3:30pm
      author: AURI,
      message: "update README with setup instructions",
      timestamp: utc(2026, 1, 13, 23, 30), // 15:30 PST
      addFiles: {
        "README.md": README_FINAL,
      },
    },
  ];

  return buildCommitChain(steps);
}

/**
 * Registry of remote repositories that can be cloned.
 * Keys are the URL passed to `git clone`.
 */
export const REMOTE_REPOS: Record<string, RemoteRepoDef> = {
  "nexacorp/nexacorp-analytics": (() => {
    const commits = buildAnalyticsCommits();
    const finalTree = commits[commits.length - 1].tree;
    return {
      files: finalTree,
      defaultBranch: "main",
      commits,
      getUpdates: (storyFlags: Record<string, string | boolean>, localHead: string | null) => {
        if (!storyFlags.day1_shutdown || !localHead) return [];
        const message = "add not_null test for conversion_rate";
        const timestamp = 1772000000000;
        // Deterministic remote-tip hash so repeated pulls converge instead of looping.
        const hash = shortHash(message + timestamp);
        if (localHead === hash) return [];
        const files = { ...finalTree };
        files["models/marts/_marts__models.yml"] = UPDATED_MARTS_YAML;
        return [{ hash, parent: localHead, message, author: "Auri Park <auri@nexacorp.com>", timestamp, tree: files }];
      },
    } satisfies RemoteRepoDef;
  })(),
};

// Re-export for use in story content that registers remotes
export { buildSimpleRemote };
