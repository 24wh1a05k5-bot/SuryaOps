"""Request dependencies: current user and role checks (RBAC)."""
import jwt
from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AppError
from app.core.security import decode_token
from app.models import User


def get_current_user(
    authorization: str | None = Header(default=None), db: Session = Depends(get_db)
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AppError("UNAUTHENTICATED", "Please sign in.", 401)
    try:
        payload = decode_token(authorization.split(" ", 1)[1])
    except jwt.ExpiredSignatureError:
        raise AppError("SESSION_EXPIRED", "Your session has expired. Please sign in again.", 401)
    except jwt.PyJWTError:
        raise AppError("UNAUTHENTICATED", "Invalid session. Please sign in again.", 401)
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise AppError("UNAUTHENTICATED", "Account not found or disabled.", 401)
    return user


def require_roles(*roles: str):
    """Admin can do everything; other roles must be listed."""

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role != "admin" and user.role not in roles:
            raise AppError("FORBIDDEN", "Your role doesn't have access to this action.", 403,
                           {"required": list(roles), "role": user.role})
        return user

    return checker
