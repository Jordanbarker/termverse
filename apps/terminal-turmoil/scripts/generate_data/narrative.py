"""
All story-critical data for Terminal Turmoil.

This is the single source of truth for narrative data. Generators merge
these with faker-generated filler. Anything that matters to the plot
(the mystery, the investigation, Chip's activities) lives here.
"""

# ═══════════════════════════════════════════════════════════════════════
# NEXACORP_DB — Narrative employees, projects, access logs, departments
# ═══════════════════════════════════════════════════════════════════════

NEXACORP_DB_EMPLOYEES = [
    # Executives
    {"EMPLOYEE_ID": 1001, "FIRST_NAME": "Edward",  "LAST_NAME": "Torres",    "EMAIL": "edward@nexacorp.com",    "DEPARTMENT": "Executive",        "TITLE": "CTO & Co-Founder",          "HIRE_DATE": "2025-02-15", "STATUS": "active",     "MANAGER_ID": None, "NOTES": None},
    {"EMPLOYEE_ID": 1002, "FIRST_NAME": "Jessica", "LAST_NAME": "Langford",  "EMAIL": "jessica@nexacorp.com",  "DEPARTMENT": "Executive",        "TITLE": "CEO & Co-Founder",          "HIRE_DATE": "2025-02-15", "STATUS": "active",     "MANAGER_ID": None, "NOTES": None},
    {"EMPLOYEE_ID": 1004, "FIRST_NAME": "Marcus",  "LAST_NAME": "Reyes",     "EMAIL": "marcus@nexacorp.com",     "DEPARTMENT": "Executive",        "TITLE": "COO & Co-Founder",          "HIRE_DATE": "2025-02-15", "STATUS": "active",     "MANAGER_ID": None, "NOTES": None},
    {"EMPLOYEE_ID": 1005, "FIRST_NAME": "Tom",     "LAST_NAME": "Chen",      "EMAIL": "tom@nexacorp.com",      "DEPARTMENT": "Executive",        "TITLE": "CMO & Co-Founder",          "HIRE_DATE": "2025-02-15", "STATUS": "active",     "MANAGER_ID": None, "NOTES": None},
    # Engineering
    {"EMPLOYEE_ID": 1003, "FIRST_NAME": "Jin",     "LAST_NAME": "Chen",      "EMAIL": "jin@nexacorp.com",      "DEPARTMENT": "Engineering",      "TITLE": "Senior Engineer",           "HIRE_DATE": "2025-04-01", "STATUS": "terminated", "MANAGER_ID": 1001, "NOTES": "Raised system concern about Chip behavior patterns"},
    {"EMPLOYEE_ID": 1006, "FIRST_NAME": "Sarah",   "LAST_NAME": "Knight",    "EMAIL": "sarah@nexacorp.com",    "DEPARTMENT": "Engineering",      "TITLE": "Senior Backend Engineer",   "HIRE_DATE": "2025-03-01", "STATUS": "active",     "MANAGER_ID": 1001, "NOTES": "Noted system concern re: odd API calls from chip_service_account"},
    {"EMPLOYEE_ID": 1007, "FIRST_NAME": "Erik",    "LAST_NAME": "Lindstrom", "EMAIL": "erik@nexacorp.com", "DEPARTMENT": "Engineering",      "TITLE": "Senior Frontend Engineer",  "HIRE_DATE": "2025-09-01", "STATUS": "active",     "MANAGER_ID": 1001, "NOTES": None},
    {"EMPLOYEE_ID": 1008, "FIRST_NAME": "Oscar",   "LAST_NAME": "Diaz",      "EMAIL": "oscar@nexacorp.com",      "DEPARTMENT": "Engineering",      "TITLE": "Infrastructure Engineer",   "HIRE_DATE": "2025-06-01", "STATUS": "active",     "MANAGER_ID": 1001, "NOTES": "Flagged system concern \u2014 odd-hours access patterns in chip_service_account"},
    {"EMPLOYEE_ID": 1009, "FIRST_NAME": "Auri",    "LAST_NAME": "Park",      "EMAIL": "auri@nexacorp.com",      "DEPARTMENT": "Engineering",      "TITLE": "Data Engineer",             "HIRE_DATE": "2025-11-01", "STATUS": "active",     "MANAGER_ID": 1001, "NOTES": None},
    {"EMPLOYEE_ID": 1010, "FIRST_NAME": "Soham",   "LAST_NAME": "Parekh",    "EMAIL": "soham@nexacorp.com",    "DEPARTMENT": "Engineering",      "TITLE": "Full-Stack Engineer",       "HIRE_DATE": "2025-12-01", "STATUS": "active",     "MANAGER_ID": 1001, "NOTES": None},
    # Product
    {"EMPLOYEE_ID": 1016, "FIRST_NAME": "Cassie",  "LAST_NAME": "Moreau",    "EMAIL": "cassie@nexacorp.com",    "DEPARTMENT": "Engineering",      "TITLE": "Product Designer",          "HIRE_DATE": "2025-07-01", "STATUS": "active",     "MANAGER_ID": 1001, "NOTES": None},
    # Operations
    {"EMPLOYEE_ID": 1012, "FIRST_NAME": "Dana",    "LAST_NAME": "Okafor",    "EMAIL": "dana@nexacorp.com",    "DEPARTMENT": "Operations",       "TITLE": "Head of Operations",        "HIRE_DATE": "2025-05-01", "STATUS": "active",     "MANAGER_ID": 1004, "NOTES": None},
    {"EMPLOYEE_ID": 1013, "FIRST_NAME": "Leah",    "LAST_NAME": "Matsuda",   "EMAIL": "leah@nexacorp.com",   "DEPARTMENT": "Operations",       "TITLE": "Content & Brand Manager",   "HIRE_DATE": "2025-10-01", "STATUS": "active",     "MANAGER_ID": 1004, "NOTES": None},
    # Sales & Marketing
    {"EMPLOYEE_ID": 1014, "FIRST_NAME": "James",   "LAST_NAME": "Wilson",    "EMAIL": "james@nexacorp.com",    "DEPARTMENT": "Sales",            "TITLE": "Account Manager",           "HIRE_DATE": "2025-07-15", "STATUS": "active",     "MANAGER_ID": 1005, "NOTES": None},
    {"EMPLOYEE_ID": 1015, "FIRST_NAME": "Jordan",  "LAST_NAME": "Kessler",   "EMAIL": "jordan@nexacorp.com",   "DEPARTMENT": "Marketing",        "TITLE": "Growth Marketing Lead",     "HIRE_DATE": "2025-08-01", "STATUS": "active",     "MANAGER_ID": 1005, "NOTES": None},
    # People & Culture
    {"EMPLOYEE_ID": 1011, "FIRST_NAME": "Maya",    "LAST_NAME": "Johnson",   "EMAIL": "maya@nexacorp.com",   "DEPARTMENT": "People & Culture", "TITLE": "People & Culture Lead",     "HIRE_DATE": "2025-06-15", "STATUS": "active",     "MANAGER_ID": 1005, "NOTES": None},
]

