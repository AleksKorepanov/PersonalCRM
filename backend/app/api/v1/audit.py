from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_db, require_permission, require_role
from app.schemas.common import Paginated
from app.schemas.audit import AuditEvent
from app.services.db import fetchall
from app.utils.pagination import decode_cursor, encode_cursor

router = APIRouter()


@router.get("/audit", response_model=Paginated[AuditEvent])
def list_audit(
    workspace_id: str = Query(..., alias="workspace_id"),
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    actor_user_id: Optional[str] = Query(None),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    conn=Depends(get_db),
    ctx=Depends(require_permission("audit.read")),
    _access=Depends(require_role("owner")),
):
    params = [ctx.workspace_id]
    where = ["workspace_id = %s"]
    if entity_type:
        where.append("entity_type = %s")
        params.append(entity_type)
    if entity_id:
        where.append("entity_id = %s")
        params.append(entity_id)
    if actor_user_id:
        where.append("actor_user_id = %s")
        params.append(actor_user_id)
    if since:
        where.append("created_at >= %s")
        params.append(since)
    if until:
        where.append("created_at <= %s")
        params.append(until)
    if cursor:
        try:
            c = decode_cursor(cursor)
            created_at = c.get("created_at")
            cursor_id = c.get("id")
            if not created_at or not cursor_id:
                raise ValueError("cursor is missing fields")
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail={"code": "VALIDATION_ERROR", "message": "Неверный курсор пагинации"},
            ) from exc
        where.append("(created_at, id) < (%s, %s)")
        params.extend([created_at, cursor_id])

    sql = (
        "SELECT id, actor_user_id, action_key, entity_type, entity_id, before, after, created_at "
        "FROM audit_log WHERE "
        + " AND ".join(where)
        + " ORDER BY created_at DESC, id DESC LIMIT %s"
    )
    params.append(limit)
    rows = fetchall(conn, sql, tuple(params))
    data = [
        {
            "id": str(r["id"]),
            "workspace_id": ctx.workspace_id,
            "actor_user_id": str(r["actor_user_id"]) if r.get("actor_user_id") else None,
            "action_key": r.get("action_key"),
            "entity_type": r.get("entity_type"),
            "entity_id": str(r["entity_id"]) if r.get("entity_id") else None,
            "before": r.get("before"),
            "after": r.get("after"),
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]
    next_cursor = None
    if len(rows) == limit:
        last = rows[-1]
        next_cursor = encode_cursor(
            {"created_at": last["created_at"].isoformat(), "id": str(last["id"])}
        )
    return {"data": data, "next_cursor": next_cursor}
