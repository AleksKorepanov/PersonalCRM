from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_db, get_current_user, require_permission

router = APIRouter()


@router.get("/projects")
def list_projects(
    q: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    conn=Depends(get_db),
    ctx=Depends(require_permission("projects.manage")),
):
    params = [ctx.workspace_id]
    where = ["workspace_id = %s", "deleted_at IS NULL"]
    if status:
        where.append("status = %s")
        params.append(status)
    if q:
        where.append("search_tsv @@ plainto_tsquery('simple', %s)")
        params.append(q)

    sql = "SELECT id, workspace_id, visibility, name, description, status, start_date, end_date, created_at, updated_at FROM projects WHERE " + " AND ".join(where) + " ORDER BY updated_at DESC LIMIT %s"
    params.append(limit)
    rows = conn.execute(sql, tuple(params)).fetchall()

    return [
        {
            "id": str(r[0]),
            "workspace_id": str(r[1]),
            "visibility": r[2],
            "name": r[3],
            "description": r[4],
            "status": r[5],
            "start_date": r[6].isoformat() if r[6] else None,
            "end_date": r[7].isoformat() if r[7] else None,
            "created_at": r[8].isoformat(),
            "updated_at": r[9].isoformat(),
        }
        for r in rows
    ]


@router.post("/projects", status_code=201)
def create_project(payload: dict, conn=Depends(get_db), user=Depends(get_current_user), ctx=Depends(require_permission("projects.manage"))):
    name = (payload or {}).get("name")
    if not name:
        raise HTTPException(status_code=422, detail={"code": "VALIDATION_ERROR", "message": "name is required"})
    row = conn.execute(
        """
        INSERT INTO projects(workspace_id, name, description, status, visibility, start_date, end_date, created_by, updated_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id, created_at, updated_at
        """,
        (
            ctx.workspace_id,
            name,
            (payload or {}).get("description"),
            (payload or {}).get("status", "idea"),
            (payload or {}).get("visibility", "shared"),
            (payload or {}).get("start_date"),
            (payload or {}).get("end_date"),
            user.user_id,
            user.user_id,
        ),
    ).fetchone()
    conn.commit()
    return {"id": str(row[0]), "workspace_id": ctx.workspace_id, "name": name, "created_at": row[1].isoformat(), "updated_at": row[2].isoformat()}
