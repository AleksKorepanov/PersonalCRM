from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_db, get_current_user, get_workspace_context, require_permission

router = APIRouter()


@router.get("/organizations")
def list_organizations(
    q: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user=Depends(get_current_user),
    conn=Depends(get_db),
    ctx=Depends(require_permission("contacts.read")),
):
    params = [ctx.workspace_id]
    where = ["workspace_id = %s", "deleted_at IS NULL"]
    if q:
        where.append("name ILIKE %s")
        params.append(f"%{q}%")
    sql = "SELECT id, workspace_id, name, website, industry, city, notes_shared, notes_private, created_at, updated_at FROM organizations WHERE " + " AND ".join(where) + " ORDER BY name ASC LIMIT %s"
    params.append(limit)
    rows = conn.execute(sql, tuple(params)).fetchall()

    out = []
    for r in rows:
        notes_private = r[7] if ctx.membership_role == "owner" else None
        out.append(
            {
                "id": str(r[0]),
                "workspace_id": str(r[1]),
                "name": r[2],
                "website": r[3],
                "industry": r[4],
                "city": r[5],
                "notes_shared": r[6],
                "notes_private": notes_private,
                "created_at": r[8].isoformat(),
                "updated_at": r[9].isoformat(),
            }
        )
    return out


@router.post("/organizations", status_code=201)
def create_organization(payload: dict, user=Depends(get_current_user), conn=Depends(get_db), ctx=Depends(require_permission("contacts.write"))):
    name = (payload or {}).get("name")
    if not name:
        raise HTTPException(status_code=422, detail={"code": "VALIDATION_ERROR", "message": "name is required"})

    row = conn.execute(
        """
        INSERT INTO organizations(workspace_id, name, website, industry, city, notes_shared, notes_private, created_by, updated_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id, created_at, updated_at
        """,
        (
            ctx.workspace_id,
            name,
            (payload or {}).get("website"),
            (payload or {}).get("industry"),
            (payload or {}).get("city"),
            (payload or {}).get("notes_shared"),
            (payload or {}).get("notes_private"),
            user.user_id,
            user.user_id,
        ),
    ).fetchone()
    conn.commit()
    return {"id": str(row[0]), "workspace_id": ctx.workspace_id, "name": name, "created_at": row[1].isoformat(), "updated_at": row[2].isoformat()}
