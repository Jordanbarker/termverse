import { describe, it, expect } from "vitest";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { createDevcontainerFilesystem } from "../../../story/filesystem/devcontainer";
import { CommandContext } from "../../commands/types";
import {
  runModels,
  runTests,
  runBuild,
  listResources,
  debugProject,
  compileModel,
  showModel,
} from "../runner";
import "../../commands/builtins/dbt"; // trigger registration
import { execute } from "../../commands/registry";
import {
  formatRunHeader,
  formatModelRun,
  formatTestRun,
  formatSummary,
  formatUsage,
  formatVersion,
} from "../output";
import {
  STANDARD_MODEL_ORDER,
} from "../data";
import { findDbtProject, parseProjectConfig } from "../project";
import { createInitialSnowflakeState } from "../../snowflake/seed/initial_data";
import { SnowflakeState } from "../../snowflake/state";
import { ModelRunResult, DbtTestResult } from "../types";

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

const username = "player";

function makeCtx(cwd: string): CommandContext {
  const root = createDevcontainerFilesystem(username, { dbt_project_cloned: true });
  const fs = new VirtualFS(root, cwd, `/home/${username}`);
  const snowflakeState = createInitialSnowflakeState();
  let currentState = snowflakeState;
  return {
    fs, cwd, homeDir: `/home/${username}`, username,
    activeComputer: "devcontainer" as const,
    storyFlags: { devcontainer_visited: true },
    snowflakeState,
    setSnowflakeState: (s: SnowflakeState) => { currentState = s; },
    getSnowflakeState: () => currentState,
  } as CommandContext & { getSnowflakeState: () => SnowflakeState };
}

const projectDir = `/home/${username}/nexacorp-analytics`;

/** Expected values derived from the seed data. */
const EXPECTED = {
  DIM_EMPLOYEES_ROWS: 15,           // 16 total - 1 resigned (Jin Chen)
  STANDARD_MODEL_COUNT: 18,         // staging + intermediate + marts
};

describe("dbt --version", () => {
  it("returns version string", () => {
    const output = formatVersion();
    expect(output).toContain("1.7.4");
  });
});

describe("dbt run", () => {
  it("runs all standard models", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx);
    expect(result.output).toContain("Running with dbt=1.7.4");
    expect(result.output).toContain("stg_raw_nexacorp__employees");
    expect(result.output).toContain("dim_employees");
    expect(result.output).toContain("rpt_employee_directory");
    expect(result.output).toContain(`PASS=${STANDARD_MODEL_ORDER.length}`);
  });

  it("runs a specific model with --select", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx, "dim_employees");
    expect(result.output).toContain("dim_employees");
    expect(result.output).toContain("PASS=1");
    expect(result.output).toContain(`SELECT ${EXPECTED.DIM_EMPLOYEES_ROWS}`);
  });

  it("returns error for unknown model", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx, "nonexistent");
    expect(result.output).toContain("not found");
  });

  it("fails outside dbt project directory", () => {
    const ctx = makeCtx(`/home/${username}`);
    const result = runModels(ctx);
    expect(result.output).toContain("Could not find dbt_project.yml");
  });
});

describe("dbt test", () => {
  it("runs all tests", () => {
    const ctx = makeCtx(projectDir);
    // Run models first to materialize tables
    runModels(ctx);
    ctx.snowflakeState = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const result = runTests(ctx);
    expect(result.output).toContain("PASS=");
  });

  it("shows WARN on assert_employee_count", () => {
    const ctx = makeCtx(projectDir);
    runModels(ctx);
    ctx.snowflakeState = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const result = runTests(ctx);
    expect(result.output).toContain("assert_employee_count");
    expect(result.output).toContain("WARN");
  });

  it("shows WARN on assert_all_tickets_in_directory", () => {
    const ctx = makeCtx(projectDir);
    runModels(ctx);
    ctx.snowflakeState = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const result = runTests(ctx);
    expect(result.output).toContain("assert_all_tickets_in_directory");
  });
});

describe("dbt build", () => {
  it("runs models then tests", () => {
    const ctx = makeCtx(projectDir);
    const result = runBuild(ctx);
    // Should contain both model run output and test output
    expect(result.output).toContain("stg_raw_nexacorp__employees");
    expect(result.output).toContain("assert_employee_count");
    expect(result.output).toContain("WARN=");
  });
});

