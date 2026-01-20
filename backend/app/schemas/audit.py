from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel


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
