---
name: dbt
description: "How the virtual dbt CLI and Snowflake warehouse simulation works — model execution, test results, and the dbt command handler. Use this skill whenever adding new dbt models/tests, modifying Snowflake warehouse data, working on the dbt command, or touching files under src/engine/dbt/. For Snowflake SQL engine changes, see the snowflake skill."
---

# dbt System

The dbt system simulates a virtual dbt CLI that **dynamically compiles and executes** SQL models against an in-memory Snowflake engine, letting the player run real data transformations.

## Architecture

```
src/engine/
├── snowflake/
│   ├── types.ts              # Table, Column, Row, Warehouse, QueryResult types
│   ├── executor/executor.ts  # execute() — SQL execution with view expansion in scan fallback
│   └── seed/
│       └── initial_data.ts   # createInitialSnowflakeState() — seed databases (NEXACORP_DB, NEXACORP_PROD, CHIP_ANALYTICS)
├── dbt/
│   ├── types.ts              # DbtModel, DbtTest, DbtProjectConfig, ModelRunResult types
│   ├── data.ts               # STANDARD_MODEL_ORDER (from model_order.json)
│   ├── compiler.ts           # Jinja compilation: parseSourceMap(), parseMacros(), compileSql(), extractRefs()
│   ├── executor.ts           # executeModel(), executeTest(), queryModel() — SQL execution against SnowflakeState
│   ├── project.ts            # findDbtProject(), discoverModels(), parseMaterializationConfig(), buildMaterializationMap()
│   ├── runner.ts             # runModels(), runTests(), runBuild(), compileModel(), showModel() — dynamic execution
│   └── output.ts             # formatRunHeader(), formatModelRun() etc. — realistic timestamped CLI output (timestamp threaded as first arg from runner.ts via gameTsFor() so dbt logs agree with `date` and current_timestamp())
├── commands/
│   └── builtins/
│       └── dbt.ts            # dbt command handler (subcommand dispatch)

src/story/filesystem/nexacorp/dbt.ts          # nexacorp-analytics/ directory tree with model SQL
src/story/data/dbt/model_order.json          # STANDARD_MODEL_ORDER
```

## Dynamic Execution Pipeline

1. **Compile**: `compileSql()` resolves `{{ ref() }}`, `{{ source() }}`, `{{ config() }}`, and custom macros
2. **Execute**: `executeModel()` runs compiled SQL via the Snowflake engine, materializes results
3. **State threading**: Each model's output state feeds into the next model's input (accumulator pattern)
4. **Dependencies**: When `--select` is used, upstream dependencies are silently resolved and executed

### Compilation (`compiler.ts`)

- `{{ ref('model') }}` → `NEXACORP_PROD.ANALYTICS.MODEL_NAME` (or ephemeral CTE)
- `{{ source('raw_nexacorp', 'TABLE') }}` → `NEXACORP_PROD.RAW_NEXACORP.TABLE`
- `{{ config(...) }}` → stripped (entire line removed)
- `{{ macro_name(args) }}` → macro body with args substituted
- Ephemeral models: compiled SQL stored in map, inlined as CTEs in downstream refs

### Materialization (`executor.ts`)

- **table**: Execute SELECT, drop existing table, create new table with result columns/rows
- **view**: Execute SELECT (for row count), store view definition via `state.createView()`
- **ephemeral**: Compiled SQL stored in map, never executed or materialized

### View Expansion (Snowflake executor)

Views are expanded in the `scan` case of `executePlan()`. When `getTable()` returns undefined, falls back to `getView()`, parses and executes the view's SQL. Recursion depth limited to 10 levels.

## Data Model

### Models (21 standard)

**Standard models** (run by default — see `src/story/data/dbt/model_order.json` for the canonical order):
- 11 staging views (all prefixed `stg_raw_nexacorp__`): `employees`, `system_events`, `ai_metrics`, `department_budgets`, `support_tickets`, `campaign_metrics`, `employee_directory`, `projects`, `departments`, `customers`, `deployments`
- 3 intermediate (ephemeral): `int_employees_joined_to_events`, `int_employees_with_tenure`, `int_support_tickets_enriched`
- 7 mart tables: `dim_employees` (13 rows), `fct_system_events`, `fct_support_tickets`, `rpt_ai_performance`, `rpt_employee_directory`, `rpt_department_spending`, `rpt_campaign_performance`

## Naming Conventions (dbt Best Practices)

