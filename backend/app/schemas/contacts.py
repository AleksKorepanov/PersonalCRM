from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from app.schemas.enums import TieStrength, Visibility
from app.schemas.organizations import Organization


class Contact(BaseModel):
    id: str
    workspace_id: str
    visibility: Visibility

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    display_name: str
    photo_url: Optional[str] = None

    emails: List[str] = []
    phones: List[str] = []
    messengers: Dict[str, str] = {}

    city: Optional[str] = None
    timezone: Optional[str] = None
    birthday: Optional[str] = None

    organization: Optional[Organization] = None
    job_title: Optional[str] = None
    industries: List[str] = []
    competencies: List[str] = []
    tags: List[str] = []

    tie_strength: TieStrength

    trust_score: Optional[int] = Field(default=None, ge=1, le=10)
    emotional_balance: Optional[float] = None

    how_can_help: List[str] = []
    how_i_can_help: List[str] = []

    met_context: Optional[str] = None
    shared_notes: Optional[str] = None
    private_notes: Optional[str] = None

    last_interaction_at: Optional[str] = None
    next_touch_at: Optional[str] = None

    created_at: str
    updated_at: str


class ContactCreate(BaseModel):
    visibility: Visibility = Visibility.shared
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    display_name: str
    photo_url: Optional[str] = None

    emails: List[str] = []
    phones: List[str] = []
    messengers: Dict[str, str] = {}

    city: Optional[str] = None
    timezone: Optional[str] = None
    birthday: Optional[str] = None

    organization_id: Optional[str] = None
    job_title: Optional[str] = None
    industries: List[str] = []
    competencies: List[str] = []
    tags: List[str] = []

    tie_strength: TieStrength

    trust_score: Optional[int] = Field(default=None, ge=1, le=10)
    emotional_balance: Optional[float] = None

    how_can_help: List[str] = []
    how_i_can_help: List[str] = []

    met_context: Optional[str] = None
    shared_notes: Optional[str] = None
    private_notes: Optional[str] = None

    next_touch_at: Optional[str] = None


class ContactUpdate(BaseModel):
    visibility: Optional[Visibility] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    display_name: Optional[str] = None
    photo_url: Optional[str] = None

    emails: Optional[List[str]] = None
    phones: Optional[List[str]] = None
    messengers: Optional[Dict[str, str]] = None

    city: Optional[str] = None
    timezone: Optional[str] = None
    birthday: Optional[str] = None

    organization_id: Optional[str] = None
    job_title: Optional[str] = None
    industries: Optional[List[str]] = None
    competencies: Optional[List[str]] = None
    tags: Optional[List[str]] = None

    tie_strength: Optional[TieStrength] = None

    trust_score: Optional[int] = Field(default=None, ge=1, le=10)
    emotional_balance: Optional[float] = None

    how_can_help: Optional[List[str]] = None
    how_i_can_help: Optional[List[str]] = None

    met_context: Optional[str] = None
    shared_notes: Optional[str] = None
    private_notes: Optional[str] = None

    next_touch_at: Optional[str] = None


class ContactMergeRequest(BaseModel):
    primary_contact_id: str
    merge_contact_ids: List[str] = []
