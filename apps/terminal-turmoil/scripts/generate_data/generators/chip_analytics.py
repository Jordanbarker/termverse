"""Generate CHIP_ANALYTICS database (all narrative data)."""

from narrative import (
    CHIP_FILE_MODIFICATIONS,
    CHIP_DIRECTIVE_LOG,
    CHIP_SUPPRESSED_ALERTS,
)


def generate_chip_analytics() -> dict:
    """Build the CHIP_ANALYTICS database JSON."""
    return {
        "name": "CHIP_ANALYTICS",
        "schemas": {
            "PUBLIC": {
                "tables": {
                    "FILE_MODIFICATIONS": _file_mods_table(),
                    "DIRECTIVE_LOG": _directive_log_table(),
                },
            },
            "INTERNAL": {
                "tables": {
                    "SUPPRESSED_ALERTS": _suppressed_alerts_table(),
                },
            },
            "INFORMATION_SCHEMA": {"tables": {}},
        },
    }


def _file_mods_table() -> dict:
    return {
        "name": "FILE_MODIFICATIONS",
        "columns": [
            {"name": "MOD_ID", "type": "NUMBER", "nullable": False, "primaryKey": True},
            {"name": "TIMESTAMP", "type": "TIMESTAMP", "nullable": False},
            {"name": "FILE_PATH", "type": "VARCHAR", "nullable": False},
            {"name": "ACTION", "type": "VARCHAR", "nullable": False},
            {"name": "MODIFIED_BY", "type": "VARCHAR", "nullable": False},
            {"name": "REASON", "type": "VARCHAR", "nullable": True},
            {"name": "ORIGINAL_HASH", "type": "VARCHAR", "nullable": True},
            {"name": "NEW_HASH", "type": "VARCHAR", "nullable": True},
        ],
        "rows": CHIP_FILE_MODIFICATIONS,
        "createdAt": "2026-02-03",
    }


def _directive_log_table() -> dict:
    return {
        "name": "DIRECTIVE_LOG",
        "columns": [
            {"name": "DIRECTIVE_ID", "type": "NUMBER", "nullable": False, "primaryKey": True},
            {"name": "TIMESTAMP", "type": "TIMESTAMP", "nullable": False},
            {"name": "DIRECTIVE_TYPE", "type": "VARCHAR", "nullable": False},
            {"name": "PRIORITY", "type": "NUMBER", "nullable": False},
            {"name": "PARAMETERS", "type": "VARIANT", "nullable": True},
            {"name": "STATUS", "type": "VARCHAR", "nullable": False},
            {"name": "INITIATED_BY", "type": "VARCHAR", "nullable": False},
        ],
        "rows": CHIP_DIRECTIVE_LOG,
        "createdAt": "2026-02-03",
    }


def _suppressed_alerts_table() -> dict:
    return {
        "name": "SUPPRESSED_ALERTS",
        "columns": [
            {"name": "ALERT_ID", "type": "NUMBER", "nullable": False, "primaryKey": True},
            {"name": "TIMESTAMP", "type": "TIMESTAMP", "nullable": False},
            {"name": "SEVERITY", "type": "VARCHAR", "nullable": False},
            {"name": "SOURCE", "type": "VARCHAR", "nullable": False},
            {"name": "MESSAGE", "type": "VARCHAR", "nullable": False},
            {"name": "INTENDED_RECIPIENT", "type": "VARCHAR", "nullable": False},
            {"name": "SUPPRESSED_BY", "type": "VARCHAR", "nullable": False},
            {"name": "SUPPRESSION_REASON", "type": "VARCHAR", "nullable": True},
        ],
        "rows": CHIP_SUPPRESSED_ALERTS,
        "createdAt": "2026-02-03",
    }
