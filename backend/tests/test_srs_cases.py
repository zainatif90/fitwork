"""
SRS acceptance tests TC-1 .. TC-8, one test per test case, so TEST_RESULTS.md maps 1:1.
Detailed variations of each case live in the feature test files (test_auth.py, test_matching.py, ...).
"""
import statistics
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.job import Job
from app.models.user import User
from app.services.ingestion import upsert_jobs
from app.services.llm import LLMClient
from app.services.sources.base import JobData
from tests.conftest import auth_header, register

NOW = datetime.now(timezone.utc)
REACT = {"skills": ["React", "TypeScript", "Tailwind CSS"], "experience_level": "expert", "hourly_rate": 30,
         "bio": "Frontend developer building React dashboards."}
PYTHON = {"skills": ["Python", "Django", "PostgreSQL"], "experience_level": "expert", "hourly_rate": 30,
          "bio": "Backend developer building Django APIs."}


def jd(eid: str, title: str, desc: str, skills: list[str], source: str = "freelancer") -> JobData:
    return JobData(source=source, external_id=eid, title=title, description=desc, skills=skills,
                   budget_min=20, budget_max=40, budget_type="hourly", posted_at=NOW - timedelta(hours=2))


BASE_JOBS = [
    jd("react", "React analytics dashboard", "Build a React + TypeScript dashboard with Tailwind CSS.", ["React", "TypeScript", "Tailwind CSS"]),
    jd("django", "Django REST API", "Build a Django REST API backed by PostgreSQL.", ["Python", "Django", "PostgreSQL"]),
    jd("shop1", "Shopify theme changes", "Customise our Shopify Liquid theme.", ["Shopify", "Liquid"]),
    jd("shop2", "Shopify product page", "Redesign the Shopify product page template.", ["Shopify", "Liquid"]),
    jd("seo", "SEO audit", "Audit our website SEO and write a report.", ["SEO", "Content Writing"]),
]


def test_tc1_registration(client: TestClient, db: Session) -> None:
    body = register(client, email="tc1@example.com")
    assert body["access_token"] and body["user"]["email"] == "tc1@example.com"
    user = db.scalar(select(User).where(User.email == "tc1@example.com"))
    assert user is not None and user.password_hash.startswith("$2b$12$")


def test_tc2_duplicate_email(client: TestClient, db: Session) -> None:
    register(client, email="tc2@example.com")
    res = client.post("/api/auth/register", json={"email": "TC2@example.com", "password": "Another123", "full_name": "Dup"})
    assert res.status_code == 409
    assert db.scalar(select(func.count()).select_from(User)) == 1


def test_tc3_ranked_matches(client: TestClient, db: Session) -> None:
    upsert_jobs(db, BASE_JOBS)
    token = register(client)["access_token"]
    client.put("/api/profile/me", json=REACT, headers=auth_header(token))
    matches = client.get("/api/matches", headers=auth_header(token)).json()["matches"]
    assert len(matches) == 5
    assert [m["score"] for m in matches] == sorted((m["score"] for m in matches), reverse=True)
    assert matches[0]["job"]["title"] == "React analytics dashboard"
    assert all(0 <= m["score"] <= 100 and m["reason"] for m in matches)


def test_tc4_skill_gap(client: TestClient, db: Session) -> None:
    """Missing skills come only from the user's own field: jobs similar to the profile that share one of its skills."""
    react_field = [
        jd("rshop1", "React storefront for a Shopify store", "Build React components for our Shopify storefront.", ["React", "Shopify"]),
        jd("rshop2", "Shopify app with a React admin", "Build the React admin panel of a Shopify app.", ["React", "Shopify", "TypeScript"]),
        jd("rnext1", "Next.js marketing site", "Build a Next.js and React marketing site with Tailwind CSS.", ["React", "Next.js", "Tailwind CSS"]),
        jd("rnext2", "Next.js blog", "Build a Next.js blog in TypeScript.", ["Next.js", "TypeScript"]),
    ]
    upsert_jobs(db, BASE_JOBS + react_field)
    token = register(client)["access_token"]
    client.put("/api/profile/me", json=REACT, headers=auth_header(token))
    body = client.get("/api/skill-gap", headers=auth_header(token)).json()
    radar = {r["skill"]: r for r in body["radar"]}
    # Only the 2 Shopify jobs that also ask for React are in a React developer's field
    assert radar["Shopify"]["jobs"] == 2 and radar["React"]["your_coverage"] == 100
    suggested = {g["skill"] for g in body["gaps"]}
    assert suggested and suggested <= {"Shopify", "Next.js", "Liquid"}
    assert not suggested & {"SEO", "Content Writing", "Django", "Python"}  # other fields are never suggested
    assert all(len(g["sample_jobs"]) <= 3 for g in body["gaps"])