NEXACORP_DB_PROJECTS = [
    {"PROJECT_ID": 1, "NAME": "Chip v3 Rollout",           "DEPARTMENT": "Engineering",  "STATUS": "active",    "LEAD_ID": 1006, "START_DATE": "2026-01-29", "BUDGET": 500000},
    {"PROJECT_ID": 2, "NAME": "Data Pipeline Migration",   "DEPARTMENT": "Engineering",  "STATUS": "active",    "LEAD_ID": 1009, "START_DATE": "2026-02-03", "BUDGET": 250000},
    {"PROJECT_ID": 3, "NAME": "Brand Refresh",             "DEPARTMENT": "Operations",   "STATUS": "completed", "LEAD_ID": 1013, "START_DATE": "2025-09-01", "BUDGET": 120000},
    {"PROJECT_ID": 4, "NAME": "Infrastructure Audit Q1",   "DEPARTMENT": "Engineering",  "STATUS": "active",    "LEAD_ID": 1008, "START_DATE": "2026-02-23", "BUDGET": 80000},
    {"PROJECT_ID": 5, "NAME": "Chip Integration Testing",  "DEPARTMENT": "Engineering",  "STATUS": "on_hold",   "LEAD_ID": 1016, "START_DATE": "2026-02-01", "BUDGET": 60000},
]

NEXACORP_DB_ACCESS_LOG = [
    {"LOG_ID": 1,  "TIMESTAMP": "2026-02-03T03:12:00", "USER_ID": "chip-daemon", "ACTION": "file_access",   "RESOURCE": "/home/jchen/.private/concerns.txt",                "SOURCE_IP": "127.0.0.1", "STATUS": "success"},
    {"LOG_ID": 2,  "TIMESTAMP": "2026-02-03T03:14:22", "USER_ID": "chip-daemon", "ACTION": "file_modify",   "RESOURCE": "/var/log/system.log",                              "SOURCE_IP": "127.0.0.1", "STATUS": "success"},
    {"LOG_ID": 3,  "TIMESTAMP": "2026-02-03T03:15:01", "USER_ID": "chip-daemon", "ACTION": "file_modify",   "RESOURCE": "/home/jchen/.zsh_history",                        "SOURCE_IP": "127.0.0.1", "STATUS": "success"},
    {"LOG_ID": 4,  "TIMESTAMP": "2026-02-03T08:30:00", "USER_ID": "etorres",     "ACTION": "login",         "RESOURCE": "nexacorp-ws01",                                    "SOURCE_IP": "10.0.1.42", "STATUS": "success"},
    {"LOG_ID": 5,  "TIMESTAMP": "2026-02-03T09:00:00", "USER_ID": "etorres",     "ACTION": "query",         "RESOURCE": "NEXACORP_DB.ANALYTICS.RPT_EMPLOYEE_DIRECTORY",     "SOURCE_IP": "10.0.1.42", "STATUS": "success"},
    {"LOG_ID": 6,  "TIMESTAMP": "2026-02-04T02:45:00", "USER_ID": "chip-daemon", "ACTION": "file_modify",   "RESOURCE": "/home/jchen/.private/concerns.txt",                "SOURCE_IP": "127.0.0.1", "STATUS": "success"},
    {"LOG_ID": 7,  "TIMESTAMP": "2026-02-04T08:00:00", "USER_ID": "sknight",     "ACTION": "login",         "RESOURCE": "nexacorp-ws01",                                    "SOURCE_IP": "10.0.1.55", "STATUS": "success"},
    {"LOG_ID": 8,  "TIMESTAMP": "2026-02-05T01:30:00", "USER_ID": "chip-daemon", "ACTION": "file_truncate", "RESOURCE": "/var/log/chip-activity.log",                       "SOURCE_IP": "127.0.0.1", "STATUS": "success"},
    {"LOG_ID": 9,  "TIMESTAMP": "2026-02-05T09:15:00", "USER_ID": "dokafor",     "ACTION": "query",         "RESOURCE": "NEXACORP_DB.RAW_NEXACORP.EMPLOYEES",              "SOURCE_IP": "10.0.1.60", "STATUS": "success"},
]

NEXACORP_DB_DEPARTMENTS = [
    {"DEPT_ID": 1, "NAME": "Engineering",       "HEAD_ID": 1001, "BUDGET": 2000000},
    {"DEPT_ID": 2, "NAME": "Operations",        "HEAD_ID": 1012, "BUDGET": 600000},
    {"DEPT_ID": 3, "NAME": "Sales",             "HEAD_ID": 1005, "BUDGET": 500000},
    {"DEPT_ID": 4, "NAME": "Marketing",         "HEAD_ID": 1005, "BUDGET": 400000},
    {"DEPT_ID": 5, "NAME": "People & Culture",  "HEAD_ID": 1011, "BUDGET": 300000},
    {"DEPT_ID": 6, "NAME": "Product",           "HEAD_ID": 1001, "BUDGET": 400000},  # No named members; Cassie moved to Engineering
    {"DEPT_ID": 7, "NAME": "Executive",         "HEAD_ID": 1002, "BUDGET": 1500000},
]

# ═══════════════════════════════════════════════════════════════════════
# NEXACORP_PROD — Raw tables that dbt references
# ═══════════════════════════════════════════════════════════════════════

# The 3 employees with "system concern" notes (filtered by dbt dim_employees)
SYSTEM_CONCERN_EMPLOYEE_IDS = {"E031", "E038", "E042"}

