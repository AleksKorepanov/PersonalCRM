from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_db, get_current_user, require_permission
from app.schemas.common import Paginated
from app.schemas.enums import ProjectStatus
from app.schemas.projects import Project, ProjectCreate, ProjectUpdate
from app.services import projects as projects_svc

router = APIRouter()


@router.get("/projects", response_model=Paginated[Project])
def list_projects(
    workspace_id: str = Query(..., alias="workspace_id"),
    q: Optional[str] = Query(None),
    status: Optional[ProjectStatus] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = Query(None),
    conn=Depends(get_db),
    ctx=Depends(require_permission("projects.manage")),
):
    items, next_cursor = projects_svc.list_projects(
        conn,
        ctx,
        q=q,
        status=status.value if status else None,
        limit=limit,
        cursor=cursor,
    )
    return {"data": items, "next_cursor": next_cursor}


@router.post("/projects", status_code=201, response_model=Project)
def create_project(
    payload: ProjectCreate,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("projects.manage")),
):
    return projects_svc.create_project(conn, ctx, user, payload)


@router.get("/projects/{project_id}", response_model=Project)
def get_project(
    project_id: str,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    ctx=Depends(require_permission("projects.manage")),
):
    return projects_svc.get_project(conn, ctx, project_id)


@router.patch("/projects/{project_id}", response_model=Project)
def patch_project(
    project_id: str,
    payload: ProjectUpdate,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("projects.manage")),
):
    return projects_svc.update_project(conn, ctx, user, project_id, payload)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("projects.manage")),
):
    projects_svc.delete_project(conn, ctx, user, project_id)
    return None
