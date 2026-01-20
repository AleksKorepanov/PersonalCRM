from __future__ import annotations

from typing import List

from pydantic import BaseModel

from app.schemas.rbac import Workspace, WorkspaceMember


class MeUser(BaseModel):
    id: str
    email: str
    display_name: str | None = None


class MeWorkspaceItem(BaseModel):
    workspace: Workspace
    membership: WorkspaceMember


class MeResponse(BaseModel):
    user: MeUser
    workspaces: List[MeWorkspaceItem]
