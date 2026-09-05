---
name: snowflake
description: "How the in-browser Snowflake SQL query engine works — lexer, parser, executor, SnowflakeState, Snowflake CLI REPL, and the VirtualFS bridge. Use this skill whenever modifying SQL parsing/execution, adding SQL functions, working on the snow sql command, or touching files under packages/core/src/snowflake/."
---

# Snowflake SQL Query Engine

A full client-side Snowflake SQL engine (`snow sql`) — custom recursive-descent parser, no external SQL library. Pure pipeline: `SQL string → lexer → Token[] → parser → AST → planner → LogicalPlan → executor → QueryResult`.

**The engine is `@tt/core`.** Code map (`packages/core/src/snowflake/`): `types.ts` (all data-model types — read them there), `state.ts` (`SnowflakeState`, immutable like VirtualFS), `serialization.ts`, `identity.ts` (the `setWarehouseIdentity` seam), `queryTriggers.ts` (the story-detection seam), `lexer/`, `parser/`, `planner/`, `executor/` (dispatch, `evaluator.ts`, `resolve.ts`, `joins.ts`, `aggregation.ts`, `sort.ts`, `window_exec.ts`, `dml.ts`, `ddl.ts`, `show_describe.ts`, `copy_staging.ts`, `functions/`), `formatter/`, `session/` (`context.ts`, `permissions.ts`, `SnowSqlSession.ts`), `bridge/fs_bridge.ts`. Command registration in `packages/core/src/commands/builtins/snow.ts`. Seed data and the NexaCorp identity are app-side: `apps/termoil/src/story/data/snowflake/initial_data.ts`, `story/warehouseIdentity.ts`.

## SQL feature scope

DDL (CREATE/ALTER/DROP for DATABASE/SCHEMA/TABLE/VIEW/WAREHOUSE/STAGE/SEQUENCE), DML (INSERT/UPDATE/DELETE/MERGE/TRUNCATE), full query (joins, CTEs, subqueries, set ops, DISTINCT), Snowflake-specific (QUALIFY, VARIANT dot/bracket, FLATTEN, LATERAL, ILIKE, SAMPLE, CLONE, COPY INTO, PUT/GET, SHOW/DESCRIBE, USE, INFORMATION_SCHEMA), all standard data types. **`PIVOT`/`UNPIVOT` are lexer keywords only, and Time Travel `AT`/`BEFORE` parses to `TableName.atTimestamp` that nothing reads** — don't treat any of them as working.

**Functions (100+): the per-category files in `executor/functions/` are the canonical list — read those, not `registry.ts`, which only calls `registerAll` over each category's export.** Aggregates (`aggregation.ts`) and window functions (`window_exec.ts`) bypass the scalar registry.

## Game clock (`gameNow`)

`SessionContext.gameNow` is the story clock for all date functions (fallback: wall-clock). It rides through `evalContextFromSession()` into every `EvalContext`, read by `functions/date.ts`. Core never builds it: producers read the **`ctx.clock` seam** (`packages/core/src/commands/clock.ts`), which termoil supplies from `createGameClock` in `story/clock.ts` — the same `getGameTime()` Piper uses, so every clock agrees. Threaded per call site: `snow sql -q` per invocation; `SnowSqlSession` via a `getGameNow?` callback (refreshes per-statement); the dbt runner per `runModels`/`runTests`/`showModel`.

## Behavior notes worth knowing

- **Derived tables / CTEs** plan to a `DerivedNode`, never inlined; subqueries are consumed through their **projection** (`EvalContext.executeSubquery` returns the sub-select's projected rows), so IN/scalar read the select list, never the source table's first column.
- **`ORDER BY` resolves against the select list first** (`resolveOrderBy` in `planner/planner.ts`): aliases substituted at any depth, ordinals rewritten to the select expression. `SELECT *` ordinals are re-resolved in `executePlan` once the star expands.
- **Result column types are inferred, and only the temporal ones are real.** The formatter uses type only for DATE rendering and numeric right-alignment, so widening more types would change alignment everywhere.
- **One Date, two midnight conventions.** Seed/ISO dates parse to UTC midnight; `CURRENT_DATE()` builds local midnight. EXTRACT and the YEAR/MONTH/DAY shorthands read UTC-midnight dates locally and can report the previous day west of UTC.
- **Value ordering is `compareValues` everywhere** (ORDER BY, BETWEEN, MIN/MAX, GREATEST/LEAST). Never stringify or `Number()`-coerce to compare — `String(date)` starts with the weekday name.
- **Division by zero** — `x/0`, `x%0`, `MOD(x,0)` throw `Division by zero` (caught per-statement → error result). `DIV0()`/`DIV0NULL()` are the escape hatches.
- **`SHOW TABLES/VIEWS/SCHEMAS`** accept `IN SCHEMA`/`IN DATABASE`/`IN ACCOUNT`; all apply per-schema `canReadSchema` filtering + optional `LIKE`.
- **Story detection is an injected table, consulted after the error check** — `snowflake/queryTriggers.ts` (`setSqlQueryTriggers`) is the app seam; core holds no pattern or flag detail. Both call `matchSqlQueryTriggers` only when no result is an error (`snow sql -q` with just the SQL; the REPL also passes its emitted-details set) — a failed query must not complete the investigation it never made. The REPL fires each detail once per session. Termoil's table (`src/story/queryTriggers.ts`) holds one entry: `/campaign_metrics/i` → `queried_campaign_metrics`.
- **Warehouse identity is the other injected table** — `snowflake/identity.ts` (`setWarehouseIdentity`) supplies the account, database, schema, warehouse, role and dbt profile names read by the session prompt, `permissions.ts`, the executor, and the whole dbt engine. Neutral defaults when un-injected; termoil's values are in `story/warehouseIdentity.ts` (`initial_data.ts` assumes them).
- **SnowSqlSession REPL** — inline (not alt-buffer), hand-rolled CSI parser separate from `useCommandLine.ts`. Ctrl+U is readline kill-to-start (matching real snowsql, deliberately different from the shell). Covered by `__tests__/session.test.ts`. **Caution: prior edits here have regressed history navigation — preserve the existing A/B Up/Down branches verbatim and verify history still works after any change.**

## snow sql command

`snow sql` enters the REPL (prompt is `DATABASE.SCHEMA>` from the identity seam); `snow sql -q "..."` runs inline (exit 1 if any statement errors or on usage error). In-REPL: SQL ending `;` executes, `quit`/`exit`/Ctrl+D exits, `settings`/`help` are built-ins.

## VirtualFS bridge

`bridge/fs_bridge.ts` `syncToVirtualFS(state, fs)` mirrors the warehouse under `/opt/snowflake/{DB}/{SCHEMA}/_tables/{TABLE}.meta` so players can `ls`/`cat` to explore.

## Role-based access control (`session/permissions.ts`)

Schema-level model enforced across SELECT/DML/DDL. **Roles and grants are defined in `permissions.ts` — read them there** (player default `ANALYST`; admin roles bypass all checks). Helpers: `checkPermission(role, db, schema, "READ"|"WRITE")` (throws Snowflake-style), `canReadSchema` (filters SHOW), `isValidRole`. Non-obvious: INFORMATION_SCHEMA always readable; **view expansion skips permission checks** (owner-privilege semantics, `viewDepth > 0`); the dbt executor overrides the session role to the identity seam's `dbtRole`.

## State persistence

`SnowflakeState` lives in the Zustand store and round-trips through `serializedSnowflake` (`snowflake/serialization.ts`). The persistence rules, including what a manual `load` restores, are the **save skill's** — read them there.
