from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from app.core.deps import get_db, get_current_user, require_permission
from app.schemas.enums import InteractionType
from app.schemas.interactions import InteractionCreate
from app.services import interactions as interactions_svc
from app.services.db import fetchone

router = APIRouter()


def _parse_iso_datetime(value: str) -> Optional[str]:
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _extract_messages(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, dict):
        items = payload.get("messages", [])
    else:
        items = payload
    if not isinstance(items, list):
        return []
    return items


def _find_contact_by_email(conn, ctx, email: str) -> Optional[str]:
    where = ["workspace_id = %s", "deleted_at IS NULL"]
    params: List[Any] = [ctx.workspace_id]
    if ctx.membership_role != "owner":
        where.append("visibility <> 'private'")
    where.append(
        """
        (
          EXISTS (SELECT 1 FROM jsonb_array_elements_text(emails) e WHERE lower(e) = lower(%s))
          OR EXISTS (SELECT 1 FROM jsonb_array_elements(emails) e WHERE lower(e->>'email') = lower(%s))
        )
        """
    )
    params.extend([email, email])
    sql = "SELECT id FROM contacts WHERE " + " AND ".join(where) + " LIMIT 1"
    row = fetchone(conn, sql, tuple(params))
    if row:
        return str(row["id"])
    return None


def _message_exists(conn, ctx, message_id: str) -> bool:
    row = fetchone(
        conn,
        """
        SELECT 1 FROM interactions
        WHERE workspace_id = %s
          AND deleted_at IS NULL
          AND type = 'message'
          AND outcome ILIKE %s
        LIMIT 1
        """,
        (ctx.workspace_id, f"%message_id:{message_id}%"),
    )
    return row is not None


@router.post("/email/import")
def import_email(
    payload: Any = Body(...),
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("interactions.write")),
):
    if os.getenv("EMAIL_IMPORT_ENABLED") != "1":
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Импорт писем отключен"})

    messages = _extract_messages(payload)
    if not messages:
        raise HTTPException(
            status_code=400,
            detail={"code": "VALIDATION_ERROR", "message": "Ожидается список писем"},
        )

    imported = 0
    skipped = 0
    errors: List[Dict[str, Any]] = []

    for idx, msg in enumerate(messages, start=1):
        if not isinstance(msg, dict):
            errors.append({"line": idx, "message": "Элемент письма должен быть объектом"})
            skipped += 1
            continue

        message_id = str(msg.get("message_id") or "").strip()
        if not message_id:
            errors.append({"line": idx, "message": "message_id обязателен"})
            skipped += 1
            continue

        if _message_exists(conn, ctx, message_id):
            skipped += 1
            continue

        date_raw = str(msg.get("date") or "").strip()
        if not date_raw:
            errors.append({"line": idx, "message": "date обязателен"})
            skipped += 1
            continue
        occurred_at = _parse_iso_datetime(date_raw)
        if not occurred_at:
            errors.append({"line": idx, "message": "Некорректный формат date"})
            skipped += 1
            continue

        addresses: List[str] = []
        from_email = msg.get("from")
        if isinstance(from_email, str) and from_email.strip():
            addresses.append(from_email.strip())
        to_field = msg.get("to")
        if isinstance(to_field, list):
            addresses.extend([e.strip() for e in to_field if isinstance(e, str) and e.strip()])
        elif isinstance(to_field, str) and to_field.strip():
            addresses.append(to_field.strip())

        if not addresses:
            errors.append({"line": idx, "message": "Не указаны email участников письма"})
            skipped += 1
            continue

        matched_contact_id = None
        for email in addresses:
            matched_contact_id = _find_contact_by_email(conn, ctx, email)
            if matched_contact_id:
                break

        if not matched_contact_id:
            skipped += 1
            continue

        subject = str(msg.get("subject") or "").strip()
        snippet = str(msg.get("snippet") or "").strip()
        notes = subject
        if snippet:
            notes = f"{notes}\n{snippet}" if notes else snippet
        if not notes:
            notes = "Письмо"

        payload = InteractionCreate(
            type=InteractionType.message,
            occurred_at=occurred_at,
            summary=notes,
            outcome=f"message_id:{message_id}",
        )
        interactions_svc.create_interaction(conn, ctx, user, matched_contact_id, payload)
        imported += 1

    return {"imported": imported, "skipped": skipped, "errors": errors}
