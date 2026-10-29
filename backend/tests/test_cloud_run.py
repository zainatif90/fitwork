"""Tests for the pieces used on Google Cloud Run: in-memory store and the scheduler endpoint."""
import time

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.redis_client import MemoryStore
from app.services.ingestion import IngestStats


def test_memory_store_behaves_like_redis() -> None:
    m = MemoryStore()
    assert m.get("a") is None
    m.setex("a", 60, "1")
    assert m.get("a") == "1" and m.exists("a") == 1
    assert m.incr("count") == 1 and m.incr("count") == 2
    assert m.set("lock", "1", ex=60, nx=True) is True
    assert m.set("lock", "1", ex=60, nx=True) is False   # NX: only if missing
    assert m.delete("a", "missing") == 1
    m.set("short", "x", ex=1)
    m._data["short"] = ("x", time.monotonic() - 1)       # pretend 1 s has passed
    assert m.get("short") is None and m.exists("short") == 0
    m.flushdb()
    assert m.get("count") is None


def test_memory_store_rate_limit_window() -> None:
    m = MemoryStore()
    assert m.incr("rl") == 1 and m.expire("rl", 60) is True
    for _ in range(5):
        m.incr("rl")
    assert int(m.get("rl")) == 6  # type: ignore[arg-type]


def test_cron_endpoint_requires_secret(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "CRON_SECRET", "s3cret-value")
    assert client.post("/api/internal/ingest").status_code == 401
    assert client.post("/api/internal/ingest", headers={"X-Cron-Secret": "wrong"}).status_code == 401


def test_cron_endpoint_disabled_without_configured_secret(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "CRON_SECRET", "")
    assert client.post("/api/internal/ingest", headers={"X-Cron-Secret": ""}).status_code == 401


def test_cron_endpoint_runs_ingestion(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import admin

    monkeypatch.setattr(settings, "CRON_SECRET", "s3cret-value")
    monkeypatch.setattr(admin, "run_freelancer_ingestion",
                        lambda db: IngestStats(source="freelancer", fetched=3, inserted=2, updated=1))
    res = client.post("/api/internal/ingest", headers={"X-Cron-Secret": "s3cret-value"})
    assert res.status_code == 200
    assert res.json()["inserted"] == 2
