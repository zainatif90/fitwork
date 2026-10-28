"""
FastAPI dependencies for authentication and role checks.

Usage in a route:
    user: User = Depends(get_current_user)
    user: User = Depends(require_roles("agency_owner"))
"""
import uuid
from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)

_unauthorized = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise _unauthorized
    user_id = decode_token(creds.credentials, "access")
    if user_id is None:
        raise _unauthorized
    try:
        user = db.get(User, uuid.UUID(user_id))
    except ValueError:
        raise _unauthorized
    if user is None:
        raise _unauthorized
    return user


def require_roles(*roles: str) -> Callable[..., User]:
    """Dependency factory: only users whose role is in `roles` may call the route."""

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed for your role")
        return user

    return checker


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user