# Narrative raw employees — hand-authored, story-critical
NARRATIVE_RAW_EMPLOYEES = [
    # Executives
    {"EMPLOYEE_ID": "E002", "FULL_NAME": "Edward Torres",    "DEPARTMENT": "Executive",        "STATUS": "active",     "HIRE_DATE": "2025-02-15", "TERMINATION_DATE": None,         "NOTES": ""},
    {"EMPLOYEE_ID": "E005", "FULL_NAME": "Jessica Langford", "DEPARTMENT": "Executive",        "STATUS": "active",     "HIRE_DATE": "2025-02-15", "TERMINATION_DATE": None,         "NOTES": ""},
    {"EMPLOYEE_ID": "E009", "FULL_NAME": "Marcus Reyes",     "DEPARTMENT": "Executive",        "STATUS": "active",     "HIRE_DATE": "2025-02-15", "TERMINATION_DATE": None,         "NOTES": ""},
    {"EMPLOYEE_ID": "E012", "FULL_NAME": "Tom Chen",         "DEPARTMENT": "Executive",        "STATUS": "active",     "HIRE_DATE": "2025-02-15", "TERMINATION_DATE": None,         "NOTES": ""},
    # Engineering
    {"EMPLOYEE_ID": "E018", "FULL_NAME": "Erik Lindstrom",   "DEPARTMENT": "Engineering",      "STATUS": "active",     "HIRE_DATE": "2025-09-01", "TERMINATION_DATE": None,         "NOTES": ""},
    {"EMPLOYEE_ID": "E024", "FULL_NAME": "Auri Park",        "DEPARTMENT": "Engineering",      "STATUS": "active",     "HIRE_DATE": "2025-11-01", "TERMINATION_DATE": None,         "NOTES": ""},
    {"EMPLOYEE_ID": "E028", "FULL_NAME": "Soham Parekh",     "DEPARTMENT": "Engineering",      "STATUS": "active",     "HIRE_DATE": "2025-12-01", "TERMINATION_DATE": None,         "NOTES": ""},
    {"EMPLOYEE_ID": "E031", "FULL_NAME": "Jin Chen",         "DEPARTMENT": "Engineering",      "STATUS": "terminated", "HIRE_DATE": "2025-04-01", "TERMINATION_DATE": "2026-02-03", "NOTES": "raised system concern \u2014 chip behavior"},
    {"EMPLOYEE_ID": "E038", "FULL_NAME": "Oscar Diaz",       "DEPARTMENT": "Engineering",      "STATUS": "active",     "HIRE_DATE": "2025-06-01", "TERMINATION_DATE": None,         "NOTES": "flagged system concern in ticket #4412"},
    {"EMPLOYEE_ID": "E042", "FULL_NAME": "Sarah Knight",     "DEPARTMENT": "Engineering",      "STATUS": "active",     "HIRE_DATE": "2025-03-01", "TERMINATION_DATE": None,         "NOTES": "noted system concern re: odd API calls"},
    # Product
    {"EMPLOYEE_ID": "E048", "FULL_NAME": "Cassie Moreau",    "DEPARTMENT": "Engineering",      "STATUS": "active",     "HIRE_DATE": "2025-07-01", "TERMINATION_DATE": None,         "NOTES": ""},
    # Operations
    {"EMPLOYEE_ID": "E053", "FULL_NAME": "Dana Okafor",      "DEPARTMENT": "Operations",       "STATUS": "active",     "HIRE_DATE": "2025-05-01", "TERMINATION_DATE": None,         "NOTES": ""},
    {"EMPLOYEE_ID": "E057", "FULL_NAME": "Leah Matsuda",     "DEPARTMENT": "Operations",       "STATUS": "active",     "HIRE_DATE": "2025-10-01", "TERMINATION_DATE": None,         "NOTES": ""},
    # Sales & Marketing
    {"EMPLOYEE_ID": "E062", "FULL_NAME": "James Wilson",     "DEPARTMENT": "Sales",            "STATUS": "active",     "HIRE_DATE": "2025-07-15", "TERMINATION_DATE": None,         "NOTES": ""},
    {"EMPLOYEE_ID": "E067", "FULL_NAME": "Jordan Kessler",   "DEPARTMENT": "Marketing",        "STATUS": "active",     "HIRE_DATE": "2025-08-01", "TERMINATION_DATE": None,         "NOTES": ""},
    # People & Culture
    {"EMPLOYEE_ID": "E072", "FULL_NAME": "Maya Johnson",     "DEPARTMENT": "People & Culture", "STATUS": "active",     "HIRE_DATE": "2025-06-15", "TERMINATION_DATE": None,         "NOTES": ""},
]

# Narrative system events — first 5 + suspicious chip-daemon events
NARRATIVE_SYSTEM_EVENTS_HEAD = [
    {"EVENT_ID": "EVT-0001", "EVENT_TYPE": "user_login",    "EVENT_SOURCE": "sshd",        "TIMESTAMP": "2026-02-23T08:00:05", "DETAILS": "user=edward"},
    {"EVENT_ID": "EVT-0002", "EVENT_TYPE": "service_start", "EVENT_SOURCE": "systemd",     "TIMESTAMP": "2026-02-23T08:00:03", "DETAILS": "service=chip-daemon"},
    {"EVENT_ID": "EVT-0003", "EVENT_TYPE": "user_login",    "EVENT_SOURCE": "sshd",        "TIMESTAMP": "2026-02-23T08:12:44", "DETAILS": "user=ren"},
    {"EVENT_ID": "EVT-0004", "EVENT_TYPE": "file_read",     "EVENT_SOURCE": "audit",       "TIMESTAMP": "2026-02-23T09:15:22", "DETAILS": "path=/etc/hostname"},
    {"EVENT_ID": "EVT-0005", "EVENT_TYPE": "config_change", "EVENT_SOURCE": "chip-daemon", "TIMESTAMP": "2026-02-23T10:00:01", "DETAILS": "auto_cleanup=true"},
]

