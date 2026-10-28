"""Agency Mode tests (UC-4, SRS TC-6 agency routing)."""
import re
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.agency import Assignment
from app.services.ingestion import upsert_jobs
from app.services.sources.base import JobData
from tests.conftest import auth_header, register

NOW = datetime.now(timezone.utc)

PYTHON_PROFILE = {"skills": ["Python", "Django", "PostgreSQL", "Pandas"], "experience_level": "expert",
                  "hourly_rate": 30, "bio": "Backend developer building Python APIs and data pipelines."}
REACT_PROFILE = {"skills": ["React", "TypeScript", "Tailwind CSS"], "experience_level": "expert",
                 "hourly_rate": 30, "bio": "Frontend developer building React interfaces."}


def make_job(eid: str, title: str, desc: str, skills: list[str]) -> JobData:
    return JobData(source="freelancer", external_id=eid, title=title, description=desc, skills=skills,
                   budget_min=20, budget_max=40, budget_type="hourly", posted_at=NOW - timedelta(hours=1))


@pytest.fixture
def jobs(db: Session) -> dict[str, str]:
    saved, _, _ = upsert_jobs(db, [
        make_job("py", "Django REST API for inventory", "Build a Django REST API with PostgreSQL for our inventory system.",
                 ["Python", "Django", "PostgreSQL"]),
        make_job("re", "React admin dashboard", "Build a React + TypeScript admin dashboard styled with Tailwind CSS.",
                 ["React", "TypeScript", "Tailwind CSS"]),
        make_job("logo", "Logo for organic tea brand", "Design a hand-drawn logo and packaging label for an organic tea brand.",
                 ["Logo Design", "Adobe Illustrator", "Packaging Design"]),
    ])
    return {j.external_id: str(j.id) for j in saved}


def invite_and_join(client: TestClient, owner_token: str, email: str, name: str, profile: dict) -> str:
    res = client.post("/api/agency/invite", json={"email": email}, headers=auth_header(owner_token))
    assert res.status_code == 201, res.text
    token = re.search(r"/invite/(.+)$", res.json()["invite_link"]).group(1)  # type: ignore[union-attr]
    member_token = register(client, email=email, full_name=name)["access_token"]
    accepted = client.post("/api/agency/invite/accept", json={"token": token}, headers=auth_header(member_token))
    assert accepted.status_code == 200, accepted.text
    assert client.put("/api/profile/me", json=profile, headers=auth_header(member_token)).status_code == 200
    return member_token


@pytest.fixture
def team(client: TestClient) -> dict[str, str]:
    owner = register(client, email="owner@example.com", role="agency_owner", full_name="Olivia Owner")["access_token"]
    py = invite_and_join(client, owner, "pyra@example.com", "Pyra Python", PYTHON_PROFILE)
    rx = invite_and_join(client, owner, "rex@example.com", "Rex React", REACT_PROFILE)
    return {"owner": owner, "py": py, "rx": rx}


def member_id(client: TestClient, token: str) -> str:
    return client.get("/api/auth/me", headers=auth_header(token)).json()["id"]


def rec_for(recs: list[dict], job_id: str) -> dict:
    return next(r for r in recs if r["job"]["id"] == job_id)


def test_invite_makes_user_agency_member(client: TestClient, team: dict) -> None:
    me = client.get("/api/auth/me", headers=auth_header(team["py"])).json()
    assert me["role"] == "agency_member"
    agency = client.get("/api/agency/me", headers=auth_header(team["owner"])).json()
    assert agency["role"] == "owner"
    assert {m["status"] for m in agency["members"]} == {"active"}


def test_invite_token_is_single_use_and_email_bound(client: TestClient) -> None:
    owner = register(client, email="o2@example.com", role="agency_owner")["access_token"]
    link = client.post("/api/agency/invite", json={"email": "right@example.com"}, headers=auth_header(owner)).json()["invite_link"]
    token = link.rsplit("/", 1)[1]
    wrong = register(client, email="wrong@example.com")["access_token"]
    assert client.post("/api/agency/invite/accept", json={"token": token}, headers=auth_header(wrong)).status_code == 403
    right = register(client, email="right@example.com")["access_token"]
    assert client.post("/api/agency/invite/accept", json={"token": token}, headers=auth_header(right)).status_code == 200
    assert client.post("/api/agency/invite/accept", json={"token": token}, headers=auth_header(right)).status_code == 404


def test_python_job_routes_to_python_member(client: TestClient, team: dict, jobs: dict) -> None:
    recs = client.get("/api/agency/routing", headers=auth_header(team["owner"])).json()
    py_rec = rec_for(recs, jobs["py"])
    assert py_rec["recommended"]["name"] == "Pyra Python"
    assert py_rec["recommended"]["score"] > py_rec["alternatives"][0]["score"]
    assert rec_for(recs, jobs["re"])["recommended"]["name"] == "Rex React"


