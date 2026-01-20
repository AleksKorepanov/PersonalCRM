from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_db, get_current_user, require_permission, get_workspace_context
from app.schemas.contacts import ContactCreate, ContactUpdate
from app.services import contacts as contacts_svc

router = APIRouter()


@router.get("/contacts")
def list_contacts(
    q: Optional[str] = Query(None),
    tie_strength: Optional[str] = Query(None),
    visibility: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    next_touch_before: Optional[str] = Query(None),
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
        tie_strength=tie_strength,
        visibility=visibility,
        tag=tag,
        next_touch_before=next_touch_before,
    )
    return {"items": data, "next_cursor": next_cursor}


@router.post("/contacts", status_code=201)
def create_contact(
    payload: ContactCreate,
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("contacts.write")),
):
    return contacts_svc.create_contact(conn, ctx, user, payload)


@router.get("/contacts/{contact_id}")
def get_contact(contact_id: str, conn=Depends(get_db), ctx=Depends(require_permission("contacts.read"))):
    return contacts_svc.get_contact(conn, ctx, contact_id)


@router.patch("/contacts/{contact_id}")
def patch_contact(contact_id: str, payload: ContactUpdate, conn=Depends(get_db), user=Depends(get_current_user), ctx=Depends(require_permission("contacts.write"))):
    return contacts_svc.update_contact(conn, ctx, user, contact_id, payload)


@router.delete("/contacts/{contact_id}", status_code=204)
def delete_contact(contact_id: str, conn=Depends(get_db), user=Depends(get_current_user), ctx=Depends(require_permission("contacts.write"))):
    contacts_svc.delete_contact(conn, ctx, user, contact_id)
    return None
