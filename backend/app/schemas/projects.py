from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel

from app.schemas.enums import ProjectStatus, Visibility


class Project(BaseModel):
    id: str
    workspace_id: str
    visibility: Visibility
    name: str
    description: Optional[str] = None
    status: ProjectStatus
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    participant_contact_ids: List[str] = []
    created_at: str
    updated_at: str


class ProjectCreate(BaseModel):
    visibility: Visibility = Visibility.shared
    name: str
    description: Optional[str] = None
    status: ProjectStatus = ProjectStatus.idea
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    participant_contact_ids: List[str] = []


class ProjectUpdate(BaseModel):
    visibility: Optional[Visibility] = None
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    participant_contact_ids: Optional[List[str]] = None
