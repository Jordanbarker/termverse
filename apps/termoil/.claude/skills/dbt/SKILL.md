---
name: dbt
description: "How the virtual dbt CLI and Snowflake warehouse simulation works — model execution, test results, and the dbt command handler. Use this skill whenever adding new dbt models/tests, modifying Snowflake warehouse data, working on the dbt command, or touching files under src/engine/dbt/. For Snowflake SQL engine changes, see the snowflake skill."
---

# dbt System

A virtual dbt CLI that **dynamically compiles and executes** SQL models against the in-memory Snowflake engine — the player runs real transformations, edits model SQL with `nano`, and re-runs to watch row counts change.

Code map (`src/engine/dbt/`): `types.ts`, `data.ts` (`STANDARD_MODEL_ORDER` from `story/data/dbt/model_order.json`), `compiler.ts` (Jinja: `compileSql`/`parseSourceMap`/`parseMacros`/`extractRefs`), `executor.ts` (`executeModel`/`executeTest`/`queryModel`), `project.ts` (`findDbtProject`/`discoverModels`/materialization map), `runner.ts` (`runModels`/`runTests`/`runBuild`/`compileModel`/`showModel`), `output.ts` (timestamped CLI output — timestamp threaded from `runner.ts` via `gameTsFor()` so logs agree with `date`/`current_timestamp()`). Command handler `commands/builtins/dbt.ts`. Project tree built in `story/filesystem/nexacorp/dbt.ts`.

## Dynamic execution

1. `compileSql()` resolves `{{ ref() }}` (→ `NEXACORP_PROD.ANALYTICS.MODEL` or an ephemeral CTE), `{{ source('raw_nexacorp', 'T') }}` (→ `NEXACORP_PROD.RAW_NEXACORP.T`), `{{ config(...) }}` (stripped), and custom macros.
2. `executeModel()` runs compiled SQL, materializes per config: **table** (drop+recreate with result), **view** (store definition via `state.createView()`), **ephemeral** (compiled SQL stashed in a map, inlined as a CTE downstream, never materialized).
3. State threads model→model (accumulator); `--select` silently resolves upstream deps.
4. Views are expanded in the `scan` fallback of the Snowflake `executePlan()` (parse+execute the view SQL, depth-limited to 10).

## Warehouse and models

Three databases: `NEXACORP_DB` (operational), `NEXACORP_PROD` (analytics — `RAW_NEXACORP` sources + dbt-built `ANALYTICS`), `CHIP_ANALYTICS` (investigation). **Seed data lives in `story/data/snowflake/initial_data.ts` (`createInitialSnowflakeState`); the model list + order is `story/data/dbt/model_order.json` — read those for exact tables/rows/models rather than a mirror here.** Shape: 11 staging views (`stg_raw_nexacorp__*`), 3 intermediate ephemerals (`int_*`), 7 mart tables (`dim_`/`fct_`/`rpt_`). Naming follows dbt conventions: staging `stg_[source]__[entity]s`, intermediate `int_[entity]s_[verb]s`, marts `dim_`/`fct_`/`rpt_`, YAML `_[dir]__[type].yml`; materializations set in `dbt_project.yml` (staging=view, intermediate=ephemeral, marts=table).

## dbt command

Subcommands dispatched in `dbt.ts`: `run` (`--select model`), `test` (emits `dbt_test_warn`/`dbt_test_all_pass`), `build` (run+test, merges triggerEvents + `dbt_build`), `ls`/`list`, `debug` (reveals `chip_service_account` as the Snowflake user), `compile --select`, `show --select`, `--version`. Execution: handler finds `dbt_project.yml` via `findDbtProject()` → `discoverModels()` → build compilation context (`parseSourceMap`/`parseMacros`) → materialization map from `dbt_project.yml` → compile+execute each model in dep order (state accumulated) → `ctx.setSnowflakeState()` → format output → post-command hook fires `GameEvent`s for email delivery.

## Adding models/tests

1. Add the `.sql` file under `models/` in `story/filesystem/nexacorp/dbt.ts`.
2. Add it to `STANDARD_MODEL_ORDER` in `model_order.json`.
3. Update the relevant YAML (`_staging__sources.yml`/`_staging__models.yml`/`_marts__models.yml`) for generic tests.
4. New assertion tests go under `tests/` in `nexacorp/dbt.ts`.
5. No JSON data files needed — results are computed dynamically from SQL. dbt runs under the `TRANSFORMER` role (see the snowflake skill); config files are parsed by simple string matching, not a YAML lib.

## Narrative context

The mystery: three mart models quietly scrub evidence — `dim_employees.sql` filters employees whose notes contain "system concern", `fct_system_events.sql` filters `chip-daemon` events, `fct_support_tickets.sql` filters tickets `chip_service_account` self-closed. Two tests WARN (`assert_employee_count` 13 vs HR's 15; `assert_all_tickets_in_directory`), which is the player's thread: read the failing tests → read the model SQL → find the filters → edit them out with `nano` → re-run `dbt build` and watch counts change. The full player-facing beats are in `docs/storyboard/`.
