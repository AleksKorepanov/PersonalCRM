from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_db, get_current_user, require_permission
from app.schemas.introductions import IntroductionCreate, IntroductionUpdate
from app.services import introductions as introductions_svc

router = APIRouter()


@router.get("/introductions")
def list_introductions(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = Query(None),
    conn=Depends(get_db),
    ctx=Depends(require_permission("introductions.manage")),
):
    items, next_cursor = introductions_svc.list_introductions(conn, ctx, limit=limit, cursor=cursor, status=status)
    return {"items": items, "next_cursor": next_cursor}


@router.post("/introductions", status_code=201)
def create_introduction(payload: IntroductionCreate, conn=Depends(get_db), user=Depends(get_current_user), ctx=Depends(require_permission("introductions.manage"))):
    return introductions_svc.create_introduction(conn, ctx, user, payload)


@router.get("/introductions/{introduction_id}")
def get_introduction(introduction_id: str, conn=Depends(get_db), ctx=Depends(require_permission("introductions.manage"))):
    return introductions_svc.get_introduction(conn, ctx, introduction_id)


@router.patch("/introductions/{introduction_id}")
def patch_introduction(introduction_id: str, payload: IntroductionUpdate, conn=Depends(get_db), user=Depends(get_current_user), ctx=Depends(require_permission("introductions.manage"))):
    return introductions_svc.update_introduction(conn, ctx, user, introduction_id, payload)


@router.delete("/introductions/{introduction_id}", status_code=204)
def delete_introduction(introduction_id: str, conn=Depends(get_db), user=Depends(get_current_user), ctx=Depends(require_permission("introductions.manage"))):
    introductions_svc.delete_introduction(conn, ctx, user, introduction_id)
    return None
