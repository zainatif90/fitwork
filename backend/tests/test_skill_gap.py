"""Skill Gap Radar tests (UC-5, SRS TC-4): demand counting and impact calculation."""
from datetime import datetime, timedelta, timezone

import numpy as np
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.job import Job
from app.services import scoring
from app.services.ingestion import upsert_jobs
from app.services.skill_gap import count_unlocked, scores_from_cosines, skill_demand
from app.services.sources.base import JobData
from tests.conftest import auth_header, register

NOW = datetime.now(timezone.utc)


def job(eid: str, title: str, desc: str, skills: list[str], source: str = "freelancer") -> JobData:
    return JobData(source=source, external_id=eid, title=title, description=desc, skills=skills,
                   budget_min=20, budget_max=40, budget_type="hourly", posted_at=NOW - timedelta(hours=1))


def test_demand_merges_spellings_and_counts_once_per_job() -> None:
    jobs = [Job(skills=["React.js", "React", "CSS"]), Job(skills=["ReactJS", "Node.js"]), Job(skills=["css3"])]
    counts, display = skill_demand(jobs)
    assert counts["react"] == 2        # 3 spellings, but job 1 counted once
    assert counts["css"] == 2          # "CSS" and "css3"
    assert counts["node.js"] == 1
    assert display["react"] in {"React.js", "React", "ReactJS"}


def test_count_unlocked_only_counts_new_passes() -> None:
    base = np.array([55, 65, 40, 59])
    new = np.array([61, 70, 45, 60])
    assert count_unlocked(base, new, 60).tolist() == [True, False, False, True]


def test_scores_from_cosines_matches_single_job_formula() -> None:
    cos = np.array([0.6, 0.2])
    fixed = np.array([0.15 * 1.0 + 0.15 * 1.0, 0.15 * 0.5 + 0.15 * 0.5])
    vec = scores_from_cosines(cos, fixed)
    assert vec[0] == scoring.combine(scoring.semantic_score(0.6), 1.0, 1.0)
    assert vec[1] == scoring.combine(scoring.semantic_score(0.2), 0.5, 0.5)


def _seed(db: Session) -> None:
    shopify = [job(f"s{i}", f"Shopify store {t}", f"Customise our Shopify store: {t}. Shopify Liquid theme work.", ["Shopify", "Liquid"])
               for i, t in enumerate(["theme customization", "product page redesign", "checkout tweaks", "speed optimisation"])]
    react = [job(f"r{i}", f"React {t}", f"Build a React {t} with TypeScript.", ["React", "TypeScript"])
             for i, t in enumerate(["dashboard", "landing page"])]
    other = [job("o1", "Inactive Shopify job", "Shopify Liquid store work.", ["Shopify"]),
             job("m1", "My manual Vue job", "Vue.js fixes.", ["Vue.js"], source="manual")]
    upsert_jobs(db, shopify + react + other)
    db.query(Job).filter(Job.external_id == "o1").update({"is_active": False})
    db.commit()


def test_skill_gap_endpoint_finds_shopify(client: TestClient, db: Session) -> None:
    _seed(db)
    token = register(client)["access_token"]
    client.put("/api/profile/me", headers=auth_header(token), json={
        "skills": ["React", "TypeScript"], "experience_level": "expert", "hourly_rate": 30,
        "bio": "Frontend developer building web stores and e-commerce frontends."})
    res = client.get("/api/skill-gap", headers=auth_header(token))
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["total_active_jobs"] == 6  # inactive and other users' manual jobs excluded
    radar = {r["skill"]: r for r in body["radar"]}
    assert radar["Shopify"]["jobs"] == 4 and radar["Shopify"]["market_demand"] == 100
    assert radar["React"]["your_coverage"] == 100 and radar["Shopify"]["your_coverage"] == 0
    assert all(g["skill"] not in ("React", "TypeScript") for g in body["gaps"])  # never suggest owned skills

    shop = next(g for g in body["gaps"] if g["skill"] == "Shopify")
    assert shop["jobs_unlocked"] >= 1
    assert all("Shopify" in s["title"] for s in shop["sample_jobs"])
    assert all(s["score"] >= body["threshold"] for s in shop["sample_jobs"])
    assert len(shop["sample_jobs"]) <= 3

    # Cached on the second call
    assert client.get("/api/skill-gap", headers=auth_header(token)).json()["cached"] is True


def test_strong_coverage_message(client: TestClient, db: Session) -> None:
    _seed(db)
    token = register(client)["access_token"]
    client.put("/api/profile/me", headers=auth_header(token), json={
        "skills": ["React", "TypeScript", "Shopify", "Liquid"], "experience_level": "expert",
        "hourly_rate": 30, "bio": "Shopify and React developer."})
    body = client.get("/api/skill-gap", headers=auth_header(token)).json()
    assert body["gaps"] == []
    assert body["coverage_message"].startswith("Strong coverage")


def test_skill_gap_requires_profile(client: TestClient) -> None:
    token = register(client)["access_token"]
    assert client.get("/api/skill-gap", headers=auth_header(token)).status_code == 409
