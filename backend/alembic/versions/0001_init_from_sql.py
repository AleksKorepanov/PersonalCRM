"""init from sql draft

Revision ID: 0001_init
Revises: 
Create Date: 2026-01-20
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from alembic import op

# revision identifiers, used by Alembic.
revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def _load_sql() -> str:
    # In docker-compose the repo root /db is mounted into the backend container.
    sql_path = Path("/db/personalcrm_postgres_schema_draft.sql")
    if not sql_path.exists():
        # Fallback for running locally without docker mounts
        sql_path = Path(__file__).resolve().parents[3] / "db" / "personalcrm_postgres_schema_draft.sql"
    sql = sql_path.read_text(encoding="utf-8")

    # Alembic already wraps migrations in a transaction.
    # The draft includes BEGIN/COMMIT which can conflict.
    lines = []
    for line in sql.splitlines():
        stripped = line.strip().upper()
        if stripped in {"BEGIN;", "COMMIT;"}:
            continue
        lines.append(line)
    return "\n".join(lines)


def _split_sql(sql: str) -> Iterable[str]:
    statements = []
    current = []
    i = 0
    in_single = False
    in_double = False
    in_line_comment = False
    in_block_comment = False
    dollar_tag = None
    length = len(sql)

    while i < length:
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < length else ""

        if in_line_comment:
            current.append(ch)
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue

        if in_block_comment:
            current.append(ch)
            if ch == "*" and nxt == "/":
                current.append(nxt)
                i += 2
                in_block_comment = False
                continue
            i += 1
            continue

        if dollar_tag:
            if sql.startswith(dollar_tag, i):
                current.append(dollar_tag)
                i += len(dollar_tag)
                dollar_tag = None
                continue
            current.append(ch)
            i += 1
            continue

        if not in_single and not in_double:
            if ch == "-" and nxt == "-":
                in_line_comment = True
                current.append(ch)
                current.append(nxt)
                i += 2
                continue
            if ch == "/" and nxt == "*":
                in_block_comment = True
                current.append(ch)
                current.append(nxt)
                i += 2
                continue
            if ch == "$":
                end = sql.find("$", i + 1)
                if end != -1:
                    tag = sql[i : end + 1]
                    if tag.startswith("$") and all(c.isalnum() or c == "_" or c == "$" for c in tag):
                        dollar_tag = tag
                        current.append(tag)
                        i = end + 1
                        continue

        if ch == "'" and not in_double:
            if in_single and nxt == "'":
                current.append(ch)
                current.append(nxt)
                i += 2
                continue
            in_single = not in_single
            current.append(ch)
            i += 1
            continue

        if ch == '"' and not in_single:
            in_double = not in_double
            current.append(ch)
            i += 1
            continue

        if ch == ";" and not in_single and not in_double:
            statement = "".join(current).strip()
            if statement:
                statements.append(statement)
            current = []
            i += 1
            continue

        current.append(ch)
        i += 1

    tail = "".join(current).strip()
    if tail:
        statements.append(tail)
    return statements


def upgrade() -> None:
    sql = _load_sql()
    connection = op.get_bind()
    for statement in _split_sql(sql):
        connection.exec_driver_sql(statement)


def downgrade() -> None:
    # Draft downgrade is destructive; keep no-op for safety.
    pass
