from __future__ import annotations

from typing import Optional, List

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_db, get_current_user, require_permission
from app.schemas.interactions import InteractionCreate, InteractionUpdate
from app.services import interactions as interactions_svc

router = APIRouter()


@router.get("/contacts/{contact_id}/interactions")
def list_contact_interactions(
    contact_id: str,
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = Query(None),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    type: Optional[List[str]] = Query(None),
    conn=Depends(get_db),
    ctx=Depends(require_permission("interactions.read")),
):
    items, next_cursor = interactions_svc.list_interactions(conn, ctx, contact_id=contact_id, limit=limit, cursor=cursor, since=since, until=until, types=type)
    return {"items": items, "next_cursor": next_cursor}


@router.post("/contacts/{contact_id}/interactions", status_code=201)
def create_contact_interaction(
    contact_id: str,
    payload: InteractionCreate,
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("interactions.write")),
):
    return interactions_svc.create_interaction(conn, ctx, user, contact_id, payload)


@router.get("/interactions/{interaction_id}")
def get_interaction(interaction_id: str, conn=Depends(get_db), ctx=Depends(require_permission("interactions.read"))):
    return interactions_svc.get_interaction(conn, ctx, interaction_id)


@router.patch("/interactions/{interaction_id}")
def patch_interaction(interaction_id: str, payload: InteractionUpdate, conn=Depends(get_db), user=Depends(get_current_user), ctx=Depends(require_permission("interactions.write"))):
    return interactions_svc.update_interaction(conn, ctx, user, interaction_id, payload)


@router.delete("/interactions/{interaction_id}", status_code=204)
def delete_interaction(interaction_id: str, conn=Depends(get_db), user=Depends(get_current_user), ctx=Depends(require_permission("interactions.write"))):
    interactions_svc.delete_interaction(conn, ctx, user, interaction_id)
    return None
