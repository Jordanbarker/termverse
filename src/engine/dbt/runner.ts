import { CommandContext, CommandResult, IncrementalLine } from "@tt/core/commands/types";
import { DbtDebugInfo, DbtRunSummary, DbtTestResult, ModelRunResult } from "./types";
import {
  findDbtProject,
  parseProjectConfig,
  discoverModels,
  discoverResources,
  parseMaterializationConfig,
  buildMaterializationMap,
} from "./project";
import { STANDARD_MODEL_ORDER } from "./data";
import {
  formatRunHeader,
  formatModelRun,
  formatTestRun,
  formatSummary,
  formatDebug,
  formatShowOutput,
  formatCompiledSql,
} from "./output";
import { DBT_DEFAULT_LINE_DELAY_MS, jitterDelay } from "@tt/core/lib/timing";
import { parseSourceMap, parseMacros, compileSql, extractRefs } from "./compiler";
import { executeModel, executeTest, queryModel, getModelRowCount } from "./executor";
import { createDefaultContext } from "@tt/core/snowflake/session/context";
import { execute as executeSql } from "@tt/core/snowflake/executor/executor";
import { isFile, isDirectory } from "@tt/core/filesystem/types";
import { SnowflakeState } from "@tt/core/snowflake/state";

/** In-game "now" as a Date, falling back to the real clock when none is injected. */
function clockNow(ctx: CommandContext): Date {
  return ctx.clock?.now() ?? new Date();
}

