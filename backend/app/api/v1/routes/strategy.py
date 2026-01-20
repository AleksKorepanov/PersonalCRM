from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends

from app.core.deps import get_workspace_context, get_current_user, get_db, WorkspaceContext
from app.core.security import UserPrincipal
from app.schemas.strategy import StrategyUpsert, WheelSegmentUpsert
from app.services import strategy as svc

router = APIRouter()


@router.get("/strategy")
def get_strategy(ctx: WorkspaceContext = Depends(get_workspace_context), conn=Depends(get_db)):
    return svc.get_strategy(conn, ctx)


@router.put("/strategy")
def put_strategy(
    payload: StrategyUpsert,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
):
    return svc.upsert_strategy(conn, ctx, user, payload)


@router.get("/strategy/wheel")
def get_wheel(ctx: WorkspaceContext = Depends(get_workspace_context), conn=Depends(get_db)):
    return svc.get_wheel(conn, ctx)


@router.put("/strategy/wheel")
def put_wheel(
    segments: List[WheelSegmentUpsert],
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
):
    return svc.replace_wheel(conn, ctx, user, segments)
