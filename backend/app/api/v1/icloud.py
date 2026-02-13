"""API эндпоинты для iCloud интеграции."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_db, get_current_user, get_workspace_context, require_role
from app.core.security import UserPrincipal
from app.schemas.icloud import ContactLink, ContactLinkRequest, ICloudAccount, ICloudConnectRequest
from app.services import icloud as icloud_svc

router = APIRouter()


@router.post("/icloud/connect", status_code=201, response_model=ICloudAccount)
def connect_icloud(
    payload: ICloudConnectRequest,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
    ctx=Depends(get_workspace_context),
    _access=Depends(require_role("owner")),
):
    """Подключить iCloud аккаунт."""
    return icloud_svc.connect_icloud(conn, ctx, user, payload)


@router.get("/icloud/status", response_model=ICloudAccount)
def get_icloud_status(
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
    ctx=Depends(get_workspace_context),
):
    """Получить статус подключения iCloud."""
    account = icloud_svc.get_icloud_status(conn, ctx, user)
    if not account:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "iCloud аккаунт не подключен"},
        )
    return account


@router.delete("/icloud/disconnect", status_code=204)
def disconnect_icloud(
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
    ctx=Depends(get_workspace_context),
    _access=Depends(require_role("owner")),
):
    """Отключить iCloud аккаунт."""
    icloud_svc.disconnect_icloud(conn, ctx, user)
    return None


@router.post("/icloud/sync")
def sync_icloud(
    workspace_id: str = Query(..., alias="workspace_id"),
    full: bool = Query(False, description="Выполнить полную синхронизацию"),
    conn=Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
    ctx=Depends(get_workspace_context),
    _access=Depends(require_role("owner")),
):
    """Запустить синхронизацию вручную."""
    result = icloud_svc.sync_icloud_contacts(conn, ctx, user, full_sync=full)
    return result


@router.get("/icloud/contacts")
def list_icloud_contacts(
    workspace_id: str = Query(..., alias="workspace_id"),
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Поисковый запрос"),
    conn=Depends(get_db),
    ctx=Depends(get_workspace_context),
):
    """Список iCloud контактов."""
    contacts, next_cursor = icloud_svc.list_icloud_contacts(conn, ctx, limit=limit, cursor=cursor, q=q)
    return {"data": contacts, "next_cursor": next_cursor}


@router.get("/icloud/contacts/{icloud_contact_id}")
def get_icloud_contact(
    icloud_contact_id: UUID,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    ctx=Depends(get_workspace_context),
):
    """Получить детали iCloud контакта."""
    return icloud_svc.get_icloud_contact(conn, ctx, icloud_contact_id)


@router.post("/icloud/contacts/{icloud_contact_id}/link", response_model=ContactLink)
def link_icloud_contact(
    icloud_contact_id: UUID,
    payload: ContactLinkRequest,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
    ctx=Depends(get_workspace_context),
):
    """Связать iCloud контакт с CRM контактом."""
    return icloud_svc.link_icloud_contact(
        conn,
        ctx,
        user,
        icloud_contact_id,
        payload.crm_contact_id,
        payload.link_type,
    )
