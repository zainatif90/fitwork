"""
Authentication routes: register, login, refresh, logout, me, verify email.

Token flow:
1. Login returns an access token (24h) in the JSON body and sets a refresh token (7d)
   in an httpOnly cookie that JavaScript cannot read.
2. The frontend keeps the access token in memory and sends it as `Authorization: Bearer`.
3. When the access token expires (or the page reloads), the frontend calls /auth/refresh;
   the browser sends the cookie automatically and gets a new access token back.
"""
import logging
import uuid

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.redis_client import hit_rate_limit
from app.core.security import (
    create_access_token,
    create_refresh_token,
    create_reset_token,
    create_verify_token,
    decode_token,
    decode_token_payload,
    hash_password,
    password_fingerprint,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordIn,
    LoginIn,
    MessageOut,
    RegisterIn,
    ResetPasswordIn,
    TokenOut,
    UserOut,
)
from app.services import email

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = settings.REFRESH_COOKIE_NAME
COOKIE_PATH = "/api/auth"  # the cookie is only sent to auth routes


def _write_refresh_cookie(response: Response, value: str, max_age: int) -> None:
    """
    Set (max_age > 0) or delete (max_age = 0) the refresh cookie.
    Options must be identical when setting and deleting, or the browser keeps the old cookie.
    """
    cross_site = settings.COOKIE_SAMESITE == "none"
    secure = settings.is_production or cross_site  # HTTPS only (always required with SameSite=None)
    if settings.COOKIE_PARTITIONED:
        # Website and API on different domains (Firebase + Render): a "partitioned" cookie is stored
        # only for our website, so it works where browsers block ordinary third-party cookies.
        # Python 3.11's cookie library cannot write this attribute, so the header is built by hand.
        parts = [f"{REFRESH_COOKIE}={value}", f"Max-Age={max_age}", f"Path={COOKIE_PATH}", "HttpOnly",
                 "Secure", f"SameSite={settings.COOKIE_SAMESITE.capitalize()}", "Partitioned"]
        if max_age == 0:
            parts.insert(2, "Expires=Thu, 01 Jan 1970 00:00:00 GMT")
        response.headers.append("set-cookie", "; ".join(parts))
    else:
        response.set_cookie(
            key=REFRESH_COOKIE, value=value, max_age=max_age, path=COOKIE_PATH,
            httponly=True,                     # JavaScript cannot read it (protects against XSS theft)
            secure=secure,
            samesite=settings.COOKIE_SAMESITE,  # "lax" = not sent on cross-site POSTs (CSRF protection)
        )


def _set_refresh_cookie(response: Response, user: User) -> None:
    _write_refresh_cookie(response, create_refresh_token(str(user.id), user.password_hash),
                          settings.REFRESH_TOKEN_DAYS * 24 * 3600)


def _token_response(response: Response, user: User) -> TokenOut:
    _set_refresh_cookie(response, user)
    return TokenOut(access_token=create_access_token(str(user.id)), user=UserOut.model_validate(user))


def send_verification_email(user: User) -> None:
    """Email the verification link (printed to the console in development, see services/email.py)."""
    link = f"{settings.FRONTEND_URL}/verify?token={create_verify_token(str(user.id))}"
    email.send_verification(user.email, user.full_name.split()[0], link)


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, response: Response, db: Session = Depends(get_db)) -> TokenOut:
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    user = User(
        email=email,
        full_name=data.full_name,
        password_hash=hash_password(data.password),
        role=data.role,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # two requests racing with the same email
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")
    db.refresh(user)

    send_verification_email(user)
    return _token_response(response, user)


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)) -> TokenOut:
    email = data.email.lower()
    client_ip = request.client.host if request.client else "unknown"
    if hit_rate_limit(f"rl:login:{client_ip}:{email}", settings.LOGIN_RATE_LIMIT_PER_MIN, 60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please wait a minute and try again.",
        )

    # SQLAlchemy sends the email as a bound parameter, never as raw SQL text,
    # so input like "' OR 1=1 --" is treated as a plain string.
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(data.password, user.password_hash):
        # Same message for both cases so attackers cannot tell which emails exist.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return _token_response(response, user)


@router.post("/refresh", response_model=TokenOut)
def refresh(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
) -> TokenOut:
    payload = decode_token_payload(refresh_token, "refresh") if refresh_token else None
    user = db.get(User, uuid.UUID(payload["sub"])) if payload else None
    # The token remembers which password it was issued for: after a password reset it stops working.
    if user is None or payload.get("pwd") != password_fingerprint(user.password_hash):  # type: ignore[union-attr]
        _write_refresh_cookie(response, "", 0)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired, please log in again")
    # Rotate: a fresh refresh cookie is issued every time.
    return _token_response(response, user)


@router.post("/logout", response_model=MessageOut)
def logout(response: Response) -> MessageOut:
    _write_refresh_cookie(response, "", 0)
    return MessageOut(message="Logged out")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.get("/verify", response_model=MessageOut)
def verify_email(token: str, db: Session = Depends(get_db)) -> MessageOut:
    user_id = decode_token(token, "verify")
    user = db.get(User, uuid.UUID(user_id)) if user_id else None
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification link")
    if not user.is_verified:
        user.is_verified = True
        db.commit()
    return MessageOut(message="Email verified")


@router.post("/resend-verification", response_model=MessageOut)
def resend_verification(user: User = Depends(get_current_user)) -> MessageOut:
    if user.is_verified:
        return MessageOut(message="Email already verified")
    if hit_rate_limit(f"rl:verify:{user.id}", 3, 3600):
        raise HTTPException(status_code=429, detail="Too many emails. Please try again in an hour.")
    send_verification_email(user)
    return MessageOut(message="Verification link sent")


FORGOT_MESSAGE = "If an account exists for that email, we have sent a link to reset the password."


@router.post("/forgot-password", response_model=MessageOut)
def forgot_password(data: ForgotPasswordIn, request: Request, db: Session = Depends(get_db)) -> MessageOut:
    """Always answers the same way, so nobody can use this form to find out which emails are registered."""
    email_addr = data.email.lower()
    client_ip = request.client.host if request.client else "unknown"
    if hit_rate_limit(f"rl:forgot:{client_ip}:{email_addr}", settings.RESET_REQUESTS_PER_HOUR, 3600):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again in an hour.")
    user = db.scalar(select(User).where(User.email == email_addr))
    if user is not None:
        token = create_reset_token(str(user.id), user.password_hash)
        email.send_password_reset(user.email, user.full_name.split()[0], f"{settings.FRONTEND_URL}/reset-password?token={token}")
    return MessageOut(message=FORGOT_MESSAGE)


@router.post("/reset-password", response_model=MessageOut)
def reset_password(data: ResetPasswordIn, db: Session = Depends(get_db)) -> MessageOut:
    payload = decode_token_payload(data.token, "reset")
    user = db.get(User, uuid.UUID(payload["sub"])) if payload else None
    # The link only works for the password it was created for, so it can be used once.
    if user is None or payload.get("pwd") != password_fingerprint(user.password_hash):  # type: ignore[union-attr]
        raise HTTPException(status_code=400, detail="This reset link is invalid or has already been used")
    user.password_hash = hash_password(data.password)
    user.is_verified = True  # they proved they can read this mailbox
    db.commit()
    return MessageOut(message="Password changed. You can now log in with your new password.")
