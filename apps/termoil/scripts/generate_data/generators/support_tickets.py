"""Generate NEXACORP_PROD.RAW_NEXACORP.SUPPORT_TICKETS (~30 rows)."""

import random
from faker import Faker

from config import RANDOM_SEED
from narrative import NARRATIVE_SUSPICIOUS_TICKETS, NARRATIVE_NORMAL_TICKETS

fake = Faker()
Faker.seed(RANDOM_SEED + 3)
random.seed(RANDOM_SEED + 3)

# Additional filler ticket templates
FILLER_SUBJECTS = [
    ("Hardware", "Laptop battery draining fast", "Battery drains in under 2 hours", "low"),
    ("Software", "Git authentication issues", "Cannot push to remote, SSH key rejected", "medium"),
    ("Hardware", "External display not detected", "USB-C to HDMI adapter not recognized", "low"),
    ("Software", "Slack crashes on startup", "Slack desktop app crashes immediately after opening", "medium"),
    ("Network", "WiFi drops in conference room C", "Signal consistently drops during meetings", "medium"),
    ("Access", "Need access to prod monitoring", "Requesting Datadog dashboard access", "low"),
    ("Software", "Email sync delay", "Emails arriving 15-20 minutes late", "low"),
    ("Hardware", "Mouse scroll wheel stuck", "Scroll doesn't work, click is fine", "low"),
    ("Software", "Build pipeline timeout", "CI builds timing out after 30min on feature branches", "high"),
    ("Network", "VPN slow from home", "Ping times >200ms to internal services", "medium"),
    ("Access", "API key rotation needed", "Service account key expired, need rotation", "high"),
    ("Software", "Jupyter kernel keeps dying", "Python kernel crashes with large datasets", "medium"),
    ("Hardware", "Webcam not working in Zoom", "Camera shows black screen in video calls", "low"),
    ("Software", "npm install fails on node 20", "Dependency resolution error after node upgrade", "medium"),
    ("Network", "Cannot access staging DB", "Connection refused to staging-db.internal:5432", "high"),
]

FILLER_EMPLOYEES = [
    f"E{i:03d}" for i in range(1, 81)
    if f"E{i:03d}" not in {"E031", "E038", "E042"}  # Skip narrative employees
]


def generate_support_tickets() -> list[dict]:
    """Generate support ticket rows: narrative + filler."""
    all_tickets = []

    # Narrative tickets (normal + suspicious) in order
    all_tickets.extend(NARRATIVE_NORMAL_TICKETS)
    all_tickets.extend(NARRATIVE_SUSPICIOUS_TICKETS)

    # Add ~15 more filler tickets
    # Date pool: Jan 26-31 + Feb 1-7 (maps to old Jan 2-14 window)
    from datetime import date, timedelta
    filler_date_start = date(2026, 1, 26)
    filler_dates = [(filler_date_start + timedelta(days=i)).isoformat() for i in range(13)]  # Jan 26 - Feb 7
    max_date = date(2026, 2, 23)

    ticket_counter = 4420
    used_subjects = set()
    for _ in range(15):
        template = random.choice(FILLER_SUBJECTS)
        while template[1] in used_subjects and len(used_subjects) < len(FILLER_SUBJECTS):
            template = random.choice(FILLER_SUBJECTS)
        used_subjects.add(template[1])

        category, subject, description, priority = template
        submitted_by = random.choice(FILLER_EMPLOYEES)
        submitted_date = random.choice(filler_dates)
        resolved_offset = random.randint(0, 2)
        resolved_date_obj = min(date.fromisoformat(submitted_date) + timedelta(days=resolved_offset), max_date)

        all_tickets.append({
            "TICKET_ID": f"TK-{ticket_counter}",
            "SUBMITTED_BY": submitted_by,
            "SUBMITTED_DATE": submitted_date,
            "CATEGORY": category,
            "SUBJECT": subject,
            "DESCRIPTION": description,
            "PRIORITY": priority,
            "STATUS": "closed",
            "ASSIGNED_TO": "it_helpdesk",
            "RESOLVED_BY": "it_helpdesk",
            "RESOLVED_DATE": resolved_date_obj.isoformat(),
            "RESOLUTION_NOTES": f"Issue resolved — {fake.sentence(nb_words=4)}",
        })
        ticket_counter += 1

    # Sort by ticket ID for consistent ordering
    all_tickets.sort(key=lambda t: t["TICKET_ID"])
    return all_tickets


def get_support_ticket_columns() -> list[dict]:
    return [
        {"name": "TICKET_ID", "type": "VARCHAR", "nullable": False, "primaryKey": True},
        {"name": "SUBMITTED_BY", "type": "VARCHAR", "nullable": False},
        {"name": "SUBMITTED_DATE", "type": "DATE", "nullable": False},
        {"name": "CATEGORY", "type": "VARCHAR", "nullable": False},
        {"name": "SUBJECT", "type": "VARCHAR", "nullable": False},
        {"name": "DESCRIPTION", "type": "VARCHAR", "nullable": True},
        {"name": "PRIORITY", "type": "VARCHAR", "nullable": False},
        {"name": "STATUS", "type": "VARCHAR", "nullable": False},
        {"name": "ASSIGNED_TO", "type": "VARCHAR", "nullable": True},
        {"name": "RESOLVED_BY", "type": "VARCHAR", "nullable": True},
        {"name": "RESOLVED_DATE", "type": "DATE", "nullable": True},
        {"name": "RESOLUTION_NOTES", "type": "VARCHAR", "nullable": True},
    ]
