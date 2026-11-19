"""
Robustness fixes from the 19 Nov 2026 review (see TEST_RESULTS.md):
  - old expired jobs are deleted daily, but never jobs with user history (feedback / proposals / assignments)
  - the in-memory store drops expired entries
  - only one Skill Gap calculation runs at a time; a waiting request gets a clear "busy" answer
  - Skill Gap analyses at most SKILL_GAP_MAX_JOBS jobs (memory guard)
  - a fetch that returns 0 jobs is not recorded as a successful fetch
"""
import threading
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.redis_client import MemoryStore
from app.models.feedback import MatchFeedback
from app.models.job import Job
from app.services import ingestion, skill_gap
from app.services.ingestion import purge_old_jobs, upsert_jobs
from app.services.sources.base import JobData
from tests.conftest import auth_header, register

NOW = datetime.now(timezone.utc)


def _job(eid: str, source: str, days_old: float, title: str = "React dashboard") -> JobData:
    return JobData(source=source, external_id=eid, title=f"{title} {eid}", description=f"Build a React app ({eid}).",
                   skills=["React"], budget_min=20, budget_max=40, budget_type="hourly",
                   posted_at=NOW - timedelta(days=days_old))


# ---------------------------------------------------------------- daily purge (integration)
def test_purge_deletes_only_old_expired_live_jobs_without_history(client: TestClient, db: Session) -> None:
    upsert_jobs(db, [
        _job("old", "freelancer", 40),          # expired 40 days ago, nobody used it -> deleted
        _job("old-board", "himalayas", 60),     # job board, old -> deleted
        _job("old-used", "freelancer", 40),     # old but the user gave feedback -> kept (history)
        _job("recent", "freelancer", 10),       # expired but younger than 30 days -> kept
        _job("seed", "csv", 400),               # seed dataset never expires -> kept
    ])
    db.execute(Job.__table__.update().where(Job.source != "csv").values(is_active=False))
    db.commit()
    user_id = register(client)["user"]["id"]
    used = db.scalar(select(Job).where(Job.external_id == "old-used"))
    db.add(MatchFeedback(user_id=user_id, job_id=used.id, outcome="applied", score_at_feedback=80))
    db.commit()

    assert purge_old_jobs(db, now=NOW, days=30) == 2
    left = set(db.scalars(select(Job.external_id)))
    assert left == {"old-used", "recent", "seed"}


def test_purge_never_touches_active_jobs(db: Session) -> None:
    upsert_jobs(db, [_job("active-but-old-date", "freelancer", 90)])
    db.commit()                                              # still active (e.g. not yet deactivated)
    assert purge_old_jobs(db, now=NOW, days=30) == 0


# ---------------------------------------------------------------- in-memory store (unit)
def test_memory_store_sweep_removes_only_expired_entries() -> None:
    store = MemoryStore()
    store.set("short", "1", ex=1)
    store.set("long", "2", ex=3600)
    store.set("forever", "3")
    store._data["short"] = ("1", time.monotonic() - 1)       # pretend 1 s has passed
    assert store.sweep_expired() == 1
    assert store.get("long") == "2" and store.get("forever") == "3" and store.get("short") is None


# ---------------------------------------------------------------- Skill Gap queue (unit)
def test_only_one_skill_gap_calculation_at_a_time(monkeypatch: pytest.MonkeyPatch) -> None:
    """Two users at once: the second waits for the first instead of running in parallel."""
    running, peak = 0, 0
    guard = threading.Lock()

    def slow_compute(db: object, profile: object) -> dict:
        nonlocal running, peak
        with guard:
            running += 1
            peak = max(peak, running)
        time.sleep(0.2)
        with guard:
            running -= 1
        return {"gaps": []}

    monkeypatch.setattr(skill_gap, "compute_skill_gap", slow_compute)
    monkeypatch.setattr(skill_gap, "cache_get", lambda key: None)
    monkeypatch.setattr(skill_gap, "cache_set", lambda key, value, ttl: None)

    class P:
        def __init__(self, uid: str) -> None:
            self.user_id = uid

    threads = [threading.Thread(target=skill_gap.get_skill_gap, args=(None, P(f"u{i}"))) for i in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert peak == 1


def test_skill_gap_busy_after_waiting_too_long(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(skill_gap, "cache_get", lambda key: None)

    class P:
        user_id = "u1"

    skill_gap._compute_lock.acquire()                        # someone else is calculating
    try:
        with pytest.raises(skill_gap.SkillGapBusy):
            skill_gap.get_skill_gap(None, P(), wait_sec=0.05)
    finally:
        skill_gap._compute_lock.release()


def test_skill_gap_endpoint_answers_503_when_busy(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    token = register(client)["access_token"]
    client.put("/api/profile/me", headers=auth_header(token), json={
        "skills": ["React"], "experience_level": "expert", "hourly_rate": 30, "bio": "React developer"})

    def busy(*args: object, **kwargs: object) -> dict:
        raise skill_gap.SkillGapBusy()

    monkeypatch.setattr("app.routers.skill_gap.get_skill_gap", busy)
    res = client.get("/api/skill-gap", headers=auth_header(token))
    assert res.status_code == 503
    assert "try again" in res.json()["detail"]


# ---------------------------------------------------------------- Skill Gap memory guard (integration)
def test_skill_gap_reads_at_most_the_newest_max_jobs(client: TestClient, db: Session,
                                                     monkeypatch: pytest.MonkeyPatch) -> None:
    from app.models.profile import Profile

    upsert_jobs(db, [_job(f"j{i}", "csv", i) for i in range(6)])   # csv: always active, any date
    db.commit()
    token = register(client)["access_token"]
    client.put("/api/profile/me", headers=auth_header(token), json={
        "skills": ["React"], "experience_level": "expert", "hourly_rate": 30, "bio": "React developer"})
    monkeypatch.setattr(settings, "SKILL_GAP_MAX_JOBS", 4)
    rows = skill_gap._active_jobs(db, db.scalar(select(Profile)))
    assert [r.title for r in rows] == [f"React dashboard j{i}" for i in range(4)]   # the 4 newest


# ---------------------------------------------------------------- fetch bookkeeping (integration: Redis)
def test_zero_job_fetch_is_not_recorded_as_success(client: TestClient, db: Session) -> None:
    ingestion.ingest_items(db, "remotive", [], time.perf_counter())
    assert ingestion.last_fetch_ok("remotive") is None
    ingestion.ingest_items(db, "remotive", [_job("r1", "remotive", 1)], time.perf_counter())
    assert ingestion.last_fetch_ok("remotive") is not None

