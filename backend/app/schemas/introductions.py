from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

from app.schemas.enums import IntroductionStatus, Visibility


class Introduction(BaseModel):
    id: str
    workspace_id: str
    status: IntroductionStatus

    requester_contact_id: str
    introducer_contact_id: str
    target_contact_id: str

    ask: str
    benefit_for_requester: Optional[str] = None
    benefit_for_target: Optional[str] = None

    consent_requester: bool = False
    consent_target: bool = False

    sent_at: Optional[str] = None
    met_at: Optional[str] = None
    outcome: Optional[str] = None

    created_by_user_id: Optional[str] = None
    created_at: str
    updated_at: str


class IntroductionCreate(BaseModel):
    requester_contact_id: str
    introducer_contact_id: str
    target_contact_id: str
    ask: str
    benefit_for_requester: Optional[str] = None
    benefit_for_target: Optional[str] = None
    consent_requester: bool = False
    consent_target: bool = False
    status: Optional[IntroductionStatus] = None


class IntroductionUpdate(BaseModel):
    status: Optional[IntroductionStatus] = None
    ask: Optional[str] = None
    benefit_for_requester: Optional[str] = None
    benefit_for_target: Optional[str] = None
    consent_requester: Optional[bool] = None
    consent_target: Optional[bool] = None
    sent_at: Optional[str] = None
    met_at: Optional[str] = None
    outcome: Optional[str] = None
