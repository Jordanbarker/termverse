import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { isFile, isDirectory } from "@tt/core/filesystem/types";
import { DbtProjectConfig, DbtResource } from "./types";
import { MaterializationMap } from "./compiler";

/**
 * Walk up from cwd looking for dbt_project.yml.
 * Returns the project root path, or null if not found.
 */
export function findDbtProject(fs: VirtualFS, cwd: string): string | null {
  let dir = cwd;
  while (true) {
    const node = fs.getNode(dir + "/dbt_project.yml");
    if (node && isFile(node)) return dir;
    if (dir === "/") return null;
    const lastSlash = dir.lastIndexOf("/");
    dir = lastSlash === 0 ? "/" : dir.slice(0, lastSlash);
  }
}

/**
 * Parse a dbt_project.yml file content using simple string matching.
 * No YAML parser — just regex for the fields we care about.
 */
export function parseProjectConfig(content: string): DbtProjectConfig {
  const name = content.match(/^name:\s*['"]?([^'"\n]+)['"]?/m)?.[1]?.trim() ?? "unknown";
  const version = content.match(/^version:\s*['"]?([^'"\n]+)['"]?/m)?.[1]?.trim() ?? "0.0.0";
  const profile = content.match(/^profile:\s*['"]?([^'"\n]+)['"]?/m)?.[1]?.trim() ?? "default";

  const modelPathsMatch = content.match(/^model-paths:\s*\[([^\]]*)\]/m);
  let modelPaths = ["models"];
  if (modelPathsMatch) {
    modelPaths = modelPathsMatch[1]
      .split(",")
      .map((p) => p.trim().replace(/['"]/g, ""))
      .filter(Boolean);
  }

  return { name, version, profile, modelPaths };
}

/**
 * Recursively discover .sql model files under the model paths.
 * Returns model names in dependency order (staging → intermediate → marts).
 */
export function discoverModels(
  fs: VirtualFS,
  projectRoot: string,
  config: DbtProjectConfig
): string[] {
  const models: string[] = [];

  for (const modelPath of config.modelPaths) {
    const fullPath = projectRoot + "/" + modelPath;
    walkForSql(fs, fullPath, models);
  }

  return models;
}

/**
 * Parse folder-based materialization config from dbt_project.yml content.
 * Returns a mapping of folder name → materialization type.
 */
export function parseMaterializationConfig(content: string): Record<string, "view" | "table" | "ephemeral"> {
  const config: Record<string, "view" | "table" | "ephemeral"> = {};
  const lines = content.split("\n");
  let currentFolder = "";

  for (const line of lines) {
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    // Folder names appear at indent 4 under "models: > project_name:"
    if (indent === 4 && /^\w+:/.test(trimmed)) {
      currentFolder = trimmed.replace(/:.*/, "");
      continue;
    }

    // Materialization config at indent 6
    if (indent === 6 && trimmed.startsWith("+materialized:") && currentFolder) {
      const mat = trimmed.replace(/\+materialized:\s*/, "").trim();
      if (mat === "view" || mat === "table" || mat === "ephemeral") {
        config[currentFolder] = mat;
      }
    }
  }

  return config;
}

/**
 * Determine materialization for a model based on its path within the models/ directory.
 */
export function getMaterialization(
  modelName: string,
  modelPath: string,
  matConfig: Record<string, "view" | "table" | "ephemeral">,
): "view" | "table" | "ephemeral" {
  for (const [folder, mat] of Object.entries(matConfig)) {
    if (modelPath.includes("/" + folder + "/")) return mat;
  }
  return "table"; // default
}

/**
 * Build a MaterializationMap for all models based on their paths.
 */
export function buildMaterializationMap(
  fs: VirtualFS,
  projectRoot: string,
  config: DbtProjectConfig,
  matConfig: Record<string, "view" | "table" | "ephemeral">,
): MaterializationMap {
  const map: MaterializationMap = new Map();

  for (const modelPath of config.modelPaths) {
    const fullPath = projectRoot + "/" + modelPath;
    walkForMaterialization(fs, fullPath, fullPath, matConfig, map);
  }

  return map;
}

function walkForMaterialization(
  fs: VirtualFS,
  dirPath: string,
  modelsRoot: string,
  matConfig: Record<string, "view" | "table" | "ephemeral">,
  map: MaterializationMap,
): void {
  const node = fs.getNode(dirPath);
  if (!node || !isDirectory(node)) return;

  for (const [name, child] of Object.entries(node.children)) {
    if (isFile(child) && name.endsWith(".sql")) {
      const modelName = name.replace(/\.sql$/, "");
      const relativePath = dirPath.slice(modelsRoot.length);
      map.set(modelName, getMaterialization(modelName, relativePath + "/" + name, matConfig));
    } else if (isDirectory(child)) {
      walkForMaterialization(fs, dirPath + "/" + name, modelsRoot, matConfig, map);
    }
  }
}

function walkForSql(fs: VirtualFS, dirPath: string, models: string[]): void {
  const node = fs.getNode(dirPath);
  if (!node || !isDirectory(node)) return;

  // Sort children for deterministic order
  const entries = Object.entries(node.children).sort(([a], [b]) => a.localeCompare(b));

  // Process files first, then directories (so staging files come before subdirectory models)
  const files = entries.filter(([, n]) => isFile(n));
  const dirs = entries.filter(([, n]) => isDirectory(n));

  for (const [name] of files) {
    if (name.endsWith(".sql")) {
      models.push(name.replace(/\.sql$/, ""));
    }
  }

  for (const [name] of dirs) {
    walkForSql(fs, dirPath + "/" + name, models);
  }
}

/**
 * Discover all resources (models, tests, sources) for `dbt ls`.
 */
export function discoverResources(
  fs: VirtualFS,
  projectRoot: string,
  config: DbtProjectConfig
): DbtResource[] {
  const resources: DbtResource[] = [];

  // Models
  for (const modelPath of config.modelPaths) {
    const fullPath = projectRoot + "/" + modelPath;
    walkForResources(fs, fullPath, modelPath, resources);
  }

  // Tests
  const testsPath = projectRoot + "/tests";
  const testsNode = fs.getNode(testsPath);
  if (testsNode && isDirectory(testsNode)) {
    for (const [name] of Object.entries(testsNode.children).sort(([a], [b]) => a.localeCompare(b))) {
      if (name.endsWith(".sql")) {
        resources.push({
          name: name.replace(/\.sql$/, ""),
          type: "test",
          path: "tests/" + name,
        });
      }
    }
  }

  // Generic tests (from YAML schema files)
  for (const modelPath of config.modelPaths) {
    discoverGenericTests(fs, projectRoot + "/" + modelPath, resources);
  }

  // Sources (from _staging__sources.yml or _sources.yml)
  for (const modelPath of config.modelPaths) {
    for (const sourcesFile of ["_staging__sources.yml", "_sources.yml"]) {
      const sourcesPath = projectRoot + "/" + modelPath + "/staging/" + sourcesFile;
      const sourcesNode = fs.getNode(sourcesPath);
      if (sourcesNode && isFile(sourcesNode)) {
        const sourceNames = sourcesNode.content.match(/- name:\s*(\S+)/g);
        if (sourceNames) {
          for (const match of sourceNames) {
            const name = match.replace(/- name:\s*/, "");
            resources.push({ name, type: "source" });
          }
        }
        break; // only use the first one found
      }
    }
  }

  // Seeds (from seeds/ directory)
  const seedsPath = projectRoot + "/seeds";
  const seedsNode = fs.getNode(seedsPath);
  if (seedsNode && isDirectory(seedsNode)) {
    for (const [name] of Object.entries(seedsNode.children).sort(([a], [b]) => a.localeCompare(b))) {
      if (name.endsWith(".csv")) {
        resources.push({
          name: name.replace(/\.csv$/, ""),
          type: "seed",
          path: "seeds/" + name,
        });
      }
    }
  }

  return resources;
}

/**
 * Parse generic tests (unique/not_null) from a YAML schema file.
 * Uses indent-level tracking — no YAML library needed.
 */
export function parseGenericTests(content: string): string[] {
  const tests: string[] = [];
  const lines = content.split("\n");
  let currentModel = "";
  let currentColumn = "";
  let inColumns = false;
  let inTests = false;

  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trimStart();

    // Model-level "- name:" (indent 2)
    if (indent <= 2 && trimmed.startsWith("- name:")) {
      currentModel = trimmed.replace(/^- name:\s*/, "").trim();
      currentColumn = "";
      inColumns = false;
      inTests = false;
      continue;
    }

    // "columns:" keyword
    if (trimmed === "columns:") {
      inColumns = true;
      inTests = false;
      continue;
    }

    // Column-level "- name:" (deeper indent, inside columns)
    if (inColumns && trimmed.startsWith("- name:") && indent > 4) {
      currentColumn = trimmed.replace(/^- name:\s*/, "").trim();
      inTests = false;
      continue;
    }

    // "tests:" keyword under a column
    if (inColumns && trimmed === "tests:") {
      inTests = true;
      continue;
    }

    // Test entries: "- unique" or "- not_null"
    if (inTests && /^- (unique|not_null)$/.test(trimmed)) {
      const testType = trimmed.replace(/^- /, "");
      if (currentModel && currentColumn) {
        tests.push(`${testType}_${currentModel}_${currentColumn}`);
      }
      continue;
    }

    // Reset states on non-matching lines at appropriate indent levels
    if (inTests && !trimmed.startsWith("-")) {
      inTests = false;
    }
  }

  return tests;
}

/**
 * Recursively discover generic tests from YAML schema files under a directory.
 * Excludes *sources*.yml files (those define sources, not tests).
 */
function discoverGenericTests(
  fs: VirtualFS,
  dirPath: string,
  resources: DbtResource[]
): void {
  const node = fs.getNode(dirPath);
  if (!node || !isDirectory(node)) return;

  const entries = Object.entries(node.children).sort(([a], [b]) => a.localeCompare(b));

  for (const [name, child] of entries) {
    if (isFile(child) && name.endsWith(".yml") && !name.includes("sources")) {
      const tests = parseGenericTests(child.content);
      for (const testName of tests) {
        resources.push({ name: testName, type: "test" });
      }
    } else if (isDirectory(child)) {
      discoverGenericTests(fs, dirPath + "/" + name, resources);
    }
  }
}

function walkForResources(
  fs: VirtualFS,
  dirPath: string,
  relativePath: string,
  resources: DbtResource[]
): void {
  const node = fs.getNode(dirPath);
  if (!node || !isDirectory(node)) return;

  const entries = Object.entries(node.children).sort(([a], [b]) => a.localeCompare(b));

  for (const [name, child] of entries) {
    if (isFile(child) && name.endsWith(".sql")) {
      resources.push({
        name: name.replace(/\.sql$/, ""),
        type: "model",
        path: relativePath + "/" + name,
      });
    } else if (isDirectory(child)) {
      walkForResources(fs, dirPath + "/" + name, relativePath + "/" + name, resources);
    }
  }
}
