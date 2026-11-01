"""
Authentication routes: register, login, refresh, logout, me, verify email.

Token flow:
1. Login starts a session (one per device) and returns an access token (24h) in the JSON body and
   a refresh token (7d) in an httpOnly cookie that JavaScript cannot read. Both carry the session id.
2. The frontend keeps the access token in memory and sends it as `Authorization: Bearer`.
3. When the access token expires (or the page reloads), the frontend calls /auth/refresh;
   the browser sends the cookie automatically and gets a new access token (and a new refresh token) back.
4. Logout ends this device's session; a password reset ends every session of the user (services/sessions.py).

Rate limits (counted per email, so a fake IP header cannot get around them):
- login: 5 failed attempts per minute per IP + email, and 10 failed attempts per 15 minutes per email.
  Only FAILED attempts count, and a successful login or password reset clears the counters.
- forgot password: 3 emails per hour per address, 20 requests per hour per IP.
- register: 10 sign-ups per hour per IP.
"""
import logging
import uuid

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import bearer_scheme, client_ip, get_current_user
from app.core.redis_client import cache_delete, hit_rate_limit, is_rate_limited
from app.core.security import (
    burn_password_check,
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
from app.services import email, sessions

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


def _tokens_out(response: Response, user: User, tokens: tuple[str, str]) -> TokenOut:
    access_token, refresh_token = tokens
    _write_refresh_cookie(response, refresh_token, settings.REFRESH_TOKEN_DAYS * 24 * 3600)
    return TokenOut(access_token=access_token, user=UserOut.model_validate(user))


def _login_keys(request: Request, email_addr: str) -> tuple[str, str]:
    return f"rl:login:{client_ip(request)}:{email_addr}", f"rl:login-email:{email_addr}"


def send_verification_email(user: User) -> None:
    """Email the verification link (printed to the console in development, see services/email.py)."""
    link = f"{settings.FRONTEND_URL}/verify?token={create_verify_token(str(user.id))}"
    email.send_verification(user.email, user.full_name.split()[0], link)


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)) -> TokenOut:
    if hit_rate_limit(f"rl:register:{client_ip(request)}", settings.REGISTER_PER_IP_HOUR, 3600):
        raise HTTPException(status_code=429, detail="Too many sign-ups from your network. Please try again in an hour.")
    email_addr = data.email.lower()
    if db.scalar(select(User).where(User.email == email_addr)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    user = User(
        email=email_addr,
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
    return _tokens_out(response, user, sessions.start_session(db, user))


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)) -> TokenOut:
    email_addr = data.email.lower()
    ip_key, email_key = _login_keys(request, email_addr)
    if is_rate_limited(ip_key, settings.LOGIN_RATE_LIMIT_PER_MIN):
        raise HTTPException(status_code=429, detail="Too many login attempts. Please wait a minute and try again.")
    if is_rate_limited(email_key, settings.LOGIN_FAILS_PER_EMAIL):
        raise HTTPException(status_code=429, detail="Too many failed logins for this account. "
                                                    "Please wait 15 minutes or reset your password.")

    # SQLAlchemy sends the email as a bound parameter, never as raw SQL text,
    # so input like "' OR 1=1 --" is treated as a plain string.
    user = db.scalar(select(User).where(User.email == email_addr))
    if user is None:
        burn_password_check(data.password)  # same response time whether or not the email exists
    if user is None or not verify_password(data.password, user.password_hash):
        hit_rate_limit(ip_key, settings.LOGIN_RATE_LIMIT_PER_MIN, 60)
        hit_rate_limit(email_key, settings.LOGIN_FAILS_PER_EMAIL, settings.LOGIN_FAILS_WINDOW_SEC)
        # Same message for both cases so attackers cannot tell which emails exist.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    cache_delete(ip_key, email_key)  # only failed attempts count towards the limit
    return _tokens_out(response, user, sessions.start_session(db, user))


@router.post("/refresh", response_model=TokenOut)
def refresh(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
) -> TokenOut:
    payload = decode_token_payload(refresh_token, "refresh") if refresh_token else None
    user = db.get(User, uuid.UUID(payload["sub"])) if payload else None
    tokens = None
    # The token remembers which password it was issued for: after a password reset it stops working.
    if user is not None and payload.get("pwd") == password_fingerprint(user.password_hash):  # type: ignore[union-attr]
        tokens = sessions.rotate(db, user, payload)  # type: ignore[arg-type]
    if user is None or tokens is None:
        _write_refresh_cookie(response, "", 0)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired, please log in again")
    return _tokens_out(response, user, tokens)


@router.post("/logout", response_model=MessageOut)
def logout(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> MessageOut:
    """End this device's session: its refresh cookie and its access token stop working at once."""
    for token, kind in ((refresh_token, "refresh"), (creds.credentials if creds else None, "access")):
        payload = decode_token_payload(token, kind) if token else None  # type: ignore[arg-type]
        if payload:
            sessions.revoke(db, payload.get("sid"))
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
    too_many = "Too many requests. Please try again in an hour."
    if hit_rate_limit(f"rl:forgot-ip:{client_ip(request)}", settings.RESET_REQUESTS_PER_IP_HOUR, 3600):
        raise HTTPException(status_code=429, detail=too_many)
    # Per address, whatever the IP: one person's inbox cannot be flooded with reset emails.
    if hit_rate_limit(f"rl:forgot:{email_addr}", settings.RESET_REQUESTS_PER_HOUR, 3600):
        raise HTTPException(status_code=429, detail=too_many)
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
    sessions.revoke_all(db, user.id)  # logs the user out on every device, at once
    db.commit()
    cache_delete(f"rl:login-email:{user.email}")  # earlier failed logins no longer lock them out
    return MessageOut(message="Password changed. You can now log in with your new password.")
