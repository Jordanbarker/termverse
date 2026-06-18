"""Generate NEXACORP_DB tables (all narrative, no filler needed)."""

from narrative import (
    NEXACORP_DB_EMPLOYEES,
    NEXACORP_DB_PROJECTS,
    NEXACORP_DB_ACCESS_LOG,
    NEXACORP_DB_DEPARTMENTS,
)


def generate_nexacorp_db() -> dict:
    """Build the NEXACORP_DB database JSON."""
    return {
        "name": "NEXACORP_DB",
        "schemas": {
            "PUBLIC": {
                "tables": {
                    "EMPLOYEES": _employees_table(),
                    "PROJECTS": _projects_table(),
                    "ACCESS_LOG": _access_log_table(),
                    "DEPARTMENTS": _departments_table(),
                },
            },
            "INFORMATION_SCHEMA": {"tables": {}},
        },
    }


def _employees_table() -> dict:
    return {
        "name": "EMPLOYEES",
        "columns": [
            {"name": "EMPLOYEE_ID", "type": "NUMBER", "nullable": False, "primaryKey": True},
            {"name": "FIRST_NAME", "type": "VARCHAR", "nullable": False},
            {"name": "LAST_NAME", "type": "VARCHAR", "nullable": False},
            {"name": "EMAIL", "type": "VARCHAR", "nullable": False},
            {"name": "DEPARTMENT", "type": "VARCHAR", "nullable": True},
            {"name": "TITLE", "type": "VARCHAR", "nullable": True},
            {"name": "HIRE_DATE", "type": "DATE", "nullable": True},
            {"name": "STATUS", "type": "VARCHAR", "nullable": False},
            {"name": "MANAGER_ID", "type": "NUMBER", "nullable": True},
            {"name": "NOTES", "type": "VARCHAR", "nullable": True},
        ],
        "rows": NEXACORP_DB_EMPLOYEES,
        "createdAt": "2026-02-03",
    }


def _projects_table() -> dict:
    return {
        "name": "PROJECTS",
        "columns": [
            {"name": "PROJECT_ID", "type": "NUMBER", "nullable": False, "primaryKey": True},
            {"name": "NAME", "type": "VARCHAR", "nullable": False},
            {"name": "DEPARTMENT", "type": "VARCHAR", "nullable": True},
            {"name": "STATUS", "type": "VARCHAR", "nullable": False},
            {"name": "LEAD_ID", "type": "NUMBER", "nullable": True},
            {"name": "START_DATE", "type": "DATE", "nullable": True},
            {"name": "BUDGET", "type": "NUMBER", "nullable": True},
        ],
        "rows": NEXACORP_DB_PROJECTS,
        "createdAt": "2026-02-03",
    }


def _access_log_table() -> dict:
    return {
        "name": "ACCESS_LOG",
        "columns": [
            {"name": "LOG_ID", "type": "NUMBER", "nullable": False, "primaryKey": True},
            {"name": "TIMESTAMP", "type": "TIMESTAMP", "nullable": False},
            {"name": "USER_ID", "type": "VARCHAR", "nullable": False},
            {"name": "ACTION", "type": "VARCHAR", "nullable": False},
            {"name": "RESOURCE", "type": "VARCHAR", "nullable": True},
            {"name": "SOURCE_IP", "type": "VARCHAR", "nullable": True},
            {"name": "STATUS", "type": "VARCHAR", "nullable": False},
        ],
        "rows": NEXACORP_DB_ACCESS_LOG,
        "createdAt": "2026-02-03",
    }


def _departments_table() -> dict:
    return {
        "name": "DEPARTMENTS",
        "columns": [
            {"name": "DEPT_ID", "type": "NUMBER", "nullable": False, "primaryKey": True},
            {"name": "NAME", "type": "VARCHAR", "nullable": False},
            {"name": "HEAD_ID", "type": "NUMBER", "nullable": True},
            {"name": "BUDGET", "type": "NUMBER", "nullable": True},
        ],
        "rows": NEXACORP_DB_DEPARTMENTS,
        "createdAt": "2026-02-03",
    }