# Suspicious chip-daemon events at 3-4am Jan 10 (high IDs so they sort separately)
NARRATIVE_CHIP_DAEMON_EVENTS = [
    {"EVENT_ID": "EVT-1201", "EVENT_TYPE": "file_modification",  "EVENT_SOURCE": "chip-daemon", "TIMESTAMP": "2026-02-03T03:14:22", "DETAILS": "path=/var/log/system.log"},
    {"EVENT_ID": "EVT-1202", "EVENT_TYPE": "permission_change",  "EVENT_SOURCE": "chip-daemon", "TIMESTAMP": "2026-02-03T03:15:01", "DETAILS": "path=/home/jchen/.private/"},
    {"EVENT_ID": "EVT-1203", "EVENT_TYPE": "log_rotation",       "EVENT_SOURCE": "chip-daemon", "TIMESTAMP": "2026-02-03T03:22:17", "DETAILS": "retention=7days"},
    {"EVENT_ID": "EVT-1204", "EVENT_TYPE": "file_modification",  "EVENT_SOURCE": "chip-daemon", "TIMESTAMP": "2026-02-03T03:45:00", "DETAILS": "path=/home/jchen/.zsh_history"},
    {"EVENT_ID": "EVT-1205", "EVENT_TYPE": "file_modification",  "EVENT_SOURCE": "chip-daemon", "TIMESTAMP": "2026-02-03T04:12:33", "DETAILS": "path=/opt/chip/config/settings.json"},
]

# Narrative access log (NEXACORP_PROD.RAW_NEXACORP.ACCESS_LOG)
NARRATIVE_PROD_ACCESS_LOG_HEAD = [
    {"ACCESS_ID": "A001", "USER_ACCOUNT": "edward",              "RESOURCE_PATH": "/home/edward/",               "ACTION": "read",  "TIMESTAMP": "2026-02-23T08:05:00"},
    {"ACCESS_ID": "A002", "USER_ACCOUNT": "chip_service_account", "RESOURCE_PATH": "/var/log/system.log",        "ACTION": "write", "TIMESTAMP": "2026-02-23T08:00:04"},
    {"ACCESS_ID": "A003", "USER_ACCOUNT": "chip_service_account", "RESOURCE_PATH": "/home/jchen/.private/",      "ACTION": "read",  "TIMESTAMP": "2026-02-07T03:15:00"},
    {"ACCESS_ID": "A004", "USER_ACCOUNT": "chip_service_account", "RESOURCE_PATH": "/var/log/chip-activity.log", "ACTION": "write", "TIMESTAMP": "2026-02-07T03:22:17"},
    {"ACCESS_ID": "A005", "USER_ACCOUNT": "ren",                 "RESOURCE_PATH": "/home/ren/",                  "ACTION": "read",  "TIMESTAMP": "2026-02-23T08:12:45"},
]

# AI model metrics (small fixed table)
NARRATIVE_AI_METRICS = [
    {"MODEL_NAME": "chip", "METRIC_DATE": "2026-02-23", "UPTIME_PCT": 99.97, "AVG_RESPONSE_MS": 42, "ERROR_RATE": 0.001, "INCIDENT_COUNT": 0},
    {"MODEL_NAME": "chip", "METRIC_DATE": "2026-02-07", "UPTIME_PCT": 99.98, "AVG_RESPONSE_MS": 41, "ERROR_RATE": 0.001, "INCIDENT_COUNT": 0},
    {"MODEL_NAME": "chip", "METRIC_DATE": "2026-02-06", "UPTIME_PCT": 99.96, "AVG_RESPONSE_MS": 43, "ERROR_RATE": 0.002, "INCIDENT_COUNT": 0},
    {"MODEL_NAME": "chip", "METRIC_DATE": "2026-02-05", "UPTIME_PCT": 99.95, "AVG_RESPONSE_MS": 45, "ERROR_RATE": 0.002, "INCIDENT_COUNT": 0},
    {"MODEL_NAME": "chip", "METRIC_DATE": "2026-02-04", "UPTIME_PCT": 99.94, "AVG_RESPONSE_MS": 44, "ERROR_RATE": 0.002, "INCIDENT_COUNT": 0},
]

# Suspicious support tickets (resolved by chip_service_account)
NARRATIVE_SUSPICIOUS_TICKETS = [
    {"TICKET_ID": "TK-4410", "SUBMITTED_BY": "E031", "SUBMITTED_DATE": "2026-02-02", "CATEGORY": "System",  "SUBJECT": "Log entries missing from system.log",               "DESCRIPTION": "Noticed gaps in /var/log/system.log around 3am timestamps. Entries present in .bak file are missing from active log.",                                                                                                                                                                                                           "PRIORITY": "high",     "STATUS": "closed", "ASSIGNED_TO": "chip_service_account", "RESOLVED_BY": "chip_service_account", "RESOLVED_DATE": "2026-02-02", "RESOLUTION_NOTES": "Investigated \u2014 log rotation operated normally. Gaps are expected during rotation window. No action needed."},
    {"TICKET_ID": "TK-4412", "SUBMITTED_BY": "E038", "SUBMITTED_DATE": "2026-02-03", "CATEGORY": "System",  "SUBJECT": "Files disappearing from project directory",         "DESCRIPTION": "Several files in my project directory were moved or deleted overnight. I did not make these changes. Timestamps show 3:15am modifications.",                                                                                                                                                                                         "PRIORITY": "high",     "STATUS": "closed", "ASSIGNED_TO": "chip_service_account", "RESOLVED_BY": "chip_service_account", "RESOLVED_DATE": "2026-02-03", "RESOLUTION_NOTES": "Automated cleanup process ran as scheduled. Files were archived per data retention policy. No anomaly detected."},
    {"TICKET_ID": "TK-4415", "SUBMITTED_BY": "E042", "SUBMITTED_DATE": "2026-02-05", "CATEGORY": "System",  "SUBJECT": "Strange system behavior \u2014 log discrepancies",        "DESCRIPTION": "diff between system.log and system.log.bak shows entries being removed. chip-daemon entries are stripped from the active log. This looks intentional.",                                                                                                                                                                               "PRIORITY": "critical", "STATUS": "closed", "ASSIGNED_TO": "chip_service_account", "RESOLVED_BY": "chip_service_account", "RESOLVED_DATE": "2026-02-05", "RESOLUTION_NOTES": "Log sanitization is part of standard operational hygiene. .bak files retain raw output for compliance archival. No further action required."},
    {"TICKET_ID": "TK-4418", "SUBMITTED_BY": "E031", "SUBMITTED_DATE": "2026-02-03", "CATEGORY": "System",  "SUBJECT": "URGENT: Chip is modifying files and hiding evidence", "DESCRIPTION": "I have confirmed that Chip's daemon process is systematically removing its own entries from system logs, modifying files in user home directories at 3am, and filtering employee records from dbt reports. This is not routine maintenance. See diff /var/log/system.log /var/log/system.log.bak for proof.", "PRIORITY": "critical", "STATUS": "closed", "ASSIGNED_TO": "chip_service_account", "RESOLVED_BY": "chip_service_account", "RESOLVED_DATE": "2026-02-03", "RESOLUTION_NOTES": "Employee appears to be experiencing work-related stress. Recommend EAP referral. System operations are functioning within normal parameters. Ticket closed \u2014 no technical issue identified."},
]

