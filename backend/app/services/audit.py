from __future__ import annotations

import json
from typing import Any, Dict, Optional

from app.core.deps import WorkspaceContext
from app.core.security import UserPrincipal
from app.services.db import execute


def log_audit(
    conn,
    ctx: WorkspaceContext,
    user: UserPrincipal,
    action_key: str,
    entity_type: str,
    entity_id: Optional[str],
    before: Optional[Dict[str, Any]] = None,
    after: Optional[Dict[str, Any]] = None,
) -> None:
    execute(
        conn,
        """
        INSERT INTO audit_log(workspace_id, actor_user_id, action_key, entity_type, entity_id, before, after)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        """,
        (
            ctx.workspace_id,
            user.user_id,
            action_key,
            entity_type,
            entity_id,
            json.dumps(before) if before is not None else None,
            json.dumps(after) if after is not None else None,
        ),
    )
