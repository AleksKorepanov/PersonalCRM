"""API endpoints для управления пользователями."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from app.core.deps import WorkspaceContext, get_current_user, get_db, require_permission
from app.core.security import UserPrincipal
from app.services.db import execute, execute_returning_one, fetchall, fetchone
import hashlib
import secrets


router = APIRouter()


class UserUpdateRequest(BaseModel):
    email: EmailStr | None = None
    password: str | None = None
    display_name: str | None = None


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str | None
    role: str
    is_active: bool


def _hash_password(password: str) -> str:
    """Хеширует пароль для хранения в БД.
    
    ВНИМАНИЕ: Для production нужно использовать bcrypt или argon2.
    Здесь используется простой SHA-256 для dev режима.
    """
    # TODO: Реализовать реальное хеширование bcrypt/argon2
    salt = secrets.token_hex(16)
    hash_obj = hashlib.sha256()
    hash_obj.update((password + salt).encode('utf-8'))
    return f"{salt}:{hash_obj.hexdigest()}"


def _verify_password(password: str, password_hash: str) -> bool:
    """Проверяет пароль против хеша."""
    # TODO: Реализовать реальную проверку для bcrypt/argon2
    if ':' not in password_hash:
        return False
    salt, hash_value = password_hash.split(':', 1)
    hash_obj = hashlib.sha256()
    hash_obj.update((password + salt).encode('utf-8'))
    return hash_obj.hexdigest() == hash_value


@router.get("/users/me")
def get_current_user_info(
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
) -> dict:
    """Получить информацию о текущем пользователе."""
    row = fetchone(
        conn,
        """
        SELECT id, email, display_name
        FROM users
        WHERE id = %s
        """,
        (user.user_id,),
    )
    
    if not row:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "Пользователь не найден"},
        )
    
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "display_name": row.get("display_name"),
    }


@router.patch("/users/me")
def update_current_user(
    payload: UserUpdateRequest,
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
) -> dict:
    """Обновить информацию о текущем пользователе (email, пароль, display_name)."""
    updates = []
    params = []
    
    if payload.email is not None:
        # Проверяем, что email не занят другим пользователем
        existing = fetchone(
            conn,
            "SELECT id FROM users WHERE email = %s AND id != %s",
            (payload.email, user.user_id),
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail={"code": "EMAIL_EXISTS", "message": "Email уже используется другим пользователем"},
            )
        updates.append("email = %s")
        params.append(payload.email)
    
    if payload.password is not None:
        if len(payload.password) < 8:
            raise HTTPException(
                status_code=422,
                detail={"code": "VALIDATION_ERROR", "message": "Пароль должен содержать минимум 8 символов"},
            )
        password_hash = _hash_password(payload.password)
        updates.append("password_hash = %s")
        params.append(password_hash)
    
    if payload.display_name is not None:
        updates.append("display_name = %s")
        params.append(payload.display_name)
    
    if not updates:
        raise HTTPException(
            status_code=422,
            detail={"code": "VALIDATION_ERROR", "message": "Не указаны поля для обновления"},
        )
    
    updates.append("updated_at = NOW()")
    params.append(user.user_id)
    
    execute(
        conn,
        f"""
        UPDATE users
        SET {', '.join(updates)}
        WHERE id = %s
        """,
        tuple(params),
    )
    conn.commit()
    
    # Возвращаем обновленные данные
    row = fetchone(
        conn,
        "SELECT id, email, display_name FROM users WHERE id = %s",
        (user.user_id,),
    )
    
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "display_name": row.get("display_name"),
    }


@router.get("/workspaces/{workspace_id}/members/for-settings")
def list_workspace_members_for_settings(
    workspace_id: str,
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
) -> list[dict]:
    """Получить список участников workspace для страницы настроек.
    
    Только владелец может видеть всех участников.
    """
    # Проверяем, что пользователь является владельцем
    membership = fetchone(
        conn,
        "SELECT role FROM workspace_memberships WHERE workspace_id=%s AND user_id=%s AND deleted_at IS NULL",
        (workspace_id, user.user_id),
    )
    if not membership or membership.get("role") != "owner":
        raise HTTPException(
            status_code=403,
            detail={"code": "FORBIDDEN", "message": "Только владелец может просматривать участников"},
        )
    
    # Получаем workspace_id из параметра пути
    
    rows = fetchall(
        conn,
        """
        SELECT 
            u.id, u.email, u.display_name, m.role, m.is_active
        FROM workspace_memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = %s AND m.deleted_at IS NULL
        ORDER BY 
            CASE m.role
                WHEN 'owner' THEN 1
                WHEN 'assistant' THEN 2
                WHEN 'collaborator' THEN 3
            END,
            u.email ASC
        """,
        (workspace_id,),
    )
    
    return [
        {
            "id": str(row["id"]),
            "email": row["email"],
            "display_name": row.get("display_name"),
            "role": row["role"],
            "is_active": bool(row["is_active"]),
        }
        for row in rows
    ]


@router.patch("/workspaces/{workspace_id}/members/{user_id}")
def update_workspace_member(
    workspace_id: str,
    user_id: str,
    payload: UserUpdateRequest,
    user: UserPrincipal = Depends(get_current_user),
    conn=Depends(get_db),
) -> dict:
    """Обновить информацию об участнике workspace (email, пароль).
    
    Только владелец может обновлять участников.
    """
    # Проверяем, что пользователь является владельцем
    membership = fetchone(
        conn,
        "SELECT role FROM workspace_memberships WHERE workspace_id=%s AND user_id=%s AND deleted_at IS NULL",
        (workspace_id, user.user_id),
    )
    if not membership or membership.get("role") != "owner":
        raise HTTPException(
            status_code=403,
            detail={"code": "FORBIDDEN", "message": "Только владелец может обновлять участников"},
        )
    
    # Получаем workspace_id из параметра пути
    
    # Проверяем, что участник существует в workspace
    membership = fetchone(
        conn,
        """
        SELECT m.role
        FROM workspace_memberships m
        WHERE m.workspace_id = %s AND m.user_id = %s AND m.deleted_at IS NULL
        """,
        (workspace_id, user_id),
    )
    
    if not membership:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "Участник не найден в workspace"},
        )
    
    # Обновляем данные пользователя
    updates = []
    params = []
    
    if payload.email is not None:
        # Проверяем, что email не занят другим пользователем
        existing = fetchone(
            conn,
            "SELECT id FROM users WHERE email = %s AND id != %s",
            (payload.email, user_id),
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail={"code": "EMAIL_EXISTS", "message": "Email уже используется другим пользователем"},
            )
        updates.append("email = %s")
        params.append(payload.email)
    
    if payload.password is not None:
        if len(payload.password) < 8:
            raise HTTPException(
                status_code=422,
                detail={"code": "VALIDATION_ERROR", "message": "Пароль должен содержать минимум 8 символов"},
            )
        password_hash = _hash_password(payload.password)
        updates.append("password_hash = %s")
        params.append(password_hash)
    
    if payload.display_name is not None:
        updates.append("display_name = %s")
        params.append(payload.display_name)
    
    if not updates:
        raise HTTPException(
            status_code=422,
            detail={"code": "VALIDATION_ERROR", "message": "Не указаны поля для обновления"},
        )
    
    updates.append("updated_at = NOW()")
    params.append(user_id)
    
    execute(
        conn,
        f"""
        UPDATE users
        SET {', '.join(updates)}
        WHERE id = %s
        """,
        tuple(params),
    )
    conn.commit()
    
    # Возвращаем обновленные данные
    row = fetchone(
        conn,
        """
        SELECT u.id, u.email, u.display_name, m.role, m.is_active
        FROM users u
        JOIN workspace_memberships m ON m.user_id = u.id
        WHERE u.id = %s AND m.workspace_id = %s AND m.deleted_at IS NULL
        """,
        (user_id, workspace_id),
    )
    
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "display_name": row.get("display_name"),
        "role": row["role"],
        "is_active": bool(row["is_active"]),
    }
