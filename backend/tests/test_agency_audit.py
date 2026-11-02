"""Fixes from the 2 November 2026 SQA audit of Agency Mode and Team Chat (H = high, M = medium, L = low)."""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.agency import Agency, AgencyMember
from app.models.chat import ChatMessage
from app.services.ingestion import upsert_jobs
from tests.conftest import auth_header, register
from tests.test_agency import PYTHON_PROFILE, REACT_PROFILE, invite_and_join, jobs, make_job, member_id, team  # noqa: F401

H = auth_header


def assign(client: TestClient, owner: str, job_id: str, member: str):
    return client.post("/api/agency/assign", json={"job_id": job_id, "member_id": member}, headers=H(owner))


def set_status(client: TestClient, token: str, assignment_id: str, status: str):
    return client.post(f"/api/agency/assignments/{assignment_id}/status", json={"status": status}, headers=H(token))


def member_row(client: TestClient, owner: str, name: str) -> dict:
    return next(m for m in client.get("/api/agency/me", headers=H(owner)).json()["members"] if m["name"] == name)


def test_h1_totals_count_every_assignment_not_just_100(client: TestClient, team: dict, db: Session) -> None:
    saved, _, _ = upsert_jobs(db, [make_job(f"bulk{i}", f"Django job {i}", "Build a Django REST API.", ["Python"])
                                   for i in range(105)])
    py = member_id(client, team["py"])
    for j in saved:
        assert assign(client, team["owner"], str(j.id), py).status_code == 201
    stats = client.get("/api/agency/members/stats", headers=H(team["owner"])).json()
    assert stats["totals"]["assigned"] == 105
    assert next(r for r in stats["results"] if r["name"] == "Pyra Python")["assigned"] == 105


def test_h2_closed_job_cannot_be_applied_and_is_marked_closed(client: TestClient, team: dict, jobs: dict, db: Session) -> None:
    py = member_id(client, team["py"])
    a = assign(client, team["owner"], jobs["py"], py).json()
    db.execute(text("UPDATE jobs SET is_active = false WHERE id = :i"), {"i": jobs["py"]})
    db.commit()
    queue = client.get("/api/agency/queue", headers=H(team["py"])).json()
    assert queue[0]["job"]["is_active"] is False  # the page shows "Closed"
    res = set_status(client, team["py"], a["id"], "applied")
    assert res.status_code == 400 and "closed" in res.text
    # Declining a closed job clears it and does NOT send it on to another teammate
    declined = client.post(f"/api/agency/assignments/{a['id']}/decline", headers=H(team["py"])).json()
    assert declined["next_recommendation"] is None


def test_m1_owner_can_unassign_and_reassign(client: TestClient, team: dict, jobs: dict) -> None:
    py, rx = member_id(client, team["py"]), member_id(client, team["rx"])
    a = assign(client, team["owner"], jobs["py"], py).json()
    moved = client.post(f"/api/agency/assignments/{a['id']}/reassign", json={"member_id": rx}, headers=H(team["owner"]))
    assert moved.status_code == 200 and moved.json()["member_name"] == "Rex React"
    assert client.get("/api/agency/queue", headers=H(team["py"])).json() == []
    assert len(client.get("/api/agency/queue", headers=H(team["rx"])).json()) == 1
    # Members cannot do this; outsiders' ids are refused
    assert client.delete(f"/api/agency/assignments/{a['id']}", headers=H(team["rx"])).status_code == 403
    assert client.delete(f"/api/agency/assignments/{a['id']}", headers=H(team["owner"])).status_code == 204
    assert client.get("/api/agency/queue", headers=H(team["rx"])).json() == []
    assert any(r["job"]["id"] == jobs["py"] for r in client.get("/api/agency/routing", headers=H(team["owner"])).json())


def test_m1_finished_jobs_cannot_be_taken_back(client: TestClient, team: dict, jobs: dict) -> None:
    py = member_id(client, team["py"])
    a = assign(client, team["owner"], jobs["py"], py).json()
    set_status(client, team["py"], a["id"], "applied")
    assert client.post(f"/api/agency/assignments/{a['id']}/reassign", json={"member_id": member_id(client, team["rx"])},
                       headers=H(team["owner"])).status_code == 400  # already applied
    set_status(client, team["py"], a["id"], "won")
    assert client.delete(f"/api/agency/assignments/{a['id']}", headers=H(team["owner"])).status_code == 400


def test_m1_member_can_leave(client: TestClient, team: dict, jobs: dict) -> None:
    assign(client, team["owner"], jobs["py"], member_id(client, team["py"]))
    assert client.post("/api/agency/leave", headers=H(team["py"])).status_code == 204
    assert client.get("/api/auth/me", headers=H(team["py"])).json()["role"] == "freelancer"
    assert all(m["name"] != "Pyra Python" for m in client.get("/api/agency/me", headers=H(team["owner"])).json()["members"])
    assert client.post("/api/agency/leave", headers=H(team["owner"])).status_code == 403  # owners close instead


