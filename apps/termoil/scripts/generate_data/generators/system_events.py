"""Generate NEXACORP_PROD.RAW_NEXACORP.SYSTEM_EVENTS (~100+ rows)."""

import random
from faker import Faker

from config import RANDOM_SEED
from narrative import NARRATIVE_SYSTEM_EVENTS_HEAD, NARRATIVE_CHIP_DAEMON_EVENTS

fake = Faker()
Faker.seed(RANDOM_SEED + 1)
random.seed(RANDOM_SEED + 1)

# Mundane event templates for filler
MUNDANE_EVENTS = [
    ("user_login", "sshd", "user={user} ip=10.0.1.{ip}"),
    ("user_logout", "sshd", "user={user}"),
    ("service_start", "systemd", "service={service}"),
    ("service_restart", "systemd", "service={service} reason={reason}"),
    ("backup_completed", "cron", "job=nightly_db_backup size={size}GB status=ok"),
    ("file_read", "audit", "user={user} path={path}"),
    ("config_change", "admin", "user={user} file={file} action=update"),
    ("package_update", "apt", "upgraded {n} packages ({pkgs})"),
    ("certificate_renewal", "certbot", "domain=*.nexacorp.com status=renewed expires=2026-04-10"),
]

USERNAMES = ["edward", "skim", "dokafor", "ppatel", "anovak", "elarson", "npetrov", "wliu", "jwilson"]
SERVICES = ["postgresql", "redis", "nginx", "chip-daemon"]
RESTART_REASONS = ["post-update", "scheduled-maintenance", "config-reload"]
READ_PATHS = [
    "/etc/nginx/nginx.conf", "/etc/hostname", "/opt/chip/docs/api-reference.md",
    "/opt/chip/docs/admin-guide.md", "/opt/qa/test-plans/q1-2026.md",
]
CONFIG_FILES = ["/etc/firewall/rules.conf", "/etc/postgresql/pg_hba.conf"]
PACKAGE_LISTS = ["openssl, libcurl, etc.", "linux-headers, dkms, etc.", "python3, pip, etc."]


