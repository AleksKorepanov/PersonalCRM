from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user, get_db

router = APIRouter()


@router.get("/workspaces")
def list_workspaces(user=Depends(get_current_user), conn=Depends(get_db)):
    rows = conn.execute(
        """
        SELECT w.id, w.name, w.owner_user_id, w.created_at, w.updated_at
        FROM workspaces w
        JOIN workspace_memberships m ON m.workspace_id = w.id AND m.user_id = %s
        WHERE w.deleted_at IS NULL AND m.deleted_at IS NULL AND m.is_active = true
        ORDER BY w.created_at DESC
        """,
        (user.user_id,),
    ).fetchall()
    return [
        {
            "id": str(r[0]),
            "name": r[1],
            "owner_user_id": str(r[2]),
            "created_at": r[3].isoformat(),
            "updated_at": r[4].isoformat(),
        }
        for r in rows
    ]


@router.post("/workspaces", status_code=201)
def create_workspace(payload: dict, user=Depends(get_current_user), conn=Depends(get_db)):
    name = (payload or {}).get("name")
    if not name:
        raise HTTPException(status_code=422, detail={"code": "VALIDATION_ERROR", "message": "name is required"})

    row = conn.execute(
        "INSERT INTO workspaces(name, owner_user_id) VALUES (%s,%s) RETURNING id, created_at, updated_at",
        (name, user.user_id),
    ).fetchone()

    conn.execute(
        "INSERT INTO workspace_memberships(workspace_id, user_id, role, is_active, accepted_at) VALUES (%s,%s,'owner',true,now()) ON CONFLICT (workspace_id, user_id) DO UPDATE SET role='owner', is_active=true, deleted_at=NULL",
        (row[0], user.user_id),
    )
    conn.commit()
    return {
        "id": str(row[0]),
        "name": name,
        "owner_user_id": user.user_id,
        "created_at": row[1].isoformat(),
        "updated_at": row[2].isoformat(),
    }


@router.get("/workspaces/{workspace_id}/members")
def list_members(workspace_id: str, user=Depends(get_current_user), conn=Depends(get_db)):
    rows = conn.execute(
        """
        SELECT m.user_id, u.email, u.display_name, m.role, m.is_active, m.created_at
        FROM workspace_memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = %s AND m.deleted_at IS NULL
        ORDER BY m.created_at ASC
        """,
        (workspace_id,),
    ).fetchall()
    return [
        {
            "user_id": str(r[0]),
            "email": str(r[1]),
            "display_name": r[2],
            "role": r[3],
            "is_active": bool(r[4]),
            "created_at": r[5].isoformat(),
        }
        for r in rows
    ]


@router.put("/workspaces/{workspace_id}/members/{user_id}")
def upsert_member(workspace_id: str, user_id: str, payload: dict, user=Depends(get_current_user), conn=Depends(get_db)):
    role = (payload or {}).get("role")
    is_active = (payload or {}).get("is_active", True)
    if role not in {"owner", "assistant", "collaborator"}:
        raise HTTPException(status_code=422, detail={"code": "VALIDATION_ERROR", "message": "Invalid role"})

    # NOTE: simple implementation; you will likely restrict to owners later.
    conn.execute(
        """
        INSERT INTO workspace_memberships(workspace_id, user_id, role, is_active, accepted_at)
        VALUES (%s,%s,%s,%s,now())
        ON CONFLICT (workspace_id, user_id)
        DO UPDATE SET role=EXCLUDED.role, is_active=EXCLUDED.is_active, deleted_at=NULL, updated_at=now()
        """,
        (workspace_id, user_id, role, bool(is_active)),
    )
    conn.commit()
    return {"workspace_id": workspace_id, "user_id": user_id, "role": role, "is_active": bool(is_active)}
