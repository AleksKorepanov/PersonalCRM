from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_workspace_context, get_current_user, get_db, WorkspaceContext
from app.core.security import UserPrincipal
from app.schemas.reminders import ReminderCreate, ReminderUpdate
from app.services import reminders as svc

router = APIRouter()


@router.get("/reminders")
def list_reminders(
    status: Optional[str] = Query(default=None),
    assigned_to_user_id: Optional[str] = Query(default=None),
    due_before: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: Optional[str] = Query(default=None),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    conn=Depends(get_db),
):
    items, next_cursor = svc.list_reminders(conn, ctx, limit=limit, cursor=cursor, status=status, assigned_to=assigned_to_user_id, due_before=due_before)
    return {"items": items, "next_cursor": next_cursor}


@router.post("/reminders", status_code=201)
def create_reminder(
    payload: ReminderCreate,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
):
    return svc.create_reminder(conn, ctx, user, payload)


@router.get("/reminders/{reminder_id}")
def get_reminder(
    reminder_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    conn=Depends(get_db),
):
    return svc.get_reminder(conn, ctx, reminder_id)


@router.patch("/reminders/{reminder_id}")
def update_reminder(
    reminder_id: str,
    payload: ReminderUpdate,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
):
    return svc.update_reminder(conn, ctx, user, reminder_id, payload)


@router.delete("/reminders/{reminder_id}", status_code=204)
def delete_reminder(
    reminder_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
):
    svc.delete_reminder(conn, ctx, user, reminder_id)
    return None