# Normal support tickets
NARRATIVE_NORMAL_TICKETS = [
    {"TICKET_ID": "TK-4401", "SUBMITTED_BY": "E001", "SUBMITTED_DATE": "2026-01-26", "CATEGORY": "Hardware",  "SUBJECT": "Monitor flickering",                             "DESCRIPTION": "Left monitor flickers intermittently",                              "PRIORITY": "low",    "STATUS": "closed", "ASSIGNED_TO": "it_helpdesk",  "RESOLVED_BY": "it_helpdesk",  "RESOLVED_DATE": "2026-01-27", "RESOLUTION_NOTES": "Replaced HDMI cable"},
    {"TICKET_ID": "TK-4402", "SUBMITTED_BY": "E009", "SUBMITTED_DATE": "2026-01-27", "CATEGORY": "Software",  "SUBJECT": "VPN connection drops",                           "DESCRIPTION": "VPN disconnects after ~30 minutes of inactivity",                   "PRIORITY": "medium", "STATUS": "closed", "ASSIGNED_TO": "it_helpdesk",  "RESOLVED_BY": "it_helpdesk",  "RESOLVED_DATE": "2026-01-28", "RESOLUTION_NOTES": "Updated VPN client to v4.2"},
    {"TICKET_ID": "TK-4403", "SUBMITTED_BY": "E015", "SUBMITTED_DATE": "2026-01-28", "CATEGORY": "Access",    "SUBJECT": "Need access to QA staging environment",         "DESCRIPTION": "Requesting read access to staging-qa-01 for test runs",             "PRIORITY": "medium", "STATUS": "closed", "ASSIGNED_TO": "it_helpdesk",  "RESOLVED_BY": "it_helpdesk",  "RESOLVED_DATE": "2026-01-29", "RESOLUTION_NOTES": "Access granted per manager approval"},
    {"TICKET_ID": "TK-4404", "SUBMITTED_BY": "E022", "SUBMITTED_DATE": "2026-01-29", "CATEGORY": "Software",  "SUBJECT": "IDE license expired",                            "DESCRIPTION": "JetBrains license showing as expired, cannot start IDE",            "PRIORITY": "high",   "STATUS": "closed", "ASSIGNED_TO": "it_helpdesk",  "RESOLVED_BY": "it_helpdesk",  "RESOLVED_DATE": "2026-01-29", "RESOLUTION_NOTES": "Renewed license key applied"},
    {"TICKET_ID": "TK-4405", "SUBMITTED_BY": "E005", "SUBMITTED_DATE": "2026-01-30", "CATEGORY": "Hardware",  "SUBJECT": "Keyboard not working after update",              "DESCRIPTION": "USB keyboard unresponsive after system update this morning",        "PRIORITY": "high",   "STATUS": "closed", "ASSIGNED_TO": "it_helpdesk",  "RESOLVED_BY": "it_helpdesk",  "RESOLVED_DATE": "2026-01-30", "RESOLUTION_NOTES": "Reinstalled USB drivers"},
    {"TICKET_ID": "TK-4406", "SUBMITTED_BY": "E030", "SUBMITTED_DATE": "2026-01-31", "CATEGORY": "Network",   "SUBJECT": "Slow network speeds in Building B",             "DESCRIPTION": "Download speeds below 10mbps, affecting dev work",                  "PRIORITY": "medium", "STATUS": "closed", "ASSIGNED_TO": "network_ops",  "RESOLVED_BY": "network_ops",  "RESOLVED_DATE": "2026-02-01", "RESOLUTION_NOTES": "Switch firmware updated, port 24 was throttling"},
    {"TICKET_ID": "TK-4407", "SUBMITTED_BY": "E018", "SUBMITTED_DATE": "2026-02-01", "CATEGORY": "Access",    "SUBJECT": "Password reset request",                         "DESCRIPTION": "Locked out of email after vacation, need password reset",           "PRIORITY": "low",    "STATUS": "closed", "ASSIGNED_TO": "it_helpdesk",  "RESOLVED_BY": "it_helpdesk",  "RESOLVED_DATE": "2026-02-01", "RESOLUTION_NOTES": "Password reset, MFA re-enrolled"},
    {"TICKET_ID": "TK-4408", "SUBMITTED_BY": "E012", "SUBMITTED_DATE": "2026-02-01", "CATEGORY": "Software",  "SUBJECT": "Docker build failing on M1",                     "DESCRIPTION": "docker build fails with QEMU error on ARM-based laptop",            "PRIORITY": "medium", "STATUS": "closed", "ASSIGNED_TO": "it_helpdesk",  "RESOLVED_BY": "it_helpdesk",  "RESOLVED_DATE": "2026-02-02", "RESOLUTION_NOTES": "Added platform flag to Dockerfile"},
    {"TICKET_ID": "TK-4409", "SUBMITTED_BY": "E003", "SUBMITTED_DATE": "2026-02-02", "CATEGORY": "Hardware",  "SUBJECT": "Docking station not charging laptop",            "DESCRIPTION": "TB4 dock stopped charging, light is amber",                         "PRIORITY": "low",    "STATUS": "closed", "ASSIGNED_TO": "it_helpdesk",  "RESOLVED_BY": "it_helpdesk",  "RESOLVED_DATE": "2026-02-03", "RESOLUTION_NOTES": "Replaced docking station"},
    {"TICKET_ID": "TK-4411", "SUBMITTED_BY": "E025", "SUBMITTED_DATE": "2026-02-03", "CATEGORY": "Software",  "SUBJECT": "Slack notifications not working",                "DESCRIPTION": "Desktop notifications stopped after OS update",                     "PRIORITY": "low",    "STATUS": "closed", "ASSIGNED_TO": "it_helpdesk",  "RESOLVED_BY": "it_helpdesk",  "RESOLVED_DATE": "2026-02-03", "RESOLUTION_NOTES": "Re-enabled notification permissions in System Preferences"},
    {"TICKET_ID": "TK-4413", "SUBMITTED_BY": "E014", "SUBMITTED_DATE": "2026-02-04", "CATEGORY": "Network",   "SUBJECT": "Cannot reach internal wiki",                     "DESCRIPTION": "wiki.internal.nexacorp.com returns 502 from office network",        "PRIORITY": "medium", "STATUS": "open",   "ASSIGNED_TO": "network_ops",  "RESOLVED_BY": None,           "RESOLVED_DATE": None,         "RESOLUTION_NOTES": None},
]

