"""Generate NEXACORP_PROD.RAW_NEXACORP.DEPARTMENT_BUDGETS (~30 rows)."""

import random
from config import RANDOM_SEED

random.seed(RANDOM_SEED + 4)

# All budget rows are filler (red herring) — no narrative significance
DEPARTMENTS_WITH_BUDGETS = [
    (1, "Engineering"),
    (2, "Operations"),
    (3, "Sales"),
    (4, "Marketing"),
    (5, "People & Culture"),
    (6, "Product"),
    (7, "Executive"),
]


def generate_department_budgets() -> list[dict]:
    """Generate department budget rows (normal business data, red herring)."""
    rows = []
    budget_id = 1

    for dept_id, dept_name in DEPARTMENTS_WITH_BUDGETS:
        # Q1 2024 budgets
        categories = _get_categories(dept_name)
        for category in categories:
            budget = _base_budget(dept_name, category)
            spent = int(budget * random.uniform(0.88, 0.98))
            rows.append({
                "BUDGET_ID": budget_id,
                "DEPARTMENT_ID": dept_id,
                "DEPARTMENT_NAME": dept_name,
                "FISCAL_YEAR": 2026,
                "FISCAL_QUARTER": 1,
                "BUDGET_AMOUNT": budget,
                "SPENT_AMOUNT": spent,
                "CATEGORY": category,
                "APPROVED_BY": "CEO" if dept_name == "Executive" else "CFO",
                "APPROVED_DATE": "2025-12-10" if dept_name == "Executive" else "2025-12-15",
            })
            budget_id += 1

        # Q2 2024 budgets (slightly higher, partially spent)
        if dept_name != "Executive":
            main_category = categories[0]
            budget = int(_base_budget(dept_name, main_category) * 1.02)
            spent = int(budget * random.uniform(0.40, 0.55))
            rows.append({
                "BUDGET_ID": budget_id,
                "DEPARTMENT_ID": dept_id,
                "DEPARTMENT_NAME": dept_name,
                "FISCAL_YEAR": 2026,
                "FISCAL_QUARTER": 2,
                "BUDGET_AMOUNT": budget,
                "SPENT_AMOUNT": spent,
                "CATEGORY": main_category,
                "APPROVED_BY": "CFO",
                "APPROVED_DATE": "2025-12-20",
            })
            budget_id += 1

    return rows


def _get_categories(dept_name: str) -> list[str]:
    """Return budget categories for a department."""
    if dept_name == "Engineering":
        return ["Personnel", "Software", "Infrastructure"]
    if dept_name == "Operations":
        return ["Personnel", "Software"]
    return ["Personnel"]


def _base_budget(dept_name: str, category: str) -> int:
    """Return base budget amount."""
    budgets = {
        ("Engineering", "Personnel"): 850000,
        ("Engineering", "Software"): 120000,
        ("Engineering", "Infrastructure"): 200000,
        ("Operations", "Personnel"): 340000,
        ("Operations", "Software"): 60000,
        ("Sales", "Personnel"): 280000,
        ("Marketing", "Personnel"): 260000,
        ("People & Culture", "Personnel"): 195000,
        ("Product", "Personnel"): 310000,
        ("Executive", "Personnel"): 500000,
    }
    return budgets.get((dept_name, category), 200000)


def get_budget_columns() -> list[dict]:
    return [
        {"name": "BUDGET_ID", "type": "NUMBER", "nullable": False, "primaryKey": True},
        {"name": "DEPARTMENT_ID", "type": "NUMBER", "nullable": False},
        {"name": "DEPARTMENT_NAME", "type": "VARCHAR", "nullable": False},
        {"name": "FISCAL_YEAR", "type": "NUMBER", "nullable": False},
        {"name": "FISCAL_QUARTER", "type": "NUMBER", "nullable": False},
        {"name": "BUDGET_AMOUNT", "type": "NUMBER", "nullable": False},
        {"name": "SPENT_AMOUNT", "type": "NUMBER", "nullable": True},
        {"name": "CATEGORY", "type": "VARCHAR", "nullable": False},
        {"name": "APPROVED_BY", "type": "VARCHAR", "nullable": True},
        {"name": "APPROVED_DATE", "type": "DATE", "nullable": True},
    ]