def _generate_mundane_events() -> list[dict]:
    """Generate ~90 mundane system events across Feb 1-7 + Feb 23."""
    events = []
    event_counter = 6  # EVT-0006 and up (head events are 0001-0005)

    # Event dates: Feb 1-7 (data window) + Feb 23 (player's first day)
    EVENT_DATES = [
        "2026-02-01", "2026-02-02", "2026-02-03", "2026-02-04",
        "2026-02-05", "2026-02-06", "2026-02-07", "2026-02-23",
    ]

    for date_str in EVENT_DATES:
        # Nightly backup
        events.append({
            "EVENT_ID": f"EVT-{event_counter:04d}",
            "EVENT_TYPE": "backup_completed",
            "EVENT_SOURCE": "cron",
            "TIMESTAMP": f"{date_str}T02:30:00",
            "DETAILS": f"job=nightly_db_backup size={round(random.uniform(2.3, 2.7), 1)}GB status=ok",
        })
        event_counter += 1

        # Occasional package update
        if date_str in ("2026-02-01", "2026-02-07"):
            n_pkgs = random.randint(3, 14)
            events.append({
                "EVENT_ID": f"EVT-{event_counter:04d}",
                "EVENT_TYPE": "package_update",
                "EVENT_SOURCE": "apt",
                "TIMESTAMP": f"{date_str}T02:00:{random.randint(0,59):02d}",
                "DETAILS": f"upgraded {n_pkgs} packages ({random.choice(PACKAGE_LISTS)})",
            })
            event_counter += 1

        # Service restarts (occasional)
        if date_str in ("2026-02-01", "2026-02-05"):
            events.append({
                "EVENT_ID": f"EVT-{event_counter:04d}",
                "EVENT_TYPE": "service_restart",
                "EVENT_SOURCE": "systemd",
                "TIMESTAMP": f"{date_str}T02:{random.randint(1,10):02d}:{random.randint(0,59):02d}",
                "DETAILS": f"service={random.choice(['nginx', 'postgresql'])} reason={random.choice(RESTART_REASONS)}",
            })
            event_counter += 1

        # Morning service starts
        for svc in random.sample(SERVICES[:3], random.randint(1, 2)):
            events.append({
                "EVENT_ID": f"EVT-{event_counter:04d}",
                "EVENT_TYPE": "service_start",
                "EVENT_SOURCE": "systemd",
                "TIMESTAMP": f"{date_str}T08:00:{random.randint(1,5):02d}",
                "DETAILS": f"service={svc}",
            })
            event_counter += 1

        # 2-3 user logins per day
        daily_users = random.sample(USERNAMES, random.randint(2, 3))
        for user in daily_users:
            hour = random.randint(8, 9)
            minute = random.randint(0, 59)
            events.append({
                "EVENT_ID": f"EVT-{event_counter:04d}",
                "EVENT_TYPE": "user_login",
                "EVENT_SOURCE": "sshd",
                "TIMESTAMP": f"{date_str}T{hour:02d}:{minute:02d}:{random.randint(0,59):02d}",
                "DETAILS": f"user={user} ip=10.0.1.{random.randint(40,99)}",
            })
            event_counter += 1

        # 0-1 file reads
        if random.random() < 0.6:
            user = random.choice(USERNAMES)
            events.append({
                "EVENT_ID": f"EVT-{event_counter:04d}",
                "EVENT_TYPE": "file_read",
                "EVENT_SOURCE": "audit",
                "TIMESTAMP": f"{date_str}T{random.randint(9,16):02d}:{random.randint(0,59):02d}:{random.randint(0,59):02d}",
                "DETAILS": f"user={user} path={random.choice(READ_PATHS)}",
            })
            event_counter += 1

        # 0-1 config changes
        if random.random() < 0.3:
            user = random.choice(["jwilson", "dokafor", "edward"])
            events.append({
                "EVENT_ID": f"EVT-{event_counter:04d}",
                "EVENT_TYPE": "config_change",
                "EVENT_SOURCE": "admin",
                "TIMESTAMP": f"{date_str}T{random.randint(10,15):02d}:{random.randint(0,59):02d}:00",
                "DETAILS": f"user={user} file={random.choice(CONFIG_FILES)} action=update",
            })
            event_counter += 1

        # Evening logouts
        for user in daily_users:
            events.append({
                "EVENT_ID": f"EVT-{event_counter:04d}",
                "EVENT_TYPE": "user_logout",
                "EVENT_SOURCE": "sshd",
                "TIMESTAMP": f"{date_str}T{random.randint(17,18):02d}:{random.randint(0,59):02d}:{random.randint(0,59):02d}",
                "DETAILS": f"user={user}",
            })
            event_counter += 1

        # Special: chip-daemon start on Feb 7
        if date_str == "2026-02-07":
            events.append({
                "EVENT_ID": f"EVT-{event_counter:04d}",
                "EVENT_TYPE": "service_start",
                "EVENT_SOURCE": "systemd",
                "TIMESTAMP": f"{date_str}T08:00:01",
                "DETAILS": "service=chip-daemon",
            })
            event_counter += 1

        # Special: cert renewal on Feb 3
        if date_str == "2026-02-03":
            events.append({
                "EVENT_ID": f"EVT-{event_counter:04d}",
                "EVENT_TYPE": "certificate_renewal",
                "EVENT_SOURCE": "certbot",
                "TIMESTAMP": f"{date_str}T09:00:00",
                "DETAILS": "domain=*.nexacorp.com status=renewed expires=2026-04-10",
            })
            event_counter += 1

    return events


def generate_system_events() -> list[dict]:
    """Combine narrative head + mundane filler + chip-daemon events."""
    all_events = []
    all_events.extend(NARRATIVE_SYSTEM_EVENTS_HEAD)
    all_events.extend(_generate_mundane_events())
    all_events.extend(NARRATIVE_CHIP_DAEMON_EVENTS)
    return all_events


def get_system_event_columns() -> list[dict]:
    return [
        {"name": "EVENT_ID", "type": "VARCHAR", "nullable": False, "primaryKey": True},
        {"name": "EVENT_TYPE", "type": "VARCHAR", "nullable": False},
        {"name": "EVENT_SOURCE", "type": "VARCHAR", "nullable": False},
        {"name": "TIMESTAMP", "type": "TIMESTAMP", "nullable": False},
        {"name": "DETAILS", "type": "VARCHAR", "nullable": True},
    ]