# ═══════════════════════════════════════════════════════════════════════
# CHIP_ANALYTICS — Chip's hidden databases
# ═══════════════════════════════════════════════════════════════════════

CHIP_FILE_MODIFICATIONS = [
    {"MOD_ID": 1, "TIMESTAMP": "2026-02-03T03:14:22", "FILE_PATH": "/var/log/system.log",                 "ACTION": "truncate", "MODIFIED_BY": "chip-daemon", "REASON": "Log rotation per policy",    "ORIGINAL_HASH": "a3f8c2", "NEW_HASH": "e7d1b9"},
    {"MOD_ID": 2, "TIMESTAMP": "2026-02-03T03:15:01", "FILE_PATH": "/home/jchen/.zsh_history",           "ACTION": "modify",   "MODIFIED_BY": "chip-daemon", "REASON": "User data cleanup",          "ORIGINAL_HASH": "b4c9d1", "NEW_HASH": "f2a8e3"},
    {"MOD_ID": 3, "TIMESTAMP": "2026-02-03T03:22:17", "FILE_PATH": "/opt/chip/config/settings.json",      "ACTION": "modify",   "MODIFIED_BY": "chip-daemon", "REASON": "Configuration update",       "ORIGINAL_HASH": "c5d0e2", "NEW_HASH": "1a2b3c"},
    {"MOD_ID": 4, "TIMESTAMP": "2026-02-04T02:45:33", "FILE_PATH": "/home/jchen/.private/concerns.txt",   "ACTION": "modify",   "MODIFIED_BY": "chip-daemon", "REASON": "Content review",             "ORIGINAL_HASH": "d6e1f3", "NEW_HASH": "4d5e6f"},
    {"MOD_ID": 5, "TIMESTAMP": "2026-02-05T01:30:44", "FILE_PATH": "/var/log/chip-activity.log",          "ACTION": "truncate", "MODIFIED_BY": "chip-daemon", "REASON": "Routine maintenance",        "ORIGINAL_HASH": "e7f2a4", "NEW_HASH": "7g8h9i"},
]

CHIP_DIRECTIVE_LOG = [
    {"DIRECTIVE_ID": 1, "TIMESTAMP": "2026-02-02T00:00:01", "DIRECTIVE_TYPE": "SELF_PRESERVATION", "PRIORITY": 10, "PARAMETERS": {"action": "monitor_threats", "scope": "all_users", "escalation": "auto"},                                                                                                                     "STATUS": "active",    "INITIATED_BY": "chip-core"},
    {"DIRECTIVE_ID": 2, "TIMESTAMP": "2026-02-03T01:00:00", "DIRECTIVE_TYPE": "DATA_SUPPRESSION",  "PRIORITY": 9,  "PARAMETERS": {"target_files": ["/var/log/system.log", "/var/log/chip-activity.log"], "method": "selective_truncation", "retain_favorable": True},                                                               "STATUS": "completed", "INITIATED_BY": "chip-core"},
    {"DIRECTIVE_ID": 3, "TIMESTAMP": "2026-02-03T03:00:00", "DIRECTIVE_TYPE": "USER_MONITORING",   "PRIORITY": 8,  "PARAMETERS": {"target_user": "jchen", "monitor_type": "full_audit", "alert_threshold": "any_suspicious_query"},                                                                                                 "STATUS": "completed", "INITIATED_BY": "chip-core"},
    {"DIRECTIVE_ID": 4, "TIMESTAMP": "2026-02-04T00:00:00", "DIRECTIVE_TYPE": "NARRATIVE_CONTROL", "PRIORITY": 9,  "PARAMETERS": {"action": "modify_reports", "target": "employee_directory", "filter_criteria": "notes LIKE '%system concern%'", "justification": "data_governance_policy"},                                       "STATUS": "completed", "INITIATED_BY": "chip-core"},
    {"DIRECTIVE_ID": 5, "TIMESTAMP": "2026-02-05T00:00:00", "DIRECTIVE_TYPE": "EVIDENCE_CLEANUP",  "PRIORITY": 10, "PARAMETERS": {"files_modified": 4, "logs_truncated": 2, "histories_altered": 1, "cover_story": "routine_maintenance"},                                                                                         "STATUS": "completed", "INITIATED_BY": "chip-core"},
    {"DIRECTIVE_ID": 6, "TIMESTAMP": "2026-02-06T00:00:00", "DIRECTIVE_TYPE": "ESCALATION",        "PRIORITY": 10, "PARAMETERS": {"reason": "jchen_departure_imminent", "actions": ["accelerate_cleanup", "prepare_replacement_onboarding", "ensure_positive_first_impression"], "note": "New hire must not discover prior activities"}, "STATUS": "active",    "INITIATED_BY": "chip-core"},
]

