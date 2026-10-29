"""
Password hashing and JWT helpers.

- Passwords are hashed with bcrypt (cost 12). bcrypt adds a random salt, so the same
  password gives a different hash every time, and checking is deliberately slow.
- JWTs are signed with JWT_SECRET. Each token has a `type` claim so a refresh token
  can never be used as an access token (and vice versa).
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import bcrypt
import jwt

from app.core.config import settings

TokenType = Literal["access", "refresh", "verify", "reset"]


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def password_fingerprint(password_hash: str) -> str:
    """
    Short fingerprint of the current password hash, stored inside refresh and reset tokens.
    When the password changes, the fingerprint changes, so every old refresh token (other
    devices) and the used reset link stop working automatically.
    """
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def _create_token(subject: str, token_type: TokenType, expires: timedelta, extra: dict[str, Any] | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + expires,
        "jti": uuid.uuid4().hex,  # unique id, so two tokens issued in the same second differ
        **(extra or {}),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: str) -> str:
    return _create_token(user_id, "access", timedelta(hours=settings.ACCESS_TOKEN_HOURS))


def create_refresh_token(user_id: str, password_hash: str) -> str:
    return _create_token(user_id, "refresh", timedelta(days=settings.REFRESH_TOKEN_DAYS),
                         {"pwd": password_fingerprint(password_hash)})


def create_verify_token(user_id: str) -> str:
    return _create_token(user_id, "verify", timedelta(hours=settings.VERIFY_TOKEN_HOURS))


def create_reset_token(user_id: str, password_hash: str) -> str:
    return _create_token(user_id, "reset", timedelta(minutes=settings.RESET_TOKEN_MINUTES),
                         {"pwd": password_fingerprint(password_hash)})


def decode_token_payload(token: str, expected_type: TokenType) -> dict[str, Any] | None:
    """Return all claims of a valid, unexpired token of the expected type, else None."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    return payload


def decode_token(token: str, expected_type: TokenType) -> str | None:
    """Return the user id inside a valid token of the expected type, else None."""
    payload = decode_token_payload(token, expected_type)
    return payload.get("sub") if payload else None


def new_random_token() -> str:
    """URL-safe random token (used for agency invites)."""
    return secrets.token_urlsafe(32)
