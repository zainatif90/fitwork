"""Authentication tests (SRS TC-1 registration, TC-2 duplicate email, TC-8 SQL injection on login)."""
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.user import User
from tests.conftest import auth_header, register


def test_register_creates_user_with_hashed_password(client: TestClient, db: Session) -> None:
    body = register(client, email="Sara@Example.com")
    assert body["access_token"]
    assert body["user"]["email"] == "sara@example.com"  # stored lowercase
    assert body["user"]["role"] == "freelancer"
    assert body["user"]["is_verified"] is False

    user = db.scalar(select(User).where(User.email == "sara@example.com"))
    assert user is not None
    assert user.password_hash != "Secret123"
    assert user.password_hash.startswith("$2b$12$")  # bcrypt, cost 12
    # Refresh token is set as an httpOnly cookie, not returned in the body
    assert "refresh_token" not in body


def test_register_agency_owner(client: TestClient) -> None:
    body = register(client, role="agency_owner")
    assert body["user"]["role"] == "agency_owner"


def test_register_cannot_choose_agency_member_role(client: TestClient) -> None:
    res = client.post("/api/auth/register", json={
        "email": "x@example.com", "password": "Secret123", "role": "agency_member", "full_name": "X Y",
    })
    assert res.status_code == 422


def test_register_rejects_weak_password_and_bad_email(client: TestClient) -> None:
    weak = client.post("/api/auth/register", json={
        "email": "a@example.com", "password": "short", "full_name": "A B"})
    assert weak.status_code == 422
    bad_email = client.post("/api/auth/register", json={
        "email": "not-an-email", "password": "Secret123", "full_name": "A B"})
    assert bad_email.status_code == 422


def test_duplicate_email_is_rejected(client: TestClient, db: Session) -> None:
    register(client, email="dup@example.com")
    res = client.post("/api/auth/register", json={
        "email": "DUP@example.com", "password": "Other1234", "full_name": "Someone Else"})
    assert res.status_code == 409
    assert "already registered" in res.json()["detail"]
    assert db.scalar(select(func.count()).select_from(User)) == 1


def test_login_success_returns_token_and_cookie(client: TestClient) -> None:
    register(client, email="login@example.com")
    client.cookies.clear()
    res = client.post("/api/auth/login", json={"email": "login@example.com", "password": "Secret123"})
    assert res.status_code == 200
    assert res.json()["access_token"]
    assert "fitwork_refresh" in res.cookies


def test_login_wrong_password(client: TestClient) -> None:
    register(client, email="wrong@example.com")
    res = client.post("/api/auth/login", json={"email": "wrong@example.com", "password": "NotIt999"})
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid email or password"


def test_login_unknown_email_same_message(client: TestClient) -> None:
    res = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "Secret123"})
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid email or password"


def test_me_requires_valid_token(client: TestClient) -> None:
    body = register(client)
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers=auth_header("garbage")).status_code == 401
    me = client.get("/api/auth/me", headers=auth_header(body["access_token"]))
    assert me.status_code == 200
    assert me.json()["email"] == "sara@example.com"


def test_refresh_uses_cookie_and_rejects_without_it(client: TestClient) -> None:
    register(client)
    res = client.post("/api/auth/refresh")
    assert res.status_code == 200
    assert res.json()["access_token"]
    client.cookies.clear()
    assert client.post("/api/auth/refresh").status_code == 401


def test_refresh_token_cannot_be_used_as_access_token(client: TestClient) -> None:
    register(client)
    refresh_token = client.cookies.get("fitwork_refresh")
    assert refresh_token
    assert client.get("/api/auth/me", headers=auth_header(refresh_token)).status_code == 401


def test_email_verification(client: TestClient) -> None:
    from app.core.security import create_verify_token

    body = register(client)
    token = create_verify_token(body["user"]["id"])
    assert client.get("/api/auth/verify", params={"token": "bad"}).status_code == 400
    assert client.get("/api/auth/verify", params={"token": token}).status_code == 200
    me = client.get("/api/auth/me", headers=auth_header(body["access_token"]))
    assert me.json()["is_verified"] is True


def test_login_rate_limit(client: TestClient) -> None:
    register(client, email="rl@example.com")
    codes = [
        client.post("/api/auth/login", json={"email": "rl@example.com", "password": "Wrong1234"}).status_code
        for _ in range(6)
    ]
    assert codes[:5] == [401] * 5
    assert codes[5] == 429


def test_sql_injection_on_login_is_harmless(client: TestClient, db: Session) -> None:
    register(client, email="victim@example.com")
    payloads = [
        {"email": "victim@example.com", "password": "' OR '1'='1"},
        {"email": "victim@example.com' --", "password": "anything"},
        {"email": "' OR 1=1; DROP TABLE users; --", "password": "x"},
    ]
    for p in payloads:
        res = client.post("/api/auth/login", json=p)
        assert res.status_code in (401, 422), res.text
        assert "access_token" not in res.text
    # Table still exists and still has exactly one user
    assert db.scalar(select(func.count()).select_from(User)) == 1


def test_security_headers_present(client: TestClient) -> None:
    res = client.get("/api/health")
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"


def test_partitioned_cross_site_cookie(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """Website and API on different domains: the refresh cookie must be SameSite=None; Secure; Partitioned."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "COOKIE_SAMESITE", "none")
    monkeypatch.setattr(settings, "COOKIE_PARTITIONED", True)
    res = client.post("/api/auth/register", json={"email": "cross@example.com", "password": "Secret123",
                                                  "full_name": "Cross Site"})
    assert res.status_code == 201
    cookie = res.headers["set-cookie"]
    for part in ("fitwork_refresh=ey", "Path=/api/auth", "HttpOnly", "Secure", "SameSite=None", "Partitioned"):
        assert part in cookie
    out = client.post("/api/auth/logout")
    assert "Max-Age=0" in out.headers["set-cookie"] and "Partitioned" in out.headers["set-cookie"]
