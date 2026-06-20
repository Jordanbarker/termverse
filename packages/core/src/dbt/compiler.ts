import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { isFile, isDirectory } from "@tt/core/filesystem/types";

export type SourceMap = Map<string, string>; // source('schema', 'table') → fully qualified
export type MacroDef = { args: string[]; body: string };
export type MaterializationMap = Map<string, "view" | "table" | "ephemeral">;

/**
 * Parse _staging__sources.yml to build a source → fully qualified table mapping.
 * e.g., source('raw_nexacorp', 'EMPLOYEES') → NEXACORP_PROD.RAW_NEXACORP.EMPLOYEES
 */
export function parseSourceMap(fs: VirtualFS, projectRoot: string): SourceMap {
  const map: SourceMap = new Map();
  const sourcesPath = projectRoot + "/models/staging/_staging__sources.yml";
  const node = fs.getNode(sourcesPath);
  if (!node || !isFile(node)) return map;

  const content = node.content;

  // Extract source-level name, database, schema
  const sourceNameMatch = content.match(/- name:\s*(\S+)/);
  const dbMatch = content.match(/database:\s*(\S+)/);
  const schemaMatch = content.match(/schema:\s*(\S+)/);

  if (!sourceNameMatch) return map;
  const sourceName = sourceNameMatch[1];
  const db = dbMatch?.[1] ?? "NEXACORP_PROD";
  const schema = schemaMatch?.[1] ?? "RAW_NEXACORP";

  // Extract table names under "tables:"
  const tablesSection = content.split("tables:")[1];
  if (!tablesSection) return map;

  const tableNames = tablesSection.match(/- name:\s*(\S+)/g);
  if (!tableNames) return map;

  for (const match of tableNames) {
    const tableName = match.replace(/- name:\s*/, "").trim();
    const key = `${sourceName}||${tableName}`;
    map.set(key, `${db}.${schema}.${tableName}`);
  }

  return map;
}

/**
 * Parse macro definitions from macros/ directory.
 * Extracts {% macro name(arg1, arg2) %}...{% endmacro %} blocks.
 */
export function parseMacros(fs: VirtualFS, projectRoot: string): Map<string, MacroDef> {
  const macros = new Map<string, MacroDef>();
  const macrosDir = projectRoot + "/macros";
  const node = fs.getNode(macrosDir);
  if (!node || !isDirectory(node)) return macros;

  for (const [name, child] of Object.entries(node.children)) {
    if (!name.endsWith(".sql") || !isFile(child)) continue;

    const macroRegex = /\{%\s*macro\s+(\w+)\s*\(([^)]*)\)\s*%\}([\s\S]*?)\{%\s*endmacro\s*%\}/g;
    let match;
    while ((match = macroRegex.exec(child.content)) !== null) {
      const macroName = match[1];
      const argsStr = match[2].trim();
      const body = match[3].trim();
      const args = argsStr ? argsStr.split(",").map((a) => a.trim()) : [];
      macros.set(macroName, { args, body });
    }
  }

  return macros;
}

/**
 * Extract {{ ref('...') }} targets from model SQL.
 */
export function extractRefs(rawSql: string): string[] {
  const refs: string[] = [];
  const refRegex = /\{\{\s*ref\s*\(\s*'([^']+)'\s*\)\s*\}\}/g;
  let match;
  while ((match = refRegex.exec(rawSql)) !== null) {
    refs.push(match[1]);
  }
  return refs;
}

/**
 * Compile Jinja-like macros in model SQL:
 * - {{ ref('model') }} → table/view name or ephemeral CTE
 * - {{ source('schema', 'table') }} → fully qualified table name
 * - {{ config(...) }} → strip entire line
 * - {{ macro_name(args) }} → expand macro body
 * - {% macro %}...{% endmacro %} → strip
 */
export function compileSql(
  rawSql: string,
  sourceMap: SourceMap,
  macros: Map<string, MacroDef>,
  ephemeralSqlMap?: Map<string, string>,
  materializationMap?: MaterializationMap,
): string {
  let sql = rawSql;

  // Strip {% macro %}...{% endmacro %} blocks (macro definition files)
  sql = sql.replace(/\{%\s*macro\s+\w+\s*\([^)]*\)\s*%\}[\s\S]*?\{%\s*endmacro\s*%\}/g, "");

  // Strip {{ config(...) }} lines
  sql = sql.replace(/^\s*\{\{\s*config\([^)]*\)\s*\}\}\s*\n?/gm, "");

  // Collect ephemeral refs that need CTE inlining
  const ephemeralCtes: string[] = [];

  // Replace {{ ref('model_name') }}
  sql = sql.replace(/\{\{\s*ref\s*\(\s*'([^']+)'\s*\)\s*\}\}/g, (_match, modelName: string) => {
    const mat = materializationMap?.get(modelName);
    if (mat === "ephemeral" && ephemeralSqlMap?.has(modelName)) {
      const cteName = `__dbt__cte__${modelName}`;
      ephemeralCtes.push(`${cteName} AS (\n${ephemeralSqlMap.get(modelName)!}\n)`);
      return cteName;
    }
    return `NEXACORP_PROD.ANALYTICS.${modelName.toUpperCase()}`;
  });

  // Replace {{ source('source_name', 'table_name') }}
  sql = sql.replace(/\{\{\s*source\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)\s*\}\}/g, (_match, sourceName: string, tableName: string) => {
    const key = `${sourceName}||${tableName}`;
    return sourceMap.get(key) ?? `NEXACORP_PROD.RAW_NEXACORP.${tableName.toUpperCase()}`;
  });

  // Replace {{ macro_name(args) }} — custom macros
  sql = sql.replace(/\{\{\s*(\w+)\s*\(([^)]*)\)\s*\}\}/g, (_match, macroName: string, argsStr: string) => {
    const macro = macros.get(macroName);
    if (!macro) return _match; // not a known macro, leave as-is

    const callArgs = argsStr.split(",").map((a) => a.trim().replace(/^['"]|['"]$/g, ""));
    let body = macro.body;
    for (let i = 0; i < macro.args.length; i++) {
      const argPattern = new RegExp(`\\{\\{\\s*${macro.args[i]}\\s*\\}\\}`, "g");
      body = body.replace(argPattern, callArgs[i] ?? "");
    }
    return body;
  });

  // Prepend ephemeral CTEs if any
  if (ephemeralCtes.length > 0) {
    const existingWithMatch = sql.match(/^\s*with\s+/im);
    if (existingWithMatch) {
      // Model already has WITH — prepend ephemeral CTEs before existing ones
      sql = sql.replace(/^\s*with\s+/im, `WITH ${ephemeralCtes.join(",\n")},\n`);
    } else {
      sql = `WITH ${ephemeralCtes.join(",\n")}\n${sql}`;
    }
  }

  return sql.trim();
}
