from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_db, require_permission

router = APIRouter()


@router.get("/audit")
def list_audit(
    limit: int = Query(50, ge=1, le=200),
    since: Optional[str] = Query(None),
    conn=Depends(get_db),
    ctx=Depends(require_permission("audit.read")),
):
    params = [ctx.workspace_id]
    where = ["workspace_id = %s"]
    if since:
        where.append("created_at >= %s")
        params.append(since)
    sql = "SELECT id, actor_user_id, action_key, entity_type, entity_id, before, after, created_at FROM audit_log WHERE " + " AND ".join(where) + " ORDER BY created_at DESC LIMIT %s"
    params.append(limit)
    rows = conn.execute(sql, tuple(params)).fetchall()
    return [
        {
            "id": str(r[0]),
            "actor_user_id": str(r[1]) if r[1] else None,
            "action_key": r[2],
            "entity_type": r[3],
            "entity_id": str(r[4]) if r[4] else None,
            "before": r[5],
            "after": r[6],
            "created_at": r[7].isoformat(),
        }
        for r in rows
    ]
