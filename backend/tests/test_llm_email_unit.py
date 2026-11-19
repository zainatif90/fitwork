"""
Unit tests for the two modules that talk to outside services: the LLM client (proposal drafts)
and email sending. The network is replaced by small fakes, so these run offline in milliseconds
and never call Gemini, OpenAI, Gmail or the Apps Script mailer.

Added after the coverage report showed llm.py and email.py at 65% (see TESTING.md).
"""
import smtplib
from typing import Any

import httpx
import pytest

from app.core.config import settings
from app.services import email as email_service
from app.services.llm import LLMClient, LLMError


class FakeResponse:
    """The parts of an httpx.Response that our code reads."""

    def __init__(self, status: int = 200, body: Any = None, text: str = "") -> None:
        self.status_code = status
        self._body = body
        self.text = text

    def json(self) -> Any:
        return self._body


def fake_post(response: FakeResponse | Exception, calls: list[dict] | None = None):
    def _post(url: str, **kwargs: Any) -> FakeResponse:
        if calls is not None:
            calls.append({"url": url, **kwargs})
        if isinstance(response, Exception):
            raise response
        return response
    return _post


# ------------------------------------------------------------------------------------------
# LLM client
# ------------------------------------------------------------------------------------------
def test_gemini_success_joins_text_parts_and_sends_key_in_header(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict] = []
    body = {"candidates": [{"content": {"parts": [{"text": "Hello "}, {"text": "client"}]}}]}
    monkeypatch.setattr(httpx, "post", fake_post(FakeResponse(200, body), calls))
    out = LLMClient("gemini", "k-123", "gemini-test").generate("system", "prompt")
    assert out == "Hello client"
    assert calls[0]["headers"] == {"x-goog-api-key": "k-123"}          # key in a header, never in the URL
    assert "k-123" not in calls[0]["url"]
    assert calls[0]["json"]["systemInstruction"]["parts"][0]["text"] == "system"


def test_openai_success(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict] = []
    body = {"choices": [{"message": {"content": "  Draft text  "}}]}
    monkeypatch.setattr(httpx, "post", fake_post(FakeResponse(200, body), calls))
    assert LLMClient("openai", "sk-x", "gpt-test").generate("s", "p") == "Draft text"   # trimmed
    assert calls[0]["headers"]["Authorization"] == "Bearer sk-x"
    assert calls[0]["json"]["messages"][0] == {"role": "system", "content": "s"}


@pytest.mark.parametrize("key", ["", "none", "  NONE "])
def test_missing_key_fails_before_any_request(monkeypatch: pytest.MonkeyPatch, key: str) -> None:
    monkeypatch.setattr(httpx, "post", fake_post(AssertionError("must not be called")))
    with pytest.raises(LLMError, match="not set"):
        LLMClient("gemini", key).generate("s", "p")


def test_unknown_provider_is_refused() -> None:
    with pytest.raises(LLMError, match="Unknown LLM_PROVIDER"):
        LLMClient("claude-local", "key").generate("s", "p")


@pytest.mark.parametrize("provider", ["gemini", "openai"])
def test_http_error_status_becomes_llm_error(monkeypatch: pytest.MonkeyPatch, provider: str) -> None:
    monkeypatch.setattr(httpx, "post", fake_post(FakeResponse(429, None, "quota exceeded")))
    with pytest.raises(LLMError, match="HTTP 429"):
        LLMClient(provider, "key").generate("s", "p")


@pytest.mark.parametrize(("provider", "body"), [
    ("gemini", {"candidates": []}),                 # e.g. blocked by a safety filter
    ("openai", {"choices": []}),
])
def test_unexpected_response_shape_becomes_llm_error(monkeypatch: pytest.MonkeyPatch, provider: str, body: dict) -> None:
    monkeypatch.setattr(httpx, "post", fake_post(FakeResponse(200, body)))
    with pytest.raises(LLMError, match="Unexpected"):
        LLMClient(provider, "key").generate("s", "p")


def test_timeout_and_network_errors_become_llm_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(httpx, "post", fake_post(httpx.ReadTimeout("slow")))
    with pytest.raises(LLMError, match="timed out"):
        LLMClient("gemini", "key", timeout=5).generate("s", "p")
    monkeypatch.setattr(httpx, "post", fake_post(httpx.ConnectError("no route")))
    with pytest.raises(LLMError, match="request failed"):
        LLMClient("gemini", "key").generate("s", "p")


def test_empty_answer_is_an_error_so_the_template_fallback_is_used(monkeypatch: pytest.MonkeyPatch) -> None:
    body = {"candidates": [{"content": {"parts": [{"text": "   "}]}}]}
    monkeypatch.setattr(httpx, "post", fake_post(FakeResponse(200, body)))
    with pytest.raises(LLMError, match="empty"):
        LLMClient("gemini", "key").generate("s", "p")