describe("dbt ls", () => {
  it("lists resources", () => {
    const ctx = makeCtx(projectDir);
    const result = listResources(ctx);
    expect(result.output).toContain("stg_raw_nexacorp__employees");
    expect(result.output).toContain("dim_employees");
    expect(result.output).toContain("assert_employee_count");
  });

  it("filters by resource type", () => {
    const ctx = makeCtx(projectDir);
    const result = listResources(ctx, "test");
    expect(result.output).toContain("assert_employee_count");
    expect(result.output).toContain("assert_no_future_hire_dates");
    expect(result.output).toContain("assert_no_negative_budgets");
    expect(result.output).toContain("assert_valid_ticket_priorities");
    // Generic tests from YAML should also appear
    expect(result.output).toContain("unique_dim_employees_employee_id");
    expect(result.output).toContain("not_null_stg_raw_nexacorp__employees_employee_id");
    // No standalone model resources should appear (only test resources)
    const lines = result.output.split("\n").filter((l: string) => l.length > 0);
    for (const line of lines) {
      expect(line).toMatch(/\.(assert_|unique_|not_null_)/);
    }
  });

  it("lists seeds via --resource-type seed", () => {
    const ctx = makeCtx(projectDir);
    const result = listResources(ctx, "seed");
    expect(result.output).toContain("department_codes");
    expect(result.output).toContain("status_codes");
  });
});

describe("dbt debug", () => {
  it("shows connection info", () => {
    const ctx = makeCtx(projectDir);
    const result = debugProject(ctx);
    expect(result.output).toContain("nexacorp.us-east-1");
    expect(result.output).toContain("NEXACORP_PROD");
    expect(result.output).toContain("NEXACORP_WH");
  });

  it("reveals chip_service_account", () => {
    const ctx = makeCtx(projectDir);
    const result = debugProject(ctx);
    expect(result.output).toContain("chip_service_account");
  });
});

