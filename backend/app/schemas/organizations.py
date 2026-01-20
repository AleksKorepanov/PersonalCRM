from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class Organization(BaseModel):
    id: str
    workspace_id: str
    name: str
    website: Optional[str] = None
    industries: List[str] = []
    created_at: str
    updated_at: str


class OrganizationCreate(BaseModel):
    name: str
    website: Optional[str] = None
    industries: List[str] = []


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    website: Optional[str] = None
    industries: Optional[List[str]] = None
