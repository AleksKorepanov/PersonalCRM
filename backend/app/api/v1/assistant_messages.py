from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_current_user, get_db, get_workspace_context, require_role
from app.schemas.audit import AssistantMessageCreate, AssistantMessageResponse
from app.services import audit as audit_svc
from app.services import contacts as contacts_svc
from app.services import introductions as introductions_svc
from app.services import reminders as reminders_svc

router = APIRouter()


@router.post("/assistant/messages", response_model=AssistantMessageResponse)
def create_assistant_message(
    payload: AssistantMessageCreate,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(get_workspace_context),
    _access=Depends(require_role("assistant")),
):
    if payload.target_type == "contact":
        contacts_svc.get_contact(conn, ctx, payload.target_id)
    elif payload.target_type == "reminder":
        reminders_svc.get_reminder(conn, ctx, payload.target_id)
    elif payload.target_type == "introduction":
        introductions_svc.get_introduction(conn, ctx, payload.target_id)
    else:
        raise HTTPException(
            status_code=422,
            detail={"code": "VALIDATION_ERROR", "message": "Недопустимый тип объекта"},
        )

    audit_svc.create_assistant_message(conn, ctx, user, payload)
    return {"status": "ok"}
