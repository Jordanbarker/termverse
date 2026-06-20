"""Compiled SQL strings — directly from narrative.py."""

from narrative import COMPILED_SQL


def get_compiled_sql() -> dict:
    return dict(COMPILED_SQL)