def test_m1_owner_can_close_the_agency(client: TestClient, team: dict, jobs: dict, db: Session) -> None:
    assign(client, team["owner"], jobs["py"], member_id(client, team["py"]))
    client.post("/api/agency/chat/channels/team/messages", json={"body": "bye"}, headers=H(team["owner"]))
    wrong = client.post("/api/agency/close", json={"confirm_name": "nope"}, headers=H(team["owner"]))
    assert wrong.status_code == 400
    name = client.get("/api/agency/me", headers=H(team["owner"])).json()["name"]
    assert client.post("/api/agency/close", json={"confirm_name": name}, headers=H(team["owner"])).status_code == 204
    for t in (team["owner"], team["py"], team["rx"]):
        assert client.get("/api/auth/me", headers=H(t)).json()["role"] == "freelancer"
    assert db.scalar(select(Agency)) is None and db.scalar(select(ChatMessage)) is None


def test_m2_results_keep_people_who_left(client: TestClient, team: dict, jobs: dict) -> None:
    rx = member_id(client, team["rx"])
    a = assign(client, team["owner"], jobs["re"], rx).json()
    set_status(client, team["rx"], a["id"], "applied")
    set_status(client, team["rx"], a["id"], "won")
    client.delete(f"/api/agency/members/{member_row(client, team['owner'], 'Rex React')['id']}", headers=H(team["owner"]))
    stats = client.get("/api/agency/members/stats", headers=H(team["owner"])).json()
    rex = next(r for r in stats["results"] if r["name"] == "Rex React")
    assert rex["won"] == 1 and rex["current"] is False
    assert stats["totals"]["won"] == 1  # the banner and the table now agree


def test_m3_chat_history_with_someone_who_left_is_read_only(client: TestClient, team: dict, jobs: dict) -> None:
    rx = member_id(client, team["rx"])
    assign(client, team["owner"], jobs["re"], rx)
    client.post(f"/api/agency/chat/channels/dm-{rx}/messages", json={"body": "contract details"}, headers=H(team["owner"]))
    client.post(f"/api/agency/chat/channels/job-{jobs['re']}/messages", json={"body": "job notes"}, headers=H(team["owner"]))
    client.delete(f"/api/agency/members/{member_row(client, team['owner'], 'Rex React')['id']}", headers=H(team["owner"]))
    for key, body in ((f"dm-{rx}", "contract details"), (f"job-{jobs['re']}", "job notes")):
        res = client.get(f"/api/agency/chat/channels/{key}/messages", headers=H(team["owner"]))
        assert res.status_code == 200 and res.json()[0]["body"] == body
        sent = client.post(f"/api/agency/chat/channels/{key}/messages", json={"body": "hello?"}, headers=H(team["owner"]))
        assert sent.status_code == 403
    listed = {c["key"]: c for c in client.get("/api/agency/chat/channels", headers=H(team["owner"])).json()["channels"]}
    assert listed[f"dm-{rx}"]["archived"] is True and listed[f"job-{jobs['re']}"]["archived"] is True
    # A member never sees another member's archived job thread
    assert client.get(f"/api/agency/chat/channels/job-{jobs['re']}/messages", headers=H(team["py"])).status_code == 404


def test_m4_routing_can_return_more_than_20(client: TestClient, team: dict, db: Session) -> None:
    upsert_jobs(db, [make_job(f"r{i}", f"Django REST API project {i}", "Build a Django REST API with PostgreSQL.",
                              ["Python", "Django"]) for i in range(30)])
    h = H(team["owner"])
    assert len(client.get("/api/agency/routing", headers=h).json()) == 20
    assert len(client.get("/api/agency/routing", params={"limit": 200}, headers=h).json()) > 20
    assert client.get("/api/agency/routing", params={"limit": 201}, headers=h).status_code == 422


def test_m5_owner_with_a_profile_is_routed_jobs_too(client: TestClient, team: dict, jobs: dict) -> None:
    client.put("/api/profile/me", json={"skills": ["Logo Design", "Adobe Illustrator", "Packaging Design"],
                                        "experience_level": "expert", "hourly_rate": 30,
                                        "bio": "Brand and logo designer."}, headers=H(team["owner"]))
    owner_id = member_id(client, team["owner"])
    rec = next(r for r in client.get("/api/agency/routing", headers=H(team["owner"])).json() if r["job"]["id"] == jobs["logo"])
    assert rec["recommended"]["member_id"] == owner_id and not rec["low_team_fit"]
    a = assign(client, team["owner"], jobs["logo"], owner_id).json()
    assert [q["id"] for q in client.get("/api/agency/queue", headers=H(team["owner"])).json()] == [a["id"]]
    assert set_status(client, team["owner"], a["id"], "applied").status_code == 200
    stats = client.get("/api/agency/members/stats", headers=H(team["owner"])).json()
    assert next(m for m in stats["members"] if m["member_id"] == owner_id)["is_owner"] is True