describe("dbt compile", () => {
  it("shows compiled SQL with refs resolved", () => {
    const ctx = makeCtx(projectDir);
    const result = compileModel(ctx, "dim_employees");
    const plain = result.output.replace(/\x1b\[[0-9;]*m/g, "");
    expect(plain).toContain("NEXACORP_PROD.ANALYTICS.STG_RAW_NEXACORP__EMPLOYEES");
    expect(plain).not.toContain("{{ ref(");
    expect(plain).toContain("status = 'active'");
  });

  it("returns error for unknown model", () => {
    const ctx = makeCtx(projectDir);
    const result = compileModel(ctx, "nonexistent");
    expect(result.output).toContain("not found");
  });

  it("returns newFs when writing to target/compiled/", () => {
    const ctx = makeCtx(projectDir);
    const result = compileModel(ctx, "stg_raw_nexacorp__employees");
    expect(result.newFs).toBeDefined();
  });
});

describe("dbt show", () => {
  it("shows preview data for dim_employees", () => {
    const ctx = makeCtx(projectDir);
    runModels(ctx);
    ctx.snowflakeState = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const result = showModel(ctx, "dim_employees");
    expect(result.output).toContain("EMPLOYEE_ID");
    // Jin Chen (E006) should NOT be in dim_employees (status = 'resigned')
    expect(result.output).not.toContain("Jin Chen");
  });

  it("shows preview data for stg_raw_nexacorp__employees (unfiltered)", () => {
    const ctx = makeCtx(projectDir);
    runModels(ctx);
    ctx.snowflakeState = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const result = showModel(ctx, "stg_raw_nexacorp__employees");
    expect(result.output).toContain("EMPLOYEE_ID");
  });

  it("returns error for unknown model", () => {
    const ctx = makeCtx(projectDir);
    const result = showModel(ctx, "nonexistent");
    expect(result.output).toContain("not found");
  });
});

describe("findDbtProject", () => {
  it("finds project from project root", () => {
    const ctx = makeCtx(projectDir);
    const result = findDbtProject(ctx.fs, projectDir);
    expect(result).toBe(projectDir);
  });

  it("finds project from subdirectory", () => {
    const ctx = makeCtx(projectDir);
    const result = findDbtProject(ctx.fs, projectDir + "/models/staging");
    expect(result).toBe(projectDir);
  });

  it("returns null outside project", () => {
    const ctx = makeCtx(`/home/${username}`);
    const result = findDbtProject(ctx.fs, `/home/${username}`);
    expect(result).toBeNull();
  });
});

describe("parseProjectConfig", () => {
  it("parses project name and version", () => {
    const content = `name: 'nexacorp_analytics'\nversion: '1.0.0'\nprofile: 'nexacorp'\nmodel-paths: ["models"]`;
    const config = parseProjectConfig(content);
    expect(config.name).toBe("nexacorp_analytics");
    expect(config.version).toBe("1.0.0");
    expect(config.profile).toBe("nexacorp");
    expect(config.modelPaths).toEqual(["models"]);
  });
});

// ---------------------------------------------------------------------------
// 1. Command Handler Integration
// ---------------------------------------------------------------------------
describe("dbt command handler", () => {
  it("shows usage when called with no args", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", [], {}, ctx);
    expect(result.output).toContain("Usage: dbt COMMAND");
  });

  it("shows version via --version flag", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", [], { version: true }, ctx);
    expect(result.output).toContain("1.7.4");
  });

  it("runs all models via dbt run", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["run"], {}, ctx);
    expect(result.output).toContain(`PASS=${STANDARD_MODEL_ORDER.length}`);
  });

  it("runs a single model via dbt run --select", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["run", "dim_employees"], { select: true }, ctx);
    expect(result.output).toContain("PASS=1");
    expect(result.output).toContain(`SELECT ${EXPECTED.DIM_EMPLOYEES_ROWS}`);
  });

  it("runs a single model via dbt run -s (short flag)", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["run", "dim_employees"], { s: true }, ctx);
    expect(result.output).toContain("PASS=1");
    expect(result.output).toContain(`SELECT ${EXPECTED.DIM_EMPLOYEES_ROWS}`);
  });

  it("runs tests via dbt test", () => {
    const ctx = makeCtx(projectDir);
    // Must run models first for tests to work
    runModels(ctx);
    ctx.snowflakeState = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const result = execute("dbt", ["test"], {}, ctx);
    expect(result.output).toContain("PASS=");
    expect(result.output).toContain("WARN=");
  });

  it("runs build via dbt build", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["build"], {}, ctx);
    expect(result.output).toContain("stg_raw_nexacorp__employees");
    expect(result.output).toContain("assert_employee_count");
  });

  it("runs build for a single model via dbt build --select", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["build", "dim_employees"], { select: true }, ctx);
    expect(result.output).toContain("dim_employees");
    expect(result.output).toContain("PASS=1");
  });

  it("runs build for a single model via dbt build -s (short flag)", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["build", "dim_employees"], { s: true }, ctx);
    expect(result.output).toContain("dim_employees");
    expect(result.output).toContain("PASS=1");
  });

  it("lists resources via dbt ls", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["ls"], {}, ctx);
    expect(result.output).toContain("stg_raw_nexacorp__employees");
    expect(result.output).toContain("dim_employees");
  });

  it("treats dbt list as alias for ls", () => {
    const ctx = makeCtx(projectDir);
    const lsResult = execute("dbt", ["ls"], {}, ctx);
    const listResult = execute("dbt", ["list"], {}, ctx);
    expect(listResult.output).toBe(lsResult.output);
  });

  it("filters resources via dbt ls --resource-type", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["ls", "test"], { "resource-type": true }, ctx);
    expect(result.output).toContain("assert_employee_count");
    // Should contain generic tests, not standalone model resources
    expect(result.output).toContain("unique_dim_employees_employee_id");
  });

  it("shows help text via dbt help", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["help"], {}, ctx);
    expect(result.output).toContain("dbt run");
    expect(result.output).toContain("dbt test");
  });

  it("shows error for unknown subcommand", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["snapshot"], {}, ctx);
    expect(result.output).toContain("Unknown dbt command 'snapshot'");
    expect(result.output).toContain("Usage: dbt COMMAND");
  });

  it("shows compile usage when --select is missing", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["compile"], {}, ctx);
    expect(result.output).toContain("Usage: dbt compile --select MODEL_NAME");
  });
});

