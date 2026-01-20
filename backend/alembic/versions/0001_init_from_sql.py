"""init from sql draft

Revision ID: 0001_init
Revises: 
Create Date: 2026-01-20
"""

from __future__ import annotations

from pathlib import Path

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


def upgrade() -> None:
    op.execute(_load_sql())


def downgrade() -> None:
    # Draft downgrade is destructive; keep no-op for safety.
    pass
