from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_db, get_current_user, require_permission
from app.schemas.common import Paginated
from app.schemas.contacts import Contact, ContactCreate, ContactUpdate
from app.schemas.enums import TieStrength, Visibility
from app.services import contacts as contacts_svc

router = APIRouter()


@router.get("/contacts", response_model=Paginated[Contact])
def list_contacts(
    workspace_id: str = Query(..., alias="workspace_id"),
    q: Optional[str] = Query(None),
    tags: Optional[List[str]] = Query(None),
    tier: Optional[TieStrength] = Query(None),
    visibility: Optional[Visibility] = Query(None),
    updated_since: Optional[str] = Query(None),
    sort: Optional[str] = Query("updated_desc"),
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = Query(None),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("contacts.read")),
):
    data, next_cursor = contacts_svc.list_contacts(
        conn,
        ctx,
        limit=limit,
        cursor=cursor,
        q=q,
        tags=tags,
        tier=tier.value if tier else None,
        visibility=visibility.value if visibility else None,
        updated_since=updated_since,
        sort=sort or "updated_desc",
    )
    return {"data": data, "next_cursor": next_cursor}


@router.post("/contacts", status_code=201, response_model=Contact)
def create_contact(
    payload: ContactCreate,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("contacts.write")),
):
    return contacts_svc.create_contact(conn, ctx, user, payload)


@router.get("/contacts/{contact_id}", response_model=Contact)
def get_contact(
    contact_id: str,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    ctx=Depends(require_permission("contacts.read")),
):
    return contacts_svc.get_contact(conn, ctx, contact_id)


@router.patch("/contacts/{contact_id}", response_model=Contact)
def patch_contact(
    contact_id: str,
    payload: ContactUpdate,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("contacts.write")),
):
    return contacts_svc.update_contact(conn, ctx, user, contact_id, payload)


@router.delete("/contacts/{contact_id}", status_code=204)
def delete_contact(
    contact_id: str,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("contacts.write")),
):
    contacts_svc.delete_contact(conn, ctx, user, contact_id)
    return None
