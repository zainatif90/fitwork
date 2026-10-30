"""Forgot / reset password and email tests."""
import re

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.services import email as email_service
from tests.conftest import auth_header, register


@pytest.fixture
def outbox(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    """Capture emails instead of sending them."""
    sent: list[dict] = []
    monkeypatch.setattr(email_service, "send_email",
                        lambda to, subject, text, html: sent.append({"to": to, "subject": subject, "text": text}))
    return sent


def reset_token_from(mail: dict) -> str:
    return re.search(r"reset-password\?token=(\S+)", mail["text"]).group(1)  # type: ignore[union-attr]


def test_register_sends_verification_email(client: TestClient, outbox: list[dict]) -> None:
    register(client, email="new@example.com", full_name="Nadia Rauf")
    assert len(outbox) == 1
    assert outbox[0]["to"] == "new@example.com"
    assert "Hi Nadia" in outbox[0]["text"] and "/verify?token=" in outbox[0]["text"]


def test_forgot_password_same_answer_for_unknown_email(client: TestClient, outbox: list[dict]) -> None:
    register(client, email="known@example.com")
    outbox.clear()
    known = client.post("/api/auth/forgot-password", json={"email": "known@example.com"})
    unknown = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()          # no way to tell which emails exist
    assert [m["to"] for m in outbox] == ["known@example.com"]


def test_reset_password_flow(client: TestClient, outbox: list[dict]) -> None:
    register(client, email="reset@example.com", password="OldPass123")
    other_device = client.cookies.get(settings.REFRESH_COOKIE_NAME)
    client.post("/api/auth/forgot-password", json={"email": "reset@example.com"})
    token = reset_token_from(outbox[-1])

    res = client.post("/api/auth/reset-password", json={"token": token, "password": "NewPass456"})
    assert res.status_code == 200
    # New password works, old one does not
    assert client.post("/api/auth/login", json={"email": "reset@example.com", "password": "NewPass456"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "reset@example.com", "password": "OldPass123"}).status_code == 401
    # The same link cannot be used twice
    again = client.post("/api/auth/reset-password", json={"token": token, "password": "Another789"})
    assert again.status_code == 400
    # Sessions on other devices are logged out (their refresh token was for the old password)
    client.cookies.clear()
    client.cookies.set(settings.REFRESH_COOKIE_NAME, other_device or "", path="/api/auth")
    assert client.post("/api/auth/refresh").status_code == 401


def test_reset_rejects_bad_token_and_weak_password(client: TestClient, outbox: list[dict]) -> None:
    register(client, email="weak@example.com")
    client.post("/api/auth/forgot-password", json={"email": "weak@example.com"})
    token = reset_token_from(outbox[-1])
    assert client.post("/api/auth/reset-password", json={"token": "x" * 40, "password": "NewPass456"}).status_code == 400
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "short"}).status_code == 422
    # An access token is not a reset token
    access = client.post("/api/auth/login", json={"email": "weak@example.com", "password": "Secret123"}).json()["access_token"]
    assert client.post("/api/auth/reset-password", json={"token": access, "password": "NewPass456"}).status_code == 400


def test_forgot_password_rate_limited(client: TestClient, outbox: list[dict]) -> None:
    codes = [client.post("/api/auth/forgot-password", json={"email": "spam@example.com"}).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_agency_invite_is_emailed(client: TestClient, outbox: list[dict]) -> None:
    owner = register(client, email="boss@example.com", role="agency_owner", full_name="Omar Siddiqui")["access_token"]
    outbox.clear()
    client.post("/api/agency/invite", json={"email": "teammate@example.com"}, headers=auth_header(owner))
    assert outbox[-1]["to"] == "teammate@example.com"
    assert "Omar Siddiqui invited you" in outbox[-1]["subject"]
    assert "/invite/" in outbox[-1]["text"]


def test_resend_verification_limited(client: TestClient, outbox: list[dict]) -> None:
    token = register(client, email="resend@example.com")["access_token"]
    codes = [client.post("/api/auth/resend-verification", headers=auth_header(token)).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_dev_mode_prints_instead_of_sending(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture) -> None:
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    email_service.send_email("x@example.com", "Hello", "Body text", "<p>Body</p>")
    assert "[DEV EMAIL] To x@example.com: Hello" in capsys.readouterr().out


def test_webhook_email_sends_secret_and_message(monkeypatch: pytest.MonkeyPatch) -> None:
    """Production path: emails go over HTTPS to the Apps Script web app (SMTP ports are blocked on free hosts)."""
    sent: dict = {}

    class FakeResponse:
        status_code = 200

        def json(self) -> dict:
            return {"ok": True}

    def fake_post(url: str, json: dict, timeout: int, follow_redirects: bool) -> FakeResponse:
        sent.update(url=url, body=json, follow=follow_redirects)
        return FakeResponse()

    monkeypatch.setattr(settings, "EMAIL_WEBHOOK_URL", "https://script.google.com/macros/s/abc/exec")
    monkeypatch.setattr(settings, "EMAIL_WEBHOOK_SECRET", "top-secret")
    monkeypatch.setattr(email_service.httpx, "post", fake_post)
    email_service._send_via_webhook("a@example.com", "Hi", "text body", "<p>html</p>")
    assert sent["url"].endswith("/exec") and sent["follow"] is True
    assert sent["body"] == {"secret": "top-secret", "to": "a@example.com", "subject": "Hi",
                            "text": "text body", "html": "<p>html</p>"}


def test_webhook_email_failure_is_logged_not_raised(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    class Refused:
        status_code = 200

        def json(self) -> dict:
            return {"ok": False, "error": "forbidden"}

    monkeypatch.setattr(settings, "EMAIL_WEBHOOK_URL", "https://script.google.com/macros/s/abc/exec")
    monkeypatch.setattr(email_service.httpx, "post", lambda *a, **k: Refused())
    # Alembic's logging setup (run by the test fixtures) disables existing loggers; switch this one back on
    monkeypatch.setattr(email_service.log, "disabled", False)
    email_service._send_via_webhook("a@example.com", "Hi", "t", "<p>h</p>")  # must not raise
    assert "Email to a@example.com failed" in caplog.text
