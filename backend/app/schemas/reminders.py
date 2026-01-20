from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

from app.schemas.enums import ReminderStatus, ReminderType


class Reminder(BaseModel):
    id: str
    workspace_id: str
    contact_id: Optional[str] = None
    project_id: Optional[str] = None
    type: ReminderType
    status: ReminderStatus
    title: Optional[str] = None
    body: Optional[str] = None
    due_at: str
    assigned_to_user_id: Optional[str] = None
    created_by_user_id: Optional[str] = None
    created_at: str
    updated_at: str


class ReminderCreate(BaseModel):
    contact_id: Optional[str] = None
    project_id: Optional[str] = None
    type: ReminderType
    title: Optional[str] = None
    body: Optional[str] = None
    due_at: str
    assigned_to_user_id: Optional[str] = None


class ReminderUpdate(BaseModel):
    status: Optional[ReminderStatus] = None
    title: Optional[str] = None
    body: Optional[str] = None
    due_at: Optional[str] = None
    assigned_to_user_id: Optional[str] = None