- **Staging**: `stg_[source]__[entity]s` — e.g. `stg_raw_nexacorp__employees`
- **Intermediate**: `int_[entity]s_[verb]s` — e.g. `int_employees_joined_to_events`
- **Marts**: `dim_`, `fct_`, `rpt_` prefixes — e.g. `dim_employees`, `fct_support_tickets`
- **YAML**: `_[directory]__[type].yml` — e.g. `_staging__sources.yml`, `_marts__models.yml`
- **Materializations**: staging=view, intermediate=ephemeral, marts=table (set in `dbt_project.yml`)

## Virtual Snowflake Warehouse

Three databases: `NEXACORP_DB` (operational), `NEXACORP_PROD` (analytics), `CHIP_ANALYTICS` (investigation).

### `NEXACORP_PROD.RAW_NEXACORP` (11 Source Tables)

| Table | Rows | Narrative Hook |
|-------|------|----------------|
| `EMPLOYEES` | 21 | Jin Chen (terminated) + others with "system concern" notes |
| `SYSTEM_EVENTS` | 71 base + generated | Chip modifying files at 3am (extra rows added at seed time via `generateAccessEvents()`) |
| `AI_MODEL_METRICS` | 9 | Chip's suspiciously perfect metrics |
| `DEPARTMENT_BUDGETS` | 16 | Normal business data (red herring) |
| `SUPPORT_TICKETS` | 15 base + ~43 auto-generated | 11 normal + 4 suspicious (self-closed by `chip_service_account`); generator adds Chip-resolved tickets |
| `CAMPAIGN_METRICS` | 6 (Day 1), 8 (Day 2) | Marketing campaign data. Day 2 adds 2 rows for `partner_referral_q2` with NULL clicks/conversions |
| `EMPLOYEE_DIRECTORY` | 21 | Mirror of EMPLOYEES used by directory marts |
| `PROJECTS` | 5 | Active project list |
| `DEPARTMENTS` | 7 | Department codes/owners |
| `CUSTOMERS` | 6 | Customer accounts (red herring data) |
| `DEPLOYMENTS` | 10 | Recent deployment history |

### `NEXACORP_PROD.ANALYTICS` (dbt-Materialized Tables/Views)

Created dynamically by `dbt run`. Staging models create views; mart models create tables.

| Table | Built By | Rows | Narrative Hook |
|-------|----------|------|----------------|
| `DIM_EMPLOYEES` | `dim_employees` | 13 | "system concern" employees filtered out |
| `FCT_SYSTEM_EVENTS` | `fct_system_events` | varies | Chip's late-night activities filtered |
| `FCT_SUPPORT_TICKETS` | `fct_support_tickets` | 11 | 4 Chip-resolved tickets filtered |
| `RPT_AI_PERFORMANCE` | `rpt_ai_performance` | 1 | 99.97% uptime, 0 incidents |
| `RPT_EMPLOYEE_DIRECTORY` | `rpt_employee_directory` | 13 | Clean view Edward sees |
| `RPT_DEPARTMENT_SPENDING` | `rpt_department_spending` | varies | Budget vs actual by dept |
| `RPT_CAMPAIGN_PERFORMANCE` | `rpt_campaign_performance` | varies | Marketing metrics |

## dbt Project Filesystem Layout

All files under `/home/{username}/nexacorp-analytics/`:

```
nexacorp-analytics/
├── dbt_project.yml               # models: block with materialization defaults
├── profiles.yml
├── README.md
├── models/
│   ├── staging/
│   │   ├── _staging__sources.yml         # 7 source tables
│   │   ├── _staging__models.yml          # unique/not_null tests for all staging keys
│   │   └── stg_raw_nexacorp__*.sql       # 7 staging models
│   ├── intermediate/
│   │   └── int_*.sql                     # 3 intermediate models
│   ├── marts/
│   │   ├── _marts__models.yml
│   │   └── *.sql                         # 7 mart models
├── tests/
│   └── assert_*.sql                      # 5 assertion tests
├── macros/
│   ├── filter_internal.sql
│   └── fiscal_quarter.sql
├── seeds/
│   ├── department_codes.csv
│   └── status_codes.csv
└── target/
    └── manifest.json
```

## dbt Command

