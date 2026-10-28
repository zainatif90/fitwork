"""Proposal generator tests with the LLM mocked (SRS TC-5). No real API calls are made."""
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.proposal import Proposal
from app.services import proposals as proposal_service
from app.services.ingestion import upsert_jobs
from app.services.llm import LLMClient, LLMError
from app.services.sources.base import JobData
from tests.conftest import auth_header, register

PROFILE = {
    "skills": ["React", "TypeScript", "Tailwind CSS"],
    "experience_level": "intermediate",
    "hourly_rate": 25,
    "bio": "I build accessible React dashboards. I care about clean code.",
    "portfolio_urls": ["https://github.com/sara-dev"],
}


@pytest.fixture
def job_id(db: Session) -> str:
    saved, _, _ = upsert_jobs(db, [JobData(
        source="freelancer", external_id="p1", title="React admin dashboard",
        description="We need a React + TypeScript admin dashboard with charts and a login page.",
        skills=["React.js", "TypeScript", "Chart.js"], budget_min=300, budget_max=600,
        posted_at=datetime.now(timezone.utc))])
    return str(saved[0].id)


@pytest.fixture
def token(client: TestClient) -> str:
    t = register(client, full_name="Sara Khan")["access_token"]
    client.put("/api/profile/me", json=PROFILE, headers=auth_header(t))
    return t


@pytest.fixture
def captured(monkeypatch: pytest.MonkeyPatch) -> dict:
    """Mock the LLM: record the prompt and return a fixed draft."""
    seen: dict = {}

    def fake_generate(self: LLMClient, system: str, prompt: str) -> str:
        seen["system"], seen["prompt"] = system, prompt
        return "**Hello**, I can build your React dashboard.\n\nWhich chart library do you prefer?\n\nSara"

    monkeypatch.setattr(settings, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(LLMClient, "generate", fake_generate)
    return seen


def test_generate_with_llm(client: TestClient, db: Session, job_id: str, token: str, captured: dict) -> None:
    res = client.post("/api/proposals/generate", headers=auth_header(token),
                      json={"job_id": job_id, "tone": "technical", "length": "concise"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["is_fallback"] is False
    assert body["content"].startswith("Hello, I can build")  # markdown bold removed
    assert body["remaining_today"] == settings.PROPOSALS_PER_DAY - 1
    assert db.query(Proposal).count() == 1

    prompt = captured["prompt"]
    assert "React admin dashboard" in prompt                 # job title
    assert "Skills: React, TypeScript, Tailwind CSS" in prompt  # user's real skills
    assert "Skills that match this job: React.js, TypeScript" in prompt
    assert "https://github.com/sara-dev" in prompt           # portfolio
    assert "about 120 words" in prompt                       # concise
    assert "Technical and precise" in prompt                 # tone
    assert "Do NOT invent experience" in prompt
    assert "End with ONE short, specific question" in prompt


def test_fallback_when_llm_fails(client: TestClient, db: Session, job_id: str, token: str,
                                 monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(self: LLMClient, system: str, prompt: str) -> str:
        raise LLMError("timeout")

    monkeypatch.setattr(LLMClient, "generate", broken)
    res = client.post("/api/proposals/generate", headers=auth_header(token), json={"job_id": job_id, "length": "detailed"})
    assert res.status_code == 200
    body = res.json()
    assert body["is_fallback"] is True and body["provider"] == "template"
    text = body["content"]
    assert '"React admin dashboard"' in text
    assert "React.js and TypeScript" in text or "React and TypeScript" in text
    assert "https://github.com/sara-dev" in text  # detailed includes portfolio
    assert "?" in text and text.rstrip().endswith("Sara")
    assert "Chart.js" not in text.split("skills for this work are")[1].split(".")[0]  # never claims a skill they lack


def test_fallback_when_no_api_key(job_id: str, db: Session, token: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "LLM_API_KEY", "")
    from app.models.job import Job
    from app.models.profile import Profile
    from app.models.user import User

    job = db.get(Job, job_id)
    profile = db.query(Profile).one()
    user = db.query(User).one()
    draft = proposal_service.draft_proposal(job, profile, user, "professional", "standard")  # type: ignore[arg-type]
    assert draft.is_fallback is True


def test_daily_rate_limit(client: TestClient, job_id: str, token: str, captured: dict,
                          monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "PROPOSALS_PER_DAY", 3)
    codes = [client.post("/api/proposals/generate", headers=auth_header(token), json={"job_id": job_id}).status_code
             for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_invalid_options_and_missing_profile(client: TestClient, job_id: str, token: str) -> None:
    bad = client.post("/api/proposals/generate", headers=auth_header(token), json={"job_id": job_id, "tone": "rude"})
    assert bad.status_code == 422
    other = register(client, email="noprofile@example.com")["access_token"]
    assert client.post("/api/proposals/generate", headers=auth_header(other), json={"job_id": job_id}).status_code == 409


def test_history(client: TestClient, job_id: str, token: str, captured: dict) -> None:
    client.post("/api/proposals/generate", headers=auth_header(token), json={"job_id": job_id})
    res = client.get("/api/proposals", params={"job_id": job_id}, headers=auth_header(token))
    assert res.status_code == 200 and len(res.json()) == 1
    other = register(client, email="nosy@example.com")["access_token"]
    assert client.get("/api/proposals", headers=auth_header(other)).json() == []  # cannot see others' drafts
