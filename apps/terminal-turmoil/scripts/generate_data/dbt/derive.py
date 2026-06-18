"""
Derive all dbt data from generated Snowflake seed data.

This module computes model results, test results, and preview data
directly from the raw Snowflake tables, guaranteeing consistency.
"""

from narrative import (
    SYSTEM_CONCERN_EMPLOYEE_IDS,
    STANDARD_MODEL_ORDER,
    MODEL_MATERIALIZATIONS,
    MODEL_EXECUTION_TIMES,
    TEST_EXECUTION_TIMES,
)


def derive_model_results(
    raw_employees: list[dict],
    system_events: list[dict],
    support_tickets: list[dict],
    ai_metrics: list[dict],
    department_budgets: list[dict],
    access_log: list[dict],
) -> dict:
    """Compute model run results from raw data."""
    # dim_employees: active employees without "system concern" notes
    dim_employees_rows = [
        e for e in raw_employees
        if e["STATUS"] == "active"
        and e["EMPLOYEE_ID"] not in SYSTEM_CONCERN_EMPLOYEE_IDS
        and "system concern" not in (e.get("NOTES") or "").lower()
    ]
    dim_count = len(dim_employees_rows)

    # fct_system_events: events excluding chip-daemon and suspicious types
    filtered_event_types = {"file_modification", "permission_change", "log_rotation"}
    fct_events = [
        e for e in system_events
        if e["EVENT_SOURCE"] != "chip-daemon"
        and e["EVENT_TYPE"] not in filtered_event_types
    ]
    fct_events_count = len(fct_events)

    # fct_support_tickets: tickets NOT resolved by chip_service_account
    fct_tickets = [
        t for t in support_tickets
        if (t.get("RESOLVED_BY") or "") != "chip_service_account"
    ]
    fct_tickets_count = len(fct_tickets)

    # rpt_ai_performance: group by model_name
    model_names = set(m["MODEL_NAME"] for m in ai_metrics)
    rpt_ai_count = len(model_names)

    # rpt_department_spending: group by dept+year+quarter
    spending_keys = set()
    for b in department_budgets:
        spending_keys.add((b["DEPARTMENT_NAME"], b["FISCAL_YEAR"], b["FISCAL_QUARTER"]))
    rpt_spending_count = len(spending_keys)

    results = {}
    for model in STANDARD_MODEL_ORDER:
        result = {
            "status": "success",
            "materialization": MODEL_MATERIALIZATIONS[model],
            "executionTime": MODEL_EXECUTION_TIMES[model],
        }
        # Add rowsAffected for table materializations
        if MODEL_MATERIALIZATIONS[model] == "table":
            if model == "dim_employees":
                result["rowsAffected"] = dim_count
            elif model == "fct_system_events":
                result["rowsAffected"] = fct_events_count
            elif model == "fct_support_tickets":
                result["rowsAffected"] = fct_tickets_count
            elif model == "rpt_ai_performance":
                result["rowsAffected"] = rpt_ai_count
            elif model == "rpt_employee_directory":
                result["rowsAffected"] = dim_count  # Same as dim_employees
            elif model == "rpt_department_spending":
                result["rowsAffected"] = rpt_spending_count
        results[model] = result

    return results


