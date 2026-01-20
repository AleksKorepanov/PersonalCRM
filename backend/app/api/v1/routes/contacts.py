from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_workspace_context, get_current_user, get_db, WorkspaceContext
from app.core.security import UserPrincipal
from app.schemas.contacts import ContactCreate, ContactUpdate
from app.schemas.interactions import InteractionCreate
from app.services import contacts as contacts_svc
from app.services import interactions as interactions_svc

router = APIRouter()


@router.get("/contacts")
def list_contacts(
    q: Optional[str] = Query(default=None),
    visibility: Optional[str] = Query(default=None),
    tie_strength: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    next_touch_before: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: Optional[str] = Query(default=None),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    conn=Depends(get_db),
):
    data, next_cursor = contacts_svc.list_contacts(
        conn,
        ctx,
        q=q,
        visibility=visibility,
        tie_strength=tie_strength,
        tag=tag,
        next_touch_before=next_touch_before,
        limit=limit,
        cursor=cursor,
    )
    return {"items": data, "next_cursor": next_cursor}


@router.post("/contacts", status_code=201)
def create_contact(
    payload: ContactCreate,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
):
    return contacts_svc.create_contact(conn, ctx, user, payload)


@router.get("/contacts/{contact_id}")
def get_contact(
    contact_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    conn=Depends(get_db),
):
    return contacts_svc.get_contact(conn, ctx, contact_id)


@router.patch("/contacts/{contact_id}")
def update_contact(
    contact_id: str,
    payload: ContactUpdate,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
):
    return contacts_svc.update_contact(conn, ctx, user, contact_id, payload)


@router.delete("/contacts/{contact_id}", status_code=204)
def delete_contact(
    contact_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
):
    contacts_svc.delete_contact(conn, ctx, user, contact_id)
    return None


@router.get("/contacts/{contact_id}/interactions")
def list_contact_interactions(
    contact_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    types: Optional[str] = Query(default=None, description="Comma-separated interaction types"),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    conn=Depends(get_db),
):
    types_list = [t.strip() for t in types.split(',')] if types else None
    items, next_cursor = interactions_svc.list_interactions(
        conn,
        ctx,
        contact_id=contact_id,
        limit=limit,
        cursor=cursor,
        since=since,
        until=until,
        types=types_list,
    )
    return {"items": items, "next_cursor": next_cursor}


@router.post("/contacts/{contact_id}/interactions", status_code=201)
def create_contact_interaction(
    contact_id: str,
    payload: InteractionCreate,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
):
    return interactions_svc.create_interaction(conn, ctx, user, contact_id, payload)
