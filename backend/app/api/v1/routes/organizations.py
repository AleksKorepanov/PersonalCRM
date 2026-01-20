from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_workspace_context, get_current_user, get_db, WorkspaceContext
from app.core.security import UserPrincipal
from app.services.db import fetchall, fetchone, execute, execute_returning_one

router = APIRouter()


@router.get("/organizations")
def list_organizations(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    q: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    conn=Depends(get_db),
) -> List[dict]:
    params = [ctx.workspace_id]
    where = ["workspace_id=%s", "deleted_at IS NULL"]
    if q:
        where.append("name ILIKE %s")
        params.append(f"%{q}%")
    sql = "SELECT * FROM organizations WHERE " + " AND ".join(where) + " ORDER BY name ASC LIMIT %s"
    params.append(limit)
    rows = fetchall(conn, sql, tuple(params))
    out = []
    for r in rows:
        out.append(
            {
                "id": str(r["id"]),
                "workspace_id": str(r["workspace_id"]),
                "name": r.get("name"),
                "website": r.get("website"),
                "industry": r.get("industry"),
                "city": r.get("city"),
                "shared_notes": r.get("notes_shared"),
                "private_notes": None if ctx.membership_role != "owner" else r.get("notes_private"),
                "created_at": r.get("created_at").isoformat(),
                "updated_at": r.get("updated_at").isoformat(),
            }
        )
    return out


@router.post("/organizations", status_code=201)
def create_organization(
    payload: dict,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
) -> dict:
    name = (payload or {}).get("name")
    if not name:
        raise HTTPException(status_code=422, detail={"code": "VALIDATION_ERROR", "message": "name is required"})

    row = execute_returning_one(
        conn,
        """
        INSERT INTO organizations(workspace_id, name, website, industry, city, notes_shared, notes_private, created_by, updated_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
        """,
        (
            ctx.workspace_id,
            name,
            (payload or {}).get("website"),
            (payload or {}).get("industry"),
            (payload or {}).get("city"),
            (payload or {}).get("shared_notes"),
            (payload or {}).get("private_notes"),
            user.user_id,
            user.user_id,
        ),
    )
    conn.commit()
    org_id = str(row["id"])
    r = fetchone(conn, "SELECT * FROM organizations WHERE workspace_id=%s AND id=%s AND deleted_at IS NULL", (ctx.workspace_id, org_id))
    return {
        "id": org_id,
        "workspace_id": str(r["workspace_id"]),
        "name": r.get("name"),
        "website": r.get("website"),
        "industry": r.get("industry"),
        "city": r.get("city"),
        "shared_notes": r.get("notes_shared"),
        "private_notes": None if ctx.membership_role != "owner" else r.get("notes_private"),
        "created_at": r.get("created_at").isoformat(),
        "updated_at": r.get("updated_at").isoformat(),
    }
