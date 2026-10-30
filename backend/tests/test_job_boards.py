"""Remote job boards (Himalayas, Remotive, Jobicy): normalization, filtering, salary conversion, expiry."""
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.job import Job
from app.services import scoring
from app.services.ingestion import deactivate_stale_jobs, upsert_jobs
from app.services.sources.job_boards import (
    fetch_himalayas,
    html_to_text,
    normalize_himalayas,
    normalize_jobicy,
    normalize_remotive,
    parse_salary_text,
    to_hourly,
)

NOW = datetime.now(timezone.utc)

# Shaped like the real API responses (values made up for the test)
HIMALAYAS = {
    "title": "React Developer (Contract)", "excerpt": "Build React dashboards",
    "companyName": "Acme", "employmentType": "Contractor", "minSalary": 40, "maxSalary": 60,
    "salaryPeriod": "hourly", "currency": "USD", "locationRestrictions": ["Pakistan", "India"],
    "description": "<p>Build <b>React</b> &amp; TypeScript dashboards.</p><ul><li>Tailwind CSS</li></ul>",
    "pubDate": int(NOW.timestamp()) - 3600, "applicationLink": "https://himalayas.app/companies/acme/jobs/react",
    "guid": "https://himalayas.app/companies/acme/jobs/react",
}
REMOTIVE = {
    "id": 2091161, "url": "https://remotive.com/remote-jobs/software-dev/python-dev-2091161",
    "title": "Python Developer", "company_name": "Beta", "job_type": "freelance",
    "publication_date": "2026-10-22T18:40:19", "candidate_required_location": "Worldwide",
    "salary": "70K-80K", "description": "<p>Write Python and Django APIs.</p>",
}
JOBICY = {
    "id": 157987, "url": "https://jobicy.com/jobs/157987-ads-quality-rater", "jobTitle": "Ads Quality Rater &amp; QA",
    "companyName": "Welo", "jobType": ["Contract"], "jobGeo": "Thailand",
    "jobDescription": "<p>Rate ads quality.</p>", "pubDate": "2026-10-30T11:26:31+00:00",
    "salaryMin": 6, "salaryMax": 6, "salaryCurrency": "USD", "salaryPeriod": "hourly",
}


def test_html_to_text() -> None:
    assert html_to_text("<p>Build <b>React</b> &amp; TS.</p><ul><li>Tailwind</li></ul>") == "Build React & TS.\n Tailwind"


@pytest.mark.parametrize("amount,period,expected", [
    (40, "hourly", 40.0), (104000, "yearly", 50.0), (10400, "monthly", 60.0), (50, None, None), (0, "hourly", None),
])
def test_to_hourly(amount: float, period: str | None, expected: float | None) -> None:
    assert to_hourly(amount, period) == expected


@pytest.mark.parametrize("text,expected", [
    ("70K-80K", (33.65, 38.46)), ("$60,000 - $90,000", (28.85, 43.27)), ("$40/hour", (40.0, 40.0)),
    ("€50K", (None, None)), ("Competitive", (None, None)), (None, (None, None)),
])
def test_parse_salary_text(text: str | None, expected: tuple) -> None:
    assert parse_salary_text(text) == expected


def test_normalize_himalayas() -> None:
    job = normalize_himalayas(HIMALAYAS)
    assert job is not None and job.source == "himalayas"
    assert job.external_id == HIMALAYAS["guid"]
    assert (job.budget_min, job.budget_max, job.budget_type) == (40.0, 60.0, "hourly")
    assert "React & TypeScript dashboards" in job.description
    assert job.client_country == "Pakistan, India"
    assert job.url == HIMALAYAS["applicationLink"]


def test_himalayas_non_usd_salary_is_not_guessed() -> None:
    job = normalize_himalayas({**HIMALAYAS, "currency": "EUR"})
    assert job is not None and job.budget_min is None and job.budget_max is None


def test_normalize_remotive_keeps_only_freelance_and_contract() -> None:
    job = normalize_remotive(REMOTIVE)
    assert job is not None and job.source == "remotive" and job.external_id == "2091161"
    assert job.budget_min == 33.65 and job.budget_type == "hourly"
    assert job.posted_at.tzinfo is not None
    assert normalize_remotive({**REMOTIVE, "job_type": "full_time"}) is None


def test_normalize_jobicy_keeps_only_contract() -> None:
    job = normalize_jobicy(JOBICY)
    assert job is not None and job.title == "Ads Quality Rater & QA"
    assert (job.budget_min, job.budget_max) == (6.0, 6.0)
    assert normalize_jobicy({**JOBICY, "jobType": ["Full-Time"]}) is None


def test_fetch_himalayas_pages_and_filters_contractor(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.services.sources.job_boards as jb

    monkeypatch.setattr(jb.time, "sleep", lambda s: None)
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(dict(request.url.params))
        offset = int(request.url.params["offset"])
        jobs = [{**HIMALAYAS, "guid": f"g{offset + i}"} for i in range(20)] if offset < 40 else []
        return httpx.Response(200, json={"jobs": jobs})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    jobs = fetch_himalayas(pages=5, client=client)
    assert len(jobs) == 40
    assert seen[0]["employment_type"] == "Contractor"
    assert [p["offset"] for p in seen] == ["0", "20", "40"]  # stops at the first empty page


def test_board_jobs_expire_after_21_days_freelancer_after_72h(db: Session) -> None:
    def item(source: str, eid: str, hours: float):  # type: ignore[no-untyped-def]
        j = normalize_himalayas({**HIMALAYAS, "guid": eid})
        assert j is not None
        j.source, j.posted_at = source, NOW - timedelta(hours=hours)
        return j

    upsert_jobs(db, [item("himalayas", "board-10d", 240), item("himalayas", "board-30d", 720),
                     item("freelancer", "fl-4d", 96)])
    assert deactivate_stale_jobs(db) == 2
    active = dict(db.execute(select(Job.external_id, Job.is_active)).all())
    assert active == {"board-10d": True, "board-30d": False, "fl-4d": False}


def test_recency_scales_with_source_lifetime() -> None:
    now = datetime(2026, 10, 30, tzinfo=timezone.utc)
    assert scoring.recency_score("freelancer", now - timedelta(hours=6), now) == 1.0
    assert scoring.recency_score("himalayas", now - timedelta(hours=40), now) == 1.0     # fresh for 42 h
    assert scoring.recency_score("himalayas", now - timedelta(days=21), now) == 0.0
    mid = scoring.recency_score("remotive", now - timedelta(hours=42 + (504 - 42) / 2), now)
    assert mid == pytest.approx(0.5)
