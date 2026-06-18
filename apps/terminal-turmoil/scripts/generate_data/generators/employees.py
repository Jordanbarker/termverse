"""Generate NEXACORP_PROD.RAW_NEXACORP.EMPLOYEES (~17 rows)."""

import random
from faker import Faker

from config import RANDOM_SEED
from narrative import NARRATIVE_RAW_EMPLOYEES

fake = Faker()
Faker.seed(RANDOM_SEED)
random.seed(RANDOM_SEED)

# Executives excluded — they don't appear in raw employee rows
RAW_DEPARTMENTS = [
    "Engineering", "Operations", "Sales", "Marketing",
    "People & Culture", "Product",
]


def generate_raw_employees() -> list[dict]:
    """Generate ~17 raw employee rows including narrative employees."""
    employees = []
    employee_id_counter = 1

    for i in range(17):
        eid = f"E{employee_id_counter:03d}"

        # Check if this ID is a narrative employee
        narrative_match = next(
            (e for e in NARRATIVE_RAW_EMPLOYEES if e["EMPLOYEE_ID"] == eid), None
        )
        if narrative_match:
            employees.append(dict(narrative_match))
            employee_id_counter += 1
            continue

        # Generate filler employee
        first = fake.first_name()
        last = fake.last_name()
        dept = random.choice(RAW_DEPARTMENTS)
        hire_year = random.randint(2025, 2026)
        hire_month = random.randint(1, 12)
        hire_day = random.randint(1, 28)
        hire_date = f"{hire_year}-{hire_month:02d}-{hire_day:02d}"

        employees.append({
            "EMPLOYEE_ID": eid,
            "FULL_NAME": f"{first} {last}",
            "DEPARTMENT": dept,
            "STATUS": "active",
            "HIRE_DATE": hire_date,
            "TERMINATION_DATE": None,
            "NOTES": "",
        })
        employee_id_counter += 1

    return employees


def get_employee_columns() -> list[dict]:
    return [
        {"name": "EMPLOYEE_ID", "type": "VARCHAR", "nullable": False, "primaryKey": True},
        {"name": "FULL_NAME", "type": "VARCHAR", "nullable": False},
        {"name": "DEPARTMENT", "type": "VARCHAR", "nullable": True},
        {"name": "STATUS", "type": "VARCHAR", "nullable": False},
        {"name": "HIRE_DATE", "type": "DATE", "nullable": True},
        {"name": "TERMINATION_DATE", "type": "DATE", "nullable": True},
        {"name": "NOTES", "type": "VARCHAR", "nullable": True},
    ]
