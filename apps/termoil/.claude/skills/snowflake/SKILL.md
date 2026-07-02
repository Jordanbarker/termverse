---
name: snowflake
description: "How the in-browser Snowflake SQL query engine works — lexer, parser, executor, SnowflakeState, Snowflake CLI REPL, and the VirtualFS bridge. Use this skill whenever modifying SQL parsing/execution, adding SQL functions, working on the snow sql command, or touching files under src/engine/snowflake/."
---

# Snowflake SQL Query Engine

A full client-side Snowflake SQL engine (`snow sql`) — custom recursive-descent parser, no external SQL library, ~50-60KB minified. Pure pipeline: `SQL string → lexer → Token[] → parser → AST → planner → LogicalPlan → executor → QueryResult`.

Code map (`src/engine/snowflake/`): `types.ts` (all data-model types — read them there), `state.ts` (`SnowflakeState`, immutable like VirtualFS, all query+mutation methods return new instances), `lexer/`, `parser/`, `planner/`, `executor/` (`executor.ts` dispatch, `evaluator.ts`, `resolve.ts`, `joins.ts`, `aggregation.ts`, `window_exec.ts`, `dml.ts`, `ddl.ts`, `show_describe.ts`, `copy_staging.ts`, `functions/`), `formatter/`, `session/` (`context.ts`, `gameClock.ts`, `permissions.ts`, `SnowSqlSession.ts`), `bridge/fs_bridge.ts`. Command registration in `commands/builtins/snow.ts`. Seed data is app-side: `apps/termoil/src/story/data/snowflake/initial_data.ts` (`createInitialSnowflakeState`).

## SQL feature scope

DDL (CREATE/ALTER/DROP for DATABASE/SCHEMA/TABLE/VIEW/WAREHOUSE/STAGE/SEQUENCE), DML (INSERT/UPDATE/DELETE/MERGE/TRUNCATE), full query (joins, CTEs, subqueries, set ops, DISTINCT), Snowflake-specific (QUALIFY, VARIANT dot/bracket, FLATTEN, LATERAL, PIVOT/UNPIVOT, ILIKE, SAMPLE, Time Travel AT/BEFORE, CLONE, COPY INTO, PUT/GET, SHOW/DESCRIBE, USE, INFORMATION_SCHEMA), all standard data types.

**Functions (100+): `executor/functions/registry.ts` is the canonical scalar list — read it, don't mirror it here.** Aggregate functions (`aggregation.ts`) and window functions (`window_exec.ts`) bypass the scalar registry and have their own executors.

## Game clock (`gameNow`)

`SessionContext.gameNow` is the story clock for all date functions (`CURRENT_DATE`/`NOW`/`CURRENT_TIMESTAMP`/`GETDATE`/`SYSDATE`/`LOCALTIMESTAMP`/`CURRENT_TIME`); when omitted they fall back to wall-clock. It rides through `evalContextFromSession()` into every `EvalContext`, read by `functions/date.ts` via the `ctx` arg. Producers build it via `gameNowFor(deliveredPiperIds, username, computer)` (`session/gameClock.ts`), wrapping `getGameTime()` (`src/engine/piper/timestamp.ts`) — same source as the `date` command, so the clocks agree. Threaded per call site: `snow sql -q` builds it per invocation; `SnowSqlSession` takes a `getGameNow?: () => Date` callback (refreshes per-statement); the dbt runner builds it per `runModels`/`runTests`/`showModel`.

## Behavior notes worth knowing

- **Derived tables / CTEs** plan to a `DerivedNode`, never inlined: the executor runs the inner query as a full `executeSelect` and maps the resultset back to rows keyed `COL` + `alias.COL` (same as view expansion). `withOuterCtes()` attaches in-scope CTEs (excluding the CTE's own name so a self-ref resolves as a table). The top-level `project` node is a no-op in `executePlan`; outer projection happens once in `projectRows` after window functions.
- **Division by zero** — `x/0`, `x%0`, `MOD(x,0)` throw `Division by zero` (caught per-statement → error result), matching real Snowflake. `DIV0()`/`DIV0NULL()` are the sanctioned escape hatches.
- **`SHOW TABLES/VIEWS/SCHEMAS`** accept `IN SCHEMA`/`IN DATABASE` (every schema in the db)/`IN ACCOUNT`; all apply per-schema `canReadSchema` filtering + optional `LIKE`. Target set built by `resolveShowTargets()`. A bare `SHOW TABLES;` on an empty schema appends a dim hint.
- **SnowSqlSession REPL** — inline (not alt-buffer), hand-rolled CSI parser separate from `useCommandLine.ts`. Ctrl+U is readline `unix-line-discard` (kill-to-start, matching real snowsql — deliberately different from the shell's zsh kill-whole-line). Line-edit behavior covered by `__tests__/session.test.ts`. **Caution: prior edits here have regressed history navigation — preserve the existing A/B Up/Down branches verbatim and verify history still works after any change.**

## snow sql command

`snow sql` enters the REPL (default `NEXACORP_PROD.ANALYTICS>`); `snow sql -q "..."` runs inline (exit 1 if **any** statement in the batch errors or on usage error, else 0). In-REPL: SQL ending `;` executes, `quit`/`exit`/Ctrl+D exits, `settings`/`help` are built-ins.

## VirtualFS bridge

`bridge/fs_bridge.ts` `syncToVirtualFS(state, fs)` mirrors the warehouse under `/opt/snowflake/{DB}/{SCHEMA}/_tables/{TABLE}.meta` (columns/types/row-counts) so players can `ls`/`cat` to explore.

## Role-based access control (`session/permissions.ts`)

Schema-level model enforced across SELECT/DML/DDL. **Roles and their grants are defined in `permissions.ts` — read them there** (player default is `ANALYST`; admin roles bypass all checks). Key helpers: `checkPermission(role, db, schema, "READ"|"WRITE")` (throws Snowflake-style error), `canReadSchema` (filters SHOW output), `isValidRole` (validates `USE ROLE`). Non-obvious: INFORMATION_SCHEMA always readable; **view expansion skips permission checks** (owner-privilege semantics, `viewDepth > 0`); the dbt executor overrides the session role to `TRANSFORMER` (`src/engine/dbt/executor.ts`).

## State persistence

`SnowflakeState` lives in the Zustand store; `serialize()`/`deserialize()` round-trip via `serializedSnowflake` in `partialize`, restored in `onRehydrateStorage` (falls back to seed on failure). See the **save skill** for the manual-slot behavior (manual loads keep the live Snowflake state rather than restoring a snapshot).
