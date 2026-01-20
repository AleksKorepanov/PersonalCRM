from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends

from app.core.deps import get_db, get_current_user, require_permission
from app.schemas.strategy import StrategyUpsert, WheelSegmentUpsert
from app.services import strategy as strategy_svc

router = APIRouter()


@router.get("/strategy")
def get_strategy(conn=Depends(get_db), ctx=Depends(require_permission("strategy.manage"))):
    return strategy_svc.get_strategy(conn, ctx)


@router.patch("/strategy")
def patch_strategy(payload: StrategyUpsert, conn=Depends(get_db), user=Depends(get_current_user), ctx=Depends(require_permission("strategy.manage"))):
    return strategy_svc.upsert_strategy(conn, ctx, user, payload)


@router.get("/strategy/wheel")
def get_wheel(conn=Depends(get_db), ctx=Depends(require_permission("strategy.manage"))):
    return strategy_svc.get_wheel(conn, ctx)


@router.put("/strategy/wheel")
def put_wheel(payload: List[WheelSegmentUpsert], conn=Depends(get_db), user=Depends(get_current_user), ctx=Depends(require_permission("strategy.manage"))):
    return strategy_svc.replace_wheel(conn, ctx, user, payload)
