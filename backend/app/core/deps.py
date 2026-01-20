from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from typing import Generator, Optional

from fastapi import Depends, HTTPException, Query, Request

from app.core.config import settings
from app.core.security import UserPrincipal, decode_bearer_token, get_authorization_header
from app.db.session import create_pool


@dataclass(frozen=True)
class WorkspaceContext:
    workspace_id: str
    membership_role: str  # owner|assistant|collaborator


@contextmanager
def db_conn(request: Request) -> Generator:
    pool = request.app.state.pool
    with pool.connection() as conn:
        yield conn


async def get_db(request: Request) -> Generator:
    pool = request.app.state.pool
    with pool.connection() as conn:
        yield conn


def _get_or_create_dev_user(conn) -> UserPrincipal:
    email = settings.dev_user_email
    row = conn.execute(
        "SELECT id, email, display_name FROM users WHERE email = %s",
        (email,),
    ).fetchone()
    if row:
        user_id, email_db, name = row
        return UserPrincipal(user_id=str(user_id), email=str(email_db), display_name=name)

    row = conn.execute(
        "INSERT INTO users(email, display_name) VALUES (%s, %s) RETURNING id, email, display_name",
        (email, email.split("@", 1)[0]),
    ).fetchone()
    user_id, email_db, name = row
    return UserPrincipal(user_id=str(user_id), email=str(email_db), display_name=name)


async def get_current_user(
    request: Request,
    authorization: Optional[str] = Depends(get_authorization_header),
    conn=Depends(get_db),
) -> UserPrincipal:
    if settings.auth_disabled:
        return _get_or_create_dev_user(conn)
    return decode_bearer_token(authorization)


async def get_workspace_context(
    workspace_id: str = Query(..., alias="workspace_id"),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
) -> WorkspaceContext:
    row = conn.execute(
        "SELECT role, is_active FROM workspace_memberships WHERE workspace_id = %s AND user_id = %s AND deleted_at IS NULL",
        (workspace_id, user.user_id),
    ).fetchone()

    if not row:
        # Dev convenience: if auth is disabled, auto-create membership as owner if workspace exists.
        if settings.auth_disabled:
            ws = conn.execute(
                "SELECT id FROM workspaces WHERE id = %s AND deleted_at IS NULL",
                (workspace_id,),
            ).fetchone()
            if not ws:
                raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Workspace not found"})
            conn.execute(
                "INSERT INTO workspace_memberships(workspace_id, user_id, role, is_active, accepted_at) VALUES (%s,%s,'owner',true,now()) ON CONFLICT (workspace_id, user_id) DO UPDATE SET role='owner', is_active=true, deleted_at=NULL",
                (workspace_id, user.user_id),
            )
            conn.commit()
            return WorkspaceContext(workspace_id=workspace_id, membership_role="owner")

        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "No workspace access"})

    role, is_active = row
    if not is_active:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Membership inactive"})

    return WorkspaceContext(workspace_id=workspace_id, membership_role=str(role))


def require_permission(permission_key: str):
    async def _checker(
        ctx: WorkspaceContext = Depends(get_workspace_context),
        user: UserPrincipal = Depends(get_current_user),
        conn=Depends(get_db),
    ) -> WorkspaceContext:
        if ctx.membership_role == "owner":
            return ctx

        # Assistants/collaborators: check RBAC role permissions
        has = conn.execute(
            """
            SELECT 1
            FROM membership_roles mr
            JOIN workspace_role_permissions wrp ON wrp.role_id = mr.role_id
            WHERE mr.workspace_id = %s AND mr.user_id = %s AND wrp.permission_key = %s
            LIMIT 1
            """,
            (ctx.workspace_id, user.user_id, permission_key),
        ).fetchone()

        # Minimal default: allow assistant to read/write common entities if no RBAC configured
        if not has and permission_key.endswith(".read") and ctx.membership_role in {"assistant", "collaborator"}:
            return ctx

        if not has:
            raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": f"Missing permission: {permission_key}"})

        return ctx

    return _checker
