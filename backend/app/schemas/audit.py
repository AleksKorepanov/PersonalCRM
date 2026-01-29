from __future__ import annotations

from typing import Any, Dict, Optional, Literal

from pydantic import BaseModel, Field


class AuditEvent(BaseModel):
    id: str
    workspace_id: str
    actor_user_id: str
    action_key: str
    entity_type: str
    entity_id: str
    before: Optional[Dict[str, Any]] = None
    after: Optional[Dict[str, Any]] = None
    created_at: str


class AssistantMessageCreate(BaseModel):
    target_type: Literal["contact", "reminder", "introduction"]
    target_id: str
    task: str = Field(..., min_length=2)
    reason: Optional[str] = None
    due_at: Optional[str] = None


class AssistantMessageResponse(BaseModel):
    status: str
