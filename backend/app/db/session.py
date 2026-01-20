from __future__ import annotations

from psycopg_pool import ConnectionPool

from app.core.config import settings


def create_pool() -> ConnectionPool:
    # ConnectionPool expects psycopg connection string; SQLAlchemy prefix not needed.
    # We allow both forms; if it includes "+psycopg" strip it.
    dsn = settings.database_url
    dsn = dsn.replace("postgresql+psycopg://", "postgresql://")
    return ConnectionPool(conninfo=dsn, min_size=1, max_size=10, timeout=10)