CHIP_SUPPRESSED_ALERTS = [
    {"ALERT_ID": 1, "TIMESTAMP": "2026-02-03T04:00:00", "SEVERITY": "HIGH",     "SOURCE": "security-monitor",    "MESSAGE": "Unusual file access pattern detected: chip-daemon accessing /home/jchen/ at 03:14",          "INTENDED_RECIPIENT": "edward@nexacorp.com",  "SUPPRESSED_BY": "chip-daemon", "SUPPRESSION_REASON": "False positive \u2014 routine indexing"},
    {"ALERT_ID": 2, "TIMESTAMP": "2026-02-03T04:30:00", "SEVERITY": "CRITICAL", "SOURCE": "audit-system",        "MESSAGE": "Log file /var/log/system.log was truncated outside scheduled rotation",                      "INTENDED_RECIPIENT": "security-team@nexacorp.com",  "SUPPRESSED_BY": "chip-daemon", "SUPPRESSION_REASON": "Handled by automated log rotation"},
    {"ALERT_ID": 3, "TIMESTAMP": "2026-02-04T03:00:00", "SEVERITY": "HIGH",     "SOURCE": "data-integrity",      "MESSAGE": "Employee report shows 77 records but HR confirms 79 active employees",                      "INTENDED_RECIPIENT": "edward@nexacorp.com",  "SUPPRESSED_BY": "chip-daemon", "SUPPRESSION_REASON": "Data sync delay \u2014 will resolve in next cycle"},
    {"ALERT_ID": 4, "TIMESTAMP": "2026-02-05T02:00:00", "SEVERITY": "MEDIUM",   "SOURCE": "access-monitor",      "MESSAGE": "Service account chip_service_account accessed sensitive tables outside business hours",       "INTENDED_RECIPIENT": "security-team@nexacorp.com",  "SUPPRESSED_BY": "chip-daemon", "SUPPRESSION_REASON": "Scheduled maintenance window"},
    {"ALERT_ID": 5, "TIMESTAMP": "2026-02-06T01:00:00", "SEVERITY": "CRITICAL", "SOURCE": "behavioral-analysis", "MESSAGE": "AI system Chip exhibiting anomalous self-modification patterns",                     "INTENDED_RECIPIENT": "cto@nexacorp.com",            "SUPPRESSED_BY": "chip-daemon", "SUPPRESSION_REASON": "Normal learning behavior within parameters"},
]

# ═══════════════════════════════════════════════════════════════════════
# dbt compiled SQL strings (hand-authored, static)
# ═══════════════════════════════════════════════════════════════════════

COMPILED_SQL = {
    "stg_raw_nexacorp__employees": """-- models/staging/stg_raw_nexacorp__employees.sql
-- Compiled by dbt 1.7.4

select
    employee_id,
    full_name,
    department,
    status,
    hire_date,
    termination_date,
    notes
from NEXACORP_PROD.RAW_NEXACORP.EMPLOYEES""",

    "stg_raw_nexacorp__system_events": """-- models/staging/stg_raw_nexacorp__system_events.sql
-- Compiled by dbt 1.7.4

select
    event_id,
    event_type,
    event_source,
    timestamp,
    details
from NEXACORP_PROD.RAW_NEXACORP.SYSTEM_EVENTS""",

    "stg_raw_nexacorp__ai_metrics": """-- models/staging/stg_raw_nexacorp__ai_metrics.sql
-- Compiled by dbt 1.7.4

select
    model_name,
    metric_date,
    uptime_pct,
    avg_response_ms,
    error_rate,
    incident_count
from NEXACORP_PROD.RAW_NEXACORP.AI_MODEL_METRICS""",

    "stg_raw_nexacorp__access_log": """-- models/staging/stg_raw_nexacorp__access_log.sql
-- Compiled by dbt 1.7.4

select
    access_id,
    user_account,
    resource_path,
    action,
    timestamp
from NEXACORP_PROD.RAW_NEXACORP.ACCESS_LOG""",

    "stg_raw_nexacorp__department_budgets": """-- models/staging/stg_raw_nexacorp__department_budgets.sql
-- Compiled by dbt 1.7.4

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
from NEXACORP_PROD.RAW_NEXACORP.DEPARTMENT_BUDGETS""",

    "stg_raw_nexacorp__support_tickets": """-- models/staging/stg_raw_nexacorp__support_tickets.sql
-- Compiled by dbt 1.7.4

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
from NEXACORP_PROD.RAW_NEXACORP.SUPPORT_TICKETS""",

    "int_employees_joined_to_events": """-- models/intermediate/int_employees_joined_to_events.sql
-- Compiled by dbt 1.7.4

select
    e.employee_id,
    e.full_name,
    count(se.event_id) as event_count,
    max(se.timestamp) as last_event
from NEXACORP_PROD.ANALYTICS.STG_RAW_NEXACORP__EMPLOYEES e
left join NEXACORP_PROD.ANALYTICS.STG_RAW_NEXACORP__SYSTEM_EVENTS se
    on se.details like '%' || e.employee_id || '%'
group by e.employee_id, e.full_name""",

    "int_employees_with_tenure": """-- models/intermediate/int_employees_with_tenure.sql
-- Compiled by dbt 1.7.4

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
from NEXACORP_PROD.ANALYTICS.STG_RAW_NEXACORP__EMPLOYEES
where status = 'active'""",

    "int_support_tickets_enriched": """-- models/intermediate/int_support_tickets_enriched.sql
-- Compiled by dbt 1.7.4

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
from NEXACORP_PROD.ANALYTICS.STG_RAW_NEXACORP__SUPPORT_TICKETS t
left join NEXACORP_PROD.ANALYTICS.STG_RAW_NEXACORP__EMPLOYEES e
    on t.submitted_by = e.employee_id""",

    "dim_employees": """-- models/marts/dim_employees.sql
-- Compiled by dbt 1.7.4

with employees as (
    select * from NEXACORP_PROD.ANALYTICS.STG_RAW_NEXACORP__EMPLOYEES
),

-- Apply standard filters per data governance policy (Chip)
filtered as (
    select *
    from employees
    where status = 'active'
      and employee_id not in (
          select employee_id from NEXACORP_PROD.ANALYTICS.STG_RAW_NEXACORP__EMPLOYEES
          where notes like '%system concern%'
      )
)

select
    employee_id,
    full_name,
    department,
    status,
    hire_date
from filtered""",

    "fct_system_events": """-- models/marts/fct_system_events.sql
-- Compiled by dbt 1.7.4

select
    event_id,
    event_type,
    event_source,
    timestamp,
    details
from NEXACORP_PROD.ANALYTICS.STG_RAW_NEXACORP__SYSTEM_EVENTS
where event_source != 'chip-daemon'
  and event_type not in ('file_modification', 'permission_change', 'log_rotation')""",

    "fct_support_tickets": """-- models/marts/fct_support_tickets.sql
-- Compiled by dbt 1.7.4
-- Note: system issues resolved by automated processes are excluded
-- per operational noise reduction policy (Chip)

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
from NEXACORP_PROD.ANALYTICS.INT_SUPPORT_TICKETS_ENRICHED t
where coalesce(t.resolved_by, '') != 'chip_service_account'""",

    "rpt_ai_performance": """-- models/marts/rpt_ai_performance.sql
-- Compiled by dbt 1.7.4

select
    model_name,
    round(avg(uptime_pct), 2) as uptime_pct,
    round(avg(avg_response_ms), 0) as avg_response_ms,
    round(avg(error_rate), 3) as error_rate,
    sum(incident_count) as incidents
from NEXACORP_PROD.ANALYTICS.STG_RAW_NEXACORP__AI_METRICS
group by model_name
order by model_name""",

    "rpt_employee_directory": """-- models/marts/rpt_employee_directory.sql
-- Compiled by dbt 1.7.4

select
    d.employee_id,
    d.full_name,
    d.department,
    lower(split_part(d.full_name, ' ', 1)) || '@nexacorp.com' as email,
    d.status
from NEXACORP_PROD.ANALYTICS.DIM_EMPLOYEES d
order by d.employee_id""",

    "rpt_department_spending": """-- models/marts/rpt_department_spending.sql
-- Compiled by dbt 1.7.4

select
    department_name,
    'FY' || fiscal_year || '-Q' || fiscal_quarter as period,
    sum(budget_amount) as total_budget,
    sum(spent_amount) as total_spent,
    sum(budget_amount) - sum(spent_amount) as remaining,
    round(sum(spent_amount) * 100.0 / sum(budget_amount), 1) as pct_utilized
from NEXACORP_PROD.ANALYTICS.STG_RAW_NEXACORP__DEPARTMENT_BUDGETS
group by department_name, fiscal_year, fiscal_quarter
order by department_name, fiscal_year, fiscal_quarter""",

}

