"""
The liveness check Render polls (/api/health) must never hang and must not need the database.
On 19-20 Nov 2026 Render reported "health check timed out after 5 seconds" and the API stayed frozen:
the old check asked the database for SELECT 1 on a worker thread, with no time limits on the connection.
"""
import asyncio
import time

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.core.database import engine_options


@pytest.mark.integration
def test_health_ok_without_touching_the_database(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    def no_db(*_a, **_k):  # any database use would fail the test
        raise AssertionError("the liveness check must not use the database")

    monkeypatch.setattr("app.core.database.SessionLocal", no_db)
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.head("/api/health").status_code == 200


@pytest.mark.integration
def test_health_answers_busy_when_no_worker_thread_is_free(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(main, "HEALTH_TIMEOUT_SEC", 0.2)
    monkeypatch.setattr(main, "_worker_ready", lambda: time.sleep(1) or True)  # simulates stuck workers
    started = time.perf_counter()
    res = client.get("/api/health")
    assert res.status_code == 503 and res.json() == {"status": "busy"}
    assert time.perf_counter() - started < 1.0  # answers quickly instead of hanging


def test_postgres_connections_have_time_limits() -> None:
    opts = engine_options("postgresql+psycopg://u:p@host/db")
    assert opts["pool_timeout"] == 10 and opts["pool_pre_ping"] is True
    args = opts["connect_args"]
    assert args["connect_timeout"] == 10
    assert args["keepalives"] == 1 and args["keepalives_idle"] == 30 and args["keepalives_count"] == 3


def test_health_route_is_async_so_it_does_not_queue_behind_stuck_threads() -> None:
    assert asyncio.iscoroutinefunction(main.health)
