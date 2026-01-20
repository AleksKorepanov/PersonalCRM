from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_workspace_context, get_current_user, get_db, WorkspaceContext
from app.core.security import UserPrincipal
from app.schemas.projects import ProjectCreate, ProjectUpdate
from app.services import projects as svc

router = APIRouter()


@router.get("/projects")
def list_projects(
    q: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: Optional[str] = Query(default=None),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    conn=Depends(get_db),
):
    items, next_cursor = svc.list_projects(conn, ctx, q=q, status=status, limit=limit, cursor=cursor)
    return {"items": items, "next_cursor": next_cursor}


@router.post("/projects", status_code=201)
def create_project(
    payload: ProjectCreate,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
):
    return svc.create_project(conn, ctx, user, payload)


@router.get("/projects/{project_id}")
def get_project(project_id: str, ctx: WorkspaceContext = Depends(get_workspace_context), conn=Depends(get_db)):
    return svc.get_project(conn, ctx, project_id)


@router.patch("/projects/{project_id}")
def update_project(
    project_id: str,
    payload: ProjectUpdate,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
):
    return svc.update_project(conn, ctx, user, project_id, payload)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
):
    svc.delete_project(conn, ctx, user, project_id)
    return None
