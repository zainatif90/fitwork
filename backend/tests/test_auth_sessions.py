"""
Login limits that a fake IP header cannot bypass, and sessions that really end on logout / password reset.
Each test reproduces a bug found in the 1 November 2026 review (BUG-01, 02, 07, 08, 09, 10, 26).
"""
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.core.config import settings
from app.core.deps import client_ip
from app.main import app
from app.services import email as email_service
from app.services import sessions
from tests.conftest import auth_header, register

LOGIN = "/api/auth/login"


def fake_ip(i: int) -> dict[str, str]:
    return {"X-Forwarded-For": f"203.0.113.{i}"}


@pytest.fixture
def outbox(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    sent: list[dict] = []
    monkeypatch.setattr(email_service, "send_email", lambda to, subject, text, html: sent.append({"to": to, "text": text}))
    return sent


def test_client_ip_ignores_what_the_visitor_writes() -> None:
    def req(headers: dict[str, str]) -> Request:
        raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
        return Request({"type": "http", "headers": raw, "client": ("10.0.0.1", 1234)})

    # The proxy appends the real IP at the END; the first entry is whatever the visitor sent
    assert client_ip(req({"X-Forwarded-For": "1.2.3.4, 198.51.100.7"})) == "198.51.100.7"
    assert client_ip(req({"CF-Connecting-IP": "198.51.100.9", "X-Forwarded-For": "1.2.3.4"})) == "198.51.100.9"
    assert client_ip(req({})) == "10.0.0.1"


def test_bug01_fake_ip_headers_cannot_bypass_the_login_limit(client: TestClient) -> None:
    register(client, email="victim@example.com")
    codes = [client.post(LOGIN, headers=fake_ip(i), json={"email": "victim@example.com", "password": "Wrong1234"}).status_code
             for i in range(13)]
    assert codes[:settings.LOGIN_FAILS_PER_EMAIL] == [401] * settings.LOGIN_FAILS_PER_EMAIL
    assert set(codes[settings.LOGIN_FAILS_PER_EMAIL:]) == {429}
    # Even the right password is refused while the account is locked (no unlimited guessing)
    assert client.post(LOGIN, headers=fake_ip(99), json={"email": "victim@example.com", "password": "Secret123"}).status_code == 429


def test_bug02_reset_emails_limited_per_address_whatever_the_ip(client: TestClient, outbox: list[dict]) -> None:
    register(client, email="target@example.com")
    outbox.clear()  # the verification email
    codes = [client.post("/api/auth/forgot-password", headers=fake_ip(i), json={"email": "target@example.com"}).status_code
             for i in range(8)]
    assert codes == [200, 200, 200] + [429] * 5
    assert len(outbox) == 3


def test_bug09_only_failed_logins_count(client: TestClient) -> None:
    register(client, email="forgetful@example.com")
    for _ in range(3):  # forgot the password
        assert client.post(LOGIN, json={"email": "forgetful@example.com", "password": "Wrong1234"}).status_code == 401
    assert client.post(LOGIN, json={"email": "forgetful@example.com", "password": "Typo12345"}).status_code == 401
    assert client.post(LOGIN, json={"email": "forgetful@example.com", "password": "Secret123"}).status_code == 200
    # Six correct logins in a minute are fine (a success also clears the counters)
    assert all(client.post(LOGIN, json={"email": "forgetful@example.com", "password": "Secret123"}).status_code == 200
               for _ in range(6))


def test_bug08_logout_ends_the_session_at_once(client: TestClient) -> None:
    register(client, email="leaver@example.com")
    res = client.post(LOGIN, json={"email": "leaver@example.com", "password": "Secret123"})
    access, cookie = res.json()["access_token"], client.cookies.get(settings.REFRESH_COOKIE_NAME)
    assert client.get("/api/auth/me", headers=auth_header(access)).status_code == 200

    assert client.post("/api/auth/logout", headers=auth_header(access)).status_code == 200
    assert client.get("/api/auth/me", headers=auth_header(access)).status_code == 401  # copied access token
    client.cookies.set(settings.REFRESH_COOKIE_NAME, cookie or "", path="/api/auth")
    assert client.post("/api/auth/refresh").status_code == 401                          # copied refresh cookie


def test_bug08_old_refresh_token_stops_working_after_rotation(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sessions, "ROTATION_GRACE", timedelta(0))
    register(client, email="rotate@example.com")
    first = client.cookies.get(settings.REFRESH_COOKIE_NAME)
    assert client.post("/api/auth/refresh").status_code == 200
    second = client.cookies.get(settings.REFRESH_COOKIE_NAME)
    assert first != second

    client.cookies.set(settings.REFRESH_COOKIE_NAME, first or "", path="/api/auth")
    assert client.post("/api/auth/refresh").status_code == 401   # the old token is refused...
    client.cookies.set(settings.REFRESH_COOKIE_NAME, second or "", path="/api/auth")
    assert client.post("/api/auth/refresh").status_code == 401   # ...and its reuse ended the session (theft check)


def test_two_tabs_refreshing_at_the_same_moment_both_work(client: TestClient) -> None:
    register(client, email="tabs@example.com")
    cookie = client.cookies.get(settings.REFRESH_COOKIE_NAME)
    assert client.post("/api/auth/refresh").status_code == 200
    client.cookies.set(settings.REFRESH_COOKIE_NAME, cookie or "", path="/api/auth")  # tab 2 still sends the old one
    assert client.post("/api/auth/refresh").status_code == 200


def test_bug07_password_reset_logs_out_other_devices_at_once(client: TestClient, outbox: list[dict]) -> None:
    device_a = register(client, email="stolen@example.com", password="OldPass123")["access_token"]
    client.post("/api/auth/forgot-password", json={"email": "stolen@example.com"})
    token = next(m["text"] for m in outbox if "reset-password" in m["text"]).split("token=")[1].split()[0]
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "NewPass456"}).status_code == 200
    assert client.get("/api/auth/me", headers=auth_header(device_a)).status_code == 401