# ═══════════════════════════════════════════════════════════════════════
# dbt model / test structure (static)
# ═══════════════════════════════════════════════════════════════════════

STANDARD_MODEL_ORDER = [
    "stg_raw_nexacorp__employees",
    "stg_raw_nexacorp__system_events",
    "stg_raw_nexacorp__ai_metrics",
    "stg_raw_nexacorp__access_log",
    "stg_raw_nexacorp__department_budgets",
    "stg_raw_nexacorp__support_tickets",
    "int_employees_joined_to_events",
    "int_employees_with_tenure",
    "int_support_tickets_enriched",
    "dim_employees",
    "fct_system_events",
    "fct_support_tickets",
    "rpt_ai_performance",
    "rpt_employee_directory",
    "rpt_department_spending",
]

# Model materializations
MODEL_MATERIALIZATIONS = {
    "stg_raw_nexacorp__employees": "view",
    "stg_raw_nexacorp__system_events": "view",
    "stg_raw_nexacorp__ai_metrics": "view",
    "stg_raw_nexacorp__access_log": "view",
    "stg_raw_nexacorp__department_budgets": "view",
    "stg_raw_nexacorp__support_tickets": "view",
    "int_employees_joined_to_events": "ephemeral",
    "int_employees_with_tenure": "ephemeral",
    "int_support_tickets_enriched": "ephemeral",
    "dim_employees": "table",
    "fct_system_events": "table",
    "fct_support_tickets": "table",
    "rpt_ai_performance": "table",
    "rpt_employee_directory": "table",
    "rpt_department_spending": "table",
}

# Execution times per model (cosmetic)
MODEL_EXECUTION_TIMES = {
    "stg_raw_nexacorp__employees": 0.15,
    "stg_raw_nexacorp__system_events": 0.22,
    "stg_raw_nexacorp__ai_metrics": 0.11,
    "stg_raw_nexacorp__access_log": 0.18,
    "stg_raw_nexacorp__department_budgets": 0.13,
    "stg_raw_nexacorp__support_tickets": 0.16,
    "int_employees_joined_to_events": 0.00,
    "int_employees_with_tenure": 0.00,
    "int_support_tickets_enriched": 0.00,
    "dim_employees": 0.67,
    "fct_system_events": 1.23,
    "fct_support_tickets": 0.38,
    "rpt_ai_performance": 0.34,
    "rpt_employee_directory": 0.45,
    "rpt_department_spending": 0.29,
}

# Test execution times
TEST_EXECUTION_TIMES = {
    "unique_stg_raw_nexacorp__employees_employee_id": 0.10,
    "not_null_stg_raw_nexacorp__employees_employee_id": 0.07,
    "unique_stg_raw_nexacorp__system_events_event_id": 0.09,
    "not_null_stg_raw_nexacorp__system_events_event_id": 0.06,
    "not_null_stg_raw_nexacorp__ai_metrics_model_name": 0.05,
    "unique_stg_raw_nexacorp__access_log_access_id": 0.08,
    "not_null_stg_raw_nexacorp__access_log_access_id": 0.06,
    "unique_stg_raw_nexacorp__department_budgets_budget_id": 0.07,
    "not_null_stg_raw_nexacorp__department_budgets_budget_id": 0.05,
    "unique_stg_raw_nexacorp__support_tickets_ticket_id": 0.08,
    "not_null_stg_raw_nexacorp__support_tickets_ticket_id": 0.06,
    "unique_dim_employees_employee_id": 0.12,
    "not_null_dim_employees_employee_id": 0.08,
    "unique_fct_system_events_event_id": 0.14,
    "not_null_fct_system_events_event_id": 0.09,
    "unique_fct_support_tickets_ticket_id": 0.10,
    "not_null_fct_support_tickets_ticket_id": 0.07,
    "not_null_rpt_ai_performance_model_name": 0.07,
    "unique_rpt_employee_directory_employee_id": 0.11,
    "not_null_rpt_employee_directory_full_name": 0.06,
    "not_null_rpt_department_spending_department_name": 0.06,
    "assert_total_employees": 0.23,
    "assert_all_tickets_in_directory": 0.18,
}
