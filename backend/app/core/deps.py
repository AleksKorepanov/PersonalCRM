from __future__ import annotations

import os
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
        _set_request_gucs(request, conn)
        yield conn


async def get_db(request: Request) -> Generator:
    pool = request.app.state.pool
    with pool.connection() as conn:
        _set_request_gucs(request, conn)
        yield conn


def _set_request_gucs(request: Request, conn) -> None:
    user_id = getattr(request.state, "user_id", "") or ""
    workspace_id = getattr(request.state, "workspace_id", "") or ""
    conn.execute("SELECT set_config('app.user_id', %s, true)", (str(user_id),))
    conn.execute("SELECT set_config('app.workspace_id', %s, true)", (str(workspace_id),))


def _ensure_dev_identity(request: Request, role: str) -> tuple[UserPrincipal, str]:
    pool = request.app.state.pool
    user_id = os.getenv("DEV_USER_ID", settings.dev_user_id)
    workspace_id = os.getenv("DEV_WORKSPACE_ID", settings.dev_workspace_id)
    email = os.getenv("DEV_USER_EMAIL", settings.dev_user_email)
    display_name = email.split("@", 1)[0]

    with pool.connection() as conn:
        row = conn.execute(
            "SELECT id, email, display_name FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()
        if not row:
            row = conn.execute(
                "SELECT id, email, display_name FROM users WHERE email = %s",
                (email,),
            ).fetchone()
        if row:
            user_id_db, email_db, name = row
            user_id = str(user_id_db)
            email = str(email_db)
            display_name = name
        else:
            conn.execute(
                "INSERT INTO users(id, email, display_name) VALUES (%s, %s, %s)",
                (user_id, email, display_name),
            )

        ws_row = conn.execute(
            "SELECT id, name FROM workspaces WHERE id = %s",
            (workspace_id,),
        ).fetchone()
        if not ws_row:
            ws_row = conn.execute(
                "SELECT id, name FROM workspaces WHERE name = %s AND owner_user_id = %s",
                ("PersonalCRM Dev", user_id),
            ).fetchone()
        if ws_row:
            workspace_id = str(ws_row[0])
        else:
            conn.execute(
                "INSERT INTO workspaces(id, name, owner_user_id) VALUES (%s, %s, %s)",
                (workspace_id, "PersonalCRM Dev", user_id),
            )

        conn.execute(
            """
            INSERT INTO workspace_memberships(workspace_id, user_id, role, is_active, accepted_at)
            VALUES (%s,%s,%s,true,now())
            ON CONFLICT (workspace_id, user_id)
            DO UPDATE SET role=EXCLUDED.role, is_active=true, deleted_at=NULL
            """,
            (workspace_id, user_id, role),
        )
        conn.commit()

    principal = UserPrincipal(user_id=str(user_id), email=email, display_name=display_name)
    return principal, workspace_id


def _get_dev_role(request: Request) -> str:
    role = request.headers.get("x-dev-role") or os.getenv("DEV_MEMBERSHIP_ROLE") or "owner"
    if role not in {"owner", "assistant"}:
        raise HTTPException(status_code=400, detail={"code": "VALIDATION_ERROR", "message": "Неверная роль доступа"})
    return role


async def set_request_context(
    request: Request,
    authorization: Optional[str] = Depends(get_authorization_header),
) -> None:
    workspace_id = request.query_params.get("workspace_id")
    if settings.auth_disabled:
        role = _get_dev_role(request)
        principal, workspace_id = _ensure_dev_identity(request, role)
        request.state.user_principal = principal
        request.state.user_id = principal.user_id
        request.state.workspace_id = workspace_id
        request.state.membership_role = role
        return

    principal = decode_bearer_token(authorization)
    if not workspace_id:
        raise HTTPException(status_code=400, detail={"code": "WORKSPACE_REQUIRED", "message": "workspace_id обязателен"})
    request.state.user_principal = principal
    request.state.user_id = principal.user_id
    request.state.workspace_id = workspace_id


async def get_current_user(
    request: Request,
    authorization: Optional[str] = Depends(get_authorization_header),
) -> UserPrincipal:
    principal = getattr(request.state, "user_principal", None)
    if principal:
        return principal
    if settings.auth_disabled:
        role = _get_dev_role(request)
        principal, workspace_id = _ensure_dev_identity(request, role)
        request.state.user_principal = principal
        request.state.user_id = principal.user_id
        request.state.workspace_id = workspace_id
        request.state.membership_role = role
        return principal
    return decode_bearer_token(authorization)


async def get_workspace_context(
    request: Request,
    workspace_id: Optional[str] = Query(None, alias="workspace_id"),
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
) -> WorkspaceContext:
    workspace_id_value = workspace_id or getattr(request.state, "workspace_id", None)
    if not workspace_id_value:
        raise HTTPException(status_code=400, detail={"code": "WORKSPACE_REQUIRED", "message": "workspace_id обязателен"})

    row = conn.execute(
        "SELECT role, is_active FROM workspace_memberships WHERE workspace_id = %s AND user_id = %s AND deleted_at IS NULL",
        (workspace_id_value, user.user_id),
    ).fetchone()

    if not row:
        # Dev convenience: if auth is disabled, auto-create membership as owner if workspace exists.
        if settings.auth_disabled:
            role = getattr(request.state, "membership_role", "owner")
            ws = conn.execute(
                "SELECT id FROM workspaces WHERE id = %s AND deleted_at IS NULL",
                (workspace_id_value,),
            ).fetchone()
            if not ws:
                raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Рабочее пространство не найдено"})
            conn.execute(
                """
                INSERT INTO workspace_memberships(workspace_id, user_id, role, is_active, accepted_at)
                VALUES (%s,%s,%s,true,now())
                ON CONFLICT (workspace_id, user_id)
                DO UPDATE SET role=EXCLUDED.role, is_active=true, deleted_at=NULL
                """,
                (workspace_id_value, user.user_id, role),
            )
            conn.commit()
            return WorkspaceContext(workspace_id=workspace_id_value, membership_role=role)

        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Нет доступа к рабочему пространству"})

    role, is_active = row
    if not is_active:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Членство неактивно"})

    return WorkspaceContext(workspace_id=workspace_id_value, membership_role=str(role))


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

        # Minimal default: allow assistant to read, and write interactions in dev
        if not has and ctx.membership_role in {"assistant", "collaborator"}:
            if permission_key.endswith(".read"):
                return ctx
            if permission_key == "interactions.write":
                return ctx

        if not has:
            raise HTTPException(
                status_code=403,
                detail={"code": "FORBIDDEN", "message": f"Не хватает разрешения: {permission_key}"},
            )

        return ctx

    return _checker