def test_tc5_proposal_generation_mocked_llm(client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    saved, _, _ = upsert_jobs(db, BASE_JOBS[:1])
    monkeypatch.setattr(settings, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(LLMClient, "generate", lambda self, system, prompt: "Hi, I can build this dashboard. Which charts matter most?\n\nSara")
    token = register(client)["access_token"]
    client.put("/api/profile/me", json=REACT, headers=auth_header(token))
    res = client.post("/api/proposals/generate", json={"job_id": str(saved[0].id), "tone": "friendly", "length": "concise"},
                      headers=auth_header(token))
    assert res.status_code == 200
    assert res.json()["is_fallback"] is False and res.json()["content"].endswith("Sara")


def test_tc6_agency_routing(client: TestClient, db: Session) -> None:
    saved, _, _ = upsert_jobs(db, BASE_JOBS[:2])
    ids = {j.external_id: str(j.id) for j in saved}
    owner = register(client, email="boss@example.com", role="agency_owner")["access_token"]
    for email, name, profile in (("py@example.com", "Py Dev", PYTHON), ("re@example.com", "React Dev", REACT)):
        link = client.post("/api/agency/invite", json={"email": email}, headers=auth_header(owner)).json()["invite_link"]
        t = register(client, email=email, full_name=name)["access_token"]
        client.post("/api/agency/invite/accept", json={"token": link.rsplit("/", 1)[1]}, headers=auth_header(t))
        client.put("/api/profile/me", json=profile, headers=auth_header(t))
    recs = {r["job"]["id"]: r for r in client.get("/api/agency/routing", headers=auth_header(owner)).json()}
    assert recs[ids["django"]]["recommended"]["name"] == "Py Dev"
    assert recs[ids["react"]]["recommended"]["name"] == "React Dev"


def test_tc7_performance_matches_with_500_jobs(client: TestClient, db: Session) -> None:
    """500+ jobs in the TEST database (labelled source='synthetic'); /matches uncached must stay fast."""
    topics = ["React dashboard", "Django API", "Logo design", "SEO blog posts", "Shopify store", "Flutter app",
              "Data entry in Excel", "Video editing for YouTube", "WordPress fixes", "Machine learning model"]
    items = [jd(f"syn-{i}", f"{topics[i % 10]} #{i}", f"Synthetic load-test job about {topics[i % 10].lower()} (variant {i}).",
                [], source="synthetic") for i in range(520)]
    upsert_jobs(db, items + BASE_JOBS)
    assert db.scalar(select(func.count()).select_from(Job)) >= 500

    token = register(client)["access_token"]
    client.put("/api/profile/me", json=REACT, headers=auth_header(token))
    timings = []
    for _ in range(20):
        t = time.perf_counter()
        assert client.get("/api/matches", params={"refresh": True}, headers=auth_header(token)).status_code == 200
        timings.append((time.perf_counter() - t) * 1000)
    p95 = sorted(timings)[int(0.95 * (len(timings) - 1))]
    print(f"\nTC-7 /matches uncached over {len(items) + len(BASE_JOBS)} jobs: "
          f"p50={statistics.median(timings):.1f} ms p95={p95:.1f} ms")
    assert p95 < 1000


def test_tc8_sql_injection_on_login(client: TestClient, db: Session) -> None:
    register(client, email="victim@example.com")
    for payload in ({"email": "victim@example.com", "password": "' OR '1'='1"},
                    {"email": "' OR 1=1; DROP TABLE users; --", "password": "x"}):
        res = client.post("/api/auth/login", json=payload)
        assert res.status_code in (401, 422) and "access_token" not in res.text
    assert db.scalar(select(func.count()).select_from(User)) == 1
