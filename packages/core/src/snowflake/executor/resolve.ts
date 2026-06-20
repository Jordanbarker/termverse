import { SessionContext } from "../session/context";

/**
 * Resolve a 1-, 2-, or 3-part name (e.g. ["table"], ["schema","table"], ["db","schema","table"])
 * into a fully-qualified [database, schema, table] tuple using session defaults.
 */
export function resolveThreePart(parts: string[], ctx: SessionContext): [string, string, string] {
  if (parts.length === 3) return [parts[0].toUpperCase(), parts[1].toUpperCase(), parts[2].toUpperCase()];
  if (parts.length === 2) return [ctx.currentDatabase.toUpperCase(), parts[0].toUpperCase(), parts[1].toUpperCase()];
  return [ctx.currentDatabase.toUpperCase(), ctx.currentSchema.toUpperCase(), parts[0].toUpperCase()];
}

/**
 * Build a helpful "table does not exist" error with contextual hints.
 */
export function tableNotFoundError(qualifiedName: string): string {
  let msg = `Table '${qualifiedName}' does not exist.`;
  if (qualifiedName.endsWith(".SQL")) {
    const suggested = qualifiedName.slice(0, -4);
    msg += `\nDid you mean '${suggested}'?`;
  }
  msg += "\nHint: Use SHOW TABLES to list available tables, or SHOW SCHEMAS to see schemas.";
  return msg;
}