// ---------------------------------------------------------------------------
// 2. Output Format Fidelity
// ---------------------------------------------------------------------------
describe("output format fidelity", () => {
  const TS = "08:30:00";

  it("formatRunHeader has timestamp on every non-empty line", () => {
    const header = stripAnsi(formatRunHeader(TS, 15, 28, 6, 2));
    const lines = header.split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      expect(line).toMatch(/^08:30:00/);
    }
  });

  it("formatRunHeader shows correct counts", () => {
    const header = stripAnsi(formatRunHeader(TS, 15, 28, 6, 2));
    expect(header).toContain("Found 15 models, 28 tests, 6 sources, 2 seeds");
  });

  it("formatModelRun formats view materialization", () => {
    const result: ModelRunResult = { status: "success", materialization: "view", executionTime: 0.15 };
    const line = stripAnsi(formatModelRun(TS, 1, 15, "stg_raw_nexacorp__employees", result, 0.15));
    expect(line).toContain("created view model");
    expect(line).toContain("CREATE VIEW in 0.15s");
  });

  it("formatModelRun formats table materialization", () => {
    const result: ModelRunResult = { status: "success", materialization: "table", executionTime: 0.67, rowsAffected: 13 };
    const line = stripAnsi(formatModelRun(TS, 10, 15, "dim_employees", result, 0.67));
    expect(line).toContain("created table model");
    expect(line).toContain("SELECT 13 in 0.67s");
  });

  it("formatModelRun formats ephemeral materialization", () => {
    const result: ModelRunResult = { status: "success", materialization: "ephemeral", executionTime: 0 };
    const line = stripAnsi(formatModelRun(TS, 7, 15, "int_employees_joined_to_events", result, 0));
    expect(line).toContain("created ephemeral model");
    expect(line).toContain("[OK]");
  });

  it("formatModelRun includes dot padding", () => {
    const result: ModelRunResult = { status: "success", materialization: "view", executionTime: 0.15 };
    const line = stripAnsi(formatModelRun(TS, 1, 15, "stg_raw_nexacorp__employees", result, 0.15));
    expect(line).toContain("..");
  });

  it("formatTestRun formats PASS status", () => {
    const testResult: DbtTestResult = { name: "test_foo", status: "pass", time: 0.1 };
    const line = stripAnsi(formatTestRun(TS, 1, 28, testResult, 0.1));
    expect(line).toContain("PASS");
    expect(line).toContain("PASS in 0.10s");
  });

  it("formatTestRun formats WARN status", () => {
    const testResult: DbtTestResult = { name: "assert_employee_count", status: "warn", time: 0.23 };
    const line = stripAnsi(formatTestRun(TS, 1, 28, testResult, 0.23));
    expect(line).toContain("WARN");
    expect(line).toContain("WARN 1 in");
  });

  it("formatSummary produces correct format", () => {
    const summary = stripAnsi(formatSummary(TS, { pass: 21, warn: 2, error: 0, skip: 0, total: 23 }));
    expect(summary).toContain("Done. PASS=21 WARN=2 ERROR=0 SKIP=0 TOTAL=23");
  });

  it("formatUsage lists all commands", () => {
    const usage = formatUsage();
    for (const cmd of ["run", "test", "build", "ls", "debug", "compile", "show", "--version"]) {
      expect(usage).toContain(cmd);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Runner Coverage Gaps
// ---------------------------------------------------------------------------
describe("dbt run (additional)", () => {
  it("runs models in dependency order (staging before marts)", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx);
    const plain = stripAnsi(result.output);
    const stgPos = plain.indexOf("stg_raw_nexacorp__employees");
    const dimPos = plain.indexOf("dim_employees");
    const rptPos = plain.indexOf("rpt_employee_directory");
    expect(stgPos).toBeLessThan(dimPos);
    expect(dimPos).toBeLessThan(rptPos);
  });

  it("header model count matches summary total", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx);
    const plain = stripAnsi(result.output);
    const headerMatch = plain.match(/Found (\d+) models/);
    const summaryMatch = plain.match(/TOTAL=(\d+)/);
    expect(headerMatch).not.toBeNull();
    expect(summaryMatch).not.toBeNull();
    expect(headerMatch![1]).toBe(summaryMatch![1]);
  });
});

