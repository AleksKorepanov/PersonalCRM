from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_db, get_current_user, require_permission
from app.schemas.strategy import Strategy, StrategyUpsert, WheelSegmentUpsert
from app.services import strategy as strategy_svc

router = APIRouter()


@router.get("/strategy", response_model=Strategy)
def get_strategy(
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    ctx=Depends(require_permission("strategy.manage")),
):
    return strategy_svc.get_strategy(conn, ctx)


@router.patch("/strategy", response_model=Strategy)
def patch_strategy(
    payload: StrategyUpsert,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("strategy.manage")),
):
    return strategy_svc.upsert_strategy(conn, ctx, user, payload)


@router.get("/strategy/wheel", response_model=dict)
def get_wheel(
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    ctx=Depends(require_permission("strategy.manage")),
):
    return {"data": strategy_svc.get_wheel(conn, ctx)}


@router.put("/strategy/wheel", response_model=dict)
def put_wheel(
    payload: dict,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("strategy.manage")),
):
    segments = [WheelSegmentUpsert(**item) for item in (payload or {}).get("data", [])]
    return {"data": strategy_svc.replace_wheel(conn, ctx, user, segments)}