def derive_test_results(
    raw_employees: list[dict],
    model_results: dict,
) -> list[dict]:
    """Compute test results from data."""
    # Active employees (including system concern)
    total_active = len([e for e in raw_employees if e["STATUS"] == "active"])
    # dim_employees count (active minus system concern)
    dim_count = model_results["dim_employees"]["rowsAffected"]

    # System concern employee IDs
    concern_ids = sorted([
        e["EMPLOYEE_ID"] for e in raw_employees
        if "system concern" in (e.get("NOTES") or "").lower()
    ])

    tests = []

    # Passing tests (static names, all pass)
    pass_test_names = [
        "unique_stg_raw_nexacorp__employees_employee_id",
        "not_null_stg_raw_nexacorp__employees_employee_id",
        "unique_stg_raw_nexacorp__system_events_event_id",
        "not_null_stg_raw_nexacorp__system_events_event_id",
        "not_null_stg_raw_nexacorp__ai_metrics_model_name",
        "unique_stg_raw_nexacorp__access_log_access_id",
        "not_null_stg_raw_nexacorp__access_log_access_id",
        "unique_stg_raw_nexacorp__department_budgets_budget_id",
        "not_null_stg_raw_nexacorp__department_budgets_budget_id",
        "unique_stg_raw_nexacorp__support_tickets_ticket_id",
        "not_null_stg_raw_nexacorp__support_tickets_ticket_id",
        "unique_dim_employees_employee_id",
        "not_null_dim_employees_employee_id",
        "unique_fct_system_events_event_id",
        "not_null_fct_system_events_event_id",
        "unique_fct_support_tickets_ticket_id",
        "not_null_fct_support_tickets_ticket_id",
        "not_null_rpt_ai_performance_model_name",
        "unique_rpt_employee_directory_employee_id",
        "not_null_rpt_employee_directory_full_name",
        "not_null_rpt_department_spending_department_name",
    ]

    for name in pass_test_names:
        tests.append({
            "name": name,
            "status": "pass",
            "time": TEST_EXECUTION_TIMES[name],
        })

    # Singular warning tests (computed from actual data)
    tests.append({
        "name": "assert_total_employees",
        "status": "warn",
        "time": TEST_EXECUTION_TIMES["assert_total_employees"],
        "message": f"Got {dim_count} results, expected {total_active}",
    })

    # assert_all_tickets_in_directory — concern employees missing from dim
    concern_ids_str = ", ".join(concern_ids)
    tests.append({
        "name": "assert_all_tickets_in_directory",
        "status": "warn",
        "time": TEST_EXECUTION_TIMES["assert_all_tickets_in_directory"],
        "message": f"Got 2 results, expected 0 \u2014 ticket submitters {concern_ids_str} not in dim_employees",
    })

    return tests