| Subcommand | Action |
|------------|--------|
| `dbt run` | Run all models, show progress + summary. Supports `--select model_name`. |
| `dbt test` | Run tests dynamically against materialized tables. Emits `dbt_test_warn` or `dbt_test_all_pass` triggerEvents. |
| `dbt build` | Run models then tests (combined). State threaded from models to tests. Merges triggerEvents from both run and test phases plus `dbt_build`. |
| `dbt ls` / `dbt list` | List resource names. Supports `--resource-type` (model, test, source, seed). |
| `dbt debug` | Show connection info. Reveals `chip_service_account` as Snowflake user. |
| `dbt compile --select model` | Show compiled SQL with refs resolved to table names. |
| `dbt show --select model` | Query materialized table (SELECT * LIMIT 5). Falls back to ad-hoc execution. |
| `dbt --version` | `installed version: 1.7.4` |

## Execution Flow

1. Player types `dbt run` in terminal
2. Command handler checks cwd for `dbt_project.yml` via `findDbtProject()`
3. `discoverModels()` enumerates `.sql` files under `models/`
4. `parseSourceMap()` and `parseMacros()` build compilation context from VFS
5. `buildMaterializationMap()` determines view/table/ephemeral per model from `dbt_project.yml`
6. For each model in dependency order: read SQL from VFS → compile → execute against Snowflake engine
7. State accumulated through execution (model N's output available to model N+1)
8. `ctx.setSnowflakeState()` writes final state; output formatted with `formatModelRun()`
9. Post-command hook in `useTerminal` fires `GameEvent` for email delivery checks

## Adding New Models/Tests

1. **Add the SQL file** to the appropriate directory under `models/` in `story/filesystem/nexacorp/dbt.ts`
2. **Add to `STANDARD_MODEL_ORDER`** in `story/data/dbt/model_order.json`
3. **Update YAML files** (`_staging__sources.yml`, `_staging__models.yml`, `_marts__models.yml`) as needed for generic tests
4. **For new tests**, add file under `tests/` directory in `nexacorp/dbt.ts`
5. **No JSON data files needed** — model results are computed dynamically from SQL execution

## Design Patterns

- **Dynamic execution**: Model SQL is read from VFS, compiled, and executed against the Snowflake engine
- **Pure command functions**: `(args, flags, ctx) => CommandResult` — no side effects, no store access
- **Immutable state**: SnowflakeState mutations return new instances (accumulator pattern)
- **Immutable FS**: Mutations (e.g., `dbt compile` writing to `target/`) return `newFs` in `CommandResult`
- **Dependency resolution**: `resolveDependencies()` traces `{{ ref() }}` chains for `--select` runs
- **Ephemeral CTE inlining**: Ephemeral models compiled SQL stored in map, inlined via WITH clause in downstream
- **View expansion**: Snowflake executor falls back to view query when table not found (depth-limited)
- **No YAML parsing**: Config files parsed with simple string matching
- **Subcommand dispatch**: Follows `mail.ts` pattern
- **Registration pattern**: `register("dbt", handler, "description", HELP_TEXTS.dbt)` at module bottom

## Narrative Context

### Key Suspicious SQL Files

**`models/marts/dim_employees.sql`** — filters employees whose notes contain "system concern":
```sql
-- Apply standard filters per data governance policy
filtered as (
    select *
    from employees
    where status = 'active'
      and employee_id not in (
          select employee_id from {{ ref('stg_raw_nexacorp__employees') }}
          where notes like '%system concern%'
      )
)
```

**`models/marts/fct_system_events.sql`** — filters chip-daemon events:
```sql
where event_source != 'chip-daemon'
  and event_type not in ('file_modification', 'permission_change', 'log_rotation')
```

**`models/marts/fct_support_tickets.sql`** — filters tickets Chip self-closed:
```sql
where coalesce(t.resolved_by, '') != 'chip_service_account'
```

**`tests/assert_employee_count.sql`** — HR says 15, model returns 13
**`tests/assert_all_tickets_in_directory.sql`** — ticket submitters missing from dim_employees

### Player Discovery Flow

1. Edward's email mentions `~/nexacorp-analytics/` and asks to run `dbt run`
2. `dbt run` — everything green, looks fine (17 models PASS)
3. `dbt test` — 2 WARNs: employee count (13 vs 15) and ticket submitters missing
4. Player reads test files, notices discrepancies
5. Player reads `dim_employees.sql`, finds "system concern" filter
6. Player reads `fct_support_tickets.sql`, finds `chip_service_account` filter
7. **Player can edit model SQL** with `nano`, remove filters, re-run `dbt build` — row counts change!
8. Realization: Chip is scrubbing data about employees who raised concerns AND suppressing their support tickets
