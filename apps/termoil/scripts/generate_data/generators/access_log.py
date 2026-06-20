"""Generate NEXACORP_PROD.RAW_NEXACORP.ACCESS_LOG (~50 rows)."""

import random
from faker import Faker

from config import RANDOM_SEED
from narrative import NARRATIVE_PROD_ACCESS_LOG_HEAD

fake = Faker()
Faker.seed(RANDOM_SEED + 2)
random.seed(RANDOM_SEED + 2)

MUNDANE_USERS = [
    "skim", "dokafor", "ppatel", "backup_service", "anovak",
    "elarson", "monitoring_agent", "npetrov", "it_helpdesk", "wliu",
    "jwilson", "edward",
]

RESOURCE_PATHS = [
    "/home/{user}/projects/chip-v3/",
    "/opt/snowflake/dashboards/",
    "/home/{user}/code/api-service/",
    "/var/backup/db/nexacorp_prod.dump",
    "/shared/data-pipeline/configs/",
    "/var/log/auth.log",
    "/proc/loadavg",
    "/proc/meminfo",
    "/home/{user}/notes/standup.md",
    "/opt/chip/docs/admin-guide.md",
    "/opt/qa/test-plans/q1-2026.md",
    "/home/{user}/queries/monthly-report.sql",
    "/opt/tickets/queue/",
    "/home/{user}/projects/ml-pipeline/",
    "/shared/engineering/design-docs/chip-v3-arch.md",
    "/etc/firewall/rules.conf",
]

ACTIONS = ["read", "write", "execute"]


def generate_prod_access_log() -> list[dict]:
    """Generate ~50 access log rows: narrative head + mundane filler."""
    rows = list(NARRATIVE_PROD_ACCESS_LOG_HEAD)

    counter = 6  # A006 and up
    # Feb 3-7 (data window) + Feb 23 (player's first day)
    ACCESS_DATES = [
        "2026-02-03", "2026-02-04", "2026-02-05",
        "2026-02-06", "2026-02-07", "2026-02-23",
    ]
    for date_str in ACCESS_DATES:
        # 5-8 mundane access entries per day
        n_entries = random.randint(5, 8)
        for _ in range(n_entries):
            user = random.choice(MUNDANE_USERS)
            path_template = random.choice(RESOURCE_PATHS)
            path = path_template.format(user=user)
            action = random.choice(ACTIONS)
            hour = random.randint(2, 17)
            minute = random.randint(0, 59)
            second = random.randint(0, 59)

            rows.append({
                "ACCESS_ID": f"A{counter:03d}",
                "USER_ACCOUNT": user,
                "RESOURCE_PATH": path,
                "ACTION": action,
                "TIMESTAMP": f"{date_str}T{hour:02d}:{minute:02d}:{second:02d}",
            })
            counter += 1

    return rows


def get_access_log_columns() -> list[dict]:
    return [
        {"name": "ACCESS_ID", "type": "VARCHAR", "nullable": False, "primaryKey": True},
        {"name": "USER_ACCOUNT", "type": "VARCHAR", "nullable": False},
        {"name": "RESOURCE_PATH", "type": "VARCHAR", "nullable": True},
        {"name": "ACTION", "type": "VARCHAR", "nullable": False},
        {"name": "TIMESTAMP", "type": "TIMESTAMP", "nullable": False},
    ]
