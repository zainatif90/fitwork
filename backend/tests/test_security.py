"""Security checks: every route needs auth (except the public auth routes), no stack traces leak."""
import re

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import auth_header, register

# The only routes that may be called without an access token
PUBLIC = {
    ("POST", "/api/auth/register"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/refresh"),   # uses the httpOnly refresh cookie instead
    ("POST", "/api/auth/logout"),
    ("GET", "/api/auth/verify"),     # uses the signed token in the link
    ("POST", "/api/auth/forgot-password"),  # rate limited, same answer for every email
    ("POST", "/api/auth/reset-password"),   # needs the signed single-use token from the email
    ("GET", "/api/health"),
    ("HEAD", "/api/health"),         # uptime monitors send HEAD
    ("GET", "/api/health/deep"),     # monitoring: counts and times only, no user data
}

DUMMY_UUID = "00000000-0000-0000-0000-000000000000"


def _all_api_routes() -> list[tuple[str, str]]:
    """Every endpoint, read from the OpenAPI schema (newer FastAPI versions nest routers in app.routes)."""
    schema = app.openapi()
    return sorted((method.upper(), path) for path, ops in schema["paths"].items() for method in ops)


def _fill(path: str) -> str:
    """Replace {path_params} with harmless values."""
    return re.sub(r"\{[^}]+\}", lambda m: "sometoken1234" if "token" in m.group(0) else DUMMY_UUID, path)


@pytest.mark.parametrize("method,path", [r for r in _all_api_routes() if r not in PUBLIC])
def test_every_protected_route_requires_auth(client: TestClient, method: str, path: str) -> None:
    res = client.request(method, _fill(path), json={})
    assert res.status_code == 401, f"{method} {path} returned {res.status_code} without a token"


def test_route_inventory_is_not_empty() -> None:
    protected = [r for r in _all_api_routes() if r not in PUBLIC]
    assert len(protected) >= 25  # guards against the parametrized test silently testing nothing


@pytest.mark.integration  # builds its own TestClient (to keep the 500 response)
def test_unhandled_errors_do_not_leak_stack_traces(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import profile as profile_router

    def boom(*args: object, **kwargs: object) -> None:
        raise RuntimeError("secret internal detail: password=hunter2")

    monkeypatch.setattr(profile_router, "get_profile", boom)
    with TestClient(app, raise_server_exceptions=False) as c:
        token = register(c, email="leak@example.com")["access_token"]
        res = c.get("/api/profile/me", headers=auth_header(token))
    assert res.status_code == 500
    assert res.json() == {"detail": "Something went wrong. Please try again."}
    assert "Traceback" not in res.text and "hunter2" not in res.text


def test_api_responses_have_strict_headers(client: TestClient) -> None:
    res = client.get("/api/health")
    assert res.headers["Content-Security-Policy"] == "default-src 'none'; frame-ancestors 'none'"
    assert res.headers["Cache-Control"] == "no-store"
    assert res.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"


def test_cors_only_allows_configured_origin(client: TestClient) -> None:
    ok = client.options("/api/auth/login", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    evil = client.options("/api/auth/login", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in evil.headers


def test_oversized_and_malformed_input_rejected(client: TestClient) -> None:
    assert client.post("/api/auth/register", json={"email": "a@b.co", "password": "A1" + "x" * 200, "full_name": "Ab"}).status_code == 422
    assert client.post("/api/auth/login", content=b"{not json", headers={"Content-Type": "application/json"}).status_code == 422
    token = register(client)["access_token"]
    assert client.get("/api/jobs/not-a-uuid", headers=auth_header(token)).status_code == 404  # "Job not found"
