from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_workspace_context, get_current_user, get_db, WorkspaceContext
from app.core.security import UserPrincipal
from app.services.db import fetchall, execute, execute_returning_one, fetchone

router = APIRouter()


@router.get("/rbac/permissions")
def list_permissions(conn=Depends(get_db)) -> List[dict]:
    rows = fetchall(conn, "SELECT key, description FROM permissions ORDER BY key ASC", ())
    return [{"key": r["key"], "description": r.get("description")} for r in rows]


@router.get("/rbac/roles")
def list_roles(ctx: WorkspaceContext = Depends(get_workspace_context), conn=Depends(get_db)) -> List[dict]:
    rows = fetchall(conn, "SELECT * FROM workspace_roles WHERE workspace_id=%s AND deleted_at IS NULL ORDER BY name ASC", (ctx.workspace_id,))
    return [{"id": str(r["id"]), "workspace_id": str(r["workspace_id"]), "name": r.get("name"), "description": r.get("description")} for r in rows]


@router.post("/rbac/roles", status_code=201)
def create_role(payload: dict, ctx: WorkspaceContext = Depends(get_workspace_context), user: UserPrincipal = Depends(get_current_user), conn=Depends(get_db)) -> dict:
    if ctx.membership_role != "owner":
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Owner only"})
    name = (payload or {}).get("name")
    if not name:
        raise HTTPException(status_code=422, detail={"code": "VALIDATION_ERROR", "message": "name is required"})
    row = execute_returning_one(conn, "INSERT INTO workspace_roles(workspace_id, name, description) VALUES (%s,%s,%s) RETURNING id", (ctx.workspace_id, name, (payload or {}).get("description")))
    role_id = str(row["id"])
    # assign permissions
    perms = (payload or {}).get("permission_keys") or []
    for p in perms:
        execute(conn, "INSERT INTO workspace_role_permissions(role_id, permission_key) VALUES (%s,%s) ON CONFLICT DO NOTHING", (role_id, p))
    conn.commit()
    return {"id": role_id, "workspace_id": ctx.workspace_id, "name": name, "description": (payload or {}).get("description"), "permission_keys": perms}


@router.get("/rbac/roles/{role_id}")
def get_role(role_id: str, ctx: WorkspaceContext = Depends(get_workspace_context), conn=Depends(get_db)) -> dict:
    r = fetchone(conn, "SELECT * FROM workspace_roles WHERE workspace_id=%s AND id=%s AND deleted_at IS NULL", (ctx.workspace_id, role_id))
    if not r:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Role not found"})
    perms = fetchall(conn, "SELECT permission_key FROM workspace_role_permissions WHERE role_id=%s", (role_id,))
    return {"id": str(r["id"]), "workspace_id": str(r["workspace_id"]), "name": r.get("name"), "description": r.get("description"), "permission_keys": [x["permission_key"] for x in perms]}


@router.put("/rbac/roles/{role_id}")
def update_role(role_id: str, payload: dict, ctx: WorkspaceContext = Depends(get_workspace_context), conn=Depends(get_db)) -> dict:
    if ctx.membership_role != "owner":
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Owner only"})

    r = fetchone(conn, "SELECT id FROM workspace_roles WHERE workspace_id=%s AND id=%s AND deleted_at IS NULL", (ctx.workspace_id, role_id))
    if not r:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Role not found"})

    if (payload or {}).get("name") is not None or (payload or {}).get("description") is not None:
        execute(conn, "UPDATE workspace_roles SET name=COALESCE(%s,name), description=COALESCE(%s,description), updated_at=now() WHERE id=%s", ((payload or {}).get("name"), (payload or {}).get("description"), role_id))

    # replace permissions if provided
    if (payload or {}).get("permission_keys") is not None:
        execute(conn, "DELETE FROM workspace_role_permissions WHERE role_id=%s", (role_id,))
        for p in (payload or {}).get("permission_keys"):
            execute(conn, "INSERT INTO workspace_role_permissions(role_id, permission_key) VALUES (%s,%s) ON CONFLICT DO NOTHING", (role_id, p))

    conn.commit()
    return get_role(role_id, ctx, conn)


@router.delete("/rbac/roles/{role_id}", status_code=204)
def delete_role(role_id: str, ctx: WorkspaceContext = Depends(get_workspace_context), conn=Depends(get_db)):
    if ctx.membership_role != "owner":
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Owner only"})
    execute(conn, "UPDATE workspace_roles SET deleted_at=now(), updated_at=now() WHERE workspace_id=%s AND id=%s AND deleted_at IS NULL", (ctx.workspace_id, role_id))
    conn.commit()
    return None
