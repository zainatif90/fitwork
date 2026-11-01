"""Ingestion tests: normalization, duplicate handling, expiry rules, CSV parsing, retries, endpoints."""
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.job import Job
from app.models.user import User
from app.services.ingestion import deactivate_stale_jobs, upsert_jobs
from app.services.skill_utils import canonical_skill, extract_skills
from app.services.sources.base import JobData
from app.services.sources.csv_source import CSV_COLUMNS, CsvFormatError, read_jobs_csv
from app.services.sources.freelancer import FreelancerClient, normalize_project
from tests.conftest import auth_header, register

NOW = datetime.now(timezone.utc)

# Shaped like a project from the Freelancer.com active-projects API (values made up for the test).
SAMPLE_PROJECT = {
    "id": 123456,
    "title": "Build a React dashboard",
    "description": "Need a React + Tailwind admin dashboard with charts.",
    "type": "hourly",
    "time_submitted": int(NOW.timestamp()) - 3600,
    "budget": {"minimum": 10.0, "maximum": 20.0},
    "currency": {"code": "GBP", "exchange_rate": 1.5},
    "jobs": [{"name": "React.js"}, {"name": "Tailwind CSS"}],
    "bid_stats": {"bid_count": 7},
    "seo_url": "react/Build-React-dashboard",
}


def job_data(external_id: str = "1", source: str = "freelancer", hours_old: float = 1, **kw) -> JobData:
    base = dict(title="Python API developer", description="Build a FastAPI backend with PostgreSQL.",
                skills=["Python", "FastAPI"], budget_min=100, budget_max=300)
    base.update(kw)
    return JobData(source=source, external_id=external_id, posted_at=NOW - timedelta(hours=hours_old), **base)


def test_normalize_freelancer_project_converts_budget_to_usd() -> None:
    job = normalize_project(SAMPLE_PROJECT)
    assert job is not None
    assert job.source == "freelancer" and job.external_id == "123456"
    assert job.budget_type == "hourly"
    assert (job.budget_min, job.budget_max) == (15.0, 30.0)  # 10 GBP * 1.5, 20 GBP * 1.5
    assert job.currency == "USD"
    assert job.skills == ["React.js", "Tailwind CSS"]
    assert job.proposals_count == 7
    assert job.url == "https://www.freelancer.com/projects/react/Build-React-dashboard"
    assert job.posted_at.tzinfo is not None


def test_normalize_skips_incomplete_project() -> None:
    assert normalize_project({**SAMPLE_PROJECT, "title": ""}) is None
    assert normalize_project({**SAMPLE_PROJECT, "id": None}) is None


def test_upsert_inserts_then_updates_without_duplicates(db: Session) -> None:
    saved, ins, upd = upsert_jobs(db, [job_data("1"), job_data("2"), job_data("1")])  # "1" twice in one batch
    assert (ins, upd) == (2, 0)
    assert all(j.embedding is not None and len(j.embedding) == 384 for j in saved)

    _, ins, upd = upsert_jobs(db, [job_data("1", proposals_count=12), job_data("3")])
    assert (ins, upd) == (1, 1)
    assert db.scalar(select(func.count()).select_from(Job)) == 3
    assert db.scalar(select(Job.proposals_count).where(Job.external_id == "1")) == 12


def test_same_external_id_from_different_sources_are_different_jobs(db: Session) -> None:
    upsert_jobs(db, [job_data("1", source="freelancer"), job_data("1", source="csv")])
    assert db.scalar(select(func.count()).select_from(Job)) == 2


def test_skills_extracted_from_description_when_missing(db: Session) -> None:
    saved, _, _ = upsert_jobs(db, [job_data("9", skills=[], title="Shopify store fix",
                                            description="Fix our Shopify theme. Some JavaScript and CSS needed.")])
    assert {"Shopify", "JavaScript", "CSS"} <= set(saved[0].skills)


def test_stale_live_jobs_deactivated_but_csv_jobs_kept(db: Session) -> None:
    upsert_jobs(db, [
        job_data("fresh", hours_old=2),
        job_data("old", hours_old=80),
        job_data("old-csv", source="csv", hours_old=500),
    ])
    assert deactivate_stale_jobs(db) == 1
    active = dict(db.execute(select(Job.external_id, Job.is_active)).all())
    assert active == {"fresh": True, "old": False, "old-csv": True}