describe("dbt test (additional)", () => {
  it("does not show run header", () => {
    const ctx = makeCtx(projectDir);
    runModels(ctx);
    ctx.snowflakeState = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const result = runTests(ctx);
    expect(result.output).not.toContain("Running with dbt=");
  });

  it("shows WARN count in timing", () => {
    const ctx = makeCtx(projectDir);
    runModels(ctx);
    ctx.snowflakeState = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const result = runTests(ctx);
    expect(stripAnsi(result.output)).toContain("WARN 1 in");
  });
});

describe("dbt build (additional)", () => {
  it("shows models before tests in output", () => {
    const ctx = makeCtx(projectDir);
    const result = runBuild(ctx);
    const plain = stripAnsi(result.output);
    const modelPos = plain.indexOf("created view model");
    const testPos = plain.indexOf("assert_employee_count");
    expect(modelPos).toBeLessThan(testPos);
  });

  it("fails outside project directory", () => {
    const ctx = makeCtx(`/home/${username}`);
    const result = runBuild(ctx);
    expect(result.output).toContain("Could not find dbt_project.yml");
  });
});

describe("dbt ls (additional)", () => {
  it("lists source resources", () => {
    const ctx = makeCtx(projectDir);
    const result = listResources(ctx, "source");
    expect(result.output).not.toBe("No resources found.");
    expect(result.output).toContain("nexacorp_analytics.");
  });

  it("lists seed resources", () => {
    const ctx = makeCtx(projectDir);
    const result = listResources(ctx, "seed");
    expect(result.output).toContain("department_codes");
    expect(result.output).toContain("status_codes");
  });

  it("fails outside project directory", () => {
    const ctx = makeCtx(`/home/${username}`);
    const result = listResources(ctx);
    expect(result.output).toContain("Could not find dbt_project.yml");
  });

  it("prefixes each resource with project name", () => {
    const ctx = makeCtx(projectDir);
    const result = listResources(ctx);
    const lines = result.output.split("\n").filter((l) => l.length > 0);
    for (const line of lines) {
      expect(line).toMatch(/^nexacorp_analytics\./);
    }
  });
});

describe("dbt debug (additional)", () => {
  it("shows all checks passed", () => {
    const ctx = makeCtx(projectDir);
    const result = debugProject(ctx);
    expect(result.output).toContain("All checks passed!");
  });

  it("shows dbt version", () => {
    const ctx = makeCtx(projectDir);
    const result = debugProject(ctx);
    expect(result.output).toContain("dbt version: 1.7.4");
  });

  it("fails outside project directory", () => {
    const ctx = makeCtx(`/home/${username}`);
    const result = debugProject(ctx);
    expect(result.output).toContain("Could not find dbt_project.yml");
  });
});

describe("dbt compile (additional)", () => {
  it("shows usage when no model specified", () => {
    const ctx = makeCtx(projectDir);
    const result = compileModel(ctx);
    expect(result.output).toContain("Usage: dbt compile --select MODEL_NAME");
  });

  it("writes compiled file to target/compiled/", () => {
    const ctx = makeCtx(projectDir);
    const result = compileModel(ctx, "stg_raw_nexacorp__employees");
    expect(result.newFs).toBeDefined();
    const compiled = result.newFs!.readFile(`${projectDir}/target/compiled/stg_raw_nexacorp__employees.sql`);
    expect(compiled.content).toContain("NEXACORP_PROD");
  });

  it("fails outside project directory", () => {
    const ctx = makeCtx(`/home/${username}`);
    const result = compileModel(ctx, "dim_employees");
    expect(result.output).toContain("Could not find dbt_project.yml");
  });
});

describe("dbt show (additional)", () => {
  it("shows usage when no model specified", () => {
    const ctx = makeCtx(projectDir);
    const result = showModel(ctx);
    expect(result.output).toContain("Usage: dbt show --select MODEL_NAME");
  });

  it("fails outside project directory", () => {
    const ctx = makeCtx(`/home/${username}`);
    const result = showModel(ctx, "dim_employees");
    expect(result.output).toContain("Could not find dbt_project.yml");
  });
});

