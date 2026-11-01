"""Skill Gap Radar tests (UC-5, SRS TC-4): demand counting and impact calculation."""
from datetime import datetime, timedelta, timezone

import numpy as np
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.job import Job
from app.services import scoring
from app.services.ingestion import upsert_jobs
from app.core.config import settings
from app.services.skill_gap import count_unlocked, field_of_work, scores_from_cosines, skill_demand, unique_postings
from app.services.skill_utils import canonical_skill, skills_in_text
from app.services.sources.base import JobData
from tests.conftest import auth_header, register

NOW = datetime.now(timezone.utc)


def job(eid: str, title: str, desc: str, skills: list[str], source: str = "freelancer", budget: bool = True) -> JobData:
    return JobData(source=source, external_id=eid, title=title, description=desc, skills=skills,
                   budget_min=20 if budget else None, budget_max=40 if budget else None,
                   budget_type="hourly", posted_at=NOW - timedelta(hours=1))


def test_demand_merges_spellings_and_counts_once_per_job() -> None:
    jobs = [Job(skills=["React.js", "React", "CSS"]), Job(skills=["ReactJS", "Node.js"]), Job(skills=["css3"])]
    counts, display = skill_demand(jobs)
    assert counts[canonical_skill("react")] == 2        # 3 spellings, but job 1 counted once
    assert counts[canonical_skill("css")] == 2          # "CSS" and "css3"
    assert counts[canonical_skill("node.js")] == 1
    assert display[canonical_skill("react")] in {"React.js", "React", "ReactJS"}


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