/** In-game "now" as "HH:MM:SS" for dbt log prefixes, with a real-clock fallback. */
function clockTs(ctx: CommandContext): string {
  if (ctx.clock) return ctx.clock.ts();
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function loadProject(ctx: CommandContext): { projectRoot: string } | { error: string } {
  const projectRoot = findDbtProject(ctx.fs, ctx.cwd);
  if (!projectRoot) {
    return { error: "Runtime Error\n  Could not find dbt_project.yml." };
  }
  return { projectRoot };
}

/**
 * Read a model's raw SQL from the VFS. Searches all model paths.
 */
function readModelSql(ctx: CommandContext, projectRoot: string, modelName: string, modelPaths: string[]): string | null {
  for (const modelPath of modelPaths) {
    const result = findModelFile(ctx, projectRoot + "/" + modelPath, modelName);
    if (result) return result;
  }
  return null;
}

function findModelFile(ctx: CommandContext, dirPath: string, modelName: string): string | null {
  const node = ctx.fs.getNode(dirPath);
  if (!node || !isDirectory(node)) return null;

  for (const [name, child] of Object.entries(node.children)) {
    if (isFile(child) && name === modelName + ".sql") {
      return child.content;
    }
  }

  for (const [name, child] of Object.entries(node.children)) {
    if (isDirectory(child)) {
      const result = findModelFile(ctx, dirPath + "/" + name, modelName);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Read a test's raw SQL from the VFS.
 */
function readTestSql(ctx: CommandContext, projectRoot: string, testName: string): string | null {
  const testPath = projectRoot + "/tests/" + testName + ".sql";
  const node = ctx.fs.getNode(testPath);
  if (node && isFile(node)) return node.content;
  return null;
}

/**
 * Resolve all transitive upstream dependencies for a model.
 * Returns dependency names in no particular order (caller sorts).
 */
function resolveDependencies(
  ctx: CommandContext,
  projectRoot: string,
  modelPaths: string[],
  targetModel: string,
  allModels: string[],
): string[] {
  const deps = new Set<string>();
  const queue = [targetModel];

  while (queue.length > 0) {
    const model = queue.pop()!;
    const sql = readModelSql(ctx, projectRoot, model, modelPaths);
    if (!sql) continue;

    for (const ref of extractRefs(sql)) {
      if (!deps.has(ref) && ref !== targetModel && allModels.includes(ref)) {
        deps.add(ref);
        queue.push(ref);
      }
    }
  }

  return Array.from(deps);
}

/**
 * Run models. If selectModel is provided, run only that model.
 */
export function runModels(ctx: CommandContext, selectModel?: string): CommandResult {
  const project = loadProject(ctx);
  if ("error" in project) return { output: project.error };

  const configContent = ctx.fs.readFile(project.projectRoot + "/dbt_project.yml");
  if (!configContent.content) return { output: "Error reading dbt_project.yml" };
  const config = parseProjectConfig(configContent.content);

  if (!ctx.snowflakeState) {
    return { output: "Error: Snowflake connection required. Run `snow sql` to verify connectivity." };
  }

  // Parse compilation context
  const sourceMap = parseSourceMap(ctx.fs, project.projectRoot);
  const macros = parseMacros(ctx.fs, project.projectRoot);
  const matConfig = parseMaterializationConfig(configContent.content);
  const materializationMap = buildMaterializationMap(ctx.fs, project.projectRoot, config, matConfig);

  // Discover models from filesystem
  const discoveredModels = discoverModels(ctx.fs, project.projectRoot, config);

  let modelsToDisplay: string[];
  let modelsToExecute: string[];
  if (selectModel) {
    if (discoveredModels.includes(selectModel)) {
      modelsToDisplay = [selectModel];
      // Also execute upstream dependencies silently
      const deps = resolveDependencies(ctx, project.projectRoot, config.modelPaths, selectModel, discoveredModels);
      modelsToExecute = [...deps, selectModel];
    } else {
      return { output: `Selector error: model '${selectModel}' not found` };
    }
  } else {
    modelsToDisplay = [...discoveredModels];
    modelsToExecute = [...modelsToDisplay];
  }

  const sortByOrder = (list: string[]) => list.sort((a, b) => {
    const ai = STANDARD_MODEL_ORDER.indexOf(a);
    const bi = STANDARD_MODEL_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  sortByOrder(modelsToDisplay);
  sortByOrder(modelsToExecute);

  // Count tests for header
  const allResources = discoverResources(ctx.fs, project.projectRoot, config);
  const testCount = allResources.filter((r) => r.type === "test").length;
  const sourceCount = allResources.filter((r) => r.type === "source").length;
  const seedCount = allResources.filter((r) => r.type === "seed").length;
  const dbtTs = clockTs(ctx);
  const lines: IncrementalLine[] = [{ text: formatRunHeader(dbtTs, modelsToDisplay.length, testCount, sourceCount, seedCount), delayMs: DBT_DEFAULT_LINE_DELAY_MS }];

  let pass = 0;
  let error = 0;
  let skip = 0;
  let runningState = ctx.snowflakeState;
  const sessionCtx = createDefaultContext(
    ctx.username,
    clockNow(ctx),
  );
  const ephemeralSqlMap = new Map<string, string>();
  const failedModels = new Set<string>();
  const displaySet = new Set(modelsToDisplay);
  let displayIdx = 0;

  for (let i = 0; i < modelsToExecute.length; i++) {
    const name = modelsToExecute[i];
    const isDisplayed = displaySet.has(name);
    const rawSql = readModelSql(ctx, project.projectRoot, name, config.modelPaths);
    if (!rawSql) {
      if (isDisplayed) {
        error++;
        displayIdx++;
        const result: ModelRunResult = { status: "error", materialization: "table", executionTime: 0 };
        lines.push({ text: formatModelRun(dbtTs, displayIdx, modelsToDisplay.length, name, result, 0), delayMs: DBT_DEFAULT_LINE_DELAY_MS });
      }
      failedModels.add(name);
      continue;
    }

    // DAG-aware skip: check if any upstream dependency failed
    const refDeps = extractRefs(rawSql);
    const failedUpstream = refDeps.find((d) => failedModels.has(d));
    if (failedUpstream) {
      failedModels.add(name);
      if (isDisplayed) {
        skip++;
        displayIdx++;
        const result: ModelRunResult = { status: "error", materialization: "table", executionTime: 0 };
        lines.push({ text: formatModelRun(dbtTs, displayIdx, modelsToDisplay.length, name, result, 0), delayMs: DBT_DEFAULT_LINE_DELAY_MS });
      }
      continue;
    }

    const materialization = materializationMap.get(name) ?? "table";
    const compiled = compileSql(rawSql, sourceMap, macros, ephemeralSqlMap, materializationMap);

    if (materialization === "ephemeral") {
      ephemeralSqlMap.set(name, compiled);
      if (isDisplayed) {
        pass++;
        displayIdx++;
        const result: ModelRunResult = { status: "success", materialization: "ephemeral", executionTime: 0 };
        lines.push({ text: formatModelRun(dbtTs, displayIdx, modelsToDisplay.length, name, result, 0), delayMs: DBT_DEFAULT_LINE_DELAY_MS });
      }
      continue;
    }

    const execResult = executeModel(compiled, name, materialization, runningState, sessionCtx);

    if (execResult.status === "success") {
      runningState = execResult.newState;
      if (isDisplayed) {
        pass++;
        displayIdx++;
        const jitteredMs = jitterDelay(300);
        const executionTime = jitteredMs / 1000;
        const result: ModelRunResult = {
          status: "success",
          materialization,
          executionTime,
          rowsAffected: execResult.rowsAffected,
        };
        lines.push({ text: formatModelRun(dbtTs, displayIdx, modelsToDisplay.length, name, result, executionTime), delayMs: jitteredMs });
      }
    } else {
      failedModels.add(name);
      if (isDisplayed) {
        error++;
        displayIdx++;
        const jitteredMs = jitterDelay(300);
        const executionTime = jitteredMs / 1000;
        const result: ModelRunResult = { status: "error", materialization, executionTime, message: execResult.message };
        lines.push({ text: formatModelRun(dbtTs, displayIdx, modelsToDisplay.length, name, result, executionTime), delayMs: jitteredMs });
      }
    }
  }

  const summary: DbtRunSummary = { pass, warn: 0, error, skip, total: modelsToDisplay.length };
  lines.push({ text: "", delayMs: DBT_DEFAULT_LINE_DELAY_MS });
  lines.push({ text: formatSummary(dbtTs, summary), delayMs: DBT_DEFAULT_LINE_DELAY_MS });

  // Write final state
  ctx.setSnowflakeState?.(runningState);

  return {
    output: lines.map((l) => l.text).join("\n"),
    ...(!ctx.isPiped && { incrementalLines: lines }),
  };
}

/**
 * Run all tests.
 */
export function runTests(ctx: CommandContext): CommandResult {
  const project = loadProject(ctx);
  if ("error" in project) return { output: project.error };

  const configContent = ctx.fs.readFile(project.projectRoot + "/dbt_project.yml");
  if (!configContent.content) return { output: "Error reading dbt_project.yml" };
  const config = parseProjectConfig(configContent.content);

  if (!ctx.snowflakeState) {
    return { output: "Error: Snowflake connection required. Run `snow sql` to verify connectivity." };
  }

  const sourceMap = parseSourceMap(ctx.fs, project.projectRoot);
  const macros = parseMacros(ctx.fs, project.projectRoot);
  const matConfig = parseMaterializationConfig(configContent.content);
  const materializationMap = buildMaterializationMap(ctx.fs, project.projectRoot, config, matConfig);

  const sessionCtx = createDefaultContext(
    ctx.username,
    clockNow(ctx),
  );
  const dbtTs = clockTs(ctx);
  const allResources = discoverResources(ctx.fs, project.projectRoot, config);
  const testResources = allResources.filter((r) => r.type === "test");

  const lines: IncrementalLine[] = [];
  let pass = 0;
  let warn = 0;
  let error = 0;

  for (let i = 0; i < testResources.length; i++) {
    const test = testResources[i];
    let testSql: string | null = null;

    // Singular tests (from tests/ directory)
    testSql = readTestSql(ctx, project.projectRoot, test.name);

    if (testSql) {
      // Compile the test SQL
      const compiled = compileSql(testSql, sourceMap, macros, undefined, materializationMap);
      const result = executeTest(compiled, ctx.snowflakeState, sessionCtx);
      const jitteredMs = jitterDelay(100);
      const time = jitteredMs / 1000;

      const testResult: DbtTestResult = {
        name: test.name,
        status: result.status === "error" ? "fail" : result.status,
        time,
      };
      lines.push({ text: formatTestRun(dbtTs, i + 1, testResources.length, testResult, time), delayMs: jitteredMs });

      if (result.status === "pass") pass++;
      else if (result.status === "warn") warn++;
      else error++;
    } else {
      // Generic tests (unique/not_null from YAML)
      const genericResult = runGenericTest(test.name, ctx.snowflakeState, sessionCtx);
      const jitteredMs = jitterDelay(80);
      const time = jitteredMs / 1000;

      const testResult: DbtTestResult = {
        name: test.name,
        status: genericResult.status === "error" ? "fail" : genericResult.status,
        time,
      };
      lines.push({ text: formatTestRun(dbtTs, i + 1, testResources.length, testResult, time), delayMs: jitteredMs });

      if (genericResult.status === "pass") pass++;
      else if (genericResult.status === "warn") warn++;
      else error++;
    }
  }

  const summary: DbtRunSummary = { pass, warn, error, skip: 0, total: testResources.length };
  lines.push({ text: "", delayMs: DBT_DEFAULT_LINE_DELAY_MS });
  lines.push({ text: formatSummary(dbtTs, summary), delayMs: DBT_DEFAULT_LINE_DELAY_MS });

  const triggerEvents: { type: "command_executed"; detail: string }[] = [];
  if (error > 0) {
    triggerEvents.push({ type: "command_executed", detail: "dbt_test_fail" });
  }
  if (warn > 0) {
    triggerEvents.push({ type: "command_executed", detail: "dbt_test_warn" });
  }
  if (error === 0) {
    triggerEvents.push({ type: "command_executed", detail: "dbt_test_all_pass" });
  }

  return {
    output: lines.map((l) => l.text).join("\n"),
    ...(!ctx.isPiped && { incrementalLines: lines }),
    ...(triggerEvents.length > 0 && { triggerEvents }),
  };
}

/**
 * Run a generic test (unique_MODEL_COLUMN or not_null_MODEL_COLUMN).
 */
function runGenericTest(
  testName: string,
  state: SnowflakeState,
  sessionCtx: ReturnType<typeof createDefaultContext>,
): { status: "pass" | "warn" | "error" } {
  // Parse test name: unique_MODEL_COLUMN or not_null_MODEL_COLUMN
  let testType: string;
  let rest: string;

  if (testName.startsWith("unique_")) {
    testType = "unique";
    rest = testName.slice("unique_".length);
  } else if (testName.startsWith("not_null_")) {
    testType = "not_null";
    rest = testName.slice("not_null_".length);
  } else {
    return { status: "error" };
  }

  // Split rest into model name and column: the column is the last segment after the LAST underscore
  // But model names contain underscores, so find the model by checking ANALYTICS tables/views
  const { modelName, columnName } = parseGenericTestName(rest, state);
  if (!modelName || !columnName) return { status: "error" };

  const fqTable = `NEXACORP_PROD.ANALYTICS.${modelName.toUpperCase()}`;

  let sql: string;
  if (testType === "unique") {
    sql = `SELECT ${columnName}, COUNT(*) AS cnt FROM ${fqTable} GROUP BY ${columnName} HAVING COUNT(*) > 1`;
  } else {
    sql = `SELECT ${columnName} FROM ${fqTable} WHERE ${columnName} IS NULL`;
  }

  const result = executeTest(sql, state, sessionCtx);
  return { status: result.status === "pass" ? "pass" : "error" };
}

/**
 * Parse a generic test name (e.g., "dim_employees_employee_id") into model + column.
 * Tries to find a matching table/view in ANALYTICS schema.
 */
function parseGenericTestName(
  rest: string,
  state: SnowflakeState,
): { modelName: string | null; columnName: string | null } {
  // Try progressively longer model name prefixes
  const parts = rest.split("_");
  for (let i = parts.length - 1; i >= 1; i--) {
    const candidateModel = parts.slice(0, i).join("_");
    const candidateColumn = parts.slice(i).join("_");
    const upper = candidateModel.toUpperCase();
    // Check if this model exists as a table or view
    if (state.getTable("NEXACORP_PROD", "ANALYTICS", upper) ||
        state.getView("NEXACORP_PROD", "ANALYTICS", upper)) {
      return { modelName: candidateModel, columnName: candidateColumn };
    }
  }

  // Fallback: assume last part is column, rest is model
  const lastUnderscore = rest.lastIndexOf("_");
  if (lastUnderscore === -1) return { modelName: null, columnName: null };
  return {
    modelName: rest.slice(0, lastUnderscore),
    columnName: rest.slice(lastUnderscore + 1),
  };
}

/**
 * Run models then tests (dbt build).
 */
export function runBuild(ctx: CommandContext, selectedModel?: string): CommandResult {
  let latestState = ctx.snowflakeState;
  const wrappedCtx: CommandContext = {
    ...ctx,
    setSnowflakeState: (s: SnowflakeState) => {
      latestState = s;
      ctx.setSnowflakeState?.(s);
    },
  };

  const runResult = runModels(wrappedCtx, selectedModel);
  if (runResult.output.startsWith("Runtime Error") || runResult.output.startsWith("Error:")) return {
    ...runResult,
    triggerEvents: [
      ...(runResult.triggerEvents || []),
      { type: "command_executed" as const, detail: "dbt_build" },
    ],
  };

  const testResult = runTests({ ...wrappedCtx, snowflakeState: latestState });

  const combinedLines = [...(runResult.incrementalLines || []), { text: "", delayMs: DBT_DEFAULT_LINE_DELAY_MS }, ...(testResult.incrementalLines || [])];
  return {
    output: runResult.output + "\n\n" + testResult.output,
    ...(!ctx.isPiped && { incrementalLines: combinedLines }),
    triggerEvents: [
      ...(runResult.triggerEvents || []),
      ...(testResult.triggerEvents || []),
      { type: "command_executed" as const, detail: "dbt_build" },
    ],
  };
}

/**
 * List resources. Optionally filter by type.
 */
export function listResources(ctx: CommandContext, resourceType?: string): CommandResult {
  const project = loadProject(ctx);
  if ("error" in project) return { output: project.error };

  const configContent = ctx.fs.readFile(project.projectRoot + "/dbt_project.yml");
  if (!configContent.content) return { output: "Error reading dbt_project.yml" };
  const config = parseProjectConfig(configContent.content);

  let resources = discoverResources(ctx.fs, project.projectRoot, config);

  if (resourceType) {
    resources = resources.filter((r) => r.type === resourceType);
  }

  if (resources.length === 0) {
    return { output: "No resources found." };
  }

  const lines = resources.map((r) => {
    const prefix = `${config.name}.${r.name}`;
    return prefix;
  });

  return { output: lines.join("\n") };
}

/**
 * Show debug/connection info.
 */
export function debugProject(ctx: CommandContext): CommandResult {
  const project = loadProject(ctx);
  if ("error" in project) return { output: project.error };

  const info: DbtDebugInfo = {
    account: "nexacorp.us-east-1",
    user: "chip_service_account",
    database: "NEXACORP_PROD",
    warehouse: "NEXACORP_WH",
    role: "TRANSFORMER",
    schema: "ANALYTICS",
    dbtVersion: "1.7.4",
    profileName: "nexacorp",
    target: "prod",
  };

  const dbtTs = clockTs(ctx);
  return { output: formatDebug(dbtTs, info) };
}

/**
 * Compile a model, showing resolved SQL.
 */
export function compileModel(ctx: CommandContext, modelName?: string): CommandResult {
  const project = loadProject(ctx);
  if ("error" in project) return { output: project.error };

  if (!modelName) {
    return { output: "Usage: dbt compile --select MODEL_NAME" };
  }

  const configContent = ctx.fs.readFile(project.projectRoot + "/dbt_project.yml");
  if (!configContent.content) return { output: "Error reading dbt_project.yml" };
  const config = parseProjectConfig(configContent.content);

  const rawSql = readModelSql(ctx, project.projectRoot, modelName, config.modelPaths);
  if (!rawSql) {
    return { output: `Selector error: model '${modelName}' not found` };
  }

  const sourceMap = parseSourceMap(ctx.fs, project.projectRoot);
  const macros = parseMacros(ctx.fs, project.projectRoot);
  const matConfig = parseMaterializationConfig(configContent.content);
  const materializationMap = buildMaterializationMap(ctx.fs, project.projectRoot, config, matConfig);

  const sql = compileSql(rawSql, sourceMap, macros, undefined, materializationMap);

  // Write compiled SQL to target/compiled/ (create dir if needed)
  let fs = ctx.fs;
  const compiledDir = project.projectRoot + "/target/compiled";
  if (!fs.getNode(compiledDir)) {
    const mkdirResult = fs.makeDirectory(compiledDir);
    if (mkdirResult.fs) fs = mkdirResult.fs;
  }
  const targetPath = compiledDir + "/" + modelName + ".sql";
  const writeResult = fs.writeFile(targetPath, sql);

  const dbtTs = clockTs(ctx);
  return {
    output: formatCompiledSql(dbtTs, modelName, sql),
    newFs: writeResult.fs,
  };
}

/**
 * Show sample rows from a model (dbt show --select model).
 */
export function showModel(ctx: CommandContext, modelName?: string): CommandResult {
  const project = loadProject(ctx);
  if ("error" in project) return { output: project.error };

  if (!modelName) {
    return { output: "Usage: dbt show --select MODEL_NAME" };
  }

  if (!ctx.snowflakeState) {
    return { output: `Selector error: model '${modelName}' not found` };
  }

  const configContent = ctx.fs.readFile(project.projectRoot + "/dbt_project.yml");
  if (!configContent.content) return { output: "Error reading dbt_project.yml" };
  const config = parseProjectConfig(configContent.content);

  // Check model exists in VFS
  const rawSql = readModelSql(ctx, project.projectRoot, modelName, config.modelPaths);
  if (!rawSql) {
    return { output: `Selector error: model '${modelName}' not found` };
  }

  const sessionCtx = createDefaultContext(
    ctx.username,
    clockNow(ctx),
  );
  const dbtTs = clockTs(ctx);
  const SHOW_LIMIT = 5;

  // Try to query the materialized table/view
  const resultSet = queryModel(modelName, ctx.snowflakeState, sessionCtx, SHOW_LIMIT);
  if (!resultSet) {
    // Model hasn't been run yet — compile and execute ad-hoc
    const sourceMap = parseSourceMap(ctx.fs, project.projectRoot);
    const macros = parseMacros(ctx.fs, project.projectRoot);
    const matConfig = parseMaterializationConfig(configContent.content);
    const materializationMap = buildMaterializationMap(ctx.fs, project.projectRoot, config, matConfig);
    const compiled = compileSql(rawSql, sourceMap, macros, undefined, materializationMap);

    // Execute the compiled SQL directly
    const { results: adHocResults } = executeSql(compiled, ctx.snowflakeState, sessionCtx);
    const rs = adHocResults.find((r: { type: string }) => r.type === "resultset");
    if (!rs || rs.type !== "resultset") {
      return { output: `Error: Could not preview model '${modelName}'. Run \`dbt run\` first.` };
    }

    const adHocColumns = rs.data.columns.map((c: { name: string }) => c.name);
    const adHocRows = rs.data.rows.slice(0, SHOW_LIMIT).map((row: unknown[]) => row.map((v) => String(v ?? "")));

    return {
      output: formatShowOutput(dbtTs, modelName, adHocColumns, adHocRows, rs.data.rowCount),
    };
  }

  const columns = resultSet.columns.map((c) => c.name);
  const displayRows = resultSet.rows.slice(0, SHOW_LIMIT).map((row) => row.map((v) => String(v ?? "")));
  const totalRows = getModelRowCount(modelName, ctx.snowflakeState, sessionCtx) ?? resultSet.rowCount;

  return {
    output: formatShowOutput(dbtTs, modelName, columns, displayRows, totalRows),
  };
}
