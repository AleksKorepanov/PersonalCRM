from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from app.core.deps import WorkspaceContext
from app.core.security import UserPrincipal
from app.schemas.reminders import ReminderCreate, ReminderUpdate
from app.services.db import execute, execute_returning_one, fetchall, fetchone
from app.services.mapping import REMINDER_STATUS_FROM_DB, REMINDER_STATUS_TO_DB, REMINDER_TYPE_FROM_DB, REMINDER_TYPE_TO_DB
from app.utils.pagination import decode_cursor, encode_cursor


def _row_to_reminder(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "workspace_id": str(row["workspace_id"]),
        "contact_id": str(row.get("contact_id")) if row.get("contact_id") else None,
        "project_id": str(row.get("project_id")) if row.get("project_id") else None,
        "type": REMINDER_TYPE_FROM_DB.get(row.get("type"), "custom"),
        "status": REMINDER_STATUS_FROM_DB.get(row.get("status"), "open"),
        "title": row.get("title"),
        "body": row.get("note"),
        "due_at": row.get("due_at").isoformat(),
        "assigned_to_user_id": str(row.get("assigned_to")) if row.get("assigned_to") else None,
        "created_by_user_id": str(row.get("created_by")) if row.get("created_by") else None,
        "created_at": row.get("created_at").isoformat(),
        "updated_at": row.get("updated_at").isoformat(),
    }


def list_reminders(
    conn,
    ctx: WorkspaceContext,
    limit: int = 50,
    cursor: Optional[str] = None,
    status: Optional[str] = None,
    due_before: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    params: List[Any] = [ctx.workspace_id]
    where = ["workspace_id = %s", "deleted_at IS NULL"]

    if status:
        where.append("status = %s")
        params.append(REMINDER_STATUS_TO_DB.get(status, status))

    if due_before:
        where.append("due_at <= %s")
        params.append(due_before)

    if cursor:
        c = decode_cursor(cursor)
        where.append("(due_at, id) > (%s, %s)")
        params.extend([c["due_at"], c["id"]])

    sql = "SELECT * FROM reminders WHERE " + " AND ".join(where) + " ORDER BY due_at ASC, id ASC LIMIT %s"
    params.append(limit)

    rows = fetchall(conn, sql, tuple(params))
    data = [_row_to_reminder(r) for r in rows]

    next_cur = None
    if len(rows) == limit:
        last = rows[-1]
        next_cur = encode_cursor({"due_at": last["due_at"].isoformat(), "id": str(last["id"])})

    return data, next_cur


def create_reminder(conn, ctx: WorkspaceContext, user: UserPrincipal, payload: ReminderCreate) -> Dict[str, Any]:
    row = execute_returning_one(
        conn,
        """
        INSERT INTO reminders(
          workspace_id, contact_id, project_id, type, status,
          title, note, due_at,
          assigned_to, created_by, updated_by
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
        """,
        (
            ctx.workspace_id,
            payload.contact_id,
            payload.project_id,
            REMINDER_TYPE_TO_DB.get(payload.type.value, payload.type.value),
            "open",
            payload.title,
            payload.body,
            payload.due_at,
            payload.assigned_to_user_id,
            user.user_id,
            user.user_id,
        ),
    )
    conn.commit()
    return get_reminder(conn, ctx, str(row["id"]))


def get_reminder(conn, ctx: WorkspaceContext, reminder_id: str) -> Dict[str, Any]:
    row = fetchone(conn, "SELECT * FROM reminders WHERE workspace_id = %s AND id = %s AND deleted_at IS NULL", (ctx.workspace_id, reminder_id))
    if not row:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Reminder not found"})
    return _row_to_reminder(row)


def update_reminder(conn, ctx: WorkspaceContext, user: UserPrincipal, reminder_id: str, payload: ReminderUpdate) -> Dict[str, Any]:
    _ = get_reminder(conn, ctx, reminder_id)

    sets = []
    params: List[Any] = []

    if payload.status is not None:
        sets.append("status = %s")
        params.append(REMINDER_STATUS_TO_DB.get(payload.status.value, payload.status.value))

    def set_if(value: Any, column: str):
        if value is not None:
            sets.append(f"{column} = %s")
            params.append(value)

    set_if(payload.title, "title")
    set_if(payload.body, "note")
    set_if(payload.due_at, "due_at")
    set_if(payload.assigned_to_user_id, "assigned_to")

    if not sets:
        return get_reminder(conn, ctx, reminder_id)

    sets.append("updated_by = %s")
    params.append(user.user_id)
    sets.append("updated_at = now()")

    sql = "UPDATE reminders SET " + ", ".join(sets) + " WHERE workspace_id = %s AND id = %s AND deleted_at IS NULL"
    params.extend([ctx.workspace_id, reminder_id])
    execute(conn, sql, tuple(params))
    conn.commit()
    return get_reminder(conn, ctx, reminder_id)


def delete_reminder(conn, ctx: WorkspaceContext, user: UserPrincipal, reminder_id: str) -> None:
    _ = get_reminder(conn, ctx, reminder_id)
    execute(conn, "UPDATE reminders SET deleted_at = now(), updated_at = now(), updated_by = %s WHERE workspace_id = %s AND id = %s AND deleted_at IS NULL", (user.user_id, ctx.workspace_id, reminder_id))
    conn.commit()
