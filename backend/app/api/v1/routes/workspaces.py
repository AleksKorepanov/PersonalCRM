from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user, get_db
from app.core.security import UserPrincipal
from app.services.db import fetchall, fetchone, execute_returning_one, execute

router = APIRouter()


@router.get("/workspaces")
def list_workspaces(user: UserPrincipal = Depends(get_current_user), conn=Depends(get_db)) -> List[dict]:
    rows = fetchall(
        conn,
        """
        SELECT w.*
        FROM workspaces w
        JOIN workspace_memberships m ON m.workspace_id = w.id
        WHERE m.user_id = %s AND m.deleted_at IS NULL AND w.deleted_at IS NULL
        ORDER BY w.created_at DESC
        """,
        (user.user_id,),
    )
    return [{"id": str(r["id"]), "name": r["name"], "owner_user_id": str(r["owner_user_id"]), "created_at": r["created_at"].isoformat()} for r in rows]


@router.post("/workspaces", status_code=201)
def create_workspace(payload: dict, user: UserPrincipal = Depends(get_current_user), conn=Depends(get_db)) -> dict:
    name = (payload or {}).get("name")
    if not name:
        raise HTTPException(status_code=422, detail={"code": "VALIDATION_ERROR", "message": "name is required"})

    row = execute_returning_one(
        conn,
        "INSERT INTO workspaces(name, owner_user_id) VALUES (%s,%s) RETURNING id",
        (name, user.user_id),
    )
    workspace_id = str(row["id"])
    execute(
        conn,
        "INSERT INTO workspace_memberships(workspace_id, user_id, role, is_active, accepted_at) VALUES (%s,%s,'owner',true,now()) ON CONFLICT DO NOTHING",
        (workspace_id, user.user_id),
    )
    conn.commit()
    return {"id": workspace_id, "name": name, "owner_user_id": user.user_id}


@router.get("/workspaces/{workspace_id}/members")
def list_members(workspace_id: str, user: UserPrincipal = Depends(get_current_user), conn=Depends(get_db)) -> List[dict]:
    # Owner/assistant may read; if not a member, 403
    m = fetchone(conn, "SELECT role FROM workspace_memberships WHERE workspace_id=%s AND user_id=%s AND deleted_at IS NULL", (workspace_id, user.user_id))
    if not m:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "No workspace access"})

    rows = fetchall(
        conn,
        """
        SELECT u.id as user_id, u.email, u.display_name, m.role, m.is_active, m.accepted_at
        FROM workspace_memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id=%s AND m.deleted_at IS NULL
        ORDER BY m.created_at ASC
        """,
        (workspace_id,),
    )
    return [
        {
            "user_id": str(r["user_id"]),
            "email": str(r["email"]),
            "display_name": r.get("display_name"),
            "role": r.get("role"),
            "is_active": bool(r.get("is_active")),
            "accepted_at": r.get("accepted_at").isoformat() if r.get("accepted_at") else None,
        }
        for r in rows
    ]


@router.put("/workspaces/{workspace_id}/members/{user_id}")
def upsert_member(workspace_id: str, user_id: str, payload: dict, actor: UserPrincipal = Depends(get_current_user), conn=Depends(get_db)) -> dict:
    # Only owner can manage members
    role_row = fetchone(conn, "SELECT role FROM workspace_memberships WHERE workspace_id=%s AND user_id=%s AND deleted_at IS NULL", (workspace_id, actor.user_id))
    if not role_row or role_row.get("role") != "owner":
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Owner only"})

    role = (payload or {}).get("role")
    if role not in {"owner", "assistant", "collaborator"}:
        raise HTTPException(status_code=422, detail={"code": "VALIDATION_ERROR", "message": "role must be owner|assistant|collaborator"})

    execute(
        conn,
        """
        INSERT INTO workspace_memberships(workspace_id, user_id, role, is_active, accepted_at)
        VALUES (%s,%s,%s,true,now())
        ON CONFLICT (workspace_id, user_id)
        DO UPDATE SET role=EXCLUDED.role, is_active=true, deleted_at=NULL, updated_at=now()
        """,
        (workspace_id, user_id, role),
    )
    conn.commit()
    return {"workspace_id": workspace_id, "user_id": user_id, "role": role, "is_active": True}