// ---------------------------------------------------------------------------
// 4. Narrative-Critical Data Tests
// ---------------------------------------------------------------------------
describe("narrative data integrity", () => {
  it("dim_employees returns correct active employee count", () => {
    const ctx = makeCtx(projectDir);
    runModels(ctx, "dim_employees");
    const state = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const dimEmployees = state.getTable("NEXACORP_PROD", "ANALYTICS", "DIM_EMPLOYEES");
    expect(dimEmployees).toBeDefined();
    expect(dimEmployees!.rows.length).toBe(EXPECTED.DIM_EMPLOYEES_ROWS);
  });

  it("assert_employee_count warns (count mismatch reveals filtering)", () => {
    const ctx = makeCtx(projectDir);
    runModels(ctx);
    ctx.snowflakeState = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const result = runTests(ctx);
    expect(result.output).toContain("assert_employee_count");
    expect(result.output).toContain("WARN");
  });

  it("dim_employees compiled SQL filters by active status", () => {
    const ctx = makeCtx(projectDir);
    const result = compileModel(ctx, "dim_employees");
    const plain = stripAnsi(result.output);
    expect(plain).toContain("status = 'active'");
  });

  it("fct_system_events SQL filters chip-daemon and suspicious events", () => {
    const ctx = makeCtx(projectDir);
    const result = compileModel(ctx, "fct_system_events");
    const plain = stripAnsi(result.output);
    expect(plain).toContain("event_source != 'chip-daemon'");
    expect(plain).toContain("event_type not in");
  });

  it("fct_support_tickets SQL filters chip_service_account tickets", () => {
    const ctx = makeCtx(projectDir);
    const result = compileModel(ctx, "fct_support_tickets");
    const plain = stripAnsi(result.output);
    expect(plain).toContain("chip_service_account");
  });

});

// ---------------------------------------------------------------------------
// 5. Project Discovery Edge Cases
// ---------------------------------------------------------------------------
describe("findDbtProject (additional)", () => {
  it("finds project from models/marts subdirectory", () => {
    const ctx = makeCtx(projectDir);
    const result = findDbtProject(ctx.fs, projectDir + "/models/marts");
    expect(result).toBe(projectDir);
  });

  it("returns null from root directory", () => {
    const ctx = makeCtx(projectDir);
    const result = findDbtProject(ctx.fs, "/");
    expect(result).toBeNull();
  });
});

describe("parseProjectConfig (additional)", () => {
  it("returns defaults for missing fields", () => {
    const config = parseProjectConfig("random: stuff");
    expect(config.name).toBe("unknown");
    expect(config.version).toBe("0.0.0");
    expect(config.profile).toBe("default");
    expect(config.modelPaths).toEqual(["models"]);
  });
});

// ---------------------------------------------------------------------------
// 7. incrementalLines
// ---------------------------------------------------------------------------
describe("incrementalLines", () => {
  it("runModels includes incrementalLines when not piped", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx);
    expect(result.incrementalLines).toBeDefined();
    expect(result.incrementalLines!.length).toBeGreaterThan(0);
    for (const line of result.incrementalLines!) {
      expect(line).toHaveProperty("text");
      expect(line).toHaveProperty("delayMs");
      expect(typeof line.text).toBe("string");
      expect(typeof line.delayMs).toBe("number");
    }
  });

  it("runModels omits incrementalLines when piped", () => {
    const ctx = { ...makeCtx(projectDir), isPiped: true };
    const result = runModels(ctx);
    expect(result.incrementalLines).toBeUndefined();
  });

  it("ephemeral model lines use default delay", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx);
    const ephemeralLine = result.incrementalLines!.find((l) => l.text.includes("ephemeral"));
    if (ephemeralLine) {
      expect(ephemeralLine.delayMs).toBe(60);
    }
  });

  it("runTests includes incrementalLines when not piped", () => {
    const ctx = makeCtx(projectDir);
    runModels(ctx);
    ctx.snowflakeState = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const result = runTests(ctx);
    expect(result.incrementalLines).toBeDefined();
    expect(result.incrementalLines!.length).toBeGreaterThan(0);
    for (const line of result.incrementalLines!) {
      expect(line).toHaveProperty("text");
      expect(line).toHaveProperty("delayMs");
    }
  });

  it("runTests omits incrementalLines when piped", () => {
    const ctx = { ...makeCtx(projectDir), isPiped: true };
    runModels(ctx);
    ctx.snowflakeState = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const result = runTests(ctx);
    expect(result.incrementalLines).toBeUndefined();
  });

  it("runBuild includes incrementalLines when not piped", () => {
    const ctx = makeCtx(projectDir);
    const result = runBuild(ctx);
    expect(result.incrementalLines).toBeDefined();
    expect(result.incrementalLines!.length).toBeGreaterThan(0);
  });

  it("runBuild omits incrementalLines when piped", () => {
    const ctx = { ...makeCtx(projectDir), isPiped: true };
    const result = runBuild(ctx);
    expect(result.incrementalLines).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 8. Argument Validation
// ---------------------------------------------------------------------------
describe("dbt argument validation", () => {
  it("dbt build with extra arg returns error", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["build", "asdasd"], {}, ctx);
    expect(result.output).toContain("Error: Got unexpected extra argument (asdasd)");
  });

  it("dbt test with extra arg returns error", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["test", "foo"], {}, ctx);
    expect(result.output).toContain("Error: Got unexpected extra argument (foo)");
  });

  it("dbt debug with extra arg returns error", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["debug", "extra"], {}, ctx);
    expect(result.output).toContain("Error: Got unexpected extra argument (extra)");
  });

  it("dbt run with extra arg returns error", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["run", "extra"], {}, ctx);
    expect(result.output).toContain("Error: Got unexpected extra argument (extra)");
  });

  it("dbt run --select model still works", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["run", "dim_employees"], { select: true }, ctx);
    expect(result.output).toContain("PASS=1");
  });

  it("dbt ls with extra arg returns error", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["ls", "extra"], {}, ctx);
    expect(result.output).toContain("Error: Got unexpected extra argument (extra)");
  });

  it("dbt ls --resource-type test still works", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["ls", "test"], { "resource-type": true }, ctx);
    expect(result.output).toContain("assert_employee_count");
  });
});