def test_field_of_work_needs_similarity_and_a_shared_skill(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    cos = np.array([0.9, 0.1, 0.5, 0.31, 0.29, 0.8])
    shares = np.array([True, True, True, True, True, False])  # job 5 is similar but shares no skill
    monkeypatch.setattr(settings, "SKILL_GAP_FIELD_MIN_JOBS", 1)
    assert field_of_work(cos, shares).tolist() == [0, 2, 3]  # 0.29 and 0.1 are below the 0.30 floor
    monkeypatch.setattr(settings, "SKILL_GAP_FIELD_SIZE", 2)
    assert field_of_work(cos, shares).tolist() == [0, 2]     # only the 2 most similar
    # Too few jobs share a skill -> no field at all (BUG-15: similarity alone suggested unrelated skills)
    monkeypatch.setattr(settings, "SKILL_GAP_FIELD_MIN_JOBS", 5)
    assert field_of_work(cos, shares).tolist() == []


def test_bug15_unknown_skills_get_a_message_not_random_suggestions(client: TestClient, db: Session) -> None:
    _seed(db)
    token = register(client)["access_token"]
    client.put("/api/profile/me", headers=auth_header(token), json={
        "skills": ["Underwater Basket Weaving"], "experience_level": "beginner", "hourly_rate": 10,
        "bio": "I weave baskets underwater."})
    body = client.get("/api/skill-gap", headers=auth_header(token)).json()
    assert body["field_jobs"] == 0 and body["gaps"] == [] and body["radar"] == []
    assert body["coverage_message"].startswith("We could not find enough jobs")


def test_bug33_one_name_per_skill() -> None:
    counts, display = skill_demand([Job(skills=["Website Design", "iPhone"]), Job(skills=["Web Design", "iOS"]),
                                    Job(skills=["iPhone"])])
    assert counts[canonical_skill("web design")] == 2 and display[canonical_skill("web design")] == "Web Design"
    assert counts[canonical_skill("ios")] == 3 and display[canonical_skill("ios")] == "iOS"


def test_qa_spellings_are_merged() -> None:
    """Live Freelancer.com QA jobs are tagged "Testing / QA" and "Software Testing"; users write "QA" or "SQA"."""
    assert canonical_skill("SQA") == canonical_skill("Testing / QA") == canonical_skill("Software Testing") == canonical_skill("QA Testing")
    assert canonical_skill("Test Automation") == canonical_skill("QA Automation") == canonical_skill("Automation Testing")


def test_skills_in_title() -> None:
    assert skills_in_text("QA Tester (Manual Testing, SaaS)", ["QA", "Manual Testing", "Jira"]) == {canonical_skill("QA Testing"), canonical_skill("Manual Testing")}
    assert skills_in_text("Social media manager for a bakery", ["QA", "Manual Testing"]) == set()


def test_reposted_job_is_counted_once() -> None:
    """Seen live: one "CAD Engineer - AI Trainer" role posted 14 times made SolidWorks look like 14 jobs."""
    a = Job(title="CAD Engineer - AI Trainer", description="Use SolidWorks  and Python.", skills=["SolidWorks"])
    b = Job(title="CAD engineer - AI trainer", description="Use SolidWorks and Python.", skills=["SolidWorks"])
    c = Job(title="CAD Engineer - AI Trainer", description="A different project in AutoCAD.", skills=["AutoCAD"])
    assert unique_postings([a, b, c]) == [a, c]


def _seed(db: Session) -> None:
    # Shopify jobs that also ask for React: in a React developer's field, but they need Shopify too.
    # Seed-dataset jobs without a budget (neutral budget + recency), so some are just below a match (52-62).
    shopify = [job(f"s{i}", f"Shopify store {t}", f"Customise our Shopify store: {t}. Shopify Liquid theme work, React widgets.",
                   ["Shopify", "Liquid", "React"], source="csv", budget=False)
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
    assert body["field_jobs"] == 6  # every job here asks for React
    assert radar["Shopify"]["jobs"] == 4 and radar["React"]["jobs"] == 6 and radar["React"]["market_demand"] == 100
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


def test_qa_tester_only_gets_skills_from_their_field(client: TestClient, db: Session) -> None:
    """Seen live: a QA tester was told to learn social media and Photoshop because those jobs are the most common."""
    marketing = [job(f"mk{i}", f"Social media manager for {t}",
                     f"Manage our Instagram and Facebook pages for {t}. Design posts in Photoshop and Canva.",
                     ["Social Media Marketing", "Adobe Photoshop", "Canva"])
                 for i, t in enumerate(["a bakery", "a gym", "a salon", "a clothing brand", "a cafe", "a dentist",
                                        "a real estate agent", "a travel agency"])]
    qa = [job(f"qa{i}", f"QA tester for {t}",
              f"Test our {t}: write test cases, report bugs, automate end-to-end tests with Cypress and Selenium.",
              ["QA Testing", "Cypress", "Selenium", "Test Automation"])
          for i, t in enumerate(["web app", "checkout flow", "mobile app", "admin dashboard", "booking website"])]
    upsert_jobs(db, marketing + qa)

    token = register(client)["access_token"]
    client.put("/api/profile/me", headers=auth_header(token), json={
        "skills": ["Manual Testing", "QA", "Bug Reporting", "Test Cases"], "experience_level": "intermediate",
        "hourly_rate": 25, "bio": "Software QA tester. I test web and mobile apps and write clear bug reports."})
    body = client.get("/api/skill-gap", headers=auth_header(token)).json()

    marketing_skills = {"Social Media Marketing", "Adobe Photoshop", "Canva"}
    suggested = {g["skill"] for g in body["gaps"]}
    assert not suggested & marketing_skills, suggested
    assert not {r["skill"] for r in body["radar"]} & marketing_skills
    assert suggested & {"Cypress", "Selenium"}, suggested       # testing tools from their own field
    assert "QA Testing" not in suggested                         # "QA" in the profile is the same skill
    assert 0 < body["field_jobs"] < body["total_active_jobs"]


def test_skill_gap_requires_profile(client: TestClient) -> None:
    token = register(client)["access_token"]
    assert client.get("/api/skill-gap", headers=auth_header(token)).status_code == 409


def test_spelling_variants_are_one_skill() -> None:
    """Seen live: a Shopify user with "E-commerce" was told they were missing "eCommerce"."""
    assert canonical_skill("E-commerce") == canonical_skill("eCommerce") == canonical_skill("e commerce")
    assert canonical_skill("Front-end Development") == canonical_skill("Frontend development")
    assert canonical_skill("Node JS") == canonical_skill("node.js") == canonical_skill("NodeJS")
    assert canonical_skill("C#") != canonical_skill("C") and canonical_skill("C++") != canonical_skill("C")
    counts, display = skill_demand([Job(skills=["E-commerce"]), Job(skills=["eCommerce", "Shopify"])])
    assert counts[canonical_skill("ecommerce")] == 2