def test_extract_skills_handles_symbols_and_ambiguous_words() -> None:
    known = ["C++", "C#", "Node.js", "Go", "React", "C"]
    found = extract_skills("Port our C++ engine to C# and Node.js, go fast. React optional.", known)
    assert found == ["C++", "C#", "Node.js", "React"]  # "go" and "C" are ignored in free text


def test_canonical_skill_aliases() -> None:
    assert canonical_skill("React.js") == canonical_skill("react") == canonical_skill("ReactJS")
    assert canonical_skill("  Node JS ") == canonical_skill("node.js")


def test_read_csv(tmp_path: Path) -> None:
    path = tmp_path / "jobs.csv"
    path.write_text(
        ",".join(CSV_COLUMNS) + "\n"
        + 'a1,Logo design,"Design a logo for a bakery",Logo Design;Adobe Illustrator,50,100,fixed,USD,Pakistan,4,2026-10-01T10:00:00Z,\n',
        encoding="utf-8",
    )
    [job] = read_jobs_csv(path)
    assert job.source == "csv" and job.external_id == "a1"
    assert job.skills == ["Logo Design", "Adobe Illustrator"]
    assert job.budget_max == 100 and job.proposals_count == 4
    assert job.posted_at == datetime(2026, 10, 1, 10, tzinfo=timezone.utc)


def test_read_csv_reports_bad_rows(tmp_path: Path) -> None:
    path = tmp_path / "bad.csv"
    path.write_text(",".join(CSV_COLUMNS) + "\nx,Title,Desc,,,,weekly,USD,,,2026-10-01,\n", encoding="utf-8")
    with pytest.raises(CsvFormatError, match="Line 2"):
        read_jobs_csv(path)


def test_freelancer_client_retries_on_429_then_succeeds() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, headers={"Retry-After": "0"})
        return httpx.Response(200, json={"status": "success", "result": {"projects": [SAMPLE_PROJECT]}})

    client = FreelancerClient(client=httpx.Client(transport=httpx.MockTransport(handler), base_url="https://x"), delay_sec=0)
    jobs = client.fetch_active(pages=1, page_size=100)
    assert calls["n"] == 2
    assert len(jobs) == 1


def test_freelancer_client_reads_all_pages_even_if_a_page_is_short() -> None:
    offsets: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        offsets.append(request.url.params["offset"])
        n = len(offsets)
        projects = [{**SAMPLE_PROJECT, "id": n * 1000 + i} for i in range(98 if n == 1 else 100)]
        return httpx.Response(200, json={"result": {"projects": projects if n <= 3 else []}})

    client = FreelancerClient(client=httpx.Client(transport=httpx.MockTransport(handler), base_url="https://x"), delay_sec=0)
    jobs = client.fetch_active(pages=3, page_size=100)
    assert offsets == ["0", "100", "200"]
    assert len(jobs) == 298


def test_manual_job_endpoint(client: TestClient, db: Session) -> None:
    token = register(client)["access_token"]
    res = client.post("/api/jobs/manual", headers=auth_header(token), json={
        "title": "WordPress site speed fix",
        "description": "Our WordPress site is slow. Need caching and image optimisation.",
        "budget_min": 50, "budget_max": 150,
    })
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["source"] == "manual"
    assert "WordPress" in body["skills"]  # extracted from the text
    job = db.get(Job, body["id"])
    assert job is not None and job.embedding is not None and job.created_by is not None


def test_manual_job_validation(client: TestClient) -> None:
    token = register(client)["access_token"]
    res = client.post("/api/jobs/manual", headers=auth_header(token),
                      json={"title": "Hi", "description": "too short", "budget_min": 10, "budget_max": 5})
    assert res.status_code == 422


def test_admin_ingest_requires_admin(client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    body = register(client)
    assert client.post("/api/admin/ingest/run", headers=auth_header(body["access_token"])).status_code == 403

    user = db.get(User, body["user"]["id"])
    assert user is not None
    user.is_admin = True
    db.commit()
    monkeypatch.setattr(FreelancerClient, "fetch_active", lambda self, pages, page_size, start_offset=0: [job_data("77")])
    res = client.post("/api/admin/ingest/run", headers=auth_header(body["access_token"]), json={"pages": 1})
    assert res.status_code == 200, res.text
    assert res.json()["inserted"] == 1
