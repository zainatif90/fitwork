"""
Matching, proposal and job fixes from the 1 November 2026 review
(BUG-04, 11, 12, 16, 20, 21, 25, 27, 32 and the job-link check).
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services import scoring
from app.services.ingestion import drop_expired, fit_to_columns, upsert_jobs
from app.services.llm import LLMClient, LLMError
from app.services.proposals import short_title
from app.services.sources.base import JobData
from tests.conftest import auth_header, register

NOW = datetime.now(timezone.utc)
REACT = {"skills": ["React", "TypeScript"], "experience_level": "expert", "hourly_rate": 30,
         "bio": "Frontend developer building React dashboards."}


def job(eid: str, title: str, source: str = "freelancer", hours_old: float = 1, **kw: object) -> JobData:
    return JobData(source=source, external_id=eid, title=title, description=f"{title}. Built with React and TypeScript.",
                   skills=["React", "TypeScript"], budget_min=20, budget_max=40, budget_type="hourly",
                   posted_at=NOW - timedelta(hours=hours_old), **kw)  # type: ignore[arg-type]


@pytest.fixture
def react_user(client: TestClient, db: Session) -> str:
    upsert_jobs(db, [job(f"r{i}", f"React {t}") for i, t in enumerate(
        ["admin dashboard", "landing page", "booking widget", "chart page", "settings screen", "login form", "data table"])])
    token = register(client)["access_token"]
    assert client.put("/api/profile/me", json=REACT, headers=auth_header(token)).status_code == 200
    return token


def test_bug04_not_relevant_job_leaves_the_top_5(client: TestClient, react_user: str) -> None:
    h = auth_header(react_user)
    first = client.get("/api/matches", headers=h).json()["matches"][0]["job"]["id"]
    assert client.post(f"/api/matches/{first}/feedback", json={"outcome": "not_relevant"}, headers=h).status_code == 200
    after = client.get("/api/matches", headers=h).json()   # no ?refresh needed: feedback clears the cache
    assert first not in [m["job"]["id"] for m in after["matches"]]
    assert len(after["matches"]) == 5                       # the next best job moved up


def test_bug11_seed_jobs_never_beat_live_jobs_on_recency() -> None:
    now = datetime(2026, 11, 1, tzinfo=timezone.utc)
    live_48h = scoring.recency_score("freelancer", now - timedelta(hours=48), now)
    assert scoring.recency_score("csv", now - timedelta(days=10), now) == 0.0 < live_48h
    assert scoring.recency_score("manual", now, now) == 0.5   # pasted jobs stay neutral


def test_bug16_budget_and_recency_need_a_real_fit() -> None:
    # An unrelated job (cosine ~0.35 -> semantic 0.4) with a perfect budget and brand new: was 58 "Possible fit"
    assert scoring.combine(0.4, 1.0, 1.0) < 50
    # Jobs that really fit are scored exactly as before
    assert scoring.combine(0.7, 1.0, 1.0) == 79
    assert scoring.combine(1.0, 1.0, 1.0) == 100
    assert scoring.combine(0.0, 1.0, 1.0) == 0


def test_bug12_template_after_ai_failure_does_not_use_the_quota(client: TestClient, react_user: str,
                                                                monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(self: LLMClient, system: str, prompt: str) -> str:
        raise LLMError("timeout")

    monkeypatch.setattr(LLMClient, "generate", broken)
    h = auth_header(react_user)
    job_id = client.get("/api/matches", headers=h).json()["matches"][0]["job"]["id"]
    body = client.post("/api/proposals/generate", headers=h, json={"job_id": job_id}).json()
    assert body["is_fallback"] is True
    assert body["remaining_today"] == settings.PROPOSALS_PER_DAY


def test_bug27_template_quotes_only_the_title_and_uses_singular() -> None:
    assert short_title("Shopify Speed OptimizationThe budget is $20.") == "Shopify Speed Optimization"
    assert short_title("Fix my WordPress site. Urgent!") == "Fix my WordPress site"
    assert short_title("JavaScript and iPhone app fixes") == "JavaScript and iPhone app fixes"

    from app.models.job import Job
    from app.models.profile import Profile
    from app.models.user import User
    from app.services.proposals import fallback_proposal

    text = fallback_proposal(Job(title="Shopify Speed OptimizationThe budget is $20.", skills=["Shopify"]),
                             Profile(skills=["Shopify", "Figma"], bio="", portfolio_urls=[]),
                             User(full_name="Sara Khan"), "standard")
    assert "My relevant skill for this work is Shopify." in text
    assert '"Shopify Speed Optimization"' in text and "budget is $20" not in text


def test_bug20_broken_job_link_is_not_found(client: TestClient, react_user: str) -> None:
    res = client.get("/api/jobs/not-a-real-id", headers=auth_header(react_user))
    assert res.status_code == 404 and res.json()["detail"] == "Job not found"


def test_bug21_paste_errors_are_plain_words(client: TestClient, react_user: str) -> None:
    h = auth_header(react_user)
    base = {"title": "Build a site", "description": "A small website with a contact form, please."}
    res = client.post("/api/jobs/manual", headers=h, json={**base, "budget_min": 500, "budget_max": 100})
    assert res.status_code == 422 and "Minimum budget can't be more than the maximum budget" in res.text
    res = client.post("/api/jobs/manual", headers=h, json={**base, "url": "www.example.com/job"})
    assert res.status_code == 422 and "Links must start with https://" in res.text


def test_bug25_pasted_jobs_are_limited(client: TestClient, react_user: str, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import jobs as jobs_router

    monkeypatch.setattr(jobs_router, "PASTED_PER_DAY", 2)
    h = auth_header(react_user)
    body = {"title": "Build a site", "description": "A small website with a contact form, please."}
    codes = [client.post("/api/jobs/manual", headers=h, json=body).status_code for _ in range(3)]
    assert codes == [201, 201, 429]


def test_bug32_expired_jobs_are_skipped_before_embedding() -> None:
    fresh, old = job("a", "Fresh", source="remotive", hours_old=24), job("b", "Old", source="remotive", hours_old=24 * 30)
    seed = job("c", "Seed", source="csv", hours_old=24 * 300)
    assert drop_expired([fresh, old, seed]) == [fresh, seed]   # csv jobs never expire


def test_only_web_links_are_kept() -> None:
    item = job("x", "Bad link", url="javascript:alert(1)")
    fit_to_columns(item)
    assert item.url is None
