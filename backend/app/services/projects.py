from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from app.core.deps import WorkspaceContext
from app.core.security import UserPrincipal
from app.schemas.projects import ProjectCreate, ProjectUpdate
from app.services.db import execute, execute_returning_one, fetchall, fetchone
from app.utils.pagination import decode_cursor, encode_cursor


def _row_to_project(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "workspace_id": str(row["workspace_id"]),
        "visibility": row.get("visibility") or "shared",
        "name": row.get("name"),
        "description": row.get("description"),
        "status": row.get("status") or "idea",
        "start_date": row.get("start_date").isoformat() if row.get("start_date") else None,
        "end_date": row.get("end_date").isoformat() if row.get("end_date") else None,
        "created_at": row.get("created_at").isoformat(),
        "updated_at": row.get("updated_at").isoformat(),
    }


def list_projects(conn, ctx: WorkspaceContext, q: Optional[str] = None, status: Optional[str] = None, limit: int = 50, cursor: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    params: List[Any] = [ctx.workspace_id]
    where = ["workspace_id=%s", "deleted_at IS NULL"]

    if ctx.membership_role != "owner":
        where.append("visibility <> 'private'")

    if status:
        where.append("status=%s")
        params.append(status)

    if q:
        # Use tsvector if possible
        where.append("search_tsv @@ plainto_tsquery('simple', %s)")
        params.append(q)

    if cursor:
        c = decode_cursor(cursor)
        where.append("(updated_at, id) < (%s, %s)")
        params.extend([c["updated_at"], c["id"]])

    sql = "SELECT * FROM projects WHERE " + " AND ".join(where) + " ORDER BY updated_at DESC, id DESC LIMIT %s"
    params.append(limit)

    rows = fetchall(conn, sql, tuple(params))
    items = [_row_to_project(r) for r in rows]

    next_cursor = None
    if len(rows) == limit:
        last = rows[-1]
        next_cursor = encode_cursor({"updated_at": last["updated_at"].isoformat(), "id": str(last["id"])})

    return items, next_cursor


def create_project(conn, ctx: WorkspaceContext, user: UserPrincipal, payload: ProjectCreate) -> Dict[str, Any]:
    row = execute_returning_one(
        conn,
        """
        INSERT INTO projects(workspace_id, name, description, status, visibility, start_date, end_date, created_by, updated_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
        """,
        (
            ctx.workspace_id,
            payload.name,
            payload.description,
            payload.status.value if payload.status else "idea",
            payload.visibility.value if payload.visibility else "shared",
            payload.start_date,
            payload.end_date,
            user.user_id,
            user.user_id,
        ),
    )
    conn.commit()
    return get_project(conn, ctx, str(row["id"]))


def get_project(conn, ctx: WorkspaceContext, project_id: str) -> Dict[str, Any]:
    row = fetchone(conn, "SELECT * FROM projects WHERE workspace_id=%s AND id=%s AND deleted_at IS NULL", (ctx.workspace_id, project_id))
    if not row:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Project not found"})
    if ctx.membership_role != "owner" and row.get("visibility") == "private":
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Private record"})
    return _row_to_project(row)


def update_project(conn, ctx: WorkspaceContext, user: UserPrincipal, project_id: str, payload: ProjectUpdate) -> Dict[str, Any]:
    _ = get_project(conn, ctx, project_id)

    sets = []
    params: List[Any] = []

    def set_if(value: Any, column: str):
        if value is not None:
            sets.append(f"{column}=%s")
            params.append(value)

    set_if(payload.visibility.value if payload.visibility else None, "visibility")
    set_if(payload.name, "name")
    set_if(payload.description, "description")
    set_if(payload.status.value if payload.status else None, "status")
    set_if(payload.start_date, "start_date")
    set_if(payload.end_date, "end_date")

    sets.append("updated_by=%s")
    params.append(user.user_id)
    sets.append("updated_at=now()")

    sql = "UPDATE projects SET " + ", ".join(sets) + " WHERE workspace_id=%s AND id=%s AND deleted_at IS NULL"
    params.extend([ctx.workspace_id, project_id])

    execute(conn, sql, tuple(params))
    conn.commit()
    return get_project(conn, ctx, project_id)


def delete_project(conn, ctx: WorkspaceContext, user: UserPrincipal, project_id: str) -> None:
    _ = get_project(conn, ctx, project_id)
    execute(conn, "UPDATE projects SET deleted_at=now(), updated_at=now(), updated_by=%s WHERE workspace_id=%s AND id=%s AND deleted_at IS NULL", (user.user_id, ctx.workspace_id, project_id))
    conn.commit()
