"""Matching engine tests (UC-3, SRS TC-3 ranked matches)."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.ingestion import upsert_jobs
from app.services.sources.base import JobData
from tests.conftest import auth_header, register

NOW = datetime.now(timezone.utc)

REACT_PROFILE = {
    "skills": ["React", "TypeScript", "Tailwind CSS"],
    "experience_level": "expert",
    "hourly_rate": 30,
    "bio": "Frontend developer who builds dashboards in React.",
}

JOBS = [
    ("react", "React dashboard with Tailwind", "Build an admin dashboard in React and TypeScript, styled with Tailwind CSS.",
     ["React.js", "TypeScript", "Tailwind CSS"]),
    ("python", "Python data pipeline", "Write Python ETL scripts with Pandas to clean CSV files and load PostgreSQL.",
     ["Python", "Pandas", "PostgreSQL"]),
    ("logo", "Logo for a bakery", "Design a warm, friendly logo for a family bakery. Deliver AI and PNG files.",
     ["Logo Design", "Adobe Illustrator"]),
    ("wp", "WordPress blog fixes", "Fix the theme of our WordPress blog and speed up page loading.",
     ["WordPress", "PHP"]),
    ("vue", "Vue.js frontend bug fixes", "Fix bugs in our Vue.js single page app frontend.", ["Vue.js", "JavaScript"]),
    ("android", "Android app crash", "Our Kotlin Android app crashes on start, need a fix.", ["Android", "Kotlin"]),
]


@pytest.fixture
def seeded_jobs(db: Session) -> None:
    upsert_jobs(db, [
        JobData(source="freelancer", external_id=eid, title=t, description=d, skills=s,
                budget_min=20, budget_max=40, budget_type="hourly", posted_at=NOW - timedelta(hours=1))
        for eid, t, d, s in JOBS
    ])


@pytest.fixture
def react_user(client: TestClient) -> str:
    token = register(client)["access_token"]
    assert client.put("/api/profile/me", json=REACT_PROFILE, headers=auth_header(token)).status_code == 200
    return token


def test_matches_require_profile(client: TestClient) -> None:
    token = register(client)["access_token"]
    assert client.get("/api/matches", headers=auth_header(token)).status_code == 409


def test_matches_sorted_scored_and_explained(client: TestClient, seeded_jobs: None, react_user: str) -> None:
    res = client.get("/api/matches", headers=auth_header(react_user))
    assert res.status_code == 200, res.text
    body = res.json()
    matches = body["matches"]
    assert len(matches) == 5
    scores = [m["score"] for m in matches]
    assert scores == sorted(scores, reverse=True)
    assert all(0 <= s <= 100 for s in scores)
    for m in matches:
        assert m["reason"]
        assert 0 <= m["breakdown"]["semantic"] <= 1
    assert body["stats"]["candidates_considered"] == 6


def test_react_profile_ranks_react_job_above_python_job(client: TestClient, seeded_jobs: None, react_user: str) -> None:
    matches = client.get("/api/matches", headers=auth_header(react_user)).json()["matches"]
    titles = [m["job"]["title"] for m in matches]
    assert titles[0] == "React dashboard with Tailwind"
    top = matches[0]
    assert set(top["matched_skills"]) == {"React.js", "TypeScript", "Tailwind CSS"}
    assert top["reason"].startswith("Matches your React.js, TypeScript and Tailwind CSS skills")
    python_score = next((m["score"] for m in matches if m["job"]["title"] == "Python data pipeline"), 0)
    assert top["score"] > python_score


def test_matches_are_cached_and_cleared_on_profile_change(client: TestClient, seeded_jobs: None, react_user: str) -> None:
    h = auth_header(react_user)
    assert client.get("/api/matches", headers=h).json()["cached"] is False
    assert client.get("/api/matches", headers=h).json()["cached"] is True
    assert client.get("/api/matches", params={"refresh": True}, headers=h).json()["cached"] is False
    # Skills AND bio both feed the embedding, so change both
    client.put("/api/profile/me", json={**REACT_PROFILE, "skills": ["Python", "Pandas"],
                                        "bio": "Data engineer writing Python ETL pipelines."}, headers=h)
    body = client.get("/api/matches", headers=h).json()
    assert body["cached"] is False
    assert body["matches"][0]["job"]["title"] == "Python data pipeline"


def test_inactive_jobs_are_not_matched(client: TestClient, db: Session, seeded_jobs: None, react_user: str) -> None:
    from app.models.job import Job

    db.query(Job).filter(Job.external_id == "react").update({"is_active": False})
    db.commit()
    titles = [m["job"]["title"] for m in client.get("/api/matches", params={"refresh": True}, headers=auth_header(react_user)).json()["matches"]]
    assert "React dashboard with Tailwind" not in titles


def test_manual_jobs_are_private(client: TestClient, seeded_jobs: None, react_user: str) -> None:
    other = register(client, email="other@example.com")["access_token"]
    client.put("/api/profile/me", json=REACT_PROFILE, headers=auth_header(other))
    job = client.post("/api/jobs/manual", headers=auth_header(other), json={
        "title": "Private React gig", "description": "React and Tailwind landing page for my startup."}).json()
    mine = [m["job"]["id"] for m in client.get("/api/matches", params={"refresh": True}, headers=auth_header(other)).json()["matches"]]
    theirs = [m["job"]["id"] for m in client.get("/api/matches", params={"refresh": True}, headers=auth_header(react_user)).json()["matches"]]
    assert job["id"] in mine
    assert job["id"] not in theirs
    assert client.get(f"/api/jobs/{job['id']}", headers=auth_header(react_user)).status_code == 404


def test_job_detail_and_feedback(client: TestClient, seeded_jobs: None, react_user: str) -> None:
    h = auth_header(react_user)
    top = client.get("/api/matches", headers=h).json()["matches"][0]
    detail = client.get(f"/api/jobs/{top['job_id']}", headers=h).json()
    assert detail["job"]["description"].startswith("Build an admin dashboard")
    assert detail["match"]["score"] == top["score"]
    assert detail["feedback"] is None

    res = client.post(f"/api/matches/{top['job_id']}/feedback", json={"outcome": "applied"}, headers=h)
    assert res.status_code == 200 and res.json()["score_at_feedback"] == top["score"]
    client.post(f"/api/matches/{top['job_id']}/feedback", json={"outcome": "won"}, headers=h)  # update, not duplicate
    assert client.get(f"/api/jobs/{top['job_id']}", headers=h).json()["feedback"] == "won"
    bad = client.post(f"/api/matches/{top['job_id']}/feedback", json={"outcome": "maybe"}, headers=h)
    assert bad.status_code == 422


def test_unknown_job_is_404(client: TestClient, react_user: str) -> None:
    res = client.get("/api/jobs/00000000-0000-0000-0000-000000000000", headers=auth_header(react_user))
    assert res.status_code == 404
