"""
FastAPI dependencies for authentication and role checks.

Usage in a route:
    user: User = Depends(get_current_user)
    user: User = Depends(require_roles("agency_owner"))
"""
import uuid
from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token_payload
from app.models.session import AuthSession
from app.models.user import User
from app.services.sessions import is_active

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
    payload = decode_token_payload(creds.credentials, "access")
    if payload is None:
        raise _unauthorized
    try:
        user = db.get(User, uuid.UUID(payload["sub"]))
        session = db.get(AuthSession, uuid.UUID(str(payload.get("sid"))))
    except (KeyError, ValueError):
        raise _unauthorized
    # The login session must still be open: logout and password reset end it immediately.
    if user is None or not is_active(session, user.id):
        raise _unauthorized
    return user


def client_ip(request: Request) -> str:
    """
    The visitor's real IP, for rate limits. Never the first X-Forwarded-For entry: the visitor writes
    that one themselves (seen in testing: a new fake IP per request bypassed the login limit).
    - CF-Connecting-IP: set by Cloudflare, which sits in front of Render; visitors cannot override it.
    - Otherwise the LAST X-Forwarded-For entry, which the proxy nearest to us appended.
    """
    cf = request.headers.get("cf-connecting-ip", "").strip()
    if cf:
        return cf
    forwarded = [part.strip() for part in request.headers.get("x-forwarded-for", "").split(",") if part.strip()]
    if forwarded:
        return forwarded[-1]
    return request.client.host if request.client else "unknown"


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
