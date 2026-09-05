---
name: dbt
description: "How the virtual dbt CLI and Snowflake warehouse simulation works — model execution, test results, and the dbt command handler. Use this skill whenever adding new dbt models/tests, modifying Snowflake warehouse data, working on the dbt command, or touching files under packages/core/src/dbt/ or apps/termoil/src/story/filesystem/nexacorp/dbt.ts. For Snowflake SQL engine changes, see the snowflake skill."
---

# dbt System

A virtual dbt CLI that **dynamically compiles and executes** SQL models against the in-memory Snowflake engine — the player runs real transformations, edits model SQL with `nano`, and re-runs to watch row counts change.

**The engine is `@tt/core`, the content is termoil's.** Code map (`packages/core/src/dbt/`): `types.ts`, `compiler.ts` (Jinja: `compileSql`/`parseSourceMap`/`parseMacros`/`extractRefs`), `executor.ts` (`executeModel`/`executeTest`/`queryModel`), `project.ts` (`findDbtProject`/`discoverModels`/materialization map), `runner.ts` (`runModels`/`runTests`/`runBuild`/`listResources`/`debugProject`/`compileModel`/`showModel`), `output.ts` (timestamped CLI output — the timestamp comes from the `ctx.clock` seam so logs agree with `date`/`current_timestamp()`). Command handler `packages/core/src/commands/builtins/dbt.ts`.

App side: the project tree (models, tests, YAML, `dbt_project.yml`) is built in `apps/termoil/src/story/filesystem/nexacorp/dbt.ts`; the authored execution order is `STANDARD_MODEL_ORDER` (`story/data/dbt/data.ts`, from `model_order.json`), which reaches core as the `ctx.dbtModelOrder` seam — absent, core falls back to discovered order.

## Dynamic execution

1. `compileSql()` resolves `{{ ref() }}` (→ `<database>.<analyticsSchema>.MODEL` or an ephemeral CTE), `{{ source(...) }}` (→ `<database>.<rawSchema>.T`), `{{ config(...) }}` (stripped), and custom macros. **The database/schema names are not literals in core** — they come from the `setWarehouseIdentity` seam (`story/warehouseIdentity.ts`), which also supplies the user/role `dbt debug` prints.
2. `executeModel()` runs compiled SQL, materializes per config: **table** (drop+recreate with result), **view** (store definition via `state.createView()`), **ephemeral** (compiled SQL stashed in a map, inlined as a CTE downstream, never materialized).
3. State threads model→model (accumulator); `--select` silently resolves upstream deps.
4. Views are expanded in the `scan` fallback of the Snowflake `executePlan()` (parse+execute the view SQL, depth-limited to 10).

## Warehouse and models

One database, `NEXACORP_PROD`, with two schemas: `RAW_NEXACORP` (sources) and `ANALYTICS` (dbt-built). **Seed data lives in `story/data/snowflake/initial_data.ts` (`createInitialSnowflakeState`) + `nexacorp_prod.json`; the model list + order is `story/data/dbt/model_order.json` — read those for exact tables/rows/models rather than a mirror here.** Layers are staging views → intermediate ephemerals → mart tables (`dim_`/`fct_`/`rpt_`); materializations are set per-layer in `dbt_project.yml`.

## dbt command

`dbt.ts` only validates arity and dispatches; the pipeline lives in `runner.ts`. Subcommands: `run`/`compile`/`show`/`build` (all take `--select`, alias `-s`), `test` (**no `--select`** — it runs everything, and emits `dbt_test_warn`/`dbt_test_all_pass`), `ls`/`list` (`--resource-type`), `debug`, `help`, `--version`. `build` is run+test and merges both trigger-event sets plus `dbt_build`.

Pipeline (`runner.ts`): find `dbt_project.yml` via `findDbtProject()` → `discoverModels()` → build the compilation context (`parseSourceMap`/`parseMacros`) → materialization map from `dbt_project.yml` → compile+execute each model in dep order (state accumulated) → `ctx.setSnowflakeState()` → format output → trigger events for the delivery cascade.

## Adding models/tests

1. Add the `.sql` file under `models/` in `story/filesystem/nexacorp/dbt.ts`.
2. Add it to `STANDARD_MODEL_ORDER` in `model_order.json`.
3. Update the relevant YAML (`_staging__sources.yml`/`_staging__models.yml`/`_marts__models.yml`) for generic tests.
4. New assertion tests go under `tests/` in `nexacorp/dbt.ts`.
5. No JSON data files needed — results are computed dynamically from SQL. dbt runs under its own role (see the snowflake skill); config files are parsed by simple string matching, not a YAML lib.

## Narrative context

The mystery: three mart models quietly scrub evidence via an innocuous-looking `where` clause (`dim_employees.sql` on `status`, `fct_system_events.sql` on `chip-daemon` events, `fct_support_tickets.sql` on self-closed tickets), so `dbt test` WARNs and the player's thread is: read the failing tests → read the model SQL → find the filter → edit it out with `nano` → re-run `dbt build` and watch counts change. Read the SQL and the `tests/` dir in `story/filesystem/nexacorp/dbt.ts` for exact predicates and expected counts; the player-facing beats are in `apps/termoil/docs/storyboard/`.