# ------------------------------------------------------------------------------------------
# Email
# ------------------------------------------------------------------------------------------
class RunNow:
    """Stands in for threading.Thread: runs the target immediately so the test can check the result."""

    def __init__(self, target: Any, args: tuple = (), daemon: bool = False) -> None:
        self.target, self.args = target, args

    def start(self) -> None:
        self.target(*self.args)


class FakeSMTP:
    instances: list["FakeSMTP"] = []

    def __init__(self, host: str, port: int, **kwargs: Any) -> None:
        self.host, self.port, self.tls, self.login_as, self.sent = host, port, False, None, []
        FakeSMTP.instances.append(self)

    def __enter__(self) -> "FakeSMTP":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def starttls(self, context: Any = None) -> None:
        self.tls = True

    def login(self, user: str, password: str) -> None:
        self.login_as = user

    def send_message(self, msg: Any) -> None:
        self.sent.append(msg)


@pytest.fixture
def no_mailer(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("EMAIL_WEBHOOK_URL", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"):
        monkeypatch.setattr(settings, name, "")
    monkeypatch.setattr(email_service.threading, "Thread", RunNow)
    FakeSMTP.instances = []


def test_development_prints_the_email_instead_of_sending(no_mailer: None, capsys: pytest.CaptureFixture) -> None:
    assert email_service.mailer_configured() is False
    email_service.send_email("a@example.com", "Verify", "Click the link", "<b>Click</b>")
    assert "[DEV EMAIL] To a@example.com: Verify" in capsys.readouterr().out


def test_webhook_posts_secret_and_message(no_mailer: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "EMAIL_WEBHOOK_URL", "https://script.example/exec")
    monkeypatch.setattr(settings, "EMAIL_WEBHOOK_SECRET", "s3cret")
    calls: list[dict] = []
    monkeypatch.setattr(email_service.httpx, "post", fake_post(FakeResponse(200, {"ok": True}), calls))
    assert email_service.mailer_configured() is True
    email_service.send_email("b@example.com", "Reset", "text", "<p>html</p>")
    assert calls[0]["url"] == "https://script.example/exec"
    assert calls[0]["json"] == {"secret": "s3cret", "to": "b@example.com", "subject": "Reset",
                                "text": "text", "html": "<p>html</p>"}


class RecordingLog:
    """Replaces the email module's logger. (pytest's caplog misses these messages once the FastAPI app
    has configured logging in an earlier integration test, which made the test depend on test order.)"""

    def __init__(self) -> None:
        self.errors: list[str] = []

    def info(self, *args: Any) -> None:
        pass

    def exception(self, msg: str, *args: Any) -> None:
        self.errors.append(msg % args)


def test_webhook_failure_is_logged_not_raised(no_mailer: None, monkeypatch: pytest.MonkeyPatch) -> None:
    log = RecordingLog()
    monkeypatch.setattr(email_service, "log", log)
    monkeypatch.setattr(settings, "EMAIL_WEBHOOK_URL", "https://script.example/exec")
    monkeypatch.setattr(email_service.httpx, "post", fake_post(FakeResponse(200, {"ok": False, "error": "forbidden"})))
    email_service.send_email("c@example.com", "Invite", "t", "h")       # must not raise into the API request
    assert log.errors == ["Email to c@example.com failed"]


@pytest.mark.parametrize(("port", "cls", "uses_starttls"), [(587, "SMTP", True), (465, "SMTP_SSL", False)])
def test_smtp_uses_starttls_on_587_and_ssl_on_465(no_mailer: None, monkeypatch: pytest.MonkeyPatch,
                                                  port: int, cls: str, uses_starttls: bool) -> None:
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_USER", "team@example.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "app-password")
    monkeypatch.setattr(settings, "SMTP_PORT", port)
    monkeypatch.setattr(smtplib, cls, FakeSMTP)
    email_service.send_email("d@example.com", "Hello", "plain", "<p>rich</p>")
    server = FakeSMTP.instances[0]
    assert (server.host, server.port, server.tls, server.login_as) == ("smtp.example.com", port, uses_starttls, "team@example.com")
    msg = server.sent[0]
    assert msg["To"] == "d@example.com" and msg["From"] == "FitWork <team@example.com>"
    assert msg.get_body(("plain",)).get_content().strip() == "plain"       # text + HTML versions
    assert "rich" in msg.get_body(("html",)).get_content()


def test_smtp_failure_is_logged_not_raised(no_mailer: None, monkeypatch: pytest.MonkeyPatch) -> None:
    log = RecordingLog()
    monkeypatch.setattr(email_service, "log", log)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_USER", "u")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "p")

    def refuse(*args: Any, **kwargs: Any) -> None:
        raise smtplib.SMTPAuthenticationError(535, b"bad credentials")

    monkeypatch.setattr(smtplib, "SMTP", refuse)
    email_service.send_email("e@example.com", "Hi", "t", "h")
    assert log.errors == ["Email to e@example.com failed"]