def test_bug10_long_urdu_password_gets_a_clear_message(client: TestClient) -> None:
    password = "پاکستان" * 6 + "1"  # 43 characters, 85 bytes
    assert len(password) <= 72 < len(password.encode())
    res = client.post("/api/auth/register", json={"email": "urdu@example.com", "password": password, "full_name": "Ali"})
    assert res.status_code == 422
    assert "too long" in res.text


@pytest.mark.integration  # builds its own TestClient (to keep the 500 response)
def test_bug10_server_errors_keep_cors_headers(monkeypatch: pytest.MonkeyPatch) -> None:
    """Without CORS headers the browser hides a 500 and the app wrongly says 'Cannot reach the server'."""
    from app.routers import profile as profile_router

    def boom(*args: object, **kwargs: object) -> None:
        raise RuntimeError("internal detail")

    monkeypatch.setattr(profile_router, "get_profile", boom)
    origin = {"Origin": "http://localhost:5173"}
    with TestClient(app, raise_server_exceptions=False) as c:
        token = register(c, email="cors500@example.com")["access_token"]
        res = c.get("/api/profile/me", headers={**auth_header(token), **origin})
    assert res.status_code == 500
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert res.json() == {"detail": "Something went wrong. Please try again."}


def test_bug26_health_answers_head_and_get(client: TestClient) -> None:
    assert client.head("/api/health").status_code == 200
    assert client.get("/api/health").json() == {"status": "ok"}


def test_signups_are_limited_per_ip(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "REGISTER_PER_IP_HOUR", 2)
    register(client, email="one@example.com")
    register(client, email="two@example.com")
    res = client.post("/api/auth/register", json={"email": "three@example.com", "password": "Secret123", "full_name": "Three"})
    assert res.status_code == 429
