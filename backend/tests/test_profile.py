"""Profile endpoint tests (UC-2)."""
import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.profile import Profile
from app.services import embeddings
from tests.conftest import auth_header, register

VALID = {
    "skills": ["React", "TypeScript", " Tailwind CSS ", "react"],  # duplicate + spaces on purpose
    "experience_level": "expert",
    "hourly_rate": 35,
    "bio": "Frontend developer building dashboards.",
    "portfolio_urls": ["https://github.com/example"],
    "platforms": ["Upwork", "Freelancer.com"],
}


@pytest.fixture
def token(client: TestClient) -> str:
    return register(client)["access_token"]


def test_profile_is_null_before_wizard(client: TestClient, token: str) -> None:
    res = client.get("/api/profile/me", headers=auth_header(token))
    assert res.status_code == 200
    assert res.json() is None


def test_save_profile_cleans_skills_and_creates_embedding(client: TestClient, token: str, db: Session) -> None:
    res = client.put("/api/profile/me", json=VALID, headers=auth_header(token))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["skills"] == ["React", "TypeScript", "Tailwind CSS"]
    assert body["embedding_status"] == "ready"
    assert "embedding" not in body  # the raw vector is never sent to the browser

    profile = db.query(Profile).one()
    vec = np.array(profile.embedding)
    assert vec.shape == (384,)
    assert abs(np.linalg.norm(vec) - 1.0) < 1e-4


def test_update_profile_replaces_values(client: TestClient, token: str) -> None:
    client.put("/api/profile/me", json=VALID, headers=auth_header(token))
    res = client.put("/api/profile/me", json={**VALID, "skills": ["Python"], "hourly_rate": 50},
                     headers=auth_header(token))
    assert res.json()["skills"] == ["Python"]
    assert res.json()["hourly_rate"] == 50
    assert client.get("/api/profile/me", headers=auth_header(token)).json()["skills"] == ["Python"]


@pytest.mark.parametrize("bad", [
    {"skills": []},
    {"experience_level": "guru"},
    {"hourly_rate": 0},
    {"hourly_rate": 5000},
    {"portfolio_urls": ["not a url"]},
    {"platforms": ["MySpace"]},
    {"bio": "x" * 2001},
])
def test_invalid_profile_is_rejected(client: TestClient, token: str, bad: dict) -> None:
    res = client.put("/api/profile/me", json={**VALID, **bad}, headers=auth_header(token))
    assert res.status_code == 422


def test_profile_saved_as_pending_when_embedding_fails(
    client: TestClient, token: str, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken(_: str) -> list[float]:
        raise RuntimeError("model unavailable")

    monkeypatch.setattr(embeddings, "embed_text", broken)
    res = client.put("/api/profile/me", json=VALID, headers=auth_header(token))
    assert res.status_code == 200
    assert res.json()["embedding_status"] == "pending"
    assert db.query(Profile).one().embedding is None


def test_profile_requires_auth(client: TestClient) -> None:
    assert client.get("/api/profile/me").status_code == 401
    assert client.put("/api/profile/me", json=VALID).status_code == 401


def test_skill_autocomplete(client: TestClient, token: str) -> None:
    res = client.get("/api/skills", params={"q": "rea"}, headers=auth_header(token))
    names = [s["name"] for s in res.json()]
    assert names[0] in ("React", "React Native")  # prefix matches first
    assert "React" in names
    # LIKE wildcards are treated literally
    assert client.get("/api/skills", params={"q": "%"}, headers=auth_header(token)).json() == []


def test_skills_table_is_seeded(db: Session) -> None:
    from app.models.skill import Skill

    assert db.query(Skill).count() >= 300
