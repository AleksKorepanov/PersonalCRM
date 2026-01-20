from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_workspace_context, get_db, WorkspaceContext
from app.services.db import fetchall

router = APIRouter()


@router.get("/audit")
def list_audit(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: Optional[str] = Query(default=None),
    conn=Depends(get_db),
):
    params = [ctx.workspace_id]
    where = ["workspace_id=%s"]

    if cursor:
        # cursor is ISO string for created_at
        where.append("created_at < %s")
        params.append(cursor)

    sql = "SELECT * FROM audit_log WHERE " + " AND ".join(where) + " ORDER BY created_at DESC LIMIT %s"
    params.append(limit)

    rows = fetchall(conn, sql, tuple(params))
    items = []
    for r in rows:
        items.append(
            {
                "id": str(r["id"]),
                "workspace_id": str(r["workspace_id"]),
                "actor_user_id": str(r["actor_user_id"]) if r.get("actor_user_id") else None,
                "action_key": r.get("action_key"),
                "entity_type": r.get("entity_type"),
                "entity_id": str(r["entity_id"]) if r.get("entity_id") else None,
                "before": r.get("before"),
                "after": r.get("after"),
                "ip": str(r.get("ip")) if r.get("ip") else None,
                "user_agent": r.get("user_agent"),
                "created_at": r.get("created_at").isoformat(),
            }
        )

    next_cursor = None
    if len(rows) == limit:
        next_cursor = rows[-1]["created_at"].isoformat()

    return {"items": items, "next_cursor": next_cursor}