def test_low_team_fit_lists_missing_skills(client: TestClient, team: dict, jobs: dict) -> None:
    recs = client.get("/api/agency/routing", headers=auth_header(team["owner"])).json()
    logo = rec_for(recs, jobs["logo"])
    assert logo["low_team_fit"] is True
    assert logo["recommended"]["score"] < 50
    assert set(logo["missing_skills"]) == {"Logo Design", "Adobe Illustrator", "Packaging Design"}


def test_assign_then_decline_reroutes_to_next_member(client: TestClient, db: Session, team: dict, jobs: dict) -> None:
    owner_h = auth_header(team["owner"])
    py_id, rx_id = member_id(client, team["py"]), member_id(client, team["rx"])

    res = client.post("/api/agency/assign", json={"job_id": jobs["py"], "member_id": py_id}, headers=owner_h)
    assert res.status_code == 201, res.text
    # Job is now taken: it leaves the routing list, and cannot be assigned twice
    assert all(r["job"]["id"] != jobs["py"] for r in client.get("/api/agency/routing", headers=owner_h).json())
    assert client.post("/api/agency/assign", json={"job_id": jobs["py"], "member_id": rx_id}, headers=owner_h).status_code == 409

    queue = client.get("/api/agency/queue", headers=auth_header(team["py"])).json()
    assert [q["job"]["id"] for q in queue] == [jobs["py"]]
    assert client.get("/api/agency/queue", headers=auth_header(team["rx"])).json() == []  # members see only their own

    declined = client.post(f"/api/agency/assignments/{queue[0]['id']}/decline", headers=auth_header(team["py"])).json()
    assert declined["declined"]["status"] == "declined"
    nxt = declined["next_recommendation"]
    assert nxt["recommended"]["member_id"] == rx_id
    assert nxt["rerouted_after_decline"] is True

    # Back in routing, now recommended to Rex; owner approves -> the pending row becomes "assigned"
    rec = rec_for(client.get("/api/agency/routing", headers=owner_h).json(), jobs["py"])
    assert rec["recommended"]["member_id"] == rx_id
    client.post("/api/agency/assign", json={"job_id": jobs["py"], "member_id": rx_id}, headers=owner_h)
    statuses = sorted(a.status for a in db.query(Assignment).all())
    assert statuses == ["assigned", "declined"]


def test_members_cannot_assign_or_see_routing(client: TestClient, team: dict, jobs: dict) -> None:
    py_h = auth_header(team["py"])
    assert client.post("/api/agency/assign", json={"job_id": jobs["py"], "member_id": member_id(client, team["py"])},
                       headers=py_h).status_code == 403
    assert client.get("/api/agency/routing", headers=py_h).status_code == 403
    assert client.get("/api/agency/members/stats", headers=py_h).status_code == 403
    assert client.post("/api/agency/invite", json={"email": "x@example.com"}, headers=py_h).status_code == 403
    solo = register(client, email="solo@example.com")["access_token"]
    assert client.get("/api/agency/routing", headers=auth_header(solo)).status_code == 403


def test_member_cannot_touch_someone_elses_assignment(client: TestClient, team: dict, jobs: dict) -> None:
    py_id = member_id(client, team["py"])
    a = client.post("/api/agency/assign", json={"job_id": jobs["py"], "member_id": py_id},
                    headers=auth_header(team["owner"])).json()
    res = client.post(f"/api/agency/assignments/{a['id']}/decline", headers=auth_header(team["rx"]))
    assert res.status_code == 404


def test_cannot_assign_to_non_member(client: TestClient, team: dict, jobs: dict) -> None:
    outsider = register(client, email="out@example.com")["access_token"]
    res = client.post("/api/agency/assign", json={"job_id": jobs["py"], "member_id": member_id(client, outsider)},
                      headers=auth_header(team["owner"]))
    assert res.status_code == 400


def test_stats_and_win_rate(client: TestClient, team: dict, jobs: dict) -> None:
    owner_h = auth_header(team["owner"])
    py_id = member_id(client, team["py"])
    a = client.post("/api/agency/assign", json={"job_id": jobs["py"], "member_id": py_id}, headers=owner_h).json()
    client.post(f"/api/agency/assignments/{a['id']}/status", json={"status": "won"}, headers=auth_header(team["py"]))
    stats = client.get("/api/agency/members/stats", headers=owner_h).json()
    pyra = next(m for m in stats["members"] if m["member_id"] == py_id)
    assert pyra["win_rate_30d"] == 1.0 and pyra["routed_today"] == 1 and pyra["active_assignments"] == 0
    rex = next(m for m in stats["members"] if m["name"] == "Rex React")
    assert rex["win_rate_30d"] is None  # no outcomes -> no made-up number
    assert stats["has_outcomes"] is True
    assert stats["win_rate_series"][-1][py_id] == 1.0
