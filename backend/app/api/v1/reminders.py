from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_db, get_current_user, require_permission
from app.schemas.common import Paginated
from app.schemas.enums import ReminderStatus
from app.schemas.reminders import Reminder, ReminderCreate, ReminderUpdate
from app.services import reminders as reminders_svc

router = APIRouter()


@router.get("/reminders", response_model=Paginated[Reminder])
def list_reminders(
    workspace_id: str = Query(..., alias="workspace_id"),
    status: Optional[ReminderStatus] = Query(None),
    due_before: Optional[str] = Query(None),
    due_after: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = Query(None),
    conn=Depends(get_db),
    ctx=Depends(require_permission("reminders.manage")),
):
    items, next_cursor = reminders_svc.list_reminders(
        conn,
        ctx,
        limit=limit,
        cursor=cursor,
        status=status.value if status else None,
        due_before=due_before,
        due_after=due_after,
    )
    return {"data": items, "next_cursor": next_cursor}


@router.post("/reminders", status_code=201, response_model=Reminder)
def create_reminder(
    payload: ReminderCreate,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("reminders.manage")),
):
    return reminders_svc.create_reminder(conn, ctx, user, payload)


@router.get("/reminders/{reminder_id}", response_model=Reminder)
def get_reminder(
    reminder_id: str,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    ctx=Depends(require_permission("reminders.manage")),
):
    return reminders_svc.get_reminder(conn, ctx, reminder_id)


@router.patch("/reminders/{reminder_id}", response_model=Reminder)
def patch_reminder(
    reminder_id: str,
    payload: ReminderUpdate,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("reminders.manage")),
):
    return reminders_svc.update_reminder(conn, ctx, user, reminder_id, payload)


@router.delete("/reminders/{reminder_id}", status_code=204)
def delete_reminder(
    reminder_id: str,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("reminders.manage")),
):
    reminders_svc.delete_reminder(conn, ctx, user, reminder_id)
    return None
