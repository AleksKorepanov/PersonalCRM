from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_workspace_context, get_current_user, get_db, WorkspaceContext
from app.core.security import UserPrincipal
from app.schemas.introductions import IntroductionCreate, IntroductionUpdate
from app.services import introductions as svc

router = APIRouter()


@router.get("/introductions")
def list_introductions(
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: Optional[str] = Query(default=None),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    conn=Depends(get_db),
):
    items, next_cursor = svc.list_introductions(conn, ctx, limit=limit, cursor=cursor, status=status)
    return {"items": items, "next_cursor": next_cursor}


@router.post("/introductions", status_code=201)
def create_introduction(
    payload: IntroductionCreate,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
):
    return svc.create_introduction(conn, ctx, user, payload)


@router.get("/introductions/{introduction_id}")
def get_introduction(
    introduction_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    conn=Depends(get_db),
):
    return svc.get_introduction(conn, ctx, introduction_id)


@router.patch("/introductions/{introduction_id}")
def update_introduction(
    introduction_id: str,
    payload: IntroductionUpdate,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
):
    return svc.update_introduction(conn, ctx, user, introduction_id, payload)


@router.delete("/introductions/{introduction_id}", status_code=204)
def delete_introduction(
    introduction_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
):
    svc.delete_introduction(conn, ctx, user, introduction_id)
    return None
