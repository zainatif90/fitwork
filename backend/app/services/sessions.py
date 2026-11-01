"""
Login sessions (one per device), so the server can end a session immediately.

- Login / sign-up: start_session() creates a session and issues an access + refresh token for it.
- Refresh: rotate() swaps the refresh token for a new one; the old one stops working.
- Logout: revoke() ends this device's session (its access token stops working too).
- Password reset: revoke_all() ends the user's sessions on every device.
get_current_user (core/deps.py) checks the session on every request.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token
from app.models.session import AuthSession
from app.models.user import User

ROTATION_GRACE = timedelta(seconds=30)  # two tabs refreshing at the same moment both succeed


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _tokens(user: User, session: AuthSession) -> tuple[str, str]:
    sid = str(session.id)
    return (create_access_token(str(user.id), sid),
            create_refresh_token(str(user.id), user.password_hash, sid, session.refresh_jti))


def start_session(db: Session, user: User) -> tuple[str, str]:
    """Create a session for a new login. Returns (access_token, refresh_token)."""
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id, AuthSession.expires_at < _now()))
    session = AuthSession(id=uuid.uuid4(), user_id=user.id, refresh_jti=uuid.uuid4().hex,
                          expires_at=_now() + timedelta(days=settings.REFRESH_TOKEN_DAYS))
    db.add(session)
    db.commit()
    return _tokens(user, session)


def is_active(session: AuthSession | None, user_id: uuid.UUID) -> bool:
    return (session is not None and session.user_id == user_id and session.revoked_at is None
            and session.expires_at > _now())


def rotate(db: Session, user: User, payload: dict[str, Any]) -> tuple[str, str] | None:
    """Exchange a valid refresh token for new tokens. Returns None if the session is over."""
    try:
        session = db.get(AuthSession, uuid.UUID(str(payload.get("sid"))))
    except ValueError:
        return None
    if not is_active(session, user.id):
        return None
    assert session is not None
    jti = payload.get("jti")
    if jti == session.refresh_jti:
        session.previous_jti, session.refresh_jti, session.rotated_at = session.refresh_jti, uuid.uuid4().hex, _now()
        db.commit()
    elif not (jti == session.previous_jti and session.rotated_at and _now() - session.rotated_at < ROTATION_GRACE):
        # An old refresh token was used again: it may have been stolen, so end the session.
        session.revoked_at = _now()
        db.commit()
        return None
    return _tokens(user, session)


def revoke(db: Session, session_id: Any) -> None:
    try:
        sid = uuid.UUID(str(session_id))
    except ValueError:
        return
    db.execute(update(AuthSession).where(AuthSession.id == sid, AuthSession.revoked_at.is_(None))
               .values(revoked_at=_now()))
    db.commit()


def revoke_all(db: Session, user_id: uuid.UUID) -> None:
    db.execute(update(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
               .values(revoked_at=_now()))
