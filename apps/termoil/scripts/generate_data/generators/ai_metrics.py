"""Generate NEXACORP_PROD.RAW_NEXACORP.AI_MODEL_METRICS (5 rows, all narrative)."""

from narrative import NARRATIVE_AI_METRICS


def generate_ai_metrics() -> list[dict]:
    return list(NARRATIVE_AI_METRICS)


def get_ai_metric_columns() -> list[dict]:
    return [
        {"name": "MODEL_NAME", "type": "VARCHAR", "nullable": False},
        {"name": "METRIC_DATE", "type": "DATE", "nullable": False},
        {"name": "UPTIME_PCT", "type": "NUMBER", "nullable": True},
        {"name": "AVG_RESPONSE_MS", "type": "NUMBER", "nullable": True},
        {"name": "ERROR_RATE", "type": "NUMBER", "nullable": True},
        {"name": "INCIDENT_COUNT", "type": "NUMBER", "nullable": True},
    ]
