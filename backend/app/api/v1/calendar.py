from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile

from app.core.deps import get_db, get_current_user, require_permission
from app.schemas.enums import InteractionType
from app.schemas.interactions import InteractionCreate
from app.services import interactions as interactions_svc
from app.services.db import fetchone

router = APIRouter()


def _parse_ics_datetime(value: str) -> Optional[str]:
    raw = value.strip()
    if not raw:
        return None
    try:
        if len(raw) == 8:
            dt = datetime.strptime(raw, "%Y%m%d").replace(tzinfo=timezone.utc)
            return dt.isoformat()
        if raw.endswith("Z"):
            dt = datetime.strptime(raw, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
            return dt.isoformat()
        dt = datetime.strptime(raw, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except ValueError:
        return None


def _extract_ics_events(content: str) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None
    attendees: List[str] = []
    for line in content.splitlines():
        line = line.strip()
        if line == "BEGIN:VEVENT":
            current = {}
            attendees = []
            continue
        if line == "END:VEVENT":
            if current is not None:
                current["attendees"] = attendees
                events.append(current)
            current = None
            attendees = []
            continue
        if current is None or not line:
            continue
        if line.startswith("DTSTART"):
            _, value = line.split(":", 1)
            current["start"] = value.strip()
        elif line.startswith("SUMMARY"):
            _, value = line.split(":", 1)
            current["summary"] = value.strip()
        elif line.startswith("ATTENDEE"):
            _, value = line.split(":", 1)
            email = value.strip()
            if email.lower().startswith("mailto:"):
                email = email[7:]
            if email:
                attendees.append(email)
    return events


def _extract_json_events(data: Any) -> List[Dict[str, Any]]:
    if isinstance(data, dict):
        events = data.get("events", [])
    else:
        events = data
    if not isinstance(events, list):
        return []
    return events


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


@router.post("/calendar/import")
def import_calendar(
    file: UploadFile,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("interactions.write")),
):
    if os.getenv("CALENDAR_IMPORT_ENABLED") != "1":
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Импорт календаря отключен"})

    if not file:
        raise HTTPException(status_code=422, detail={"code": "VALIDATION_ERROR", "message": "Файл обязателен"})

    raw = file.file.read()
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "VALIDATION_ERROR", "message": "Файл должен быть в кодировке UTF-8"},
        ) from exc

    events: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    imported = 0
    skipped = 0

    is_json = content.lstrip().startswith("{") or content.lstrip().startswith("[")
    if is_json:
        try:
            data = json.loads(content)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=400,
                detail={"code": "VALIDATION_ERROR", "message": "Некорректный JSON"},
            ) from exc
        events = _extract_json_events(data)
    else:
        events = _extract_ics_events(content)

    if not events:
        return {"imported": 0, "skipped": 0, "errors": []}

    for idx, event in enumerate(events, start=1):
        summary = event.get("summary") or event.get("title") or "Событие календаря"
        start_raw = event.get("start") or event.get("start_at")
        occurred_at = None
        if isinstance(start_raw, str):
            if is_json:
                try:
                    occurred_at = datetime.fromisoformat(start_raw.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
                except ValueError:
                    occurred_at = None
            else:
                occurred_at = _parse_ics_datetime(start_raw)
        if not occurred_at:
            errors.append({"line": idx, "message": "Не указано время начала события"})
            skipped += 1
            continue

        attendees = event.get("attendees") or []
        if isinstance(attendees, str):
            attendees = [attendees]
        matched_contact_id = None
        for email in attendees:
            if not isinstance(email, str):
                continue
            matched_contact_id = _find_contact_by_email(conn, ctx, email)
            if matched_contact_id:
                break

        if not matched_contact_id:
            skipped += 1
            continue

        payload = InteractionCreate(
            type=InteractionType.event,
            occurred_at=occurred_at,
            summary=summary,
        )
        interactions_svc.create_interaction(conn, ctx, user, matched_contact_id, payload)
        imported += 1

    return {"imported": imported, "skipped": skipped, "errors": errors}
