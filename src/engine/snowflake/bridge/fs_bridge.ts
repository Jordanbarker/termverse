import { SnowflakeState } from "../state";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";

/**
 * Sync SnowflakeState metadata to VirtualFS under /opt/snowflake/.
 * Creates directory structure and .meta files so players can discover
 * databases/tables via `ls` and `cat`.
 */
export function syncToVirtualFS(sfState: SnowflakeState, fs: VirtualFS): VirtualFS {
  let currentFs = fs;

  // Ensure /opt/snowflake/ exists
  currentFs = ensureDir(currentFs, "/opt");
  currentFs = ensureDir(currentFs, "/opt/snowflake");

  // Create database directories
  for (const dbName of sfState.listDatabases()) {
    const dbPath = `/opt/snowflake/${dbName}`;
    currentFs = ensureDir(currentFs, dbPath);

    // Write _schemas.txt
    const schemas = sfState.listSchemas(dbName).filter((s) => s !== "INFORMATION_SCHEMA");
    const schemasContent = `Schemas in ${dbName}:\n${schemas.map((s) => `  ${s}`).join("\n")}\n`;
    currentFs = writeFileIfChanged(currentFs, `${dbPath}/_schemas.txt`, schemasContent);

    // Create schema directories
    for (const schName of schemas) {
      const schPath = `${dbPath}/${schName}`;
      currentFs = ensureDir(currentFs, schPath);
      currentFs = ensureDir(currentFs, `${schPath}/_tables`);

      // Create .meta files for each table
      const tables = sfState.listTables(dbName, schName);
      for (const table of tables) {
        const metaContent = formatTableMeta(dbName, schName, table.name, table.columns.length, table.rows.length,
          table.columns.map((c) => `  ${c.name.padEnd(20)} ${c.type.padEnd(12)} ${c.nullable ? "NULL" : "NOT NULL"}`).join("\n")
        );
        currentFs = writeFileIfChanged(currentFs, `${schPath}/_tables/${table.name}.meta`, metaContent);
      }
    }
  }

  return currentFs;
}

function formatTableMeta(db: string, schema: string, table: string, colCount: number, rowCount: number, columnDefs: string): string {
  return `Table: ${db}.${schema}.${table}
Columns: ${colCount}
Rows: ${rowCount}
Created: 2026-02-03

Columns:
${columnDefs}

Use 'snow sql' to query this table:
  snow sql -q "SELECT * FROM ${table} LIMIT 5"
`;
}

function ensureDir(fs: VirtualFS, path: string): VirtualFS {
  const node = fs.getNode(path);
  if (node) return fs;
  const result = fs.makeDirectory(path);
  return result.fs ?? fs;
}

function writeFileIfChanged(fs: VirtualFS, path: string, content: string): VirtualFS {
  const existing = fs.readFile(path);
  if (existing.content === content) return fs;
  const result = fs.writeFile(path, content);
  return result.fs ?? fs;
}