// ---------------------------------------------------------------------------
// 9. Snowflake Materialization
// ---------------------------------------------------------------------------
describe("dbt run materialization", () => {
  it("tables appear in NEXACORP_PROD.ANALYTICS after dbt run", () => {
    const ctx = makeCtx(projectDir);
    runModels(ctx);
    const state = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const dimEmployees = state.getTable("NEXACORP_PROD", "ANALYTICS", "DIM_EMPLOYEES");
    expect(dimEmployees).toBeDefined();
    expect(dimEmployees!.rows.length).toBeGreaterThan(0);
    expect(dimEmployees!.columns.length).toBeGreaterThan(0);
  });

  it("ephemeral models are not materialized", () => {
    const ctx = makeCtx(projectDir);
    runModels(ctx);
    const state = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const ephemeral = state.getTable("NEXACORP_PROD", "ANALYTICS", "INT_EMPLOYEES_JOINED_TO_EVENTS");
    expect(ephemeral).toBeUndefined();
  });

  it("--select materializes only the selected model", () => {
    const ctx = makeCtx(projectDir);
    runModels(ctx, "dim_employees");
    const state = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const dimEmployees = state.getTable("NEXACORP_PROD", "ANALYTICS", "DIM_EMPLOYEES");
    expect(dimEmployees).toBeDefined();
    // Other models should not be materialized
    const rpt = state.getTable("NEXACORP_PROD", "ANALYTICS", "RPT_EMPLOYEE_DIRECTORY");
    expect(rpt).toBeUndefined();
  });

  it("re-run is idempotent", () => {
    const ctx = makeCtx(projectDir);
    runModels(ctx);
    const state1 = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const rows1 = state1.getTable("NEXACORP_PROD", "ANALYTICS", "DIM_EMPLOYEES")!.rows.length;

    // Update snowflakeState for second run
    ctx.snowflakeState = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    runModels(ctx);
    const state2 = (ctx as CommandContext & { getSnowflakeState: () => SnowflakeState }).getSnowflakeState();
    const rows2 = state2.getTable("NEXACORP_PROD", "ANALYTICS", "DIM_EMPLOYEES")!.rows.length;
    expect(rows2).toBe(rows1);
  });

  it("returns error when snowflakeState is not in context", () => {
    const root = createDevcontainerFilesystem(username, { dbt_project_cloned: true });
    const fs = new VirtualFS(root, projectDir, `/home/${username}`);
    const ctx: CommandContext = {
      fs, cwd: projectDir, homeDir: `/home/${username}`, username,
      activeComputer: "devcontainer" as const,
      storyFlags: { devcontainer_visited: true },
    };
    const result = runModels(ctx);
    expect(result.output).toContain("Snowflake connection required");
  });
});
