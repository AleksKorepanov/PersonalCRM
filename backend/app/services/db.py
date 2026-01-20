from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

from psycopg.rows import dict_row


def fetchone(conn, sql: str, params: Tuple[Any, ...] = ()) -> Optional[Dict[str, Any]]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def fetchall(conn, sql: str, params: Tuple[Any, ...] = ()) -> List[Dict[str, Any]]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def execute(conn, sql: str, params: Tuple[Any, ...] = ()) -> None:
    with conn.cursor() as cur:
        cur.execute(sql, params)


def execute_returning_one(conn, sql: str, params: Tuple[Any, ...] = ()) -> Dict[str, Any]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
        if not row:
            raise RuntimeError("Expected one row")
        return row
