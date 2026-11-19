"""
Shared pytest setup.

Safety: before the app is imported we point DATABASE_URL at the separate `fitwork_test`
database and REDIS_URL at Redis DB 15, so tests can never touch development data.
The test schema is rebuilt from the Alembic migrations once per test run, and every
table is emptied after each test.
"""
import os
from collections.abc import Iterator
from pathlib import Path

from dotenv import dotenv_values

BACKEND_DIR = Path(__file__).resolve().parent.parent
_env = {**dotenv_values(BACKEND_DIR.parent / ".env"), **os.environ}
os.environ["DATABASE_URL"] = _env.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://fitwork:fitwork_dev_pw@localhost:5433/fitwork_test"
)
os.environ["REDIS_URL"] = "redis://localhost:6379/15"
os.environ["ENV"] = "test"
os.environ["SCHEDULER_ENABLED"] = "false"
os.environ["FX_ENABLED"] = "false"
os.environ["SKILL_GAP_PREWARM"] = "false"   # no background threads during tests (tested directly)   # tests never call the exchange-rate API; test_fx.py injects fixed rates
assert "fitwork_test" in os.environ["DATABASE_URL"], "Refusing to run tests against a non-test database"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.redis_client import redis_client  # noqa: E402
from app.main import app  # noqa: E402

# Tables filled by migrations (reference data) that must survive between tests
KEEP_TABLES = {"alembic_version", "skills"}


# --- Unit vs integration tests -------------------------------------------------------------
# A test is an INTEGRATION test when it uses the real database or the HTTP API (the `db` or
# `client` fixture, directly or through another fixture). Every other test is a UNIT test: it
# calls one function with plain inputs and needs no database, Redis or network.
#   pytest -m unit          -> fast unit tests only (Docker not needed)
#   pytest -m integration   -> tests that go through PostgreSQL / Redis / the API
INTEGRATION_FIXTURES = {"client", "db"}


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    for item in items:
        uses_io = INTEGRATION_FIXTURES & set(getattr(item, "fixturenames", ()))
        if uses_io or item.get_closest_marker("integration"):
            item.add_marker(pytest.mark.integration)
        else:
            item.add_marker(pytest.mark.unit)


@pytest.fixture(scope="session")
def migrated_database() -> Iterator[None]:
    """Rebuild the test schema from the Alembic migrations (once, and only if an integration test runs)."""
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def clean_state(request: pytest.FixtureRequest) -> Iterator[None]:
    """Integration tests start and end with an empty database and an empty Redis DB 15."""
    if not request.node.get_closest_marker("integration"):
        yield  # unit test: nothing to set up
        return
    request.getfixturevalue("migrated_database")
    redis_client.flushdb()
    yield
    with engine.begin() as conn:
        tables = conn.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        ).scalars()
        to_clear = [t for t in tables if t not in KEEP_TABLES]
        if to_clear:
            conn.execute(text(f"TRUNCATE {', '.join(to_clear)} RESTART IDENTITY CASCADE"))
    redis_client.flushdb()


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def register(client: TestClient, email: str = "sara@example.com", password: str = "Secret123",
             role: str = "freelancer", full_name: str = "Sara Khan", verified: bool | None = None) -> dict:
    """
    Register a user and return the JSON body (contains access_token and user).
    Agency owners are verified by default, because inviting a team member requires a verified email.
    """
    res = client.post("/api/auth/register", json={
        "email": email, "password": password, "role": role, "full_name": full_name,
    })
    assert res.status_code == 201, res.text
    body = res.json()
    if verified if verified is not None else role == "agency_owner":
        from app.core.security import create_verify_token

        assert client.get("/api/auth/verify", params={"token": create_verify_token(body["user"]["id"])}).status_code == 200
    return body


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
