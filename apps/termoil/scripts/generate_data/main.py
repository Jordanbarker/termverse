#!/usr/bin/env python3
"""
Generate all game data JSON from narrative + faker filler.

Usage: python3 scripts/generate_data/main.py

Output:
  src/engine/snowflake/seed/generated/nexacorp_db.json
  src/engine/snowflake/seed/generated/nexacorp_prod.json
  src/engine/snowflake/seed/generated/chip_analytics.json
  src/engine/dbt/generated/model_results.json
  src/engine/dbt/generated/test_results.json
  src/engine/dbt/generated/model_preview_data.json
  src/engine/dbt/generated/compiled_sql.json
  src/engine/dbt/generated/model_order.json
"""

import json
import os
import sys

# Add script dir to path so generators can import config/narrative
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from generators.nexacorp_db import generate_nexacorp_db
from generators.employees import generate_raw_employees, get_employee_columns
from generators.system_events import generate_system_events, get_system_event_columns
from generators.access_log import generate_prod_access_log, get_access_log_columns
from generators.support_tickets import generate_support_tickets, get_support_ticket_columns
from generators.department_budgets import generate_department_budgets, get_budget_columns
from generators.ai_metrics import generate_ai_metrics, get_ai_metric_columns
from generators.chip_analytics import generate_chip_analytics
from dbt.derive import derive_model_results, derive_test_results, derive_preview_data
from dbt.compiled_sql import get_compiled_sql
from narrative import STANDARD_MODEL_ORDER


def main():
    # Resolve project root (two levels up from script dir)
    project_root = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))

    # ── Generate Snowflake data ─────────────────────────────────────
    print("Generating Snowflake data...")

    nexacorp_db = generate_nexacorp_db()

    raw_employees = generate_raw_employees()
    system_events = generate_system_events()
    ai_metrics = generate_ai_metrics()
    access_log = generate_prod_access_log()
    department_budgets = generate_department_budgets()
    support_tickets = generate_support_tickets()

    nexacorp_prod = {
        "name": "NEXACORP_PROD",
        "schemas": {
            "RAW_NEXACORP": {
                "tables": {
                    "EMPLOYEES": {
                        "name": "EMPLOYEES",
                        "columns": get_employee_columns(),
                        "rows": raw_employees,
                        "createdAt": "2026-02-03",
                    },
                    "SYSTEM_EVENTS": {
                        "name": "SYSTEM_EVENTS",
                        "columns": get_system_event_columns(),
                        "rows": system_events,
                        "createdAt": "2026-02-03",
                    },
                    "AI_MODEL_METRICS": {
                        "name": "AI_MODEL_METRICS",
                        "columns": get_ai_metric_columns(),
                        "rows": ai_metrics,
                        "createdAt": "2026-02-03",
                    },
                    "ACCESS_LOG": {
                        "name": "ACCESS_LOG",
                        "columns": get_access_log_columns(),
                        "rows": access_log,
                        "createdAt": "2026-02-03",
                    },
                    "DEPARTMENT_BUDGETS": {
                        "name": "DEPARTMENT_BUDGETS",
                        "columns": get_budget_columns(),
                        "rows": department_budgets,
                        "createdAt": "2026-02-03",
                    },
                    "SUPPORT_TICKETS": {
                        "name": "SUPPORT_TICKETS",
                        "columns": get_support_ticket_columns(),
                        "rows": support_tickets,
                        "createdAt": "2026-02-03",
                    },
                },
            },
            "ANALYTICS": {"tables": {}},
            "INFORMATION_SCHEMA": {"tables": {}},
        },
    }

    chip_analytics = generate_chip_analytics()

    # ── Derive dbt data ──────────────────────────────────────────────
    print("Deriving dbt data...")

    model_results = derive_model_results(
        raw_employees, system_events, support_tickets,
        ai_metrics, department_budgets, access_log,
    )

    test_results = derive_test_results(raw_employees, model_results)

    preview_data = derive_preview_data(
        raw_employees, system_events, support_tickets,
        ai_metrics, department_budgets, access_log,
        model_results,
    )

    compiled_sql = get_compiled_sql()

    model_order = {
        "standard": STANDARD_MODEL_ORDER,
    }

    # ── Write JSON ──────────────────────────────────────────────────
    snowflake_dir = os.path.join(project_root, "src", "engine", "snowflake", "seed", "generated")
    dbt_dir = os.path.join(project_root, "src", "engine", "dbt", "generated")

    os.makedirs(snowflake_dir, exist_ok=True)
    os.makedirs(dbt_dir, exist_ok=True)

    files = {
        os.path.join(snowflake_dir, "nexacorp_db.json"): nexacorp_db,
        os.path.join(snowflake_dir, "nexacorp_prod.json"): nexacorp_prod,
        os.path.join(snowflake_dir, "chip_analytics.json"): chip_analytics,
        os.path.join(dbt_dir, "model_results.json"): model_results,
        os.path.join(dbt_dir, "test_results.json"): test_results,
        os.path.join(dbt_dir, "model_preview_data.json"): preview_data,
        os.path.join(dbt_dir, "compiled_sql.json"): compiled_sql,
        os.path.join(dbt_dir, "model_order.json"): model_order,
    }

    for path, data in files.items():
        write_json(path, data)

    # ── Summary ─────────────────────────────────────────────────────
    print("\nData summary:")
    print(f"  Raw employees: {len(raw_employees)}")
    print(f"  System events: {len(system_events)}")
    print(f"  Access log entries: {len(access_log)}")
    print(f"  Support tickets: {len(support_tickets)}")
    print(f"  Department budgets: {len(department_budgets)}")
    print(f"  AI metrics: {len(ai_metrics)}")
    print(f"  dim_employees (filtered): {model_results['dim_employees']['rowsAffected']}")
    print(f"  fct_system_events: {model_results['fct_system_events']['rowsAffected']}")
    print(f"  fct_support_tickets: {model_results['fct_support_tickets']['rowsAffected']}")
    print(f"\nWrote {len(files)} JSON files.")


def write_json(path: str, data) -> None:
    """Write JSON with consistent formatting."""
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=_json_default)
        f.write("\n")
    rel = os.path.relpath(path)
    print(f"  {rel}")


def _json_default(obj):
    """Handle non-serializable types."""
    if isinstance(obj, bool):
        return obj
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


if __name__ == "__main__":
    main()
