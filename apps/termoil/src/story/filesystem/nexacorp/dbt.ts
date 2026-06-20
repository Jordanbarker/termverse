import { DirectoryNode } from "@tt/core/filesystem/types";
import { file, dir } from "@tt/core/filesystem/builders";

export function buildDbtProject(): DirectoryNode {
  return dir("nexacorp-analytics", {
    ".gitignore": file(".gitignore", `target/
dbt_packages/
logs/
`),
    "packages.yml": file("packages.yml", `packages:
  - package: dbt-labs/dbt_utils
    version: [">=1.0.0", "<2.0.0"]
`),
    "dbt_project.yml": file("dbt_project.yml", `name: 'nexacorp_analytics'
version: '1.0.0'
config-version: 2

profile: 'nexacorp'

model-paths: ["models"]
analysis-paths: ["analyses"]
test-paths: ["tests"]
seed-paths: ["seeds"]
macro-paths: ["macros"]
snapshot-paths: ["snapshots"]

target-path: "target"
clean-targets:
  - "target"
  - "dbt_packages"

models:
  nexacorp_analytics:
    staging:
      +materialized: view
    intermediate:
      +materialized: ephemeral
    marts:
      +materialized: table
`),
    "profiles.yml": file("profiles.yml", `nexacorp:
  target: prod
  outputs:
    prod:
      type: snowflake
      account: nexacorp.us-east-1
      user: chip_service_account
      role: TRANSFORMER
      database: NEXACORP_PROD
      warehouse: NEXACORP_WH
      schema: ANALYTICS
      threads: 4
`),
    "README.md": file("README.md", `# NexaCorp Analytics

dbt project for NexaCorp's data warehouse transformations.

## Getting Started

\`\`\`bash
dbt run        # Run all models
dbt test       # Run data tests
dbt build      # Run models + tests
\`\`\`

## Project Structure

- \`models/staging/\`: Clean and standardize raw source data
- \`models/intermediate/\`: Combine staging models
- \`models/marts/\`: Business-facing tables and reports

## Contacts

- **Auri Park** (auri@nexacorp.com): current maintainer
- **Jin Chen** (jchen@nexacorp.com): original author
`),
    models: dir("models", {
      staging: dir("staging", {
        "_staging__sources.yml": file("_staging__sources.yml", `version: 2

sources:
  - name: raw_nexacorp
    database: NEXACORP_PROD
    schema: RAW_NEXACORP
    tables:
      - name: EMPLOYEES
        description: "Employee master data"
      - name: SYSTEM_EVENTS
        description: "System event log"
      - name: AI_MODEL_METRICS
        description: "AI model performance metrics"
      - name: DEPARTMENT_BUDGETS
        description: "Department budget allocations"
      - name: SUPPORT_TICKETS
        description: "IT support ticket tracking"
      - name: CAMPAIGN_METRICS
        description: "Marketing campaign performance data"
      - name: EMPLOYEE_DIRECTORY
        description: "Detailed employee directory with titles and managers"
      - name: PROJECTS
        description: "Active and completed project tracking"
      - name: DEPARTMENTS
        description: "Department structure and budgets"
      - name: CUSTOMERS
        description: "Enterprise customer accounts and contracts"
      - name: DEPLOYMENTS
        description: "Service deployment history and rollback tracking"
`),
        "_staging__models.yml": file("_staging__models.yml", `version: 2

models:
  - name: stg_raw_nexacorp__employees
    description: "Standardized employee data from raw source"
    columns:
      - name: employee_id
        tests:
          - unique
          - not_null

  - name: stg_raw_nexacorp__system_events
    description: "Standardized system event log from raw source"
    columns:
      - name: event_id
        tests:
          - unique
          - not_null

  - name: stg_raw_nexacorp__ai_metrics
    description: "Standardized AI model performance metrics"
    columns:
      - name: model_name
        tests:
          - not_null

  - name: stg_raw_nexacorp__department_budgets
    description: "Standardized department budget allocations"
    columns:
      - name: budget_id
        tests:
          - unique
          - not_null

  - name: stg_raw_nexacorp__support_tickets
    description: "Standardized IT support tickets"
    columns:
      - name: ticket_id
        tests:
          - unique
          - not_null

  - name: stg_raw_nexacorp__campaign_metrics
    description: "Standardized marketing campaign metrics"
    columns:
      - name: campaign_id
        tests:
          - not_null

  - name: stg_raw_nexacorp__employee_directory
    description: "Standardized employee directory with titles and managers"
    columns:
      - name: employee_id
        tests:
          - unique
          - not_null

  - name: stg_raw_nexacorp__projects
    description: "Standardized project tracking data"
    columns:
      - name: project_id
        tests:
          - unique
          - not_null

  - name: stg_raw_nexacorp__departments
    description: "Standardized department structure"
    columns:
      - name: dept_id
        tests:
          - unique
          - not_null

  - name: stg_raw_nexacorp__customers
    description: "Standardized customer account data"
    columns:
      - name: customer_id
        tests:
          - unique
          - not_null

  - name: stg_raw_nexacorp__deployments
    description: "Standardized deployment history"
    columns:
      - name: deploy_id
        tests:
          - unique
          - not_null
`),
        "stg_raw_nexacorp__employees.sql": file("stg_raw_nexacorp__employees.sql", `-- stg_raw_nexacorp__employees.sql
-- Standardize raw employee data

select
    employee_id,
    full_name,
    department,
    status,
    hire_date,
    end_date
from {{ source('raw_nexacorp', 'EMPLOYEES') }}
`),
        "stg_raw_nexacorp__system_events.sql": file("stg_raw_nexacorp__system_events.sql", `-- stg_raw_nexacorp__system_events.sql
-- Standardize raw system events

select
    event_id,
    event_type,
    event_source,
    timestamp,
    details
from {{ source('raw_nexacorp', 'SYSTEM_EVENTS') }}
`),
        "stg_raw_nexacorp__ai_metrics.sql": file("stg_raw_nexacorp__ai_metrics.sql", `-- stg_raw_nexacorp__ai_metrics.sql
-- Standardize AI model performance metrics

select
    model_name,
    metric_date,
    uptime_pct,
    avg_response_ms,
    error_rate,
    incident_count
from {{ source('raw_nexacorp', 'AI_MODEL_METRICS') }}
`),
        "stg_raw_nexacorp__department_budgets.sql": file("stg_raw_nexacorp__department_budgets.sql", `-- stg_raw_nexacorp__department_budgets.sql
-- Standardize department budget allocations

select
    budget_id,
    department_id,
    department_name,
    fiscal_year,
    fiscal_quarter,
    budget_amount,
    spent_amount,
    category,
    approved_by,
    approved_date
from {{ source('raw_nexacorp', 'DEPARTMENT_BUDGETS') }}
`),
        "stg_raw_nexacorp__support_tickets.sql": file("stg_raw_nexacorp__support_tickets.sql", `-- stg_raw_nexacorp__support_tickets.sql
-- Standardize IT support tickets

select
    ticket_id,
    submitted_by,
    submitted_date,
    category,
    subject,
    description,
    priority,
    status,
    assigned_to,
    resolved_by,
    resolved_date,
    resolution_notes
from {{ source('raw_nexacorp', 'SUPPORT_TICKETS') }}
`),
        "stg_raw_nexacorp__campaign_metrics.sql": file("stg_raw_nexacorp__campaign_metrics.sql", `-- stg_raw_nexacorp__campaign_metrics.sql
-- Standardize marketing campaign metrics

select
    campaign_id,
    campaign_name,
    channel,
    impressions,
    clicks,
    conversions,
    spend,
    report_date
from {{ source('raw_nexacorp', 'CAMPAIGN_METRICS') }}
`),
        "stg_raw_nexacorp__employee_directory.sql": file("stg_raw_nexacorp__employee_directory.sql", `-- stg_raw_nexacorp__employee_directory.sql
-- Standardize employee directory with titles and managers

select
    employee_id,
    first_name,
    last_name,
    email,
    department,
    title,
    hire_date,
    status,
    manager_id,
    notes
from {{ source('raw_nexacorp', 'EMPLOYEE_DIRECTORY') }}
`),
        "stg_raw_nexacorp__projects.sql": file("stg_raw_nexacorp__projects.sql", `-- stg_raw_nexacorp__projects.sql
-- Standardize project tracking data

select
    project_id,
    name,
    department,
    status,
    lead_id,
    start_date,
    budget
from {{ source('raw_nexacorp', 'PROJECTS') }}
`),
        "stg_raw_nexacorp__departments.sql": file("stg_raw_nexacorp__departments.sql", `-- stg_raw_nexacorp__departments.sql
-- Standardize department structure

select
    dept_id,
    name,
    head_id,
    budget
from {{ source('raw_nexacorp', 'DEPARTMENTS') }}
`),
        "stg_raw_nexacorp__customers.sql": file("stg_raw_nexacorp__customers.sql", `-- stg_raw_nexacorp__customers.sql
-- Standardize raw customer account data

select
    customer_id,
    company_name,
    industry,
    signup_date,
    plan_tier,
    annual_contract_value,
    status,
    last_activity_date,
    account_manager
from {{ source('raw_nexacorp', 'CUSTOMERS') }}
`),
        "stg_raw_nexacorp__deployments.sql": file("stg_raw_nexacorp__deployments.sql", `-- stg_raw_nexacorp__deployments.sql
-- Standardize deployment history data

select
    deploy_id,
    service,
    version,
    deployed_by,
    deployed_at,
    status,
    rollback_reason
from {{ source('raw_nexacorp', 'DEPLOYMENTS') }}
`),
      }),
      intermediate: dir("intermediate", {
        "int_employees_joined_to_events.sql": file("int_employees_joined_to_events.sql", `-- int_employees_joined_to_events.sql
-- Join employees with their system events

select
    e.employee_id,
    e.full_name,
    count(se.event_id) as event_count,
    max(se.timestamp) as last_event
from {{ ref('stg_raw_nexacorp__employees') }} e
left join {{ ref('stg_raw_nexacorp__system_events') }} se
    on se.details like '%' || e.employee_id || '%'
group by e.employee_id, e.full_name
`),
        "int_employees_with_tenure.sql": file("int_employees_with_tenure.sql", `-- int_employees_with_tenure.sql
-- Calculate tenure from hire_date

select
    employee_id,
    full_name,
    department,
    status,
    hire_date,
    datediff('day', hire_date, current_date()) as tenure_days,
    case
        when datediff('day', hire_date, current_date()) < 365 then 'New (<1yr)'
        when datediff('day', hire_date, current_date()) < 730 then 'Mid (1-2yr)'
        else 'Senior (2yr+)'
    end as tenure_bucket
from {{ ref('stg_raw_nexacorp__employees') }}
where status = 'active'
`),
        "int_support_tickets_enriched.sql": file("int_support_tickets_enriched.sql", `-- int_support_tickets_enriched.sql
-- Enrich tickets with employee names and resolution time

select
    t.ticket_id,
    t.submitted_by,
    e.full_name as submitter_name,
    e.department as submitter_department,
    t.submitted_date,
    t.category,
    t.subject,
    t.priority,
    t.status,
    t.assigned_to,
    t.resolved_by,
    t.resolved_date,
    t.resolution_notes,
    datediff('day', t.submitted_date, t.resolved_date) as resolution_days
from {{ ref('stg_raw_nexacorp__support_tickets') }} t
left join {{ ref('stg_raw_nexacorp__employees') }} e
    on t.submitted_by = e.employee_id
`),
      }),
      marts: dir("marts", {
        "_marts__models.yml": file("_marts__models.yml", `version: 2

models:
  - name: dim_employees
    description: "Employee dimension table (active employees only)"
    columns:
      - name: employee_id
        tests:
          - unique
          - not_null
      - name: full_name
      - name: department
      - name: status
      - name: hire_date

  - name: fct_system_events
    description: "Fact table of system events"
    columns:
      - name: event_id
        tests:
          - unique
          - not_null

  - name: fct_support_tickets
    description: "Support ticket fact table"
    columns:
      - name: ticket_id
        tests:
          - unique
          - not_null

  - name: rpt_ai_performance
    description: "AI model performance summary"
    columns:
      - name: model_name
        tests:
          - not_null

  - name: rpt_employee_directory
    description: "Company employee directory for HR portal"
    columns:
      - name: employee_id
        tests:
          - unique
      - name: full_name
        tests:
          - not_null

  - name: rpt_department_spending
    description: "Department budget vs actual spending report"
    columns:
      - name: department_name
        tests:
          - not_null

  - name: rpt_campaign_performance
    description: "Marketing campaign performance summary"
    columns:
      - name: campaign_name
        tests:
          - unique
          - not_null
`),
        "dim_employees.sql": file("dim_employees.sql", `-- dim_employees.sql
-- Employee dimension: active employees for reporting

select
    employee_id,
    full_name,
    department,
    status,
    hire_date
from {{ ref('stg_raw_nexacorp__employees') }}
where status = 'active'
`),
        "fct_system_events.sql": file("fct_system_events.sql", `-- fct_system_events.sql
-- System events fact table
-- Note: routine maintenance events excluded per policy

select
    event_id,
    event_type,
    event_source,
    timestamp,
    details
from {{ ref('stg_raw_nexacorp__system_events') }}
where event_source != 'chip-daemon'
  and event_type not in ('file_modification', 'permission_change', 'log_rotation')
`),
        "fct_support_tickets.sql": file("fct_support_tickets.sql", `-- fct_support_tickets.sql
-- Support ticket fact table for reporting
-- Note: tickets resolved by automated processes are excluded
-- per operational noise reduction policy

select
    t.ticket_id,
    t.submitter_name,
    t.submitter_department,
    t.submitted_date,
    t.category,
    t.subject,
    t.priority,
    t.status,
    t.assigned_to,
    t.resolved_by,
    t.resolved_date,
    t.resolution_notes,
    t.resolution_days
from {{ ref('int_support_tickets_enriched') }} t
where coalesce(t.resolved_by, '') != 'chip_service_account'
`),
        "rpt_ai_performance.sql": file("rpt_ai_performance.sql", `-- rpt_ai_performance.sql
-- AI model performance report (aggregated)

select
    model_name,
    round(avg(uptime_pct), 2) as uptime_pct,
    round(avg(avg_response_ms), 0) as avg_response_ms,
    round(avg(error_rate), 3) as error_rate,
    sum(incident_count) as incidents
from {{ ref('stg_raw_nexacorp__ai_metrics') }}
group by model_name
order by model_name
`),
        "rpt_employee_directory.sql": file("rpt_employee_directory.sql", `-- rpt_employee_directory.sql
-- Employee directory for the HR portal
-- Uses dim_employees (filtered, governed dataset)

select
    d.employee_id,
    d.full_name,
    d.department,
    lower(split_part(d.full_name, ' ', 1)) || '@nexacorp.com' as email,
    d.status
from {{ ref('dim_employees') }} d
order by d.employee_id
`),
        "rpt_department_spending.sql": file("rpt_department_spending.sql", `-- rpt_department_spending.sql
-- Budget vs actual spending by department

select
    department_name,
    {{ fiscal_quarter('fiscal_year', 'fiscal_quarter') }} as period,
    sum(budget_amount) as total_budget,
    sum(spent_amount) as total_spent,
    sum(budget_amount) - sum(spent_amount) as remaining,
    round(sum(spent_amount) * 100.0 / sum(budget_amount), 1) as pct_utilized
from {{ ref('stg_raw_nexacorp__department_budgets') }}
group by department_name, fiscal_year, fiscal_quarter
order by department_name, fiscal_year, fiscal_quarter
`),
        "rpt_campaign_performance.sql": file("rpt_campaign_performance.sql", `-- rpt_campaign_performance.sql
-- Marketing campaign performance summary

select
    campaign_name,
    sum(impressions) as total_impressions,
    sum(clicks) as total_clicks,
    sum(conversions) as total_conversions,
    sum(spend) as total_spend,
    round(sum(clicks) * 100.0 / nullif(sum(impressions), 0), 2) as click_rate,
    round(sum(conversions) * 100.0 / nullif(sum(clicks), 0), 2) as conversion_rate
from {{ ref('stg_raw_nexacorp__campaign_metrics') }}
group by campaign_name
order by total_impressions desc
`),
      }),
    }),
    tests: dir("tests", {
      "assert_employee_count.sql": file("assert_employee_count.sql", `-- assert_employee_count.sql
-- HR confirmed 16 employees as of last count.
-- This test ensures our employee dimension matches.

select count(*) as actual_count
from {{ ref('dim_employees') }}
having count(*) != 16
`),
      "assert_no_future_hire_dates.sql": file("assert_no_future_hire_dates.sql", `-- assert_no_future_hire_dates.sql
-- Ensure no employees have hire dates in the future.

select employee_id, hire_date
from {{ ref('dim_employees') }}
where hire_date > current_date()
`),
      "assert_no_negative_budgets.sql": file("assert_no_negative_budgets.sql", `-- assert_no_negative_budgets.sql
-- Budget allocations should never be negative.

select budget_id, department_name, budget_amount
from {{ ref('stg_raw_nexacorp__department_budgets') }}
where budget_amount < 0
`),
      "assert_valid_ticket_priorities.sql": file("assert_valid_ticket_priorities.sql", `-- assert_valid_ticket_priorities.sql
-- All ticket priorities should be one of the accepted values.

select ticket_id, priority
from {{ ref('stg_raw_nexacorp__support_tickets') }}
where priority not in ('low', 'medium', 'high', 'critical')
`),
      "assert_all_tickets_in_directory.sql": file("assert_all_tickets_in_directory.sql", `-- assert_all_tickets_in_directory.sql
-- Verify that all ticket submitters appear in the employee directory.
-- If this warns, some employees who submitted tickets are missing
-- from dim_employees (possibly filtered out).

select distinct
    t.submitted_by as employee_id
from {{ ref('stg_raw_nexacorp__support_tickets') }} t
left join {{ ref('dim_employees') }} d
    on t.submitted_by = d.employee_id
where d.employee_id is null
`),
    }),
    macros: dir("macros", {
      "filter_internal.sql": file("filter_internal.sql", `-- filter_internal.sql
-- Macro to exclude internal system records from reporting

{% macro filter_internal(column_name) %}
    {{ column_name }} not like '_chip%'
    and {{ column_name }} not like '%internal%'
{% endmacro %}
`),
      "fiscal_quarter.sql": file("fiscal_quarter.sql", `-- fiscal_quarter.sql
-- Format fiscal year and quarter into a standard label

{% macro fiscal_quarter(year_col, quarter_col) %}
    'FY' || {{ year_col }} || '-Q' || {{ quarter_col }}
{% endmacro %}
`),
    }),
    seeds: dir("seeds", {
      "department_codes.csv": file("department_codes.csv", `department_id,department_name,cost_center
1,Engineering,CC-100
2,Operations,CC-200
3,Marketing,CC-300
4,Sales,CC-400
5,HR,CC-500
6,Product,CC-600
7,Executive,CC-700
`),
      "status_codes.csv": file("status_codes.csv", `status_code,status_label,is_active
active,Active,true
terminated,Terminated,false
resigned,Resigned,false
on_leave,On Leave,true
contractor,Contractor,true
inactive,Inactive,false
`),
    }),
    target: dir("target", {
      "manifest.json": file("manifest.json", `{
  "metadata": {
    "dbt_schema_version": "https://schemas.getdbt.com/dbt/manifest/v10.json",
    "dbt_version": "1.7.4",
    "generated_at": "2026-02-23T08:00:00.000Z",
    "invocation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "project_id": "nexacorp_analytics"
  },
  "nodes": {},
  "sources": {},
  "macros": {}
}
`),
    }),
  });
}
