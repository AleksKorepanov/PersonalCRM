from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_db, get_current_user, require_permission
from app.schemas.common import Paginated
from app.schemas.enums import IntroductionStatus
from app.schemas.introductions import Introduction, IntroductionCreate, IntroductionUpdate
from app.services import introductions as introductions_svc

router = APIRouter()


@router.get("/introductions", response_model=Paginated[Introduction])
def list_introductions(
    workspace_id: str = Query(..., alias="workspace_id"),
    status: Optional[IntroductionStatus] = Query(None),
    contact_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = Query(None),
    conn=Depends(get_db),
    ctx=Depends(require_permission("introductions.manage")),
):
    items, next_cursor = introductions_svc.list_introductions(
        conn,
        ctx,
        limit=limit,
        cursor=cursor,
        status=status.value if status else None,
        contact_id=contact_id,
    )
    return {"data": items, "next_cursor": next_cursor}


@router.post("/introductions", status_code=201, response_model=Introduction)
def create_introduction(
    payload: IntroductionCreate,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("introductions.manage")),
):
    return introductions_svc.create_introduction(conn, ctx, user, payload)


@router.get("/introductions/{introduction_id}", response_model=Introduction)
def get_introduction(
    introduction_id: str,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    ctx=Depends(require_permission("introductions.manage")),
):
    return introductions_svc.get_introduction(conn, ctx, introduction_id)


@router.patch("/introductions/{introduction_id}", response_model=Introduction)
def patch_introduction(
    introduction_id: str,
    payload: IntroductionUpdate,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("introductions.manage")),
):
    return introductions_svc.update_introduction(conn, ctx, user, introduction_id, payload)


@router.delete("/introductions/{introduction_id}", status_code=204)
def delete_introduction(
    introduction_id: str,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("introductions.manage")),
):
    introductions_svc.delete_introduction(conn, ctx, user, introduction_id)
    return None
