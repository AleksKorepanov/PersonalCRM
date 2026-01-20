from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_db, get_current_user, require_permission

router = APIRouter(prefix="/rbac")


@router.get("/permissions")
def list_permissions(conn=Depends(get_db), ctx=Depends(require_permission("rbac.manage"))):
    rows = conn.execute("SELECT key, description FROM permissions ORDER BY key").fetchall()
    return [{"key": r[0], "description": r[1]} for r in rows]


@router.get("/roles")
def list_roles(conn=Depends(get_db), ctx=Depends(require_permission("rbac.manage"))):
    rows = conn.execute(
        "SELECT id, workspace_id, name, description, is_system, created_at, updated_at FROM workspace_roles WHERE workspace_id=%s AND deleted_at IS NULL ORDER BY name",
        (ctx.workspace_id,),
    ).fetchall()
    return [
        {
            "id": str(r[0]),
            "workspace_id": str(r[1]),
            "name": r[2],
            "description": r[3],
            "is_system": bool(r[4]),
            "created_at": r[5].isoformat(),
            "updated_at": r[6].isoformat(),
        }
        for r in rows
    ]
