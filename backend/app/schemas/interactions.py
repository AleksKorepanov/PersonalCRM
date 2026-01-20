from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

from app.schemas.enums import InteractionChannel, InteractionType, Visibility


class Interaction(BaseModel):
    id: str
    workspace_id: str
    contact_id: str
    visibility: Visibility
    type: InteractionType
    channel: Optional[InteractionChannel] = None
    occurred_at: str
    summary: Optional[str] = None
    outcome: Optional[str] = None
    next_action: Optional[str] = None
    next_action_at: Optional[str] = None
    created_by_user_id: Optional[str] = None
    created_at: str
    updated_at: str


class InteractionCreate(BaseModel):
    visibility: Visibility = Visibility.shared
    type: InteractionType
    channel: Optional[InteractionChannel] = None
    occurred_at: str
    summary: Optional[str] = None
    outcome: Optional[str] = None
    next_action: Optional[str] = None
    next_action_at: Optional[str] = None


class InteractionUpdate(BaseModel):
    visibility: Optional[Visibility] = None
    type: Optional[InteractionType] = None
    channel: Optional[InteractionChannel] = None
    occurred_at: Optional[str] = None
    summary: Optional[str] = None
    outcome: Optional[str] = None
    next_action: Optional[str] = None
    next_action_at: Optional[str] = None
