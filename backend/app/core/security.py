from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Header, HTTPException
from jose import JWTError, jwt

from app.core.config import settings


@dataclass(frozen=True)
class UserPrincipal:
    user_id: str
    email: str
    display_name: Optional[str] = None


def decode_bearer_token(authorization: Optional[str]) -> UserPrincipal:
    """Decode a JWT Bearer token and return the principal.

    Contract note: auth is not the core focus of this starter. The backend enforces
    membership + permissions at the service layer.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Отсутствует Bearer токен"})

    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_alg],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            options={"verify_sub": True},
        )
    except JWTError:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Неверный токен"})

    user_id = payload.get("sub")
    email = payload.get("email")
    display_name = payload.get("name")

    if not user_id or not email:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "В токене отсутствуют обязательные поля"})

    return UserPrincipal(user_id=str(user_id), email=str(email), display_name=str(display_name) if display_name else None)


def get_authorization_header(authorization: Optional[str] = Header(default=None)) -> Optional[str]:
    return authorization