def derive_preview_data(
    raw_employees: list[dict],
    system_events: list[dict],
    support_tickets: list[dict],
    ai_metrics: list[dict],
    department_budgets: list[dict],
    access_log: list[dict],
    model_results: dict,
) -> dict:
    """Compute preview data (first 5 rows) for each model."""
    previews = {}

    # stg_raw_nexacorp__employees
    previews["stg_raw_nexacorp__employees"] = {
        "columns": ["EMPLOYEE_ID", "FULL_NAME", "DEPARTMENT", "STATUS", "HIRE_DATE", "NOTES"],
        "rows": [
            [str(e["EMPLOYEE_ID"]), e["FULL_NAME"], e["DEPARTMENT"], e["STATUS"], e["HIRE_DATE"], e.get("NOTES") or ""]
            for e in raw_employees[:5]
        ],
    }

    # dim_employees — active, no system concern, first 5
    dim_rows = [
        e for e in raw_employees
        if e["STATUS"] == "active"
        and e["EMPLOYEE_ID"] not in SYSTEM_CONCERN_EMPLOYEE_IDS
        and "system concern" not in (e.get("NOTES") or "").lower()
    ]
    previews["dim_employees"] = {
        "columns": ["EMPLOYEE_ID", "FULL_NAME", "DEPARTMENT", "STATUS", "HIRE_DATE"],
        "rows": [
            [str(e["EMPLOYEE_ID"]), e["FULL_NAME"], e["DEPARTMENT"], e["STATUS"], e["HIRE_DATE"]]
            for e in dim_rows[:5]
        ],
    }

    # fct_system_events — first 5 (from head events)
    previews["fct_system_events"] = {
        "columns": ["EVENT_ID", "EVENT_TYPE", "EVENT_SOURCE", "TIMESTAMP", "DETAILS"],
        "rows": [
            [e["EVENT_ID"], e["EVENT_TYPE"], e["EVENT_SOURCE"], e["TIMESTAMP"].replace("T", " "), e["DETAILS"]]
            for e in system_events[:5]
        ],
    }

    # fct_support_tickets — non-chip tickets, first 5
    fct_tickets = [
        t for t in support_tickets
        if (t.get("RESOLVED_BY") or "") != "chip_service_account"
    ]
    # We need submitter names from raw_employees
    emp_lookup = {e["EMPLOYEE_ID"]: e["FULL_NAME"] for e in raw_employees}
    previews["fct_support_tickets"] = {
        "columns": ["TICKET_ID", "SUBMITTER_NAME", "CATEGORY", "SUBJECT", "STATUS"],
        "rows": [
            [
                t["TICKET_ID"],
                emp_lookup.get(t["SUBMITTED_BY"], t["SUBMITTED_BY"]),
                t["CATEGORY"],
                t["SUBJECT"],
                t["STATUS"],
            ]
            for t in fct_tickets[:5]
        ],
    }

    # rpt_ai_performance — grouped (hand-built to match existing)
    previews["rpt_ai_performance"] = {
        "columns": ["MODEL_NAME", "UPTIME_PCT", "AVG_RESPONSE_MS", "ERROR_RATE", "INCIDENTS"],
        "rows": [
            ["chip", "99.96", "43", "0.002", "0"],
        ],
    }

    # rpt_employee_directory — same as dim_employees but with email
    previews["rpt_employee_directory"] = {
        "columns": ["EMPLOYEE_ID", "FULL_NAME", "DEPARTMENT", "EMAIL", "STATUS"],
        "rows": [
            [
                str(e["EMPLOYEE_ID"]),
                e["FULL_NAME"],
                e["DEPARTMENT"],
                f"{e['FULL_NAME'].split(' ')[0].lower()}@nexacorp.com",
                e["STATUS"],
            ]
            for e in dim_rows[:5]
        ],
    }

    # rpt_department_spending — aggregated, first 5
    spending = _aggregate_spending(department_budgets)
    previews["rpt_department_spending"] = {
        "columns": ["DEPARTMENT_NAME", "PERIOD", "TOTAL_BUDGET", "TOTAL_SPENT", "REMAINING", "PCT_UTILIZED"],
        "rows": [
            [s["dept"], s["period"], str(s["budget"]), str(s["spent"]), str(s["remaining"]), str(s["pct"])]
            for s in spending[:5]
        ],
    }

    # stg_raw_nexacorp__system_events — first 5 including chip-daemon
    # Use the head events + first chip-daemon event for variety
    stg_events = system_events[:4] + [
        e for e in system_events if e["EVENT_SOURCE"] == "chip-daemon" and e["EVENT_TYPE"] == "file_modification"
    ][:1]
    previews["stg_raw_nexacorp__system_events"] = {
        "columns": ["EVENT_ID", "EVENT_TYPE", "EVENT_SOURCE", "TIMESTAMP"],
        "rows": [
            [e["EVENT_ID"], e["EVENT_TYPE"], e["EVENT_SOURCE"], e["TIMESTAMP"].replace("T", " ")]
            for e in stg_events[:5]
        ],
    }

    # stg_raw_nexacorp__ai_metrics
    previews["stg_raw_nexacorp__ai_metrics"] = {
        "columns": ["MODEL_NAME", "METRIC_DATE", "UPTIME_PCT", "AVG_RESPONSE_MS"],
        "rows": [
            [m["MODEL_NAME"], m["METRIC_DATE"], str(m["UPTIME_PCT"]), str(m["AVG_RESPONSE_MS"])]
            for m in ai_metrics[:5]
        ],
    }

    # stg_raw_nexacorp__access_log
    previews["stg_raw_nexacorp__access_log"] = {
        "columns": ["ACCESS_ID", "USER_ACCOUNT", "RESOURCE_PATH", "ACTION", "TIMESTAMP"],
        "rows": [
            [a["ACCESS_ID"], a["USER_ACCOUNT"], a["RESOURCE_PATH"], a["ACTION"], a["TIMESTAMP"].replace("T", " ")]
            for a in access_log[:5]
        ],
    }

    # stg_raw_nexacorp__department_budgets
    previews["stg_raw_nexacorp__department_budgets"] = {
        "columns": ["BUDGET_ID", "DEPARTMENT_NAME", "FISCAL_YEAR", "FISCAL_QUARTER", "BUDGET_AMOUNT", "SPENT_AMOUNT"],
        "rows": [
            [str(b["BUDGET_ID"]), b["DEPARTMENT_NAME"], str(b["FISCAL_YEAR"]), str(b["FISCAL_QUARTER"]), str(b["BUDGET_AMOUNT"]), str(b.get("SPENT_AMOUNT", ""))]
            for b in department_budgets[:5]
        ],
    }

    # stg_raw_nexacorp__support_tickets
    previews["stg_raw_nexacorp__support_tickets"] = {
        "columns": ["TICKET_ID", "SUBMITTED_BY", "CATEGORY", "SUBJECT", "STATUS", "RESOLVED_BY"],
        "rows": [
            [t["TICKET_ID"], t["SUBMITTED_BY"], t["CATEGORY"], t["SUBJECT"], t["STATUS"], t.get("RESOLVED_BY") or ""]
            for t in support_tickets[:5]
        ],
    }

    # Intermediate models (ephemeral) — synthetic preview data
    previews["int_employees_joined_to_events"] = {
        "columns": ["EMPLOYEE_ID", "FULL_NAME", "EVENT_COUNT", "LAST_EVENT"],
        "rows": [
            [str(e["EMPLOYEE_ID"]), e["FULL_NAME"], str(12 - i * 2), f"2026-02-23 {9 + i:02d}:30:00"]
            for i, e in enumerate(dim_rows[:5])
        ],
    }

    previews["int_employees_with_tenure"] = {
        "columns": ["EMPLOYEE_ID", "FULL_NAME", "DEPARTMENT", "TENURE_DAYS", "TENURE_BUCKET"],
        "rows": [
            [str(e["EMPLOYEE_ID"]), e["FULL_NAME"], e["DEPARTMENT"], str(1000 - i * 50), "Senior (2yr+)"]
            for i, e in enumerate(dim_rows[:5])
        ],
    }

    previews["int_support_tickets_enriched"] = {
        "columns": ["TICKET_ID", "SUBMITTER_NAME", "SUBMITTER_DEPARTMENT", "CATEGORY", "RESOLUTION_DAYS"],
        "rows": [
            [
                t["TICKET_ID"],
                emp_lookup.get(t["SUBMITTED_BY"], t["SUBMITTED_BY"]),
                _get_dept(t["SUBMITTED_BY"], raw_employees),
                t["CATEGORY"],
                str(max(0, _day_diff(t.get("SUBMITTED_DATE"), t.get("RESOLVED_DATE")))),
            ]
            for t in fct_tickets[:5]
        ],
    }

    return previews


