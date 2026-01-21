from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_db, require_permission
from app.schemas.common import Paginated
from app.schemas.audit import AuditEvent

router = APIRouter()


@router.get("/audit", response_model=Paginated[AuditEvent])
def list_audit(
    workspace_id: str = Query(..., alias="workspace_id"),
    limit: int = Query(50, ge=1, le=200),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    conn=Depends(get_db),
    ctx=Depends(require_permission("audit.read")),
):
    if ctx.membership_role != "owner":
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Доступ к аудиту только для владельца"})
    params = [ctx.workspace_id]
    where = ["workspace_id = %s"]
    if since:
        where.append("created_at >= %s")
        params.append(since)
    if until:
        where.append("created_at <= %s")
        params.append(until)
    if entity_type:
        where.append("entity_type = %s")
        params.append(entity_type)
    if entity_id:
        where.append("entity_id = %s")
        params.append(entity_id)
    sql = "SELECT id, actor_user_id, action_key, entity_type, entity_id, before, after, created_at FROM audit_log WHERE " + " AND ".join(where) + " ORDER BY created_at DESC LIMIT %s"
    params.append(limit)
    rows = conn.execute(sql, tuple(params)).fetchall()
    data = [
        {
            "id": str(r[0]),
            "workspace_id": ctx.workspace_id,
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
    return {"data": data, "next_cursor": None}
