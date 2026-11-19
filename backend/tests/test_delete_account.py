"""DELETE /api/auth/me — users can delete their account and all its data (added 19 Nov 2026)."""
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.agency import Agency, AgencyMember
from app.models.profile import Profile
from app.models.session import AuthSession
from app.models.user import User
from tests.conftest import auth_header, register
from tests.test_agency import team  # noqa: F401  (pytest fixture: owner + Python member + React member)

PROFILE = {"skills": ["React"], "experience_level": "expert", "hourly_rate": 30, "bio": "React developer"}


def _delete(client: TestClient, token: str, password: str = "Secret123"):  # type: ignore[no-untyped-def]
    return client.request("DELETE", "/api/auth/me", headers=auth_header(token), json={"password": password})


def test_user_can_delete_their_account_and_data(client: TestClient, db: Session) -> None:
    token = register(client)["access_token"]
    client.put("/api/profile/me", headers=auth_header(token), json=PROFILE)
    res = _delete(client, token)
    assert res.status_code == 200, res.text
    assert db.scalar(select(func.count()).select_from(User)) == 0
    assert db.scalar(select(func.count()).select_from(Profile)) == 0
    assert db.scalar(select(func.count()).select_from(AuthSession)) == 0
    assert client.get("/api/auth/me", headers=auth_header(token)).status_code == 401   # token stops working
    assert "Max-Age=0" in res.headers.get("set-cookie", "")                          # refresh cookie cleared


def test_wrong_password_deletes_nothing_and_is_rate_limited(client: TestClient, db: Session) -> None:
    token = register(client)["access_token"]
    codes = [_delete(client, token, "Wrong1234").status_code for _ in range(6)]
    assert codes[:5] == [400] * 5 and codes[5] == 429
    assert db.scalar(select(func.count()).select_from(User)) == 1


def test_deleting_an_owner_closes_the_agency_and_frees_the_members(client: TestClient, db: Session,
                                                                   team: dict) -> None:  # noqa: F811
    assert _delete(client, team["owner"]).status_code == 200
    assert db.scalar(select(func.count()).select_from(Agency)) == 0
    for member in ("py", "rx"):
        me = client.get("/api/auth/me", headers=auth_header(team[member])).json()
        assert me["role"] == "freelancer"                       # back to solo, accounts kept


def test_deleting_a_member_removes_them_from_the_team(client: TestClient, db: Session, team: dict) -> None:  # noqa: F811
    assert _delete(client, team["py"]).status_code == 200
    agency = client.get("/api/agency/me", headers=auth_header(team["owner"])).json()
    assert all(m.get("email") != "pyra@example.com" for m in agency["members"])
    assert db.scalar(select(func.count()).select_from(AgencyMember)) == 1   # only the React member is left