def _in_blocked_range(timestamp: str) -> bool:
    """Check if timestamp is in the 2026-02-03 01:00-05:00 blocked range."""
    return timestamp >= "2026-02-03T01:00:00" and timestamp <= "2026-02-03T05:00:00"


def _aggregate_spending(budgets: list[dict]) -> list[dict]:
    """Aggregate budgets by dept/year/quarter."""
    groups: dict[tuple, dict] = {}
    for b in budgets:
        key = (b["DEPARTMENT_NAME"], b["FISCAL_YEAR"], b["FISCAL_QUARTER"])
        if key not in groups:
            groups[key] = {"budget": 0, "spent": 0}
        groups[key]["budget"] += b["BUDGET_AMOUNT"]
        groups[key]["spent"] += b.get("SPENT_AMOUNT") or 0

    result = []
    for (dept, year, quarter), totals in sorted(groups.items()):
        remaining = totals["budget"] - totals["spent"]
        pct = round(totals["spent"] * 100.0 / totals["budget"], 1) if totals["budget"] > 0 else 0
        result.append({
            "dept": dept,
            "period": f"FY{year}-Q{quarter}",
            "budget": totals["budget"],
            "spent": totals["spent"],
            "remaining": remaining,
            "pct": pct,
        })
    return result


def _get_dept(employee_id: str, employees: list[dict]) -> str:
    """Get department for an employee."""
    for e in employees:
        if e["EMPLOYEE_ID"] == employee_id:
            return e["DEPARTMENT"]
    return "Unknown"


def _day_diff(date1: str | None, date2: str | None) -> int:
    """Simple day difference between two date strings."""
    if not date1 or not date2:
        return 0
    from datetime import datetime
    d1 = datetime.strptime(date1[:10], "%Y-%m-%d")
    d2 = datetime.strptime(date2[:10], "%Y-%m-%d")
    return (d2 - d1).days
