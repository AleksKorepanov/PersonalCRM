from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_db, get_current_user, require_permission
from app.schemas.common import Paginated
from app.schemas.enums import InteractionType
from app.schemas.interactions import Interaction, InteractionCreate, InteractionUpdate
from app.services import interactions as interactions_svc

router = APIRouter()


@router.get("/contacts/{contact_id}/interactions", response_model=Paginated[Interaction])
def list_contact_interactions(
    contact_id: str,
    workspace_id: str = Query(..., alias="workspace_id"),
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = Query(None),
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    type: Optional[List[InteractionType]] = Query(None),
    ctx=Depends(require_permission("interactions.read")),
    conn=Depends(get_db),
):
    items, next_cursor = interactions_svc.list_interactions(
        conn,
        ctx,
        contact_id=contact_id,
        limit=limit,
        cursor=cursor,
        from_ts=from_,
        to_ts=to,
        types=[t.value for t in type] if type else None,
    )
    return {"data": items, "next_cursor": next_cursor}


@router.post("/contacts/{contact_id}/interactions", status_code=201, response_model=Interaction)
def create_contact_interaction(
    contact_id: str,
    payload: InteractionCreate,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("interactions.write")),
):
    return interactions_svc.create_interaction(conn, ctx, user, contact_id, payload)


@router.get("/interactions/{interaction_id}", response_model=Interaction)
def get_interaction(
    interaction_id: str,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    ctx=Depends(require_permission("interactions.read")),
):
    return interactions_svc.get_interaction(conn, ctx, interaction_id)


@router.patch("/interactions/{interaction_id}", response_model=Interaction)
def patch_interaction(
    interaction_id: str,
    payload: InteractionUpdate,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("interactions.write")),
):
    return interactions_svc.update_interaction(conn, ctx, user, interaction_id, payload)


@router.delete("/interactions/{interaction_id}", status_code=204)
def delete_interaction(
    interaction_id: str,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("interactions.write")),
):
    interactions_svc.delete_interaction(conn, ctx, user, interaction_id)
    return None
