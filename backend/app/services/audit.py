from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, Iterable, Optional, Set

from app.core.deps import WorkspaceContext
from app.core.security import UserPrincipal
from app.services.db import execute
from app.schemas.audit import AssistantMessageCreate


def _json_default(value: Any):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


SENSITIVE_FIELDS_BY_ENTITY: Dict[str, Set[str]] = {
    "contact": {
        "shared_notes",
        "private_notes",
        "trust_score",
        "emotional_balance",
        "how_can_help",
        "how_i_can_help",
    },
    "interaction": {"outcome", "next_action"},
    "introduction": {"benefit_for_requester", "benefit_for_target", "outcome"},
    "reminder": {"body"},
    "project": {"description"},
}


def _action_from_key(action_key: str) -> str:
    if "." in action_key:
        return action_key.split(".")[-1]
    return action_key


def _diff_fields(before: Optional[Dict[str, Any]], after: Optional[Dict[str, Any]]) -> Optional[Iterable[str]]:
    if before is None or after is None:
        return None
    keys = set(before.keys()) | set(after.keys())
    return sorted(k for k in keys if before.get(k) != after.get(k))


def _redact_fields(payload: Optional[Dict[str, Any]], fields: Set[str]) -> Optional[Dict[str, Any]]:
    if payload is None:
        return None
    redacted = dict(payload)
    for field in fields:
        if field in redacted:
            redacted[field] = None
    return redacted


def _build_audit_after(
    after: Optional[Dict[str, Any]],
    action: str,
    actor_role: Optional[str],
    diff_fields: Optional[Iterable[str]],
) -> Optional[Dict[str, Any]]:
    if after is None and diff_fields is None and actor_role is None:
        return None
    payload = dict(after or {})
    if actor_role:
        payload["actor_role"] = actor_role
    payload["action"] = action
    if diff_fields is not None:
        payload["diff_fields"] = list(diff_fields)
    return payload


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
    action = _action_from_key(action_key)
    diff_fields = _diff_fields(before, after) if action == "update" else None
    sensitive_fields = SENSITIVE_FIELDS_BY_ENTITY.get(entity_type, set())
    safe_before = _redact_fields(before, sensitive_fields) if action == "update" else before
    safe_after = _redact_fields(after, sensitive_fields) if action == "update" else after
    audit_after = _build_audit_after(safe_after, action, ctx.membership_role, diff_fields)

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
            json.dumps(safe_before, default=_json_default) if safe_before is not None else None,
            json.dumps(audit_after, default=_json_default) if audit_after is not None else None,
        ),
    )


def create_assistant_message(conn, ctx: WorkspaceContext, user: UserPrincipal, payload: AssistantMessageCreate) -> Dict[str, Any]:
    after = {
        "message_type": "assistant_message",
        "target_type": payload.target_type,
        "target_id": payload.target_id,
        "task": payload.task,
        "reason": payload.reason,
        "due_at": payload.due_at,
    }
    log_audit(
        conn,
        ctx,
        user,
        action_key="assistant_message.create",
        entity_type="interaction",
        entity_id=payload.target_id,
        before=None,
        after=after,
    )
    conn.commit()
    return after