def test_l1_agency_name_of_only_spaces_is_refused(client: TestClient, team: dict) -> None:
    assert client.put("/api/agency/me", json={"name": "   "}, headers=H(team["owner"])).status_code == 422
    assert client.put("/api/agency/me", json={"name": "  Pixel Forge  "}, headers=H(team["owner"])).json()["name"] == "Pixel Forge"


def test_l2_invite_errors_do_not_reveal_account_details(client: TestClient, team: dict) -> None:
    register(client, email="boss@example.com", role="agency_owner")
    owner_case = client.post("/api/agency/invite", json={"email": "boss@example.com"}, headers=H(team["owner"])).json()
    member_case = client.post("/api/agency/invite", json={"email": "rex@example.com"}, headers=H(team["owner"])).json()
    assert owner_case == member_case


def test_l3_invite_links_expire_after_7_days(client: TestClient, team: dict, db: Session) -> None:
    token = client.post("/api/agency/invite", json={"email": "late@example.com"}, headers=H(team["owner"])).json()["invite_token"]
    row = db.scalar(select(AgencyMember).where(AgencyMember.email == "late@example.com"))
    row.invite_sent_at = datetime.now(timezone.utc) - timedelta(days=8)
    db.commit()
    late = register(client, email="late@example.com")["access_token"]
    res = client.post("/api/agency/invite/accept", json={"token": token}, headers=H(late))
    assert res.status_code == 404 and "expired" in res.text
    rows = client.get("/api/agency/me", headers=H(team["owner"])).json()["members"]
    assert next(m for m in rows if m["email"] == "late@example.com")["invite_expired"] is True
    # Resend makes a fresh link that works
    fresh = client.post("/api/agency/invite", json={"email": "late@example.com"}, headers=H(team["owner"])).json()["invite_token"]
    assert client.post("/api/agency/invite/accept", json={"token": fresh}, headers=H(late)).status_code == 200


def test_l4_applied_cannot_be_skipped(client: TestClient, team: dict, jobs: dict) -> None:
    a = assign(client, team["owner"], jobs["py"], member_id(client, team["py"])).json()
    assert set_status(client, team["py"], a["id"], "won").status_code == 400
    assert set_status(client, team["py"], a["id"], "lost").status_code == 400
    assert set_status(client, team["py"], a["id"], "applied").status_code == 200
    assert set_status(client, team["py"], a["id"], "won").status_code == 200


def test_l7_database_refuses_a_second_taken_row(client: TestClient, team: dict, jobs: dict, db: Session) -> None:
    from sqlalchemy.exc import IntegrityError

    from app.models.agency import Assignment
    assign(client, team["owner"], jobs["py"], member_id(client, team["py"]))
    agency = db.scalar(select(Agency))
    db.add(Assignment(agency_id=agency.id, job_id=jobs["py"], member_id=member_id(client, team["rx"]), status="assigned"))
    try:
        db.commit()
        raised = False
    except IntegrityError:
        db.rollback()
        raised = True
    assert raised


def test_l9_assigned_today_uses_the_viewers_time_zone(client: TestClient, team: dict, jobs: dict, db: Session) -> None:
    a = assign(client, team["owner"], jobs["py"], member_id(client, team["py"])).json()
    # Given out one minute before midnight UTC: "yesterday" in London, but already "today" in Pakistan (UTC+5)
    # whenever it is before 19:00 UTC. The expected value is worked out the same way for each time zone.
    utc_midnight = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    created = utc_midnight - timedelta(minutes=1)
    db.execute(text("UPDATE assignments SET created_at = :c WHERE id = :i"), {"c": created, "i": a["id"]})
    db.commit()
    h = H(team["owner"])
    for tz in (0, 300):
        local = timezone(timedelta(minutes=tz))
        local_midnight = datetime.now(local).replace(hour=0, minute=0, second=0, microsecond=0)
        expected = 1 if created >= local_midnight else 0
        stats = client.get("/api/agency/members/stats", params={"tz": tz}, headers=h).json()
        assert next(m for m in stats["members"] if m["name"] == "Pyra Python")["routed_today"] == expected
    assert client.get("/api/agency/members/stats", params={"tz": 9999}, headers=h).status_code == 422
