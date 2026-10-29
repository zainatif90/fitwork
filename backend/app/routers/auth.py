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
    create_verify_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import LoginIn, MessageOut, RegisterIn, TokenOut, UserOut

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

# Firebase Hosting only forwards a cookie named "__session" to Cloud Run, so the name is configurable.
REFRESH_COOKIE = settings.REFRESH_COOKIE_NAME


def _set_refresh_cookie(response: Response, user_id: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=create_refresh_token(user_id),
        max_age=settings.REFRESH_TOKEN_DAYS * 24 * 3600,
        httponly=True,                    # JavaScript cannot read it (protects against XSS theft)
        secure=settings.is_production,    # HTTPS only in production
        samesite="lax",                   # not sent on cross-site POSTs (CSRF protection)
        path="/api/auth",                 # only sent to auth routes
    )


def _token_response(response: Response, user: User) -> TokenOut:
    _set_refresh_cookie(response, str(user.id))
    return TokenOut(access_token=create_access_token(str(user.id)), user=UserOut.model_validate(user))


def send_verification_email(user: User) -> None:
    """In development we print the link to the console instead of sending a real email."""
    token = create_verify_token(str(user.id))
    link = f"{settings.FRONTEND_URL}/verify?token={token}"
    log.info("Email verification link for %s: %s", user.email, link)
    print(f"\n[DEV EMAIL] Verify {user.email}: {link}\n", flush=True)


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
    user_id = decode_token(refresh_token, "refresh") if refresh_token else None
    user = db.get(User, uuid.UUID(user_id)) if user_id else None
    if user is None:
        response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired, please log in again")
    # Rotate: a fresh refresh cookie is issued every time.
    return _token_response(response, user)


@router.post("/logout", response_model=MessageOut)
def logout(response: Response) -> MessageOut:
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
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
    send_verification_email(user)
    return MessageOut(message="Verification link sent")
