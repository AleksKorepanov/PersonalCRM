from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class Workspace(BaseModel):
    id: str
    name: str
    created_at: str


class WorkspaceMember(BaseModel):
    workspace_id: str
    user_id: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    membership_role: str
    is_active: bool
    created_at: str


class WorkspaceMemberCreate(BaseModel):
    email: str
    membership_role: str


class WorkspaceMemberUpdate(BaseModel):
    membership_role: Optional[str] = None
    is_active: Optional[bool] = None


class Permission(BaseModel):
    key: str
    description: Optional[str] = None


class Role(BaseModel):
    id: str
    workspace_id: str
    name: str
    description: Optional[str] = None
    permission_keys: List[str]


class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    permission_keys: List[str]


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permission_keys: Optional[List[str]] = None
