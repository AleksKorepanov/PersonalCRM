from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from app.core.deps import WorkspaceContext
from app.core.security import UserPrincipal
from app.schemas.projects import ProjectCreate, ProjectUpdate
from app.services.audit import log_audit
from app.services.mapping import PROJECT_STATUS_FROM_DB, PROJECT_STATUS_TO_DB
from app.services.db import execute, execute_returning_one, fetchall, fetchone
from app.utils.pagination import decode_cursor, encode_cursor


LIMITED_FIELDS = {"description"}
REDACTION_DEFAULTS = {"description": None}


def _redact_fields(data: Dict[str, Any], fields: set[str]) -> Dict[str, Any]:
    for field in fields:
        data[field] = REDACTION_DEFAULTS.get(field)
    return data


def _redact_project_dict(data: Dict[str, Any], ctx: WorkspaceContext, has_limited: bool) -> Dict[str, Any]:
    if ctx.membership_role != "owner" and has_limited:
        _redact_fields(data, LIMITED_FIELDS)
    return data


def _row_to_project(row: Dict[str, Any], participant_ids: List[str], ctx: WorkspaceContext, has_limited: bool) -> Dict[str, Any]:
    data = {
        "id": str(row["id"]),
        "workspace_id": str(row["workspace_id"]),
        "visibility": row.get("visibility") or "shared",
        "name": row.get("name"),
        "description": row.get("description"),
        "status": PROJECT_STATUS_FROM_DB.get(row.get("status"), "idea"),
        "start_date": row.get("start_date").isoformat() if row.get("start_date") else None,
        "end_date": row.get("end_date").isoformat() if row.get("end_date") else None,
        "participant_contact_ids": participant_ids,
        "created_at": row.get("created_at").isoformat(),
        "updated_at": row.get("updated_at").isoformat(),
    }
    return _redact_project_dict(data, ctx, has_limited)


def _fetch_participant_ids(conn, project_id: str) -> List[str]:
    rows = fetchall(
        conn,
        "SELECT contact_id FROM project_participants WHERE project_id = %s ORDER BY contact_id",
        (project_id,),
    )
    return [str(r["contact_id"]) for r in rows]


def _fetch_participant_visibilities(conn, contact_ids: List[str]) -> List[str]:
    if not contact_ids:
        return []
    rows = fetchall(
        conn,
        "SELECT visibility FROM contacts WHERE id = ANY(%s) AND deleted_at IS NULL",
        (contact_ids,),
    )
    return [r["visibility"] for r in rows]


def list_projects(conn, ctx: WorkspaceContext, q: Optional[str] = None, status: Optional[str] = None, limit: int = 50, cursor: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    params: List[Any] = [ctx.workspace_id]
    where = ["workspace_id=%s", "deleted_at IS NULL"]

    if ctx.membership_role != "owner":
        where.append("visibility <> 'private'")

    if status:
        where.append("status=%s")
        params.append(PROJECT_STATUS_TO_DB.get(status, status))

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
    items = []
    for r in rows:
        participant_ids = _fetch_participant_ids(conn, str(r["id"]))
        visibilities = _fetch_participant_visibilities(conn, participant_ids)
        if ctx.membership_role != "owner" and "private" in visibilities:
            continue
        has_limited = "limited" in visibilities
        items.append(_row_to_project(r, participant_ids, ctx, has_limited))

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
            PROJECT_STATUS_TO_DB.get(payload.status.value if payload.status else "idea", "idea"),
            payload.visibility.value if payload.visibility else "shared",
            payload.start_date,
            payload.end_date,
            user.user_id,
            user.user_id,
        ),
    )
    project_id = str(row["id"])
    _set_participants(conn, project_id, payload.participant_contact_ids or [])
    project = get_project(conn, ctx, project_id)
    log_audit(conn, ctx, user, "project.create", "project", project_id, before=None, after=project)
    conn.commit()
    return project


def get_project(conn, ctx: WorkspaceContext, project_id: str) -> Dict[str, Any]:
    row = fetchone(conn, "SELECT * FROM projects WHERE workspace_id=%s AND id=%s AND deleted_at IS NULL", (ctx.workspace_id, project_id))
    if not row:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Проект не найден"})
    participant_ids = _fetch_participant_ids(conn, project_id)
    visibilities = _fetch_participant_visibilities(conn, participant_ids)
    if ctx.membership_role != "owner":
        if row.get("visibility") == "private" or "private" in visibilities:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Проект не найден"})
    has_limited = "limited" in visibilities
    return _row_to_project(row, participant_ids, ctx, has_limited)


def _set_participants(conn, project_id: str, contact_ids: List[str]) -> None:
    execute(conn, "DELETE FROM project_participants WHERE project_id = %s", (project_id,))
    cleaned = [cid for cid in (contact_ids or []) if cid]
    if not cleaned:
        return
    for contact_id in sorted(set(cleaned)):
        execute(
            conn,
            "INSERT INTO project_participants(project_id, contact_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (project_id, contact_id),
        )


def update_project(conn, ctx: WorkspaceContext, user: UserPrincipal, project_id: str, payload: ProjectUpdate) -> Dict[str, Any]:
    before = get_project(conn, ctx, project_id)

    sets = []
    params: List[Any] = []

    def set_if(value: Any, column: str):
        if value is not None:
            sets.append(f"{column}=%s")
            params.append(value)

    set_if(payload.visibility.value if payload.visibility else None, "visibility")
    set_if(payload.name, "name")
    set_if(payload.description, "description")
    if payload.status is not None:
        set_if(PROJECT_STATUS_TO_DB.get(payload.status.value, payload.status.value), "status")
    set_if(payload.start_date, "start_date")
    set_if(payload.end_date, "end_date")

    sets.append("updated_by=%s")
    params.append(user.user_id)
    sets.append("updated_at=now()")

    sql = "UPDATE projects SET " + ", ".join(sets) + " WHERE workspace_id=%s AND id=%s AND deleted_at IS NULL"
    params.extend([ctx.workspace_id, project_id])

    execute(conn, sql, tuple(params))
    if payload.participant_contact_ids is not None:
        _set_participants(conn, project_id, payload.participant_contact_ids)
    after = get_project(conn, ctx, project_id)
    log_audit(conn, ctx, user, "project.update", "project", project_id, before=before, after=after)
    conn.commit()
    return after


def delete_project(conn, ctx: WorkspaceContext, user: UserPrincipal, project_id: str) -> None:
    before = get_project(conn, ctx, project_id)
    execute(conn, "UPDATE projects SET deleted_at=now(), updated_at=now(), updated_by=%s WHERE workspace_id=%s AND id=%s AND deleted_at IS NULL", (user.user_id, ctx.workspace_id, project_id))
    log_audit(conn, ctx, user, "project.delete", "project", project_id, before=before, after={"deleted": True})
    conn.commit()
